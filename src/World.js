/**
 * World - Manages voxel chunks, multi-biomes, caves, custom torches,
 * dynamic shadow casting point-lights with flame wobbles, and smooth Ambient Occlusion.
 */
class World {
    constructor(scene, textureManager) {
        this.scene = scene;
        this.textureManager = textureManager;

        // Chunk dimensions
        this.chunkWidth = 16;
        this.chunkDepth = 16;
        this.chunkHeight = 32;

        // Seeded noise
        this.noise = new window.ImprovedNoise(88888);
        
        // Chunk storage
        this.chunks = new Map();
        
        // Render distance
        this.renderDistance = 4;
        
        // Material compile
        this.texture = this.textureManager.createThreeTexture();
        
        this.solidMaterial = new THREE.MeshLambertMaterial({
            map: this.texture,
            transparent: true,
            alphaTest: 0.15,
            side: THREE.FrontSide,
            vertexColors: true // Enables vertex colors mapping for Ambient Occlusion
        });

        this.waterMaterial = new THREE.MeshLambertMaterial({
            map: this.texture,
            transparent: true,
            opacity: 0.65,
            side: THREE.DoubleSide,
            vertexColors: true
        });

        // Scene meshes tracking
        this.activeMeshes = [];

        // Placed torches global registry ('x,y,z')
        this.placedTorches = new Set();

        // Point light pool
        this.maxLights = 10;
        this.lightPool = [];
        this.initLightPool();
    }

    initLightPool() {
        for (let i = 0; i < this.maxLights; i++) {
            // Warm orange/red fire glow
            const light = new THREE.PointLight(0xff5511, 0, 14, 2.0);
            light.visible = false;
            light.castShadow = false; // Disable point light shadows to prevent destructive interference overlaps

            this.scene.add(light);
            this.lightPool.push(light);
        }
    }

    globalToChunkCoords(x, y, z) {
        return {
            cx: Math.floor(x / this.chunkWidth),
            cz: Math.floor(z / this.chunkDepth),
            lx: ((Math.floor(x) % this.chunkWidth) + this.chunkWidth) % this.chunkWidth,
            ly: Math.max(0, Math.min(this.chunkHeight - 1, Math.floor(y))),
            lz: ((Math.floor(z) % this.chunkDepth) + this.chunkDepth) % this.chunkDepth
        };
    }

    getBlock(x, y, z) {
        if (y < 0) return 3; // Stone bedrock barrier
        if (y >= this.chunkHeight) return 0; // Air

        const { cx, cz, lx, ly, lz } = this.globalToChunkCoords(x, y, z);
        const chunkKey = `${cx},${cz}`;
        
        const chunk = this.chunks.get(chunkKey);
        if (!chunk) return 0;

        const index = lx + ly * this.chunkWidth + lz * this.chunkWidth * this.chunkHeight;
        return chunk.voxels[index];
    }

    setBlock(x, y, z, blockType) {
        if (y < 0 || y >= this.chunkHeight) return;

        const { cx, cz, lx, ly, lz } = this.globalToChunkCoords(x, y, z);
        const chunkKey = `${cx},${cz}`;
        const blockKey = `${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`;
        
        let chunk = this.chunks.get(chunkKey);
        if (!chunk) {
            chunk = this.generateChunkData(cx, cz);
            this.chunks.set(chunkKey, chunk);
        }

        const index = lx + ly * this.chunkWidth + lz * this.chunkWidth * this.chunkHeight;
        const oldType = chunk.voxels[index];
        chunk.voxels[index] = blockType;

        if (oldType === 10) this.placedTorches.delete(blockKey);
        if (blockType === 10) this.placedTorches.add(blockKey);

        this.rebuildChunkMesh(cx, cz);

        if (lx === 0) this.rebuildChunkMesh(cx - 1, cz);
        if (lx === this.chunkWidth - 1) this.rebuildChunkMesh(cx + 1, cz);
        if (lz === 0) this.rebuildChunkMesh(cx, cz - 1);
        if (lz === this.chunkDepth - 1) this.rebuildChunkMesh(cx, cz + 1);
    }

    generateChunkData(cx, cz) {
        const size = this.chunkWidth * this.chunkHeight * this.chunkDepth;
        const voxels = new Uint8Array(size);
        const chunk = { voxels, cx, cz, mesh: null, waterMesh: null };

        for (let lx = 0; lx < this.chunkWidth; lx++) {
            for (let lz = 0; lz < this.chunkDepth; lz++) {
                const gx = cx * this.chunkWidth + lx;
                const gz = cz * this.chunkDepth + lz;

                const tempVal = this.noise.fbm2D(gx * 0.005, gz * 0.005, 2, 0.5, 2.0);
                
                let biome = 'plains';
                let height = 12;

                if (tempVal > 0.16) {
                    biome = 'desert';
                    const noiseVal = this.noise.fbm2D(gx * 0.009, gz * 0.009, 2, 0.5, 2.0);
                    height = Math.floor(9 + noiseVal * 7);
                } else if (tempVal < -0.16) {
                    biome = 'snowy';
                    const noiseVal = this.noise.fbm2D(gx * 0.016, gz * 0.016, 4, 0.5, 2.0);
                    height = Math.floor(14 + noiseVal * 14);
                } else {
                    biome = 'plains';
                    const noiseVal = this.noise.fbm2D(gx * 0.012, gz * 0.012, 3, 0.5, 2.0);
                    height = Math.floor(11 + noiseVal * 9);
                }

                height = Math.max(3, Math.min(this.chunkHeight - 1, height));

                // Fill columns
                for (let ly = 0; ly < this.chunkHeight; ly++) {
                    const idx = lx + ly * this.chunkWidth + lz * this.chunkWidth * this.chunkHeight;
                    
                    if (ly === 0) {
                        voxels[idx] = 3;
                        continue;
                    }

                    if (ly < height) {
                        if (biome === 'desert') {
                            if (ly >= height - 3) {
                                voxels[idx] = 6; // Sand
                            } else {
                                voxels[idx] = 3; // Stone
                            }
                        } else if (biome === 'snowy') {
                            if (ly === height - 1) {
                                voxels[idx] = 12; // Snow block
                            } else if (ly >= height - 4) {
                                voxels[idx] = 2; // Dirt
                            } else {
                                voxels[idx] = 3; // Stone
                            }
                        } else { // plains
                            if (ly === height - 1) {
                                voxels[idx] = (height <= 8) ? 6 : 1; 
                            } else if (ly >= height - 4) {
                                voxels[idx] = 2; // Dirt
                            } else {
                                voxels[idx] = 3; // Stone
                            }
                        }

                        if (voxels[idx] === 3) {
                            const rand = Math.random();
                            if (ly < 16 && rand < 0.035) {
                                voxels[idx] = 16; // Iron Ore
                            } else if (ly < 22 && rand < 0.05) {
                                voxels[idx] = 13; // Coal Ore
                            }
                        }
                    } else {
                        if (ly <= 7) {
                            voxels[idx] = 7; // Water
                        } else {
                            voxels[idx] = 0; // Air
                        }
                    }
                }
            }
        }

        // Cave hollowing
        for (let lx = 0; lx < this.chunkWidth; lx++) {
            for (let lz = 0; lz < this.chunkDepth; lz++) {
                const gx = cx * this.chunkWidth + lx;
                const gz = cz * this.chunkDepth + lz;

                for (let ly = 1; ly < this.chunkHeight; ly++) { 
                    const idx = lx + ly * this.chunkWidth + lz * this.chunkWidth * this.chunkHeight;
                    const block = voxels[idx];

                    if (block === 3 || block === 13 || block === 16 || block === 2) {
                        const caveNoise = this.noise.fbm3D(gx * 0.09, ly * 0.13, gz * 0.09, 3, 0.5, 2.0);
                        if (caveNoise > 0.45 && ly < this.chunkHeight - 4) {
                            voxels[idx] = 0; 
                        }
                    }
                }
            }
        }

        // Spawn vegetation
        for (let lx = 2; lx < this.chunkWidth - 2; lx++) {
            for (let lz = 2; lz < this.chunkDepth - 2; lz++) {
                const gx = cx * this.chunkWidth + lx;
                const gz = cz * this.chunkDepth + lz;

                const tempVal = this.noise.fbm2D(gx * 0.005, gz * 0.005, 2, 0.5, 2.0);
                
                let height = -1;
                for (let y = this.chunkHeight - 1; y >= 0; y--) {
                    const idx = lx + y * this.chunkWidth + lz * this.chunkWidth * this.chunkHeight;
                    if (voxels[idx] !== 0 && voxels[idx] !== 7) {
                        height = y + 1;
                        break;
                    }
                }

                if (height < 6 || height >= this.chunkHeight - 5) continue;
                const groundIdx = lx + (height - 1) * this.chunkWidth + lz * this.chunkWidth * this.chunkHeight;
                const groundBlock = voxels[groundIdx];

                if (tempVal > 0.16) {
                    if (groundBlock === 6 && Math.random() < 0.01) {
                        const cactusHeight = 2 + Math.floor(Math.random() * 2);
                        for (let ch = 0; ch < cactusHeight; ch++) {
                            const cy = height + ch;
                            const cIdx = lx + cy * this.chunkWidth + lz * this.chunkWidth * this.chunkHeight;
                            voxels[cIdx] = 11;
                        }
                    }
                } else if (tempVal < -0.16) {
                    if (groundBlock === 12 && Math.random() < 0.01) {
                        const trunkHeight = 4;
                        for (let th = 0; th < trunkHeight; th++) {
                            const ty = height + th;
                            const tIdx = lx + ty * this.chunkWidth + lz * this.chunkWidth * this.chunkHeight;
                            voxels[tIdx] = 4;
                        }
                        const leafStartY = height + trunkHeight - 2;
                        for (let dy = -1; dy <= 2; dy++) {
                            const ly = leafStartY + dy;
                            const radius = (dy === 2) ? 1 : 2;
                            for (let dx = -radius; dx <= radius; dx++) {
                                for (let dz = -radius; dz <= radius; dz++) {
                                    if (dx === 0 && dz === 0 && dy < 1) continue;
                                    const leafLx = lx + dx;
                                    const leafLz = lz + dz;
                                    const leafIdx = leafLx + ly * this.chunkWidth + leafLz * this.chunkWidth * this.chunkHeight;
                                    if (voxels[leafIdx] === 0) {
                                        voxels[leafIdx] = (dy === 2) ? 12 : 5;
                                    }
                                }
                            }
                        }
                    }
                } else {
                    if (groundBlock === 1 && Math.random() < 0.012) {
                        const trunkHeight = 4 + Math.floor(Math.random() * 2);
                        for (let th = 0; th < trunkHeight; th++) {
                            const ty = height + th;
                            const tIdx = lx + ty * this.chunkWidth + lz * this.chunkWidth * this.chunkHeight;
                            voxels[tIdx] = 4;
                        }
                        const leafStartY = height + trunkHeight - 2;
                        for (let dy = -2; dy <= 2; dy++) {
                            const ly = leafStartY + dy;
                            const radius = (dy >= 1) ? 1 : 2;
                            for (let dx = -radius; dx <= radius; dx++) {
                                for (let dz = -radius; dz <= radius; dz++) {
                                    if (dx === 0 && dz === 0 && dy < 1) continue;
                                    const leafLx = lx + dx;
                                    const leafLz = lz + dz;
                                    const leafIdx = leafLx + ly * this.chunkWidth + leafLz * this.chunkWidth * this.chunkHeight;
                                    if (voxels[leafIdx] === 0) {
                                        voxels[leafIdx] = 5;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // Register placed torches
        for (let i = 0; i < size; i++) {
            if (voxels[i] === 10) {
                const lx = i % this.chunkWidth;
                const ly = Math.floor((i % (this.chunkWidth * this.chunkHeight)) / this.chunkWidth);
                const lz = Math.floor(i / (this.chunkWidth * this.chunkHeight));
                const gx = cx * this.chunkWidth + lx;
                const gz = cz * this.chunkDepth + lz;
                this.placedTorches.add(`${gx},${ly},${gz}`);
            }
        }

        return chunk;
    }

    rebuildChunkMesh(cx, cz) {
        const chunkKey = `${cx},${cz}`;
        const chunk = this.chunks.get(chunkKey);
        if (!chunk) return;

        if (chunk.mesh) {
            this.scene.remove(chunk.mesh);
            chunk.mesh.geometry.dispose();
            chunk.mesh = null;
        }
        if (chunk.waterMesh) {
            this.scene.remove(chunk.waterMesh);
            chunk.waterMesh.geometry.dispose();
            chunk.waterMesh = null;
        }

        this.buildChunkMesh(chunk);
    }

    isAOOccluder(blockId) {
        // Water, Torches, Glass, and Air do not cast Ambient Occlusion shadows
        return blockId !== 0 && blockId !== 7 && blockId !== 10 && blockId !== 8;
    }

    /**
     * Voxel Smooth Lighting (AO Corner Shading) Solver.
     * Computes the ambient occlusion multiplier for a single vertex corner of an exposed face.
     */
    getVertexAO(bx, by, bz, fx, fy, fz, tx, ty, tz) {
        // Find side tangent coordinates based on normal direction
        let s1x = 0, s1y = 0, s1z = 0;
        let s2x = 0, s2y = 0, s2z = 0;
        
        if (fx !== 0) { 
            s1y = ty > 0 ? 1 : -1;
            s2z = tz > 0 ? 1 : -1;
        } else if (fy !== 0) { 
            s1x = tx > 0 ? 1 : -1;
            s2z = tz > 0 ? 1 : -1;
        } else if (fz !== 0) { 
            s1x = tx > 0 ? 1 : -1;
            s2y = ty > 0 ? 1 : -1;
        }

        const nx = bx + fx;
        const ny = by + fy;
        const nz = bz + fz;

        const side1 = this.isAOOccluder(this.getBlock(nx + s1x, ny + s1y, nz + s1z));
        const side2 = this.isAOOccluder(this.getBlock(nx + s2x, ny + s2y, nz + s2z));
        const corner = this.isAOOccluder(this.getBlock(nx + s1x + s2x, ny + s1y + s2y, nz + s1z + s2z));

        let ao = 3;
        if (side1 && side2) {
            ao = 0; // Fully enclosed corner
        } else {
            ao = 3 - (side1 ? 1 : 0) - (side2 ? 1 : 0) - (corner ? 1 : 0);
        }

        // Map occlusion rating to color multiplier
        if (ao === 0) return 0.44;
        if (ao === 1) return 0.64;
        if (ao === 2) return 0.82;
        return 1.0; // Fully lit
    }

    buildChunkMesh(chunk) {
        const { cx, cz, voxels } = chunk;

        const solidPositions = [];
        const solidNormals = [];
        const solidUVs = [];
        const solidColors = []; // Vertex Ambient Occlusion values
        const solidIndices = [];

        const waterPositions = [];
        const waterNormals = [];
        const waterUVs = [];
        const waterColors = [];
        const waterIndices = [];

        const faceDirections = [
            { dir: [1, 0, 0],  name: 'right',  normal: [1, 0, 0] },
            { dir: [-1, 0, 0], name: 'left',   normal: [-1, 0, 0] },
            { dir: [0, 1, 0],  name: 'top',    normal: [0, 1, 0] },
            { dir: [0, -1, 0], name: 'bottom', normal: [0, -1, 0] },
            { dir: [0, 0, 1],  name: 'front',  normal: [0, 0, 1] },
            { dir: [0, 0, -1], name: 'back',   normal: [0, 0, -1] }
        ];

        for (let lx = 0; lx < this.chunkWidth; lx++) {
            for (let ly = 0; ly < this.chunkHeight; ly++) {
                for (let lz = 0; lz < this.chunkDepth; lz++) {
                    
                    const index = lx + ly * this.chunkWidth + lz * this.chunkWidth * this.chunkHeight;
                    const blockId = voxels[index];
                    
                    if (blockId === 0) continue;
                    
                    const isWater = blockId === 7;
                    const isTorch = blockId === 10;
                    
                    const globalX = cx * this.chunkWidth + lx;
                    const globalY = ly;
                    const globalZ = cz * this.chunkDepth + lz;

                    if (isTorch) {
                        const tx = globalX;
                        const ty = globalY;
                        const tz = globalZ;

                        const x0 = tx + 0.42;
                        const x1 = tx + 0.58;
                        const y0 = ty;
                        const y1 = ty + 0.65;
                        const z0 = tz + 0.42;
                        const z1 = tz + 0.58;

                        const torchFaces = [
                            { verts: [x1, y0, z1,  x1, y0, z0,  x1, y1, z0,  x1, y1, z1], norm: [0, 1, 0], uv: 'side' },
                            { verts: [x0, y0, z0,  x0, y0, z1,  x0, y1, z1,  x0, y1, z0], norm: [0, 1, 0], uv: 'side' },
                            { verts: [x0, y1, z1,  x1, y1, z1,  x1, y1, z0,  x0, y1, z0], norm: [0, 1, 0], uv: 'top' },
                            { verts: [x0, y0, z0,  x1, y0, z0,  x1, y0, z1,  x0, y0, z1], norm: [0, 1, 0], uv: 'bottom' },
                            { verts: [x0, y0, z1,  x1, y0, z1,  x1, y1, z1,  x0, y1, z1], norm: [0, 1, 0], uv: 'side' },
                            { verts: [x1, y0, z0,  x0, y0, z0,  x0, y1, z0,  x1, y1, z0], norm: [0, 1, 0], uv: 'side' }
                        ];

                        torchFaces.forEach(face => {
                            const vStart = solidPositions.length / 3;
                            solidPositions.push(...face.verts);
                            for (let i = 0; i < 4; i++) {
                                solidNormals.push(...face.norm);
                                // Torches glow fully (no AO corners)
                                solidColors.push(1.0, 1.0, 1.0);
                            }
                            
                            const { u0, u1, v0, v1 } = this.textureManager.getFaceUVs(blockId, face.uv);
                            solidUVs.push(u0, v0, u1, v0, u1, v1, u0, v1);
                            solidIndices.push(vStart, vStart + 1, vStart + 2, vStart, vStart + 2, vStart + 3);
                        });

                        continue;
                    }

                    // Standard Cube Face Culling
                    for (let f = 0; f < 6; f++) {
                        const { dir, normal } = faceDirections[f];
                        
                        const neighborX = globalX + dir[0];
                        const neighborY = globalY + dir[1];
                        const neighborZ = globalZ + dir[2];

                        const neighborId = this.getBlock(neighborX, neighborY, neighborZ);

                        let drawFace = false;
                        if (isWater) {
                            drawFace = (neighborId === 0 || neighborId === 8 || neighborId === 10);
                        } else {
                            if (blockId === 8) { 
                                drawFace = (neighborId !== 8 && (neighborId === 0 || neighborId === 7 || neighborId === 10));
                            } else {
                                drawFace = (neighborId === 0 || neighborId === 7 || neighborId === 8 || neighborId === 10);
                            }
                        }

                        if (drawFace) {
                            const targetPos = isWater ? waterPositions : solidPositions;
                            const targetNorm = isWater ? waterNormals : solidNormals;
                            const targetUVs = isWater ? waterUVs : solidUVs;
                            const targetColors = isWater ? waterColors : solidColors;
                            const targetIndices = isWater ? waterIndices : solidIndices;
                            const vStart = targetPos.length / 3;

                            const x = globalX;
                            const y = globalY;
                            const z = globalZ;

                            let verts = [];
                            if (f === 0) { // +X
                                verts = [x+1, y, z+1,  x+1, y, z,  x+1, y+1, z,  x+1, y+1, z+1];
                            } else if (f === 1) { // -X
                                verts = [x, y, z,  x, y, z+1,  x, y+1, z+1,  x, y+1, z];
                            } else if (f === 2) { // +Y
                                verts = [x, y+1, z+1,  x+1, y+1, z+1,  x+1, y+1, z,  x, y+1, z];
                            } else if (f === 3) { // -Y
                                verts = [x, y, z,  x+1, y, z,  x+1, y, z+1,  x, y, z+1];
                            } else if (f === 4) { // +Z
                                verts = [x, y, z+1,  x+1, y, z+1,  x+1, y+1, z+1,  x, y+1, z+1];
                            } else if (f === 5) { // -Z
                                verts = [x+1, y, z,  x, y, z,  x, y+1, z,  x+1, y+1, z];
                            }

                            targetPos.push(...verts);
                            for (let i = 0; i < 4; i++) {
                                targetNorm.push(...normal);

                                // Compute vertex offsets and Ambient Occlusion multipliers
                                const vx = verts[i * 3];
                                const vy = verts[i * 3 + 1];
                                const vz = verts[i * 3 + 2];
                                
                                const tx = vx - (globalX + 0.5);
                                const ty = vy - (globalY + 0.5);
                                const tz = vz - (globalZ + 0.5);
                                
                                const ao = this.getVertexAO(globalX, globalY, globalZ, dir[0], dir[1], dir[2], tx, ty, tz);
                                targetColors.push(ao, ao, ao); // RGB multipliers mapping
                            }

                            const faceUVName = (f === 2) ? 'top' : ((f === 3) ? 'bottom' : 'side');
                            const { u0, u1, v0, v1 } = this.textureManager.getFaceUVs(blockId, faceUVName);

                            targetUVs.push(u0, v0, u1, v0, u1, v1, u0, v1);
                            targetIndices.push(vStart, vStart + 1, vStart + 2, vStart, vStart + 2, vStart + 3);
                        }
                    }
                }
            }
        }

        if (solidPositions.length > 0) {
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(solidPositions, 3));
            geometry.setAttribute('normal', new THREE.Float32BufferAttribute(solidNormals, 3));
            geometry.setAttribute('uv', new THREE.Float32BufferAttribute(solidUVs, 2));
            geometry.setAttribute('color', new THREE.Float32BufferAttribute(solidColors, 3)); // Injects AO colors
            geometry.setIndex(solidIndices);
            
            const mesh = new THREE.Mesh(geometry, this.solidMaterial);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            
            chunk.mesh = mesh;
            this.scene.add(mesh);
            this.activeMeshes.push(mesh);
        }

        if (waterPositions.length > 0) {
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(waterPositions, 3));
            geometry.setAttribute('normal', new THREE.Float32BufferAttribute(waterNormals, 3));
            geometry.setAttribute('uv', new THREE.Float32BufferAttribute(waterUVs, 2));
            geometry.setAttribute('color', new THREE.Float32BufferAttribute(waterColors, 3));
            geometry.setIndex(waterIndices);

            const mesh = new THREE.Mesh(geometry, this.waterMaterial);
            mesh.castShadow = true;
            mesh.receiveShadow = true;

            chunk.waterMesh = mesh;
            this.scene.add(mesh);
            this.activeMeshes.push(mesh);
        }
    }

    updateChunksAroundPlayer(playerX, playerZ, sunIntensity = 0.65) {
        const playerChunk = this.globalToChunkCoords(playerX, 0, playerZ);
        const pcx = playerChunk.cx;
        const pcz = playerChunk.cz;

        const currentKeys = new Set();

        for (let xOffset = -this.renderDistance; xOffset <= this.renderDistance; xOffset++) {
            for (let zOffset = -this.renderDistance; zOffset <= this.renderDistance; zOffset++) {
                const cx = pcx + xOffset;
                const cz = pcz + zOffset;
                const key = `${cx},${cz}`;
                currentKeys.add(key);

                if (!this.chunks.has(key)) {
                    const chunk = this.generateChunkData(cx, cz);
                    this.chunks.set(key, chunk);
                }
            }
        }

        for (const [key, chunk] of this.chunks) {
            if (currentKeys.has(key)) {
                if (!chunk.mesh && !chunk.waterMesh) {
                    this.buildChunkMesh(chunk);
                }
            } else {
                if (chunk.mesh) {
                    this.scene.remove(chunk.mesh);
                    chunk.mesh.geometry.dispose();
                    chunk.mesh = null;
                }
                if (chunk.waterMesh) {
                    this.scene.remove(chunk.waterMesh);
                    chunk.waterMesh.geometry.dispose();
                    chunk.waterMesh = null;
                }
            }
        }

        this.activeMeshes = [];
        for (const chunk of this.chunks.values()) {
            if (chunk.mesh) this.activeMeshes.push(chunk.mesh);
            if (chunk.waterMesh) this.activeMeshes.push(chunk.waterMesh);
        }

        this.updateTorchLights(playerX, playerZ, sunIntensity);
    }

    updateTorchLights(playerX, playerZ, sunIntensity = 0.65) {
        const torchesList = [];
        for (const key of this.placedTorches) {
            const [tx, ty, tz] = key.split(',').map(Number);
            const dx = tx - playerX;
            const dz = tz - playerZ;
            const distSq = dx * dx + dz * dz;
            if (distSq < 4000) {
                torchesList.push({ tx, ty, tz, distSq });
            }
        }

        torchesList.sort((a, b) => a.distSq - b.distSq);

        const count = Math.min(this.maxLights, torchesList.length);
        const time = Date.now() * 0.015;
        
        for (let i = 0; i < this.maxLights; i++) {
            const light = this.lightPool[i];
            
            if (i < count) {
                const torch = torchesList[i];
                
                // Realistic 3D flame jitter wobble
                const wobbleX = Math.sin(time + i) * 0.035;
                const wobbleY = Math.cos(time * 0.8 + i) * 0.045; // Vertical flicker bias
                const wobbleZ = Math.sin(time * 1.3 + i) * 0.035;

                light.position.set(
                    torch.tx + 0.5 + wobbleX, 
                    torch.ty + 0.65 + wobbleY, 
                    torch.tz + 0.5 + wobbleZ
                );
                
                // Scale intensity based on day/night: Day is dim (0.35), Night is bright (1.85)
                const maxSun = 0.65;
                const dayFactor = Math.min(1.0, Math.max(0.0, sunIntensity / maxSun));
                const baseIntensity = 0.35 + (1.0 - dayFactor) * 1.5;
                
                // Fluctuate intensity with flicker wobble
                light.intensity = baseIntensity * (1.0 + Math.sin(time * 0.5 + i) * 0.08 + Math.cos(time * 1.1) * 0.03);
                light.visible = true;

                light.castShadow = false;
            } else {
                light.visible = false;
                light.intensity = 0;
                light.castShadow = false;
            }
        }
    }

    /**
     * Day/Night sky, fog, and light interpolation engine
     */
    updateDayNightCycle(timePercent, sunLight, ambientLight) {
        const now = timePercent; // Range: [0.0, 1.0]

        let skyColor = new THREE.Color(0x7ec0ee);
        let sunIntensity = 0.65;
        let ambientIntensity = 0.48;

        // Day/Night transition stages
        if (now >= 0.0 && now < 0.42) {
            skyColor.setHex(0x7ec0ee);
            sunIntensity = 0.65;
            ambientIntensity = 0.48;
        } else if (now >= 0.42 && now < 0.55) {
            const t = (now - 0.42) / 0.13;
            const daySky = new THREE.Color(0x7ec0ee);
            const duskSky = new THREE.Color(0xd35400); 
            const nightSky = new THREE.Color(0x0a0a14); 
            
            if (t < 0.5) {
                skyColor.copy(daySky).lerp(duskSky, t * 2);
            } else {
                skyColor.copy(duskSky).lerp(nightSky, (t - 0.5) * 2);
            }
            
            sunIntensity = 0.65 - (0.65 - 0.18) * t; // Smoothly fades to moonlight intensity
            ambientIntensity = 0.48 * (1.0 - t * 0.7); 
        } else if (now >= 0.55 && now < 0.88) {
            skyColor.setHex(0x05050f); 
            sunIntensity = 0.18; // Moonlight active at night
            ambientIntensity = 0.12; 
        } else {
            const t = (now - 0.88) / 0.12;
            const nightSky = new THREE.Color(0x05050f);
            const dawnSky = new THREE.Color(0xe67e22); 
            const daySky = new THREE.Color(0x7ec0ee);

            if (t < 0.5) {
                skyColor.copy(nightSky).lerp(dawnSky, t * 2);
            } else {
                skyColor.copy(dawnSky).lerp(daySky, (t - 0.5) * 2);
            }

            sunIntensity = 0.18 + (0.65 - 0.18) * t; // Fades back to full sunlight
            ambientIntensity = 0.12 + (0.48 - 0.12) * t;
        }

        // Apply background and fog colors
        this.scene.background.copy(skyColor);
        if (this.scene.fog) {
            this.scene.fog.color.copy(skyColor);
        }

        if (sunLight) {
            sunLight.intensity = sunIntensity;
        }

        if (ambientLight) {
            ambientLight.intensity = ambientIntensity;
        }
    }

    clearWorld() {
        for (const chunk of this.chunks.values()) {
            if (chunk.mesh) {
                this.scene.remove(chunk.mesh);
                chunk.mesh.geometry.dispose();
            }
            if (chunk.waterMesh) {
                this.scene.remove(chunk.waterMesh);
                chunk.waterMesh.geometry.dispose();
            }
        }
        this.chunks.clear();
        this.activeMeshes = [];
        this.placedTorches.clear();
        this.lightPool.forEach(l => {
            l.visible = false;
            l.intensity = 0;
            l.castShadow = false;
        });
    }
}

window.World = World;
