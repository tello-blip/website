/**
 * Inventory - Advanced survival inventory layout.
 * Manages 36 slots, item durability, edible food, and the 3x3 recipe compiler.
 */
class Inventory {
    constructor(textureManager) {
        this.textureManager = textureManager;

        // 36 slots: 0-8: Hotbar, 9-35: Storage
        this.slots = new Array(36).fill(null);
        
        // 3x3 crafting inputs
        this.craftingSlots = new Array(9).fill(null);
        
        // 1 output slot
        this.craftingOutput = null;

        // Mouse floating item
        this.floatingItem = null;
        this.floatingEl = document.getElementById('floating-item');

        this.initStarterInventory();
        this.buildHTMLGrids();
        this.setupItemCursorTracking();
    }

    /**
     * Gives player starter items for survival testing
     */
    initStarterInventory() {
        this.slots[0] = { id: 1, count: 64 };  // Grass
        this.slots[1] = { id: 2, count: 64 };  // Dirt
        this.slots[2] = { id: 14, count: 64 }; // Wood Planks
        this.slots[3] = { id: 4, count: 16 };  // Wood Trunk
        this.slots[4] = { id: 10, count: 16 }; // Torches
        this.slots[5] = { id: 'wooden_sword', count: 1, durability: 60, maxDurability: 60 };
        this.slots[6] = { id: 'wooden_pickaxe', count: 1, durability: 60, maxDurability: 60 };
        this.slots[7] = { id: 15, count: 16 }; // Cobblestone
        this.slots[8] = { id: 'porkchop', count: 4 }; // Raw Porkchop (Food!)

        // Add some raw ingredients in storage
        this.slots[9] = { id: 'stick', count: 8 };
        this.slots[10] = { id: 'coal', count: 16 };
        this.slots[11] = { id: 16, count: 8 };  // Iron Ore blocks
    }

    buildHTMLGrids() {
        const mainGrid = document.getElementById('main-inventory-grid');
        const hotbarGrid = document.getElementById('hotbar-inventory-grid');

        // Draw 27 storage slots
        mainGrid.innerHTML = '';
        for (let i = 9; i <= 35; i++) {
            const slot = document.createElement('div');
            slot.className = 'inv-slot';
            slot.dataset.slotIndex = i;
            mainGrid.appendChild(slot);
        }

        // Draw 9 hotbar mirror slots
        hotbarGrid.innerHTML = '';
        for (let i = 0; i <= 8; i++) {
            const slot = document.createElement('div');
            slot.className = 'inv-slot';
            slot.dataset.slotIndex = i;
            hotbarGrid.appendChild(slot);
        }

        // Bind events
        document.querySelectorAll('.inv-slot, .hotbar-slot').forEach(slot => {
            slot.addEventListener('mousedown', (e) => {
                this.handleSlotClick(e, slot);
            });
        });

        this.render();
    }

    render() {
        const drawSlot = (el, item) => {
            el.innerHTML = '';
            if (!item) return;

            const icon = document.createElement('div');
            icon.className = 'item-icon';
            icon.style.backgroundImage = `url(${this.textureManager.getItemIconDataURL(item.id)})`;
            el.appendChild(icon);

            if (item.count > 1) {
                const count = document.createElement('span');
                count.className = 'item-count';
                count.innerText = item.count;
                el.appendChild(count);
            }

            if (item.durability !== undefined && item.maxDurability !== undefined) {
                const bar = document.createElement('div');
                bar.className = 'durability-bar';
                const fill = document.createElement('div');
                fill.className = 'durability-fill';
                const percent = (item.durability / item.maxDurability) * 100;
                fill.style.width = `${percent}%`;
                
                if (percent > 50) fill.style.backgroundColor = '#55ff55';
                else if (percent > 20) fill.style.backgroundColor = '#ffff55';
                else fill.style.backgroundColor = '#ff5555';
                
                bar.appendChild(fill);
                el.appendChild(bar);
            }
        };

        for (let i = 0; i < 36; i++) {
            const item = this.slots[i];
            const invSlot = document.querySelector(`.inv-slot[data-slot-index="${i}"]`);
            if (invSlot) drawSlot(invSlot, item);

            const hudSlot = document.getElementById(`hud-slot-${i}`);
            if (hudSlot) {
                drawSlot(hudSlot, item);
                const keyLabel = document.createElement('span');
                keyLabel.className = 'slot-key';
                keyLabel.innerText = i + 1;
                hudSlot.appendChild(keyLabel);
            }
        }

        for (let i = 0; i < 9; i++) {
            const item = this.craftingSlots[i];
            const craftSlot = document.querySelector(`.crafting-input[data-craft-index="${i}"]`);
            if (craftSlot) drawSlot(craftSlot, item);
        }

        const outputSlot = document.getElementById('crafting-output');
        if (outputSlot) drawSlot(outputSlot, this.craftingOutput);

        if (this.floatingItem) {
            this.floatingEl.classList.remove('hidden');
            drawSlot(this.floatingEl, this.floatingItem);
        } else {
            this.floatingEl.classList.add('hidden');
            this.floatingEl.innerHTML = '';
        }
    }

    setupItemCursorTracking() {
        document.addEventListener('mousemove', (e) => {
            if (this.floatingItem) {
                this.floatingEl.style.left = `${e.clientX - 22}px`;
                this.floatingEl.style.top = `${e.clientY - 22}px`;
            }
        });
    }

    handleSlotClick(e, el) {
        e.preventDefault();
        e.stopPropagation();

        const isLeftClick = e.button === 0;
        const isRightClick = e.button === 2;

        let slotType = 'storage';
        let index = -1;

        if (el.dataset.slotIndex !== undefined) {
            slotType = 'storage';
            index = parseInt(el.dataset.slotIndex);
        } else if (el.dataset.craftIndex !== undefined) {
            slotType = 'craft-input';
            index = parseInt(el.dataset.craftIndex);
        } else if (el.id === 'crafting-output') {
            slotType = 'craft-output';
        }

        const getTarget = () => {
            if (slotType === 'storage') return this.slots[index];
            if (slotType === 'craft-input') return this.craftingSlots[index];
            return this.craftingOutput;
        };

        const setTarget = (val) => {
            if (slotType === 'storage') this.slots[index] = val;
            if (slotType === 'craft-input') this.craftingSlots[index] = val;
            if (slotType === 'craft-output') this.craftingOutput = val;
        };

        const targetItem = getTarget();

        if (slotType === 'craft-output') {
            if (targetItem && isLeftClick) {
                if (!this.floatingItem) {
                    this.floatingItem = { ...targetItem };
                    this.consumeCraftingMaterials();
                } else if (this.floatingItem.id === targetItem.id && this.floatingItem.count + targetItem.count <= 64) {
                    this.floatingItem.count += targetItem.count;
                    this.consumeCraftingMaterials();
                }
                this.checkCraftingRecipes();
                this.render();
            }
            return;
        }

        if (isLeftClick) {
            if (!this.floatingItem) {
                if (targetItem) {
                    this.floatingItem = targetItem;
                    setTarget(null);
                }
            } else {
                if (!targetItem) {
                    setTarget(this.floatingItem);
                    this.floatingItem = null;
                } else if (targetItem.id === this.floatingItem.id && targetItem.id !== 'wooden_pickaxe' && targetItem.id !== 'stone_pickaxe' && targetItem.id !== 'iron_pickaxe' && !targetItem.id.toString().includes('sword')) {
                    const total = targetItem.count + this.floatingItem.count;
                    if (total <= 64) {
                        targetItem.count = total;
                        this.floatingItem = null;
                    } else {
                        this.floatingItem.count = total - 64;
                        targetItem.count = 64;
                    }
                } else {
                    const temp = targetItem;
                    setTarget(this.floatingItem);
                    this.floatingItem = temp;
                }
            }
        } else if (isRightClick) {
            if (!this.floatingItem) {
                if (targetItem) {
                    const half = Math.ceil(targetItem.count / 2);
                    this.floatingItem = { ...targetItem, count: half };
                    targetItem.count -= half;
                    if (targetItem.count === 0) setTarget(null);
                }
            } else {
                if (!targetItem) {
                    setTarget({ ...this.floatingItem, count: 1 });
                    this.floatingItem.count--;
                    if (this.floatingItem.count === 0) this.floatingItem = null;
                } else if (targetItem.id === this.floatingItem.id && targetItem.count < 64) {
                    targetItem.count++;
                    this.floatingItem.count--;
                    if (this.floatingItem.count === 0) this.floatingItem = null;
                }
            }
        }

        if (slotType === 'craft-input') {
            this.checkCraftingRecipes();
        }

        this.render();
    }

    consumeCraftingMaterials() {
        for (let i = 0; i < 9; i++) {
            if (this.craftingSlots[i]) {
                this.craftingSlots[i].count--;
                if (this.craftingSlots[i].count <= 0) {
                    this.craftingSlots[i] = null;
                }
            }
        }
    }

    /**
     * Advanced crafting recipe validation (combining 3x3 grids)
     */
    checkCraftingRecipes() {
        const grid = this.craftingSlots.map(slot => slot ? slot.id : 0);

        const isGridClean = (validIndices) => {
            for (let i = 0; i < 9; i++) {
                if (grid[i] !== 0 && !validIndices.includes(i)) return false;
            }
            return true;
        };

        // 1. Recipe: Wood Trunk (4) ➔ Wood Planks (14) x4
        let trunkCount = 0;
        let trunkIdx = -1;
        for (let i = 0; i < 9; i++) {
            if (grid[i] === 4) {
                trunkCount++;
                trunkIdx = i;
            }
        }
        if (trunkCount === 1 && isGridClean([trunkIdx])) {
            this.craftingOutput = { id: 14, count: 4 };
            return;
        }

        // 2. Recipe: Sticks (Planks 14 vertically stacked)
        const stickPairs = [[0,3], [1,4], [2,5], [3,6], [4,7], [5,8]];
        for (const [top, bot] of stickPairs) {
            if (grid[top] === 14 && grid[bot] === 14 && isGridClean([top, bot])) {
                this.craftingOutput = { id: 'stick', count: 4 };
                return;
            }
        }

        // 3. Recipe: Torches (10)
        // Coal (coal) / Coal Ore (13) on top of Stick (stick)
        const torchPairs = [[0,3], [1,4], [2,5], [3,6], [4,7], [5,8]];
        for (const [top, bot] of torchPairs) {
            const isCoal = (grid[top] === 'coal' || grid[top] === 13);
            if (isCoal && grid[bot] === 'stick' && isGridClean([top, bot])) {
                this.craftingOutput = { id: 10, count: 4 };
                return;
            }
        }

        // 4. Recipe: Smelt Iron
        // Iron Ore (16) + Coal (coal) / Coal Ore (13) anywhere in grid
        let oreIdx = -1, coalIdx = -1;
        for (let i = 0; i < 9; i++) {
            if (grid[i] === 16) oreIdx = i;
            else if (grid[i] === 'coal' || grid[i] === 13) coalIdx = i;
        }
        if (oreIdx !== -1 && coalIdx !== -1 && isGridClean([oreIdx, coalIdx])) {
            this.craftingOutput = { id: 'iron_ingot', count: 1 };
            return;
        }

        // 5. Recipe: Bricks (9)
        // 4 Stone (3) / Cobble (15) in a 2x2 square
        const brickQuads = [[0,1,3,4], [1,2,4,5], [3,4,6,7], [4,5,7,8]];
        for (const quad of brickQuads) {
            const allStone = quad.every(idx => grid[idx] === 3 || grid[idx] === 15);
            if (allStone && isGridClean(quad)) {
                this.craftingOutput = { id: 9, count: 4 };
                return;
            }
        }

        // 6. Recipe: Swords (Wood / Stone / Iron)
        // 2 Materials stacked vertically, 1 Stick below center hilt
        // Position: [1, 4, 7]
        const checkSwordPattern = (matId) => {
            return grid[1] === matId && grid[4] === matId && grid[7] === 'stick' && isGridClean([1, 4, 7]);
        };

        if (checkSwordPattern(14)) { // Wood Planks
            this.craftingOutput = { id: 'wooden_sword', count: 1, durability: 60, maxDurability: 60 };
            return;
        }
        if (checkSwordPattern(15) || checkSwordPattern(3)) { // Cobble / Stone
            this.craftingOutput = { id: 'stone_sword', count: 1, durability: 130, maxDurability: 130 };
            return;
        }
        if (checkSwordPattern('iron_ingot')) { // Iron Ingot
            this.craftingOutput = { id: 'iron_sword', count: 1, durability: 250, maxDurability: 250 };
            return;
        }

        // 7. Recipe: Pickaxes (Wood / Stone / Iron)
        // 3 Materials on top row, 2 Sticks vertically centered
        // Position: [0, 1, 2,  4, 7]
        const checkPickPattern = (matId) => {
            return grid[0] === matId && grid[1] === matId && grid[2] === matId &&
                   grid[4] === 'stick' && grid[7] === 'stick' && isGridClean([0, 1, 2, 4, 7]);
        };

        if (checkPickPattern(14)) { // Wood Planks
            this.craftingOutput = { id: 'wooden_pickaxe', count: 1, durability: 60, maxDurability: 60 };
            return;
        }
        if (checkPickPattern(15) || checkPickPattern(3)) { // Cobble / Stone
            this.craftingOutput = { id: 'stone_pickaxe', count: 1, durability: 130, maxDurability: 130 };
            return;
        }
        if (checkPickPattern('iron_ingot')) { // Iron Ingot
            this.craftingOutput = { id: 'iron_pickaxe', count: 1, durability: 250, maxDurability: 250 };
            return;
        }

        this.craftingOutput = null;
    }

    getActiveHotbarItem(activeIndex) {
        if (activeIndex < 0 || activeIndex >= 9) return null;
        return this.slots[activeIndex];
    }

    consumeActiveItem(activeIndex) {
        const item = this.slots[activeIndex];
        if (item) {
            item.count--;
            if (item.count <= 0) {
                this.slots[activeIndex] = null;
            }
            this.render();
        }
    }

    addItem(itemId, count = 1) {
        // Pickaxes and swords do not stack
        const isStackable = itemId !== 'wooden_pickaxe' && itemId !== 'stone_pickaxe' && itemId !== 'iron_pickaxe' && !itemId.toString().includes('sword');

        if (isStackable) {
            for (let i = 0; i < 36; i++) {
                const item = this.slots[i];
                if (item && item.id === itemId && item.count < 64) {
                    const total = item.count + count;
                    if (total <= 64) {
                        item.count = total;
                        this.render();
                        return true;
                    } else {
                        count = total - 64;
                        item.count = 64;
                    }
                }
            }
        }

        for (let i = 0; i < 36; i++) {
            if (!this.slots[i]) {
                if (itemId === 'wooden_pickaxe' || itemId === 'wooden_sword') {
                    this.slots[i] = { id: itemId, count: 1, durability: 60, maxDurability: 60 };
                } else if (itemId === 'stone_pickaxe' || itemId === 'stone_sword') {
                    this.slots[i] = { id: itemId, count: 1, durability: 130, maxDurability: 130 };
                } else if (itemId === 'iron_pickaxe' || itemId === 'iron_sword') {
                    this.slots[i] = { id: itemId, count: 1, durability: 250, maxDurability: 250 };
                } else {
                    this.slots[i] = { id: itemId, count: count };
                }
                this.render();
                return true;
            }
        }
        return false;
    }
}

window.Inventory = Inventory;
