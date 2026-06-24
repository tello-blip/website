/**
 * Player - Handles first-person controls, gravity/buoyancy physics,
 * sliding collision detection, raycasting, progressive block mining, and tool durability.
 */
class Player {
    constructor(camera, world, inventory) {
        this.camera = camera;
        this.world = world;
        this.inventory = inventory;

        // Player physics state
        this.position = new THREE.Vector3(8, 24, 8); // Start higher to avoid clipping biomes
        this.velocity = new THREE.Vector3(0, 0, 0);
        this.onGround = false;
        this.inWater = false;
        
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

        // Raycasting and targeted blocks
        this.raycaster = new THREE.Raycaster();
        this.reach = 5.0;
        this.targetedBlock = null; // { pos: Vector3, normal: Vector3, type: Number }
        
        // Selection outline
        const outlineGeo = new THREE.BoxGeometry(1.01, 1.01, 1.01);
        const outlineMat = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 });
        const edges = new THREE.EdgesGeometry(outlineGeo);
        this.blockOutline = new THREE.LineSegments(edges, outlineMat);
        this.blockOutline.visible = false;
        this.world.scene.add(this.blockOutline);

        // Block hardness values (Mining duration factors)
        this.blockHardness = {
            1: 0.5,  // Grass
            2: 0.4,  // Dirt
            3: 1.5,  // Stone (needs pickaxe)
            4: 1.0,  // Wood Trunk
            5: 0.15, // Leaves
            6: 0.4,  // Sand
            7: 0.0,  // Water (unbreakable)
            8: 0.3,  // Glass
            9: 1.8,  // Brick (needs pickaxe)
            10: 0.0, // Torch (instant)
            11: 0.5, // Cactus
            12: 0.4, // Snow
            13: 1.6, // Coal Ore (needs pickaxe)
            14: 0.8  // Wood Planks
        };

        // Mining state
        this.miningBlock = null; // Vector3
        this.miningProgress = 0; // Cumulative seconds
        this.miningTimeRequired = 0; // Seconds to break
        this.isMining = false;

        this.initControls();
    }

    initControls() {
        window.addEventListener('keydown', (e) => {
            if (this.isPointerLocked()) {
                this.handleKey(e.code, true);
            }
        });

        window.addEventListener('keyup', (e) => {
            this.handleKey(e.code, false);
        });

        document.addEventListener('mousemove', (e) => {
            if (this.isPointerLocked()) {
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

    /**
     * Checks if a block ID is solid.
     * Torches (10) and Water (7) are non-solid.
     */
    isSolid(blockId) {
        return blockId !== 0 && blockId !== 7 && blockId !== 10;
    }

    /**
     * Test AABB collision with solid world grid blocks
     */
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
     * Apply movement, gravity, and update mining progression
     */
    update(dt, activeIndex) {
        dt = Math.min(dt, 0.1);

        // Eyeline fluid check
        const eyeBlock = this.world.getBlock(this.position.x, this.position.y + this.eyeHeight, this.position.z);
        this.inWater = (eyeBlock === 7);

        // Calculate input forces
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
            }
        }

        // Apply velocities with collision resolution
        this.position.x += this.velocity.x * dt;
        if (this.checkCollision(this.position)) {
            this.position.x -= this.velocity.x * dt;
            this.velocity.x = 0;
        }

        this.onGround = false;
        this.position.y += this.velocity.y * dt;
        if (this.checkCollision(this.position)) {
            if (this.velocity.y < 0) this.onGround = true;
            this.position.y -= this.velocity.y * dt;
            this.velocity.y = 0;
        }

        this.position.z += this.velocity.z * dt;
        if (this.checkCollision(this.position)) {
            this.position.z -= this.velocity.z * dt;
            this.velocity.z = 0;
        }

        this.camera.position.copy(this.position);
        this.camera.position.y += this.eyeHeight;

        // Perform raycast selection
        this.updateRaycasting();

        // Perform mining calculations
        this.updateMining(dt, activeIndex);
    }

    /**
     * Raycasting to identify targeted voxel blocks
     */
    updateRaycasting() {
        this.raycaster.setFromCamera({ x: 0, y: 0 }, this.camera);
        const intersects = this.raycaster.intersectObjects(this.world.activeMeshes);
        
        if (intersects.length > 0 && intersects[0].distance <= this.reach) {
            const hit = intersects[0];
            const normal = hit.face.normal.clone();
            
            // Inset coordinates slightly inside face to find the block ID
            const blockPos = hit.point.clone().sub(normal.clone().multiplyScalar(0.01)).floor();
            const blockType = this.world.getBlock(blockPos.x, blockPos.y, blockPos.z);

            // Do not target air or water
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

    /**
     * Handles progressive mining duration and item drops
     */
    updateMining(dt, activeSlotIndex) {
        const progressEl = document.getElementById('mining-progress');
        const progressCircle = progressEl ? progressEl.querySelector('.bar') : null;

        if (this.isMining && this.targetedBlock) {
            const blockPos = this.targetedBlock.pos;
            const blockType = this.targetedBlock.type;

            // Initialize or keep mining
            if (!this.miningBlock || !this.miningBlock.equals(blockPos)) {
                this.miningBlock = blockPos.clone();
                this.miningProgress = 0;

                // Determine hardness
                const hardness = this.blockHardness[blockType] || 0.5;
                
                // Active item check
                const activeItem = this.inventory.getActiveHotbarItem(activeSlotIndex);
                const hasPickaxe = activeItem && activeItem.id === 'wooden_pickaxe';

                // Stone-like blocks: Stone (3), Coal Ore (13), Brick (9)
                const isStoneLike = (blockType === 3 || blockType === 13 || blockType === 9);

                let speedMultiplier = 1.0;
                if (isStoneLike) {
                    // Pickaxe mines stone 5x faster, hands are 0.3x slow
                    speedMultiplier = hasPickaxe ? 5.0 : 0.3;
                } else {
                    // Other blocks break normal speed
                    speedMultiplier = 1.0;
                }

                this.miningTimeRequired = hardness / speedMultiplier;
                if (this.miningTimeRequired < 0.05) this.miningTimeRequired = 0.05; // Cap instant break minimum
            }

            // Increment progress
            this.miningProgress += dt;

            // Update UI circular loader
            if (progressEl && progressCircle) {
                progressEl.classList.remove('hidden');
                const percent = Math.min(1.0, this.miningProgress / this.miningTimeRequired);
                
                // SVG Circle Circumference is 2 * PI * r = 2 * 3.1415 * 15 = 94.2
                const offset = 94.2 * (1.0 - percent);
                progressCircle.style.strokeDashoffset = offset;
            }

            // Block broken!
            if (this.miningProgress >= this.miningTimeRequired) {
                this.breakBlock(activeSlotIndex);
                this.resetMining();
            }
        } else {
            this.resetMining();
        }
    }

    /**
     * Resets mining timers and hides the UI progress wheel
     */
    resetMining() {
        this.miningBlock = null;
        this.miningProgress = 0;
        this.miningTimeRequired = 0;
        
        const progressEl = document.getElementById('mining-progress');
        if (progressEl) {
            progressEl.classList.add('hidden');
        }
    }

    /**
     * Destroys block, applies item drops to inventory, and updates tool durability
     */
    breakBlock(activeSlotIndex) {
        if (!this.miningBlock) return;

        const bx = this.miningBlock.x;
        const by = this.miningBlock.y;
        const bz = this.miningBlock.z;

        const blockType = this.world.getBlock(bx, by, bz);
        if (blockType === 0) return;

        // 1. Break block in the world grid (sets to Air)
        this.world.setBlock(bx, by, bz, 0);

        // 2. Determine dropped item
        let dropId = blockType;
        let dropCount = 1;

        if (blockType === 1) {
            // Grass blocks drop Dirt
            dropId = 2;
        } else if (blockType === 13) {
            // Coal Ore drops Coal item
            dropId = 'coal';
        } else if (blockType === 5) {
            // Leaves have a 10% chance to drop Sticks, otherwise drops Leaves block
            if (Math.random() < 0.15) {
                dropId = 'stick';
            }
        }

        // Add dropped item to player's inventory
        this.inventory.addItem(dropId, dropCount);

        // 3. Handle tool durability drainage
        const isStoneLike = (blockType === 3 || blockType === 13 || blockType === 9);
        const activeItem = this.inventory.getActiveHotbarItem(activeSlotIndex);

        if (isStoneLike && activeItem && activeItem.id === 'wooden_pickaxe') {
            activeItem.durability--;
            if (activeItem.durability <= 0) {
                // Pickaxe broke!
                this.inventory.slots[activeSlotIndex] = null;
            }
            this.inventory.render();
        }
    }
}

// Make globally available
window.Player = Player;
