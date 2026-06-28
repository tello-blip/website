/**
 * MobManager - Handles peaceful animals (Sheep & Pigs) and hostile monsters (Zombies & Creepers).
 * Manages detailed 3D anatomy, wandering, pursuit, fuse swelling/flashing, panic sprint,
 * grazing block mutations, ambient vocals, and crater explosions.
 */

class VoxelMob {
    constructor(scene, type, x, y, z, world) {
        this.scene = scene;
        this.world = world;
        this.type = type; // 'sheep', 'pig', 'zombie', 'creeper'

        // Physics State
        this.position = new THREE.Vector3(x, y, z);
        this.velocity = new THREE.Vector3(0, 0, 0);
        this.yaw = Math.random() * Math.PI * 2;
        this.onGround = false;
        
        // Dimensions
        this.width = (type === 'zombie' || type === 'creeper') ? 0.6 : 0.7;
        this.height = (type === 'zombie' || type === 'creeper') ? 1.8 : 0.8;

        // AI Settings
        this.wanderTimer = 0;
        this.wanderState = 0; // 0: idle, 1: walking
        this.speed = (type === 'zombie') ? 2.3 : (type === 'creeper' ? 2.1 : 1.4);
        
        // Panic State (running when hit)
        this.panicTimer = 0;

        // Grazing State (sheep eating grass)
        this.grazeTimer = 0;
        this.grazeHeadRot = 0;

        // Combat Stats
        this.maxHealth = (type === 'zombie' || type === 'creeper') ? 20 : 10;
        this.health = this.maxHealth;
        this.isDead = false;
        this.flashRedTimer = 0;
        this.meleeCooldown = 0; // Attack cooldown

        // Creeper Fuse
        this.isExploding = false;
        this.fuseTimer = 0;
        this.maxFuse = 1.5;

        // Visual Part meshes references
        this.group = new THREE.Group();
        this.legs = [];
        this.headGroup = new THREE.Group(); // Pivot for head (grazing, looking)
        this.meshMaterials = []; // Stores { mesh, originalColor } for flashing

        this.buildModel();
        
        this.group.position.copy(this.position);
        this.scene.add(this.group);
    }

    /**
     * Build voxel models with grouped box geometries
     */
    buildModel() {
        const createPart = (w, h, d, color, px, py, pz, rx = 0, targetGroup = this.group) => {
            const geo = new THREE.BoxGeometry(w, h, d);
            const mat = new THREE.MeshLambertMaterial({ color: color });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(px, py, pz);
            mesh.rotation.x = rx;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            targetGroup.add(mesh);
            this.meshMaterials.push({ mesh, originalColor: new THREE.Color(color) });
            return mesh;
        };

        if (this.type === 'sheep') {
            // Main Body (wool)
            createPart(0.58, 0.5, 0.85, 0xf5f5f5, 0, 0.45, -0.05);
            // Thick neck wool collar block
            createPart(0.64, 0.58, 0.28, 0xeaeaea, 0, 0.52, 0.38);
            // Raised rear coat block
            createPart(0.6, 0.52, 0.38, 0xf5f5f5, 0, 0.48, -0.28);

            // Head Group (for grazing rotation)
            this.headGroup.position.set(0, 0.65, 0.48);
            this.group.add(this.headGroup);
            
            // Wool Head
            createPart(0.3, 0.3, 0.3, 0xf0e5d8, 0, 0.1, 0.1, 0, this.headGroup);
            // Muzzle snout block (tan)
            createPart(0.18, 0.18, 0.16, 0xe2d5c3, 0, 0.02, 0.25, 0, this.headGroup);
            // Floppy ears
            createPart(0.06, 0.18, 0.08, 0xe2d5c3, 0.17, 0.08, 0.1, 0.15, this.headGroup);
            createPart(0.06, 0.18, 0.08, 0xe2d5c3, -0.17, 0.08, 0.1, 0.15, this.headGroup);
            // Black eyes
            createPart(0.05, 0.05, 0.02, 0x000000, 0.12, 0.12, 0.23, 0, this.headGroup);
            createPart(0.05, 0.05, 0.02, 0x000000, -0.12, 0.12, 0.23, 0, this.headGroup);

            // 4 Legs
            const legColor = 0xebe0d0;
            const legW = 0.12, legH = 0.4, legD = 0.12;
            const legPositions = [{x: 0.18, z: 0.28}, {x: -0.18, z: 0.28}, {x: 0.18, z: -0.28}, {x: -0.18, z: -0.28}];
            legPositions.forEach(pos => {
                const legPivot = new THREE.Group();
                legPivot.position.set(pos.x, 0.35, pos.z);
                const legMesh = createPart(legW, legH, legD, legColor, 0, -legH / 2, 0);
                legPivot.add(legMesh);
                this.group.add(legPivot);
                this.legs.push(legPivot);
            });

        } else if (this.type === 'pig') {
            // Main Body
            createPart(0.55, 0.46, 0.82, 0xffb5b5, 0, 0.4, -0.05);
            // Curly tail block
            createPart(0.06, 0.14, 0.06, 0xff8e8e, 0, 0.5, -0.45, 0.25);

            // Head Group
            this.headGroup.position.set(0, 0.58, 0.46);
            this.group.add(this.headGroup);

            // Head
            createPart(0.3, 0.3, 0.3, 0xffb5b5, 0, 0.08, 0.08, 0, this.headGroup);
            // Snout with nostrils (dark pink snout)
            createPart(0.18, 0.11, 0.12, 0xff7e7e, 0, 0.02, 0.24, 0, this.headGroup);
            // Nostril dots painted
            createPart(0.04, 0.04, 0.02, 0x9e3c3c, 0.04, 0.02, 0.3, 0, this.headGroup);
            createPart(0.04, 0.04, 0.02, 0x9e3c3c, -0.04, 0.02, 0.3, 0, this.headGroup);
            // Floppy ears
            createPart(0.08, 0.12, 0.06, 0xff9e9e, 0.16, 0.16, 0.06, 0.1, this.headGroup);
            createPart(0.08, 0.12, 0.06, 0xff9e9e, -0.16, 0.16, 0.06, 0.1, this.headGroup);
            // Black eyes
            createPart(0.04, 0.04, 0.02, 0x000000, 0.11, 0.12, 0.21, 0, this.headGroup);
            createPart(0.04, 0.04, 0.02, 0x000000, -0.11, 0.12, 0.21, 0, this.headGroup);

            // 4 Legs
            const legColor = 0xffa0a0;
            const legW = 0.12, legH = 0.36, legD = 0.12;
            const legPositions = [{x: 0.18, z: 0.28}, {x: -0.18, z: 0.28}, {x: 0.18, z: -0.28}, {x: -0.18, z: -0.28}];
            legPositions.forEach(pos => {
                const legPivot = new THREE.Group();
                legPivot.position.set(pos.x, 0.3, pos.z);
                const legMesh = createPart(legW, legH, legD, legColor, 0, -legH / 2, 0);
                legPivot.add(legMesh);
                this.group.add(legPivot);
                this.legs.push(legPivot);
            });

        } else if (this.type === 'zombie') {
            // Torso (cyan shirt)
            createPart(0.46, 0.6, 0.25, 0x008080, 0, 0.9, 0);
            // Pants block
            createPart(0.44, 0.2, 0.23, 0x3f51b5, 0, 0.5, 0);
            // Head (green skin)
            createPart(0.26, 0.26, 0.26, 0x2e8b57, 0, 1.33, 0);
            // Hair overlay helmet (dark green)
            createPart(0.28, 0.08, 0.28, 0x1f5c3a, 0, 1.44, 0);
            // Nose block (protruding green snout)
            createPart(0.06, 0.08, 0.06, 0x2e8b57, 0, 1.3, 0.14);
            // Hollow eyes
            createPart(0.06, 0.04, 0.02, 0x111111, 0.07, 1.35, 0.14);
            createPart(0.06, 0.04, 0.02, 0x111111, -0.07, 1.35, 0.14);

            // Arms raised locked forward (rotation.x = -Math.PI / 2)
            const armColor = 0x2e8b57;
            const armW = 0.12, armH = 0.45, armD = 0.12;
            createPart(armW, armH, armD, armColor, 0.28, 1.0, 0.2, -Math.PI / 2);
            createPart(armW, armH, armD, armColor, -0.28, 1.0, 0.2, -Math.PI / 2);

            // 2 Legs (purple pants)
            const legColor = 0x3f51b5;
            const legW = 0.14, legH = 0.5, legD = 0.14;
            const legPositions = [{ x: 0.12 }, { x: -0.12 }];
            legPositions.forEach(pos => {
                const legPivot = new THREE.Group();
                legPivot.position.set(pos.x, 0.5, 0);
                const legMesh = createPart(legW, legH, legD, legColor, 0, -legH / 2, 0);
                legPivot.add(legMesh);
                this.group.add(legPivot);
                this.legs.push(legPivot);
            });

        } else if (this.type === 'creeper') {
            // Detailed 3D Creeper Model
            // Central green torso trunk
            createPart(0.35, 0.74, 0.22, 0x10782e, 0, 0.76, 0);
            
            // Green Head
            createPart(0.28, 0.28, 0.28, 0x10782e, 0, 1.25, 0);

            // Modelled 3D Face (Sad frowning mouth and hollow eyes)
            // Left eye hollow
            createPart(0.06, 0.06, 0.02, 0x1a1a1a, 0.07, 1.28, 0.15);
            // Right eye hollow
            createPart(0.06, 0.06, 0.02, 0x1a1a1a, -0.07, 1.28, 0.15);
            
            // Frowny Sad Mouth (3-block composite)
            // Center drop
            createPart(0.06, 0.12, 0.02, 0x1a1a1a, 0, 1.15, 0.15);
            // Left frown corner
            createPart(0.06, 0.06, 0.02, 0x1a1a1a, 0.06, 1.12, 0.15);
            // Right frown corner
            createPart(0.06, 0.06, 0.02, 0x1a1a1a, -0.06, 1.12, 0.15);

            // 4 Shuffling Feet
            const footColor = 0x0c6824;
            const footW = 0.15, footH = 0.28, footD = 0.18;
            const footPositions = [
                {x: 0.13, z: 0.13},  // Front Left
                {x: -0.13, z: 0.13}, // Front Right
                {x: 0.13, z: -0.13}, // Rear Left
                {x: -0.13, z: -0.13} // Rear Right
            ];

            footPositions.forEach(pos => {
                const legPivot = new THREE.Group();
                legPivot.position.set(pos.x, 0.28, pos.z);
                const legMesh = createPart(footW, footH, footD, footColor, 0, -footH / 2, 0);
                legPivot.add(legMesh);
                this.group.add(legPivot);
                this.legs.push(legPivot);
            });
        }
    }

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

    takeDamage(amount) {
        if (this.isDead) return;

        this.health = Math.max(0, this.health - amount);
        this.flashRedTimer = 0.22; // Flash red color overrides

        // Trigger panic sprint on peaceful animals
        if (this.type === 'sheep' || this.type === 'pig') {
            this.panicTimer = 3.0; // Sprint for 3 seconds
        }
    }

    /**
     * Executes the dynamic voxel crater explosion
     */
    explodeCreeper(player) {
        this.isDead = true;

        if (window.gameAudio) {
            window.gameAudio.stopHiss();
            window.gameAudio.playExplosion();
        }

        const pDist = this.position.distanceTo(player.position);
        if (pDist < 5.0) {
            // Apply massive dynamic damage
            const damage = Math.floor((1.0 - pDist / 5.0) * 85);
            player.takeDamage(Math.max(10, damage));

            // Explode player knockback impulse
            const kbDir = player.position.clone().sub(this.position).setY(0.4).normalize();
            player.velocity.addScaledVector(kbDir, 16.0); // Launches player away
        }

        // Hollow out voxel block crater (Radius = 3)
        const rad = 3;
        const ex = Math.floor(this.position.x);
        const ey = Math.floor(this.position.y + 0.5);
        const ez = Math.floor(this.position.z);

        const affectedChunks = new Set();

        for (let dx = -rad; dx <= rad; dx++) {
            for (let dy = -rad; dy <= rad; dy++) {
                for (let dz = -rad; dz <= rad; dz++) {
                    if (dx*dx + dy*dy + dz*dz <= rad*rad) {
                        const gx = ex + dx;
                        const gy = ey + dy;
                        const gz = ez + dz;

                        // Protect unbreakable bedrock floor at y=0!
                        if (gy > 0 && gy < this.world.chunkHeight) {
                            const block = this.world.getBlock(gx, gy, gz);
                            if (block !== 0) {
                                // Clear voxel memory directly
                                const { cx, cz } = this.world.globalToChunkCoords(gx, gy, gz);
                                const chunkKey = `${cx},${cz}`;
                                const chunk = this.world.chunks.get(chunkKey);
                                
                                if (chunk) {
                                    const lx = ((gx % 16) + 16) % 16;
                                    const lz = ((gz % 16) + 16) % 16;
                                    const idx = lx + gy * 16 + lz * 16 * 32;
                                    chunk.voxels[idx] = 0;
                                    affectedChunks.add(chunkKey);
                                }
                            }
                        }
                    }
                }
            }
        }

        // Single pass mesh rebuild to prevent frames drops
        affectedChunks.forEach(key => {
            const [cx, cz] = key.split(',').map(Number);
            this.world.rebuildChunkMesh(cx, cz);
        });

        // Trigger particle puff effects
        this.destroy();
    }

    /**
     * Update AI wanders, panic runs, and swelling animations
     */
    update(dt, world, player) {
        // Red flashing override on damage
        if (this.flashRedTimer > 0) {
            this.flashRedTimer -= dt;
            this.meshMaterials.forEach(item => {
                item.mesh.material.color.setHex(0xff0000);
            });
            if (this.flashRedTimer <= 0) {
                this.meshMaterials.forEach(item => {
                    item.mesh.material.color.copy(item.originalColor);
                });
            }
        }

        if (this.isDead) return;

        this.wanderTimer -= dt;
        this.meleeCooldown = Math.max(0, this.meleeCooldown - dt);
        
        // Tick panic timers
        if (this.panicTimer > 0) {
            this.panicTimer -= dt;
        }

        // Tick grazing timers (Sheep sheep)
        if (this.type === 'sheep') {
            this.grazeTimer -= dt;
            if (this.grazeTimer <= 0 && Math.random() < 0.003 && this.onGround) {
                // Perform grazing!
                const underBlock = world.getBlock(this.position.x, this.position.y - 0.2, this.position.z);
                if (underBlock === 1) { // Eating grass!
                    this.grazeTimer = 2.0; // Graze for 2 seconds
                    this.wanderTimer = 2.0; // Stop moving
                    this.velocity.set(0,0,0);
                    
                    // Mutate Grass block into Dirt block underneath!
                    world.setBlock(this.position.x, this.position.y - 0.2, this.position.z, 2);
                    
                    if (window.gameAudio) window.gameAudio.playStep(1); // Play grass crunch
                }
            }

            // Animate head tilt down during grazing
            if (this.grazeTimer > 0) {
                this.grazeHeadRot += (0.8 - this.grazeHeadRot) * 8 * dt;
            } else {
                this.grazeHeadRot += (0 - this.grazeHeadRot) * 8 * dt;
            }
            this.headGroup.rotation.x = this.grazeHeadRot;
        }

        const dx = player.position.x - this.position.x;
        const dz = player.position.z - this.position.z;
        const dy = player.position.y - this.position.y;
        const distSq = dx * dx + dz * dz;

        // 1. AI PURSUIT VS WANDER DECISION
        const isHostile = (this.type === 'zombie' || this.type === 'creeper');
        
        if (isHostile && distSq < 16.0 * 16.0 && !player.isDead) {
            
            // Creeper Specific Fuse Trigger Check
            if (this.type === 'creeper') {
                if (distSq < 2.8 * 2.8 && Math.abs(dy) < 1.6) {
                    if (!this.isExploding) {
                        this.isExploding = true;
                        this.fuseTimer = 0;
                        if (window.gameAudio) window.gameAudio.playHiss();
                    }
                } else if (distSq > 4.2 * 4.2) {
                    if (this.isExploding) {
                        this.isExploding = false;
                        this.group.scale.set(1, 1, 1);
                        if (window.gameAudio) window.gameAudio.stopHiss();
                    }
                }
            }

            if (this.isExploding && this.type === 'creeper') {
                // Stop movement to swell
                this.velocity.x = 0;
                this.velocity.z = 0;
                this.fuseTimer += dt;

                // Animate swelling scale inflation
                const swell = 1.0 + (this.fuseTimer / this.maxFuse) * 0.35;
                this.group.scale.set(swell, swell, swell);

                // Accelerating flash sequences
                const flashFreq = 3.0 + (this.fuseTimer / this.maxFuse) * 12.0;
                const isFlashOn = Math.sin(this.fuseTimer * flashFreq * Math.PI * 2) > 0;
                
                this.meshMaterials.forEach(item => {
                    if (isFlashOn) {
                        item.mesh.material.color.setHex(0xffffff); // Flash White
                    } else {
                        item.mesh.material.color.setHex(0xff4444); // Flash Red
                    }
                });

                if (this.fuseTimer >= this.maxFuse) {
                    this.explodeCreeper(player);
                    return;
                }
            } else {
                // Normal Pursuit
                this.wanderState = 1;
                this.yaw = Math.atan2(dx, dz);
                this.velocity.x = Math.sin(this.yaw) * this.speed;
                this.velocity.z = Math.cos(this.yaw) * this.speed;

                // Zombie melee hit
                if (this.type === 'zombie' && distSq < 1.1 * 1.1 && Math.abs(dy) < 1.5 && this.meleeCooldown <= 0) {
                    player.takeDamage(15);
                    this.meleeCooldown = 1.5;

                    const pDir = player.position.clone().sub(this.position).setY(0).normalize();
                    player.velocity.addScaledVector(pDir, 3.5);
                    player.velocity.y = 2.0;
                }
            }

        } else {
            // Panic Sprint AI
            if (this.panicTimer > 0) {
                // Run in random direction away from threat
                if (this.wanderTimer <= 0) {
                    this.yaw = Math.random() * Math.PI * 2;
                    this.wanderTimer = 0.5 + Math.random() * 0.8;
                }
                this.wanderState = 1;
                
                const sprintSpeed = this.speed * 2.6; // Sprint away fast
                this.velocity.x = Math.sin(this.yaw) * sprintSpeed;
                this.velocity.z = Math.cos(this.yaw) * sprintSpeed;
            } else {
                // Standard peaceful wander
                if (this.wanderTimer <= 0 && this.grazeTimer <= 0) {
                    this.wanderState = Math.random() < 0.45 ? 0 : 1;
                    this.wanderTimer = 1.5 + Math.random() * 4.5;
                    if (this.wanderState === 1) {
                        this.yaw = Math.random() * Math.PI * 2;
                    }
                }

                if (this.wanderState === 1 && this.grazeTimer <= 0) {
                    this.velocity.x = Math.sin(this.yaw) * this.speed;
                    this.velocity.z = Math.cos(this.yaw) * this.speed;
                } else {
                    this.velocity.x = 0;
                    this.velocity.z = 0;
                }
            }
        }

        // Apply gravity physics
        this.velocity.y += -24.0 * dt;

        // 2. Separation Axis Movement
        const nextPos = this.position.clone();
        nextPos.x += this.velocity.x * dt;
        
        if (this.checkCollision(nextPos, world)) {
            nextPos.y += 1.0;
            if (!this.checkCollision(nextPos, world)) {
                this.position.copy(nextPos);
            } else {
                this.velocity.x = 0;
                this.wanderState = 0;
                this.wanderTimer = 0;
            }
        } else {
            this.position.x = nextPos.x;
        }

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

        // Rotate Mesh
        this.group.rotation.y = this.yaw + Math.PI;
        this.group.position.copy(this.position);

        // 3. Shuffling leg swinging animations
        const speed2D = Math.sqrt(this.velocity.x*this.velocity.x + this.velocity.z*this.velocity.z);
        if (speed2D > 0.1 && this.onGround) {
            // Speed up swing speed if in panic mode
            const multiplier = (this.panicTimer > 0) ? 2.2 : 1.0;
            const cycle = Date.now() * 0.008 * multiplier;
            const swingAngle = Math.sin(cycle) * 0.55;
            
            if (this.type === 'zombie') {
                this.legs[0].rotation.x = swingAngle;
                this.legs[1].rotation.x = -swingAngle;
            } else if (this.type === 'creeper') {
                // Creepers shuffle 4 feet: front pairs swing opposite to rear pairs
                this.legs[0].rotation.x = swingAngle;
                this.legs[1].rotation.x = -swingAngle;
                this.legs[2].rotation.x = -swingAngle;
                this.legs[3].rotation.x = swingAngle;
            } else {
                this.legs[0].rotation.x = swingAngle;
                this.legs[3].rotation.x = swingAngle;
                this.legs[1].rotation.x = -swingAngle;
                this.legs[2].rotation.x = -swingAngle;
            }
        } else {
            this.legs.forEach(leg => {
                leg.rotation.x = 0;
            });
        }
    }

    destroy() {
        this.scene.remove(this.group);
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
        this.maxMobs = 10;
        this.spawnDistanceMin = 18;
        this.spawnDistanceMax = 34;
    }

    spawnMobsAroundPlayer(playerX, playerZ, timePercent) {
        if (this.mobs.length >= this.maxMobs) return;

        // Lower spawn rate slightly to prevent overcrowding
        if (Math.random() > 0.012) return;

        const angle = Math.random() * Math.PI * 2;
        const dist = this.spawnDistanceMin + Math.random() * (this.spawnDistanceMax - this.spawnDistanceMin);
        
        const sx = Math.floor(playerX + Math.cos(angle) * dist);
        const sz = Math.floor(playerZ + Math.sin(angle) * dist);

        let sy = -1;
        for (let y = this.world.chunkHeight - 1; y >= 0; y--) {
            const block = this.world.getBlock(sx, y, sz);
            if (block !== 0 && block !== 7) {
                sy = y;
                break;
            }
        }

        const groundBlock = this.world.getBlock(sx, sy, sz);
        const isSpawningSurf = sy > 6 && (groundBlock === 1 || groundBlock === 12 || groundBlock === 6);
        if (!isSpawningSurf) return;

        const isNight = timePercent > 0.55 && timePercent < 0.88;

        if (isNight) {
            // Night: spawn Zombies (60%) or Creepers (40%)
            const type = Math.random() < 0.6 ? 'zombie' : 'creeper';
            const mob = new VoxelMob(this.scene, type, sx + 0.5, sy + 1.0, sz + 0.5, this.world);
            this.mobs.push(mob);
        } else {
            // Day: spawn Sheep/Pigs or deep cave monsters
            const type = (sy < 14) ? (Math.random() < 0.5 ? 'zombie' : 'creeper') : (Math.random() < 0.5 ? 'sheep' : 'pig');
            const mob = new VoxelMob(this.scene, type, sx + 0.5, sy + 1.0, sz + 0.5, this.world);
            this.mobs.push(mob);
        }
    }

    /**
     * AI updates, boundaries checking, and vocalization triggers
     */
    update(dt, player, timePercent) {
        this.spawnMobsAroundPlayer(player.position.x, player.position.z, timePercent);

        const keptMobs = [];

        for (const mob of this.mobs) {
            mob.update(dt, this.world, player);

            const dx = mob.position.x - player.position.x;
            const dz = mob.position.z - player.position.z;
            const distSq = dx * dx + dz * dz;

            const isTooFar = distSq > 64 * 64;
            const isFallenInVoid = mob.position.y < -5;

            if (mob.isDead) {
                this.dropMobItems(mob);
                mob.destroy();
            } else if (isTooFar || isFallenInVoid) {
                if (mob.type === 'creeper') {
                    // Make sure hiss halts if culled
                    if (window.gameAudio) window.gameAudio.stopHiss();
                }
                mob.destroy();
            } else {
                // Play ambient vocalizations randomly
                if (Math.random() < 0.0025 && window.gameAudio) {
                    if (mob.type === 'pig') window.gameAudio.playOink();
                    else if (mob.type === 'sheep') window.gameAudio.playBaa();
                    else if (mob.type === 'zombie') window.gameAudio.playZombieGrowl();
                }
                keptMobs.push(mob);
            }
        }

        this.mobs = keptMobs;
    }

    dropMobItems(mob) {
        const mx = mob.position.x;
        const my = mob.position.y;
        const mz = mob.position.z;

        if (mob.type === 'pig') {
            const count = 1 + Math.floor(Math.random() * 2);
            this.world.textureManager.injectItemDropEffect(mx, my, mz, 'porkchop', count, this.world.scene);
        } else if (mob.type === 'sheep') {
            this.world.textureManager.injectItemDropEffect(mx, my, mz, 12, 1, this.scene);
        } else if (mob.type === 'zombie') {
            const rand = Math.random();
            if (rand < 0.35) {
                this.world.textureManager.injectItemDropEffect(mx, my, mz, 'coal', 1, this.scene);
            } else if (rand < 0.50) {
                this.world.textureManager.injectItemDropEffect(mx, my, mz, 'raw_iron', 1, this.scene);
            }
        } else if (mob.type === 'creeper') {
            // Creeper drops Coal (50% chance) or Gunpowder (represented by raw_iron)
            if (Math.random() < 0.5) {
                this.world.textureManager.injectItemDropEffect(mx, my, mz, 'coal', 2, this.scene);
            }
        }
    }

    clearMobs() {
        this.mobs.forEach(mob => {
            if (mob.type === 'creeper') {
                if (window.gameAudio) window.gameAudio.stopHiss();
            }
            mob.destroy();
        });
        this.mobs = [];
    }
}

// Attach a helper to TextureManager to handle dropped item injection directly into player inventory
TextureManager.prototype.injectItemDropEffect = function(x, y, z, itemId, count, scene) {
    if (window.gameInventory) {
        window.gameInventory.addItem(itemId, count);
    }
};

window.MobManager = MobManager;
