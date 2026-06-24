/**
 * MobManager - Handles spawning, wandering AI, physics collisions, 
 * and animations for voxel animals (Sheep & Pigs).
 */

class VoxelMob {
    constructor(scene, type, x, y, z) {
        this.scene = scene;
        this.type = type; // 'sheep' or 'pig'

        // Physics State
        this.position = new THREE.Vector3(x, y, z);
        this.velocity = new THREE.Vector3(0, 0, 0);
        this.yaw = Math.random() * Math.PI * 2;
        this.onGround = false;
        
        // Bounding Dimensions
        this.width = 0.7;
        this.height = 0.8;

        // Wander AI timers
        this.wanderTimer = 0;
        this.wanderState = 0; // 0: idle, 1: walking
        this.speed = 1.6;

        // Build 3D mesh representation
        this.group = new THREE.Group();
        this.legs = [];
        this.buildModel();
        
        this.group.position.copy(this.position);
        this.scene.add(this.group);
    }

    /**
     * Build voxel representation of sheep or pig using grouped box geometries
     */
    buildModel() {
        const createPart = (w, h, d, color, px, py, pz) => {
            const geo = new THREE.BoxGeometry(w, h, d);
            const mat = new THREE.MeshLambertMaterial({ color: color });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(px, py, pz);
            return mesh;
        };

        if (this.type === 'sheep') {
            // Body (wool) - white
            const body = createPart(0.6, 0.5, 0.9, 0xf5f5f5, 0, 0.45, 0);
            this.group.add(body);

            // Head - white base, tan face
            const head = createPart(0.3, 0.3, 0.3, 0xf0e5d8, 0, 0.7, 0.55);
            this.group.add(head);

            // Tiny black eyes
            const eyeL = createPart(0.06, 0.06, 0.02, 0x000000, 0.16, 0.75, 0.69);
            const eyeR = createPart(0.06, 0.06, 0.02, 0x000000, -0.16, 0.75, 0.69);
            this.group.add(eyeL);
            this.group.add(eyeR);

            // 4 Legs - pivot-based for swing animation
            const legColor = 0xebe0d0;
            const legW = 0.14, legH = 0.4, legD = 0.14;
            const positions = [
                { x: 0.2, z: 0.3 },  // FL
                { x: -0.2, z: 0.3 }, // FR
                { x: 0.2, z: -0.3 }, // BL
                { x: -0.2, z: -0.3 } // BR
            ];

            positions.forEach((pos, i) => {
                const legPivot = new THREE.Group();
                legPivot.position.set(pos.x, 0.35, pos.z); // Pivot point at top of leg
                
                const legMesh = createPart(legW, legH, legD, legColor, 0, -legH / 2, 0); // Offset down so pivot is at top
                legPivot.add(legMesh);
                
                this.group.add(legPivot);
                this.legs.push(legPivot);
            });

        } else { // 'pig'
            // Body - pink
            const body = createPart(0.55, 0.45, 0.8, 0xffb5b5, 0, 0.4, 0);
            this.group.add(body);

            // Head - pink
            const head = createPart(0.3, 0.3, 0.3, 0xffb5b5, 0, 0.6, 0.5);
            this.group.add(head);

            // Snout - dark pink
            const snout = createPart(0.18, 0.1, 0.1, 0xff7e7e, 0, 0.52, 0.68);
            this.group.add(snout);

            // Eyes
            const eyeL = createPart(0.05, 0.05, 0.02, 0x000000, 0.12, 0.65, 0.64);
            const eyeR = createPart(0.05, 0.05, 0.02, 0x000000, -0.12, 0.65, 0.64);
            this.group.add(eyeL);
            this.group.add(eyeR);

            // 4 Legs
            const legColor = 0xffa0a0;
            const legW = 0.12, legH = 0.35, legD = 0.12;
            const positions = [
                { x: 0.18, z: 0.28 },  // FL
                { x: -0.18, z: 0.28 }, // FR
                { x: 0.18, z: -0.28 }, // BL
                { x: -0.18, z: -0.28 } // BR
            ];

            positions.forEach((pos) => {
                const legPivot = new THREE.Group();
                legPivot.position.set(pos.x, 0.3, pos.z);
                
                const legMesh = createPart(legW, legH, legD, legColor, 0, -legH / 2, 0);
                legPivot.add(legMesh);
                
                this.group.add(legPivot);
                this.legs.push(legPivot);
            });
        }
    }

    /**
     * Check if hypothetical position collides with solid voxels
     */
    checkCollision(pos, world) {
        const hw = this.width / 2;
        const minX = pos.x - hw;
        const maxX = pos.x + hw;
        const minY = pos.y;
        const maxY = pos.y + this.height;
        const minZ = pos.z - hw;
        const maxZ = pos.z + hw;

        const startX = Math.floor(minX);
        const endX = Math.floor(maxX);
        const startY = Math.floor(minY);
        const endY = Math.floor(maxY);
        const startZ = Math.floor(minZ);
        const endZ = Math.floor(maxZ);

        for (let x = startX; x <= endX; x++) {
            for (let y = startY; y <= endY; y++) {
                for (let z = startZ; z <= endZ; z++) {
                    const blockId = world.getBlock(x, y, z);
                    // Mobs collide with solid blocks. Torches, water, air are ignored.
                    const isSolid = blockId !== 0 && blockId !== 7 && blockId !== 10;
                    
                    if (isSolid) {
                        if (maxX > x && minX < x + 1 &&
                            maxY > y && minY < y + 1 &&
                            maxZ > z && minZ < z + 1) {
                            return true;
                        }
                    }
                }
            }
        }
        return false;
    }

    /**
     * AI updates and physics collisions
     */
    update(dt, world) {
        this.wanderTimer -= dt;
        
        // 1. AI Decision Making: Stand or Walk
        if (this.wanderTimer <= 0) {
            this.wanderState = Math.random() < 0.4 ? 0 : 1; // 40% idle, 60% wander
            this.wanderTimer = 2.0 + Math.random() * 4.0; // 2 to 6 seconds duration
            
            if (this.wanderState === 1) {
                this.yaw = Math.random() * Math.PI * 2; // Choose new random direction
            }
        }

        // Apply movement vector
        if (this.wanderState === 1) {
            this.velocity.x = Math.sin(this.yaw) * this.speed;
            this.velocity.z = Math.cos(this.yaw) * this.speed;
        } else {
            this.velocity.x = 0;
            this.velocity.z = 0;
        }

        // Apply gravity
        this.velocity.y += -24.0 * dt;

        // 2. Separation Axis Movement
        // Move X axis
        const nextPos = this.position.clone();
        nextPos.x += this.velocity.x * dt;
        
        if (this.checkCollision(nextPos, world)) {
            // Collision occurred! Try to step up a block (voxels step-up)
            nextPos.y += 1.0;
            if (!this.checkCollision(nextPos, world)) {
                // Step up success!
                this.position.copy(nextPos);
            } else {
                // Step up failed, rebound direction
                this.velocity.x = 0;
                this.wanderState = 0;
                this.wanderTimer = 0; // Force immediate decision redirection
            }
        } else {
            this.position.x = nextPos.x;
        }

        // Move Z axis
        nextPos.copy(this.position);
        nextPos.z += this.velocity.z * dt;
        if (this.checkCollision(nextPos, world)) {
            nextPos.y += 1.0;
            if (!this.checkCollision(nextPos, world)) {
                this.position.copy(nextPos);
            } else {
                this.velocity.z = 0;
                this.wanderState = 0;
                this.wanderTimer = 0;
            }
        } else {
            this.position.z = nextPos.z;
        }

        // Move Y axis (Floor & ceiling)
        this.onGround = false;
        nextPos.copy(this.position);
        nextPos.y += this.velocity.y * dt;
        if (this.checkCollision(nextPos, world)) {
            if (this.velocity.y < 0) {
                this.onGround = true;
            }
            this.velocity.y = 0;
        } else {
            this.position.y = nextPos.y;
        }

        // 3. Apply orientation (rotate the model towards movement direction)
        if (this.wanderState === 1) {
            // Yaw offsets of groups are oriented backwards relative to camera, add PI
            this.group.rotation.y = this.yaw + Math.PI;
        }

        this.group.position.copy(this.position);

        // 4. Swing Legs Animation when moving
        const speed2D = Math.sqrt(this.velocity.x*this.velocity.x + this.velocity.z*this.velocity.z);
        if (speed2D > 0.1 && this.onGround) {
            // Swing legs back and forth
            const cycle = Date.now() * 0.008;
            const swingAngle = Math.sin(cycle) * 0.55;
            
            // FL and BR swing together, FR and BL swing opposite
            this.legs[0].rotation.x = swingAngle;
            this.legs[3].rotation.x = swingAngle;
            
            this.legs[1].rotation.x = -swingAngle;
            this.legs[2].rotation.x = -swingAngle;
        } else {
            // Reset legs to default vertical position
            this.legs.forEach(leg => {
                leg.rotation.x = 0;
            });
        }
    }

    /**
     * Remove from scene
     */
    destroy() {
        this.scene.remove(this.group);
        // Clean up geometries
        this.group.traverse(child => {
            if (child.isMesh) {
                child.geometry.dispose();
                child.material.dispose();
            }
        });
    }
}

class MobManager {
    constructor(scene, world) {
        this.scene = scene;
        this.world = world;
        
        this.mobs = [];
        this.maxMobs = 6;
        this.spawnDistanceMin = 15;
        this.spawnDistanceMax = 32;
    }

    /**
     * Spawns random animals near the player coordinates on grass blocks
     */
    spawnMobsAroundPlayer(playerX, playerZ) {
        if (this.mobs.length >= this.maxMobs) return;

        // Attempt a spawn (random chance per frame to avoid clusters)
        if (Math.random() > 0.02) return;

        // Choose random angle and distance
        const angle = Math.random() * Math.PI * 2;
        const dist = this.spawnDistanceMin + Math.random() * (this.spawnDistanceMax - this.spawnDistanceMin);
        
        const sx = Math.floor(playerX + Math.cos(angle) * dist);
        const sz = Math.floor(playerZ + Math.sin(angle) * dist);

        // Find terrain height at this coordinate
        let sy = -1;
        for (let y = this.world.chunkHeight - 1; y >= 0; y--) {
            const block = this.world.getBlock(sx, y, sz);
            if (block !== 0 && block !== 7) { // Solid block
                sy = y;
                break;
            }
        }

        // Spawn only on solid Grass (1) or Snow (12)
        const groundBlock = this.world.getBlock(sx, sy, sz);
        if (sy > 6 && (groundBlock === 1 || groundBlock === 12)) {
            const type = Math.random() < 0.5 ? 'sheep' : 'pig';
            const mob = new VoxelMob(this.scene, type, sx + 0.5, sy + 1.0, sz + 0.5);
            this.mobs.push(mob);
        }
    }

    /**
     * Updates and performs culling checks on all active animals
     */
    update(dt, playerX, playerZ) {
        this.spawnMobsAroundPlayer(playerX, playerZ);

        const keptMobs = [];

        for (const mob of this.mobs) {
            mob.update(dt, this.world);

            // Despawn checks
            const dx = mob.position.x - playerX;
            const dz = mob.position.z - playerZ;
            const distSq = dx * dx + dz * dz;

            const isTooFar = distSq > 60 * 60; // 60 blocks range
            const isFallenInVoid = mob.position.y < -5;

            if (isTooFar || isFallenInVoid) {
                mob.destroy();
            } else {
                keptMobs.push(mob);
            }
        }

        this.mobs = keptMobs;
    }

    /**
     * Clear all mobs
     */
    clearMobs() {
        this.mobs.forEach(mob => mob.destroy());
        this.mobs = [];
    }
}

// Make globally available
window.MobManager = MobManager;
