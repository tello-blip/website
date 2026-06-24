/**
 * World - Manages voxel chunks, multi-biome terrain generation, 3D caves,
 * customized torch geometry, and a dynamic pool of orange point-lights.
 */
class World {
    constructor(scene, textureManager) {
        this.scene = scene;
        this.textureManager = textureManager;

        // Chunk dimensions
        this.chunkWidth = 16;
        this.chunkDepth = 16;
        this.chunkHeight = 32;

        // Seeded noise generator
        this.noise = new window.ImprovedNoise(67890); // Different seed for variety
        
        // Chunk storage: maps 'cx,cz' -> { voxels: Uint8Array, mesh: THREE.Mesh, waterMesh: THREE.Mesh, cx, cz }
        this.chunks = new Map();
        
        // Render distance
        this.renderDistance = 4;
        
        // Material compile
        this.texture = this.textureManager.createThreeTexture();
        
        // Solid blocks material
        this.solidMaterial = new THREE.MeshLambertMaterial({
            map: this.texture,
            transparent: true,
            alphaTest: 0.15,
            side: THREE.FrontSide
        });

        // Water material
        this.waterMaterial = new THREE.MeshLambertMaterial({
            map: this.texture,
            transparent: true,
            opacity: 0.6,
            side: THREE.DoubleSide
        });

        // Tracking active meshes in scene for raycasting
        this.activeMeshes = [];

        // Placed torches global registry (stores absolute coordinates as string 'x,y,z')
        this.placedTorches = new Set();

        // Point light pool (max 10 lights to maintain performance)
        this.maxLights = 10;
        this.lightPool = [];
        this.activeLights = [];
        this.initLightPool();
    }

    /**
     * Set up a pool of warm point-lights
     */
    initLightPool() {
        for (let i = 0; i < this.maxLights; i++) {
            const light = new THREE.PointLight(0xffaa44, 0, 12, 1.5); // Warm yellow-orange
            light.visible = false;
            this.scene.add(light);
            this.lightPool.push(light);
        }
    }

    /**
     * Converts global coordinates to chunk coordinates
     */
    globalToChunkCoords(x, y, z) {
        return {
            cx: Math.floor(x / this.chunkWidth),
            cz: Math.floor(z / this.chunkDepth),
            lx: ((Math.floor(x) % this.chunkWidth) + this.chunkWidth) % this.chunkWidth,
            ly: Math.max(0, Math.min(this.chunkHeight - 1, Math.floor(y))),
            lz: ((Math.floor(z) % this.chunkDepth) + this.chunkDepth) % this.chunkDepth
        };
    }

    /**
     * Get block at global coordinates
     */
    getBlock(x, y, z) {
        if (y < 0) return 3; // Bedrock barrier (Stone)
        if (y >= this.chunkHeight) return 0; // Air above sky

        const { cx, cz, lx, ly, lz } = this.globalToChunkCoords(x, y, z);
        const chunkKey = `${cx},${cz}`;
        
        const chunk = this.chunks.get(chunkKey);
        if (!chunk) return 0; // Air for ungenerated chunks

        const index = lx + ly * this.chunkWidth + lz * this.chunkWidth * this.chunkHeight;
        return chunk.voxels[index];
    }

    /**
     * Set block at global coordinates and rebuild affected chunk meshes
     */
    setBlock(x, y, z, blockType) {
        if (y < 0 || y >= this.chunkHeight) return;

        const { cx, cz, lx, ly, lz } = this.globalToChunkCoords(x, y, z);
        const chunkKey = `${cx},${cz}`;
        const blockKey = `${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`;
        
        // Force chunk generation if it doesn't exist
        let chunk = this.chunks.get(chunkKey);
        if (!chunk) {
            chunk = this.generateChunkData(cx, cz);
            this.chunks.set(chunkKey, chunk);
        }

        const index = lx + ly * this.chunkWidth + lz * this.chunkWidth * this.chunkHeight;
        const oldType = chunk.voxels[index];
        chunk.voxels[index] = blockType;

        // Manage torch lights
        if (oldType === 10) {
            this.placedTorches.delete(blockKey);
        }
        if (blockType === 10) {
            this.placedTorches.add(blockKey);
        }

        // Rebuild this chunk mesh
        this.rebuildChunkMesh(cx, cz);

        // If we edited a border block, we must rebuild the neighboring chunk too
        if (lx === 0) this.rebuildChunkMesh(cx - 1, cz);
        if (lx === this.chunkWidth - 1) this.rebuildChunkMesh(cx + 1, cz);
        if (lz === 0) this.rebuildChunkMesh(cx, cz - 1);
        if (lz === this.chunkDepth - 1) this.rebuildChunkMesh(cx, cz + 1);
    }

    /**
     * Generates a chunk's voxel data arrays procedurally with Biomes & Caves
     */
    generateChunkData(cx, cz) {
        const size = this.chunkWidth * this.chunkHeight * this.chunkDepth;
        const voxels = new Uint8Array(size);
        const chunk = { voxels, cx, cz, mesh: null, waterMesh: null };

        // Generate base terrain
        for (let lx = 0; lx < this.chunkWidth; lx++) {
            for (let lz = 0; lz < this.chunkDepth; lz++) {
                const gx = cx * this.chunkWidth + lx;
                const gz = cz * this.chunkDepth + lz;

                // 1. Biome Temperature noise
                // Low-frequency noise: positive values are warm (Desert), negative are cold (Snowy)
                const tempVal = this.noise.fbm2D(gx * 0.006, gz * 0.006, 2, 0.5, 2.0);
                
                let biome = 'plains';
                let height = 12;

                if (tempVal > 0.16) {
                    biome = 'desert';
                    // Flatter, undulating dunes
                    const noiseVal = this.noise.fbm2D(gx * 0.01, gz * 0.01, 2, 0.5, 2.0);
                    height = Math.floor(9 + noiseVal * 7);
                } else if (tempVal < -0.16) {
                    biome = 'snowy';
                    // Taller, steeper peaks
                    const noiseVal = this.noise.fbm2D(gx * 0.018, gz * 0.018, 4, 0.5, 2.0);
                    height = Math.floor(13 + noiseVal * 15);
                } else {
                    biome = 'plains';
                    // Standard rolling hills
                    const noiseVal = this.noise.fbm2D(gx * 0.014, gz * 0.014, 3, 0.5, 2.0);
                    height = Math.floor(11 + noiseVal * 9);
                }

                height = Math.max(3, Math.min(this.chunkHeight - 1, height));

                // Fill columns
                for (let ly = 0; ly < this.chunkHeight; ly++) {
                    const idx = lx + ly * this.chunkWidth + lz * this.chunkWidth * this.chunkHeight;
                    
                    if (ly < height) {
                        // Voxel layers based on Biome
                        if (biome === 'desert') {
                            if (ly >= height - 3) {
                                voxels[idx] = 6; // Sand
                            } else {
                                voxels[idx] = 3; // Stone
                            }
                        } else if (biome === 'snowy') {
                            if (ly === height - 1) {
                                voxels[idx] = 12; // Snow cover block
                            } else if (ly >= height - 4) {
                                voxels[idx] = 2; // Dirt
                            } else {
                                voxels[idx] = 3; // Stone
                            }
                        } else { // Plains
                            if (ly === height - 1) {
                                voxels[idx] = (height <= 8) ? 6 : 1; // Sand shores or Grass
                            } else if (ly >= height - 4) {
                                voxels[idx] = 2; // Dirt
                            } else {
                                voxels[idx] = 3; // Stone
                            }
                        }

                        // Generate Coal Ore seams inside Stone (5% chance)
                        if (voxels[idx] === 3 && Math.random() < 0.05) {
                            voxels[idx] = 13; // Coal Ore
                        }
                    } else {
                        // Global water level (y = 7)
                        if (ly <= 7) {
                            voxels[idx] = 7; // Water
                        } else {
                            voxels[idx] = 0; // Air
                        }
                    }
                }
            }
        }

        // 2. 3D Caves subtraction
        // Hollow out stone/dirt layers below terrain surface using 3D noise
        for (let lx = 0; lx < this.chunkWidth; lx++) {
            for (let lz = 0; lz < this.chunkDepth; lz++) {
                const gx = cx * this.chunkWidth + lx;
                const gz = cz * this.chunkDepth + lz;

                for (let ly = 0; ly < this.chunkHeight; ly++) {
                    const idx = lx + ly * this.chunkWidth + lz * this.chunkWidth * this.chunkHeight;
                    const block = voxels[idx];

                    // Only hollow out solid blocks (stone, coal ore, dirt)
                    if (block === 3 || block === 13 || block === 2) {
                        const caveNoise = this.noise.fbm3D(gx * 0.09, ly * 0.13, gz * 0.09, 3, 0.5, 2.0);
                        
                        // Hollow out if noise threshold exceeded and below ground level
                        if (caveNoise > 0.45 && ly < this.chunkHeight - 4) {
                            voxels[idx] = 0; // Cave air
                        }
                    }
                }
            }
        }

        // 3. Vegetation Generation (Cactus, Trees, etc.)
        for (let lx = 2; lx < this.chunkWidth - 2; lx++) {
            for (let lz = 2; lz < this.chunkDepth - 2; lz++) {
                const gx = cx * this.chunkWidth + lx;
                const gz = cz * this.chunkDepth + lz;

                // Re-evaluate biome at this spot
                const tempVal = this.noise.fbm2D(gx * 0.006, gz * 0.006, 2, 0.5, 2.0);
                
                // Get ground height after cave subtraction
                let height = -1;
                for (let y = this.chunkHeight - 1; y >= 0; y--) {
                    const idx = lx + y * this.chunkWidth + lz * this.chunkWidth * this.chunkHeight;
                    if (voxels[idx] !== 0 && voxels[idx] !== 7) { // Solid ground
                        height = y + 1;
                        break;
                    }
                }

                if (height < 6 || height >= this.chunkHeight - 5) continue;
                const groundIdx = lx + (height - 1) * this.chunkWidth + lz * this.chunkWidth * this.chunkHeight;
                const groundBlock = voxels[groundIdx];

                if (tempVal > 0.16) {
                    // --- Desert: Cactus Spawning ---
                    if (groundBlock === 6 && Math.random() < 0.01) { // On sand
                        const cactusHeight = 2 + Math.floor(Math.random() * 2); // 2 or 3 tall
                        for (let ch = 0; ch < cactusHeight; ch++) {
                            const cy = height + ch;
                            const cIdx = lx + cy * this.chunkWidth + lz * this.chunkWidth * this.chunkHeight;
                            voxels[cIdx] = 11; // Cactus
                        }
                    }
                } else if (tempVal < -0.16) {
                    // --- Snowy Mountain: Sparse Snowy Trees ---
                    if (groundBlock === 12 && Math.random() < 0.01) { // On snow
                        const trunkHeight = 4;
                        // Trunk (Wood)
                        for (let th = 0; th < trunkHeight; th++) {
                            const ty = height + th;
                            const tIdx = lx + ty * this.chunkWidth + lz * this.chunkWidth * this.chunkHeight;
                            voxels[tIdx] = 4;
                        }
                        // Leaves capped with snow on top
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
                                        voxels[leafIdx] = (dy === 2) ? 12 : 5; // Snow cap at very top, leaves otherwise
                                    }
                                }
                            }
                        }
                    }
                } else {
                    // --- Plains: Standard Oak Trees ---
                    if (groundBlock === 1 && Math.random() < 0.012) { // On grass
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

        // Register any procedurally placed torches
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

    /**
     * Rebuilds a chunk mesh if it is currently loaded
     */
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

    /**
     * Compiles BufferGeometry for a chunk.
     * Generates custom stick geometry for Torches (ID 10) instead of cubes.
     */
    buildChunkMesh(chunk) {
        const { cx, cz, voxels } = chunk;

        const solidPositions = [];
        const solidNormals = [];
        const solidUVs = [];
        const solidIndices = [];

        const waterPositions = [];
        const waterNormals = [];
        const waterUVs = [];
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
                        // --- Custom Torch Geometry: Small centered stick ---
                        // Width: [0.42, 0.58], Height: [0.0, 0.65], Depth: [0.42, 0.58]
                        const tx = globalX;
                        const ty = globalY;
                        const tz = globalZ;

                        const x0 = tx + 0.42;
                        const x1 = tx + 0.58;
                        const y0 = ty;
                        const y1 = ty + 0.65;
                        const z0 = tz + 0.42;
                        const z1 = tz + 0.58;

                        // Torch rendering has 6 small faces. We do NOT cull torch faces.
                        const torchFaces = [
                            // +X (Right)
                            { verts: [x1, y0, z1,  x1, y0, z0,  x1, y1, z0,  x1, y1, z1], norm: [1, 0, 0], uv: 'side' },
                            // -X (Left)
                            { verts: [x0, y0, z0,  x0, y0, z1,  x0, y1, z1,  x0, y1, z0], norm: [-1, 0, 0], uv: 'side' },
                            // +Y (Top)
                            { verts: [x0, y1, z1,  x1, y1, z1,  x1, y1, z0,  x0, y1, z0], norm: [0, 1, 0], uv: 'top' },
                            // -Y (Bottom)
                            { verts: [x0, y0, z0,  x1, y0, z0,  x1, y0, z1,  x0, y0, z1], norm: [0, -1, 0], uv: 'bottom' },
                            // +Z (Front)
                            { verts: [x0, y0, z1,  x1, y0, z1,  x1, y1, z1,  x0, y1, z1], norm: [0, 0, 1], uv: 'side' },
                            // -Z (Back)
                            { verts: [x1, y0, z0,  x0, y0, z0,  x0, y1, z0,  x1, y1, z0], norm: [0, 0, -1], uv: 'side' }
                        ];

                        torchFaces.forEach(face => {
                            const vStart = solidPositions.length / 3;
                            solidPositions.push(...face.verts);
                            for (let i = 0; i < 4; i++) solidNormals.push(...face.norm);
                            
                            const faceUVName = face.uv;
                            const { u0, u1, v0, v1 } = this.textureManager.getFaceUVs(blockId, faceUVName);
                            solidUVs.push(u0, v0, u1, v0, u1, v1, u0, v1);
                            
                            solidIndices.push(vStart, vStart + 1, vStart + 2, vStart, vStart + 2, vStart + 3);
                        });

                        continue; // Done with torch block
                    }

                    // --- Standard Block Cube Geometry ---
                    for (let f = 0; f < 6; f++) {
                        const { dir, name, normal } = faceDirections[f];
                        
                        const neighborX = globalX + dir[0];
                        const neighborY = globalY + dir[1];
                        const neighborZ = globalZ + dir[2];

                        const neighborId = this.getBlock(neighborX, neighborY, neighborZ);

                        let drawFace = false;
                        if (isWater) {
                            // Water exposed to Air, Glass, or Torches
                            drawFace = (neighborId === 0 || neighborId === 8 || neighborId === 10);
                        } else {
                            // Solid: exposed to Air (0), Water (7), Glass (8), or Torches (10)
                            if (blockId === 8) { // Glass
                                drawFace = (neighborId !== 8 && (neighborId === 0 || neighborId === 7 || neighborId === 10));
                            } else {
                                drawFace = (neighborId === 0 || neighborId === 7 || neighborId === 8 || neighborId === 10);
                            }
                        }

                        if (drawFace) {
                            const targetPos = isWater ? waterPositions : solidPositions;
                            const targetNorm = isWater ? waterNormals : solidNormals;
                            const targetUVs = isWater ? waterUVs : solidUVs;
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
                            for (let i = 0; i < 4; i++) targetNorm.push(...normal);

                            const faceUVName = (f === 2) ? 'top' : ((f === 3) ? 'bottom' : 'side');
                            const { u0, u1, v0, v1 } = this.textureManager.getFaceUVs(blockId, faceUVName);

                            targetUVs.push(u0, v0, u1, v0, u1, v1, u0, v1);
                            targetIndices.push(vStart, vStart + 1, vStart + 2, vStart, vStart + 2, vStart + 3);
                        }
                    }
                }
            }
        }

        // Build solid meshes
        if (solidPositions.length > 0) {
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(solidPositions, 3));
            geometry.setAttribute('normal', new THREE.Float32BufferAttribute(solidNormals, 3));
            geometry.setAttribute('uv', new THREE.Float32BufferAttribute(solidUVs, 2));
            geometry.setIndex(solidIndices);
            
            const mesh = new THREE.Mesh(geometry, this.solidMaterial);
            chunk.mesh = mesh;
            this.scene.add(mesh);
            this.activeMeshes.push(mesh);
        }

        // Build water meshes
        if (waterPositions.length > 0) {
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(waterPositions, 3));
            geometry.setAttribute('normal', new THREE.Float32BufferAttribute(waterNormals, 3));
            geometry.setAttribute('uv', new THREE.Float32BufferAttribute(waterUVs, 2));
            geometry.setIndex(waterIndices);

            const mesh = new THREE.Mesh(geometry, this.waterMaterial);
            chunk.waterMesh = mesh;
            this.scene.add(mesh);
            this.activeMeshes.push(mesh);
        }
    }

    /**
     * Update chunks list around player position
     */
    updateChunksAroundPlayer(playerX, playerZ) {
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

        // Manage torch lights pool
        this.updateTorchLights(playerX, playerZ);
    }

    /**
     * Dynamic Torch Light manager:
     * Sorts all torches in range by distance to player and binds the nearest 10 to PointLights
     */
    updateTorchLights(playerX, playerZ) {
        // Collect active torches coordinates
        const torchesList = [];
        for (const key of this.placedTorches) {
            const [tx, ty, tz] = key.split(',').map(Number);
            const dx = tx - playerX;
            const dz = tz - playerZ;
            const distSq = dx * dx + dz * dz;
            
            // Render distance boundary check (only process torches within range of ~64 blocks)
            if (distSq < 4000) {
                torchesList.push({ tx, ty, tz, distSq });
            }
        }

        // Sort by distance (closest first)
        torchesList.sort((a, b) => a.distSq - b.distSq);

        // Map up to 10 nearest torches to the PointLight pool
        const count = Math.min(this.maxLights, torchesList.length);
        
        for (let i = 0; i < this.maxLights; i++) {
            const light = this.lightPool[i];
            
            if (i < count) {
                const torch = torchesList[i];
                // Center the light inside the torch block (sligthly above bottom)
                light.position.set(torch.tx + 0.5, torch.ty + 0.65, torch.tz + 0.5);
                
                // Set intensity and warm glowing color
                light.intensity = 2.0 + Math.sin(Date.now() * 0.008 + i) * 0.15; // Gentle torch flickering!
                light.visible = true;
            } else {
                light.visible = false;
                light.intensity = 0;
            }
        }
    }

    /**
     * Clear all chunks for resetting
     */
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
        });
    }
}

// Make globally available
window.World = World;
