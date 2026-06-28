/**
 * Player - Handles first-person controls, gravity/buoyancy physics,
 * sliding collision detection, raycasting, progressive mining, combat hit detection,
 * and survival mechanics (Health, Hunger, Oxygen).
 */
class Player {
    constructor(camera, world, inventory) {
        this.camera = camera;
        this.world = world;
        this.inventory = inventory;

        // Player physics state
        this.position = new THREE.Vector3(8, 24, 8);
        this.velocity = new THREE.Vector3(0, 0, 0);
        this.onGround = false;
        this.inWater = false;
        this.fallVelocity = 0; // Tracks landing velocity for fall damage
        
        // Player dimensions
        this.width = 0.5;
        this.height = 1.75;
        this.eyeHeight = 1.6;

        // Movement settings
        this.speedWalk = 6.5;
        this.speedSwim = 3.0;
        this.jumpForce = 8.2;
        this.gravity = -24.0;
        this.damping = 8.0;
        
        // Pointer Lock looking state
        this.camera.rotation.order = 'YXZ';
        this.pitch = 0;
        this.yaw = 0;

        // Inputs
        this.keys = {
            forward: false,
            backward: false,
            left: false,
            right: false,
            jump: false
        };

        // Raycasting
        this.raycaster = new THREE.Raycaster();
        this.reach = 5.0;
        this.combatReach = 3.5;
        this.targetedBlock = null; 
        
        // Selection outline
        const outlineGeo = new THREE.BoxGeometry(1.01, 1.01, 1.01);
        const outlineMat = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 });
        const edges = new THREE.EdgesGeometry(outlineGeo);
        this.blockOutline = new THREE.LineSegments(edges, outlineMat);
        this.blockOutline.visible = false;
        this.world.scene.add(this.blockOutline);

        // Block hardness
        this.blockHardness = {
            1: 0.5,  // Grass
            2: 0.4,  // Dirt
            3: 1.5,  // Stone
            4: 1.0,  // Wood Trunk
            5: 0.15, // Leaves
            6: 0.4,  // Sand
            7: 0.0,  // Water
            8: 0.3,  // Glass
            9: 1.8,  // Brick
            10: 0.0, // Torch
            11: 0.5, // Cactus
            12: 0.4, // Snow
            13: 1.6, // Coal Ore
            14: 0.8, // Wood Planks
            15: 1.3, // Cobblestone
            16: 1.8  // Iron Ore
        };

        // Mining state
        this.miningBlock = null; 
        this.miningProgress = 0; 
        this.miningTimeRequired = 0; 
        this.isMining = false;

        // Survival Statistics
        this.health = 100; // max 100
        this.hunger = 100; // max 100
        this.oxygen = 100; // max 100
        this.isDead = false;
        this.damageFlashTimer = 0;

        // Survival Timers
        this.drownTimer = 0;
        this.starveTimer = 0;
        this.regenTimer = 0;

        this.initControls();
    }

    initControls() {
        window.addEventListener('keydown', (e) => {
            if (this.isPointerLocked() && !this.isDead) {
                this.handleKey(e.code, true);
            }
        });

        window.addEventListener('keyup', (e) => {
            this.handleKey(e.code, false);
        });

        document.addEventListener('mousemove', (e) => {
            if (this.isPointerLocked() && !this.isDead) {
                const sensitivity = 0.002;
                this.yaw -= e.movementX * sensitivity;
                this.pitch -= e.movementY * sensitivity;

                this.pitch = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, this.pitch));

                this.camera.rotation.x = this.pitch;
                this.camera.rotation.y = this.yaw;
            }
        });
    }

    isPointerLocked() {
        return document.pointerLockElement === document.body;
    }

    handleTouchLook(movementX, movementY) {
        if (this.isDead) return;
        const sensitivity = 0.0035;
        this.yaw -= movementX * sensitivity;
        this.pitch -= movementY * sensitivity;

        this.pitch = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, this.pitch));

        this.camera.rotation.x = this.pitch;
        this.camera.rotation.y = this.yaw;
    }

    handleKey(code, isPressed) {
        switch (code) {
            case 'KeyW':
            case 'ArrowUp':
                this.keys.forward = isPressed;
                break;
            case 'KeyS':
            case 'ArrowDown':
                this.keys.backward = isPressed;
                break;
            case 'KeyA':
            case 'ArrowLeft':
                this.keys.left = isPressed;
                break;
            case 'KeyD':
            case 'ArrowRight':
                this.keys.right = isPressed;
                break;
            case 'Space':
                this.keys.jump = isPressed;
                break;
        }
    }

    isSolid(blockId) {
        // Air (0), Water (7), Torches (10) are non-solid
        return blockId !== 0 && blockId !== 7 && blockId !== 10;
    }

    checkCollision(pos) {
        const minX = pos.x - this.width / 2;
        const maxX = pos.x + this.width / 2;
        const minY = pos.y;
        const maxY = pos.y + this.height;
        const minZ = pos.z - this.width / 2;
        const maxZ = pos.z + this.width / 2;

        const startX = Math.floor(minX);
        const endX = Math.floor(maxX);
        const startY = Math.floor(minY);
        const endY = Math.floor(maxY);
        const startZ = Math.floor(minZ);
        const endZ = Math.floor(maxZ);

        for (let x = startX; x <= endX; x++) {
            for (let y = startY; y <= endY; y++) {
                for (let z = startZ; z <= endZ; z++) {
                    const blockId = this.world.getBlock(x, y, z);
                    if (this.isSolid(blockId)) {
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
     * Inflicts damage, triggers red screen vignette, grunts, and handles death
     */
    takeDamage(amount) {
        if (this.isDead) return;

        this.health = Math.max(0, this.health - amount);
        this.damageFlashTimer = 0.25; // Flash red overlay for 1/4 second

        const flashEl = document.getElementById('damage-flash');
        if (flashEl) flashEl.classList.add('flash-active');

        // Play hurt sound
        if (window.gameAudio) {
            window.gameAudio.playHurt();
        }

        if (this.health <= 0) {
            this.isDead = true;
            this.velocity.set(0,0,0);
            this.keys.forward = false;
            this.keys.backward = false;
            this.keys.left = false;
            this.keys.right = false;
            this.keys.jump = false;
            document.exitPointerLock();
        }
    }

    /**
     * Consumes Porkchops to recover hunger points
     */
    eatFood(itemId) {
        if (itemId === 'porkchop' && this.hunger < 100) {
            this.hunger = Math.min(100, this.hunger + 30);
            if (window.gameAudio) window.gameAudio.playEat();
            return true;
        }
        return false;
    }

    /**
     * Attack Mob AI entities (Zombies, sheep, pigs) within range
     */
    swingWeapon(mobsList, activeSlotIndex) {
        this.raycaster.setFromCamera({ x: 0, y: 0 }, this.camera);
        
        // Collate list of active mob meshes to intersect
        const mobMeshes = [];
        const meshToMob = new Map();
        
        mobsList.forEach(mob => {
            mob.group.traverse(child => {
                if (child.isMesh) {
                    mobMeshes.push(child);
                    meshToMob.set(child.id, mob);
                }
            });
        });

        const intersects = this.raycaster.intersectObjects(mobMeshes);

        if (intersects.length > 0 && intersects[0].distance <= this.combatReach) {
            const hitMesh = intersects[0].object;
            const mob = meshToMob.get(hitMesh.id);

            if (mob && !mob.isDead) {
                // Determine attack damage based on active tool
                const activeItem = this.inventory.getActiveHotbarItem(activeSlotIndex);
                let damage = 1;
                
                if (activeItem) {
                    if (activeItem.id === 'iron_sword') damage = 6;
                    else if (activeItem.id === 'stone_sword') damage = 5;
                    else if (activeItem.id === 'wooden_sword') damage = 4;
                    else if (activeItem.id.toString().includes('pickaxe')) damage = 2;
                }

                // Apply damage
                mob.takeDamage(damage);

                // Play slice / punch sound
                if (window.gameAudio) window.gameAudio.playHit();

                // Apply dynamic knockback (push mob away and pop into air slightly)
                const kbDirection = mob.position.clone().sub(this.position).setY(0).normalize();
                mob.velocity.addScaledVector(kbDirection, 4.5);
                mob.velocity.y = 3.8; // Air popup

                // Decrease sword durability
                if (activeItem && activeItem.id.toString().includes('sword')) {
                    activeItem.durability--;
                    if (activeItem.durability <= 0) {
                        this.inventory.slots[activeSlotIndex] = null; // Sword broke
                    }
                    this.inventory.render();
                }

                return true; // We successfully hit a mob
            }
        }
        return false;
    }

    /**
     * Core update loop for physics, damage triggers, and timers
     */
    update(dt, activeSlotIndex) {
        dt = Math.min(dt, 0.1);

        // 1. Manage screen flash fadeout
        if (this.damageFlashTimer > 0) {
            this.damageFlashTimer -= dt;
            if (this.damageFlashTimer <= 0) {
                const flashEl = document.getElementById('damage-flash');
                if (flashEl) flashEl.classList.remove('flash-active');
            }
        }

        if (this.isDead) {
            this.velocity.set(0,0,0);
            return;
        }

        // Submerged checks
        const eyeBlock = this.world.getBlock(this.position.x, this.position.y + this.eyeHeight, this.position.z);
        this.inWater = (eyeBlock === 7);

        // 2. Oxygen & drowning calculations
        if (this.inWater) {
            this.oxygen = Math.max(0, this.oxygen - 14 * dt);
            if (this.oxygen <= 0) {
                this.drownTimer += dt;
                if (this.drownTimer >= 1.0) {
                    this.takeDamage(10); // 10 drowning damage per second
                    this.drownTimer = 0;
                }
            }
        } else {
            this.oxygen = Math.min(100, this.oxygen + 80 * dt);
            this.drownTimer = 0;
        }

        // 3. Hunger starvation calculations
        const speed2D = Math.sqrt(this.velocity.x*this.velocity.x + this.velocity.z*this.velocity.z);
        if (speed2D > 0.1) {
            this.hunger = Math.max(0, this.hunger - 0.5 * dt); // Drain walking
        } else {
            this.hunger = Math.max(0, this.hunger - 0.1 * dt); // Drain standing still
        }

        if (this.hunger <= 0) {
            this.starveTimer += dt;
            if (this.starveTimer >= 1.5) {
                this.takeDamage(5); // 5 starvation damage every 1.5s
                this.starveTimer = 0;
            }
        } else {
            this.starveTimer = 0;

            // Natural Health Regeneration (requires hunger >= 90)
            if (this.hunger >= 90 && this.health < 100) {
                this.regenTimer += dt;
                if (this.regenTimer >= 2.5) {
                    this.health = Math.min(100, this.health + 5);
                    this.hunger = Math.max(0, this.hunger - 2); // Consume hunger to heal!
                    this.regenTimer = 0;
                    this.inventory.render();
                }
            } else {
                this.regenTimer = 0;
            }
        }

        // 4. Movement controls
        const inputDir = new THREE.Vector3(0, 0, 0);
        if (this.keys.forward) inputDir.z -= 1;
        if (this.keys.backward) inputDir.z += 1;
        if (this.keys.left) inputDir.x -= 1;
        if (this.keys.right) inputDir.x += 1;
        inputDir.normalize();

        const moveVector = new THREE.Vector3();
        if (inputDir.lengthSq() > 0) {
            const camDirection = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
            camDirection.y = 0;
            camDirection.normalize();

            const camRight = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
            camRight.y = 0;
            camRight.normalize();

            moveVector.addScaledVector(camDirection, -inputDir.z);
            moveVector.addScaledVector(camRight, inputDir.x);
            moveVector.normalize();
        }

        const currentSpeed = this.inWater ? this.speedSwim : this.speedWalk;
        const targetVelX = moveVector.x * currentSpeed;
        const targetVelZ = moveVector.z * currentSpeed;

        this.velocity.x += (targetVelX - this.velocity.x) * this.damping * dt;
        this.velocity.z += (targetVelZ - this.velocity.z) * this.damping * dt;

        if (this.inWater) {
            this.velocity.y += (this.gravity * 0.15) * dt;
            if (this.velocity.y < -2.0) this.velocity.y = -2.0;
            if (this.keys.jump) {
                this.velocity.y += this.jumpForce * 0.7 * dt;
                if (this.velocity.y > 3.0) this.velocity.y = 3.0;
            }
        } else {
            this.velocity.y += this.gravity * dt;
            if (this.keys.jump && this.onGround) {
                this.velocity.y = this.jumpForce;
                this.onGround = false;
                this.hunger = Math.max(0, this.hunger - 1.2); // Jumping depletes hunger extra
                
                // Play jump step
                const groundBlock = this.world.getBlock(this.position.x, this.position.y - 0.1, this.position.z);
                if (window.gameAudio) window.gameAudio.playStep(groundBlock);
            }
        }

        // Track fall velocity prior to vertical collision resolution
        this.fallVelocity = this.velocity.y;

        // Apply velocities with collision resolution
        this.position.x += this.velocity.x * dt;
        if (this.checkCollision(this.position)) {
            this.position.x -= this.velocity.x * dt;
            this.velocity.x = 0;
        }

        const wasOnGround = this.onGround;
        this.onGround = false;
        this.position.y += this.velocity.y * dt;
        if (this.checkCollision(this.position)) {
            if (this.velocity.y < 0) {
                this.onGround = true;
                
                // 5. Land Fall Damage Check
                if (this.fallVelocity < -12.0) { // Falls greater than ~4 blocks
                    const fallDmg = Math.floor((Math.abs(this.fallVelocity) - 10) * 3);
                    if (fallDmg > 0) {
                        this.takeDamage(fallDmg);
                    }
                }
            }
            this.position.y -= this.velocity.y * dt;
            this.velocity.y = 0;
        }

        this.position.z += this.velocity.z * dt;
        if (this.checkCollision(this.position)) {
            this.position.z -= this.velocity.z * dt;
            this.velocity.z = 0;
        }

        // Stepping footstep sounds
        if (this.onGround && speed2D > 0.2) {
            // Play footsteps periodically relative to step distance
            if (!this.stepDistance) this.stepDistance = 0;
            this.stepDistance += speed2D * dt;
            if (this.stepDistance >= 2.0) {
                const groundBlock = this.world.getBlock(this.position.x, this.position.y - 0.1, this.position.z);
                if (window.gameAudio) window.gameAudio.playStep(groundBlock);
                this.stepDistance = 0;
            }
        }

        this.camera.position.copy(this.position);
        this.camera.position.y += this.eyeHeight;

        // Perform raycast selections
        this.updateRaycasting();

        // Perform mining calculations
        this.updateMining(dt, activeSlotIndex);
    }

    updateRaycasting() {
        this.raycaster.setFromCamera({ x: 0, y: 0 }, this.camera);
        const intersects = this.raycaster.intersectObjects(this.world.activeMeshes);
        
        if (intersects.length > 0 && intersects[0].distance <= this.reach) {
            const hit = intersects[0];
            const normal = hit.face.normal.clone();
            const blockPos = hit.point.clone().sub(normal.clone().multiplyScalar(0.01)).floor();
            const blockType = this.world.getBlock(blockPos.x, blockPos.y, blockPos.z);

            if (blockType !== 0 && blockType !== 7) {
                this.targetedBlock = { pos: blockPos, normal: normal, type: blockType };
                this.blockOutline.position.set(blockPos.x + 0.5, blockPos.y + 0.5, blockPos.z + 0.5);
                this.blockOutline.visible = true;
                return;
            }
        }

        this.targetedBlock = null;
        this.blockOutline.visible = false;
    }

    updateMining(dt, activeSlotIndex) {
        const progressEl = document.getElementById('mining-progress');
        const progressCircle = progressEl ? progressEl.querySelector('.bar') : null;

        if (this.isMining && this.targetedBlock) {
            const blockPos = this.targetedBlock.pos;
            const blockType = this.targetedBlock.type;

            // Check if bedrock is targeted at y=0 (bedrock is unbreakable)
            if (blockPos.y === 0) {
                this.resetMining();
                return;
            }

            if (!this.miningBlock || !this.miningBlock.equals(blockPos)) {
                this.miningBlock = blockPos.clone();
                this.miningProgress = 0;

                const hardness = this.blockHardness[blockType] || 0.5;
                const activeItem = this.inventory.getActiveHotbarItem(activeSlotIndex);
                
                // Tool multipliers
                let toolMultiplier = 1.0;
                const isStoneLike = (blockType === 3 || blockType === 13 || blockType === 15 || blockType === 16 || blockType === 9);

                if (isStoneLike) {
                    if (activeItem) {
                        if (activeItem.id === 'iron_pickaxe') toolMultiplier = 8.0;
                        else if (activeItem.id === 'stone_pickaxe') toolMultiplier = 5.5;
                        else if (activeItem.id === 'wooden_pickaxe') toolMultiplier = 3.5;
                        else toolMultiplier = 0.3; // Hands are slow
                    } else {
                        toolMultiplier = 0.3;
                    }
                }

                this.miningTimeRequired = hardness / toolMultiplier;
                if (this.miningTimeRequired < 0.05) this.miningTimeRequired = 0.05;
            }

            // Incremental mining ticking sound
            if (!this.mineSoundTimer) this.mineSoundTimer = 0;
            this.mineSoundTimer += dt;
            if (this.mineSoundTimer >= 0.22) {
                if (window.gameAudio) window.gameAudio.playMine(blockType);
                this.mineSoundTimer = 0;
            }

            this.miningProgress += dt;

            if (progressEl && progressCircle) {
                progressEl.classList.remove('hidden');
                const percent = Math.min(1.0, this.miningProgress / this.miningTimeRequired);
                const offset = 94.2 * (1.0 - percent);
                progressCircle.style.strokeDashoffset = offset;
            }

            if (this.miningProgress >= this.miningTimeRequired) {
                this.breakBlock(activeSlotIndex);
                this.resetMining();
            }
        } else {
            this.resetMining();
        }
    }

    resetMining() {
        this.miningBlock = null;
        this.miningProgress = 0;
        this.miningTimeRequired = 0;
        this.mineSoundTimer = 0;
        
        const progressEl = document.getElementById('mining-progress');
        if (progressEl) {
            progressEl.classList.add('hidden');
        }
    }

    breakBlock(activeSlotIndex) {
        if (!this.miningBlock) return;

        const bx = this.miningBlock.x;
        const by = this.miningBlock.y;
        const bz = this.miningBlock.z;

        const blockType = this.world.getBlock(bx, by, bz);
        if (blockType === 0) return;

        // Break block
        this.world.setBlock(bx, by, bz, 0);

        // Play break sound
        if (window.gameAudio) window.gameAudio.playBreak(blockType);

        // Drop item
        let dropId = blockType;
        let dropCount = 1;

        if (blockType === 1) { // Grass drops Dirt
            dropId = 2;
        } else if (blockType === 3) { // Stone drops Cobblestone
            dropId = 15;
        } else if (blockType === 13) { // Coal Ore drops Coal
            dropId = 'coal';
        } else if (blockType === 16) { // Iron Ore drops Raw Iron
            dropId = 'raw_iron';
        } else if (blockType === 5) { // Leaves drop Sticks occasionally
            if (Math.random() < 0.15) {
                dropId = 'stick';
            }
        }

        this.inventory.addItem(dropId, dropCount);

        // Reduce Pickaxe durability
        const isStoneLike = (blockType === 3 || blockType === 13 || blockType === 15 || blockType === 16 || blockType === 9);
        const activeItem = this.inventory.getActiveHotbarItem(activeSlotIndex);

        if (isStoneLike && activeItem && activeItem.id.toString().includes('pickaxe')) {
            activeItem.durability--;
            if (activeItem.durability <= 0) {
                this.inventory.slots[activeSlotIndex] = null; // Pickaxe broke
            }
            this.inventory.render();
        }
    }
}

window.Player = Player;
