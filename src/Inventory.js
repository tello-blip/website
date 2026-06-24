/**
 * Inventory - Tracks player inventory slots, active hotbar, 3x3 crafting,
 * and mouse-based stack interaction mechanics.
 */
class Inventory {
    constructor(textureManager) {
        this.textureManager = textureManager;

        // 36 slots: 0-8: Hotbar, 9-35: Storage
        this.slots = new Array(36).fill(null);
        
        // 9 slots for 3x3 crafting grid
        this.craftingSlots = new Array(9).fill(null);
        
        // 1 output slot for crafting result
        this.craftingOutput = null;

        // Item currently carried by cursor
        this.floatingItem = null;

        // Bind DOM references
        this.floatingEl = document.getElementById('floating-item');

        // Populate initial slots with starter resources for testing
        this.initStarterInventory();

        // Build HTML slots inside the inventory grids
        this.buildHTMLGrids();

        // Bind drag-and-drop mouse movements
        this.setupItemCursorTracking();
    }

    /**
     * Gives player starter items to play with
     */
    initStarterInventory() {
        // Blocks (ID mapping: 1=Grass, 2=Dirt, 3=Stone, 14=Planks, 4=Trunk, 10=Torch, 11=Cactus, 13=CoalOre)
        this.slots[0] = { id: 1, count: 64 };  // Grass
        this.slots[1] = { id: 2, count: 64 };  // Dirt
        this.slots[2] = { id: 3, count: 64 };  // Stone
        this.slots[3] = { id: 14, count: 64 }; // Wood Planks
        this.slots[4] = { id: 4, count: 32 };  // Wood Trunk
        this.slots[5] = { id: 'wooden_pickaxe', count: 1, durability: 60, maxDurability: 60 };
        this.slots[6] = { id: 10, count: 16 }; // Torches
        this.slots[7] = { id: 11, count: 8 };  // Cactus
        this.slots[8] = { id: 13, count: 16 }; // Coal Ore

        // Some items in inventory grid to start crafting immediately
        this.slots[9] = { id: 'stick', count: 8 };
        this.slots[10] = { id: 'coal', count: 12 };
    }

    /**
     * Builds inventory and hotbar grid HTML elements dynamically
     */
    buildHTMLGrids() {
        const mainGrid = document.getElementById('main-inventory-grid');
        const hotbarGrid = document.getElementById('hotbar-inventory-grid');

        // 1. Draw 27 inventory slots (indices 9 to 35)
        mainGrid.innerHTML = '';
        for (let i = 9; i <= 35; i++) {
            const slot = document.createElement('div');
            slot.className = 'inv-slot';
            slot.dataset.slotIndex = i;
            mainGrid.appendChild(slot);
        }

        // 2. Draw 9 hotbar slots (indices 0 to 8)
        hotbarGrid.innerHTML = '';
        for (let i = 0; i <= 8; i++) {
            const slot = document.createElement('div');
            slot.className = 'inv-slot';
            slot.dataset.slotIndex = i;
            hotbarGrid.appendChild(slot);
        }

        // 3. Bind click events for all slots
        document.querySelectorAll('.inv-slot, .hotbar-slot').forEach(slot => {
            slot.addEventListener('mousedown', (e) => {
                this.handleSlotClick(e, slot);
            });
        });

        // Initial render
        this.render();
    }

    /**
     * Updates the DOM overlay slots with icons, counts, and durability meters
     */
    render() {
        // Helper to draw item details into a DOM slot
        const drawSlot = (el, item) => {
            el.innerHTML = '';
            if (!item) return;

            // Icon
            const icon = document.createElement('div');
            icon.className = 'item-icon';
            icon.style.backgroundImage = `url(${this.textureManager.getItemIconDataURL(item.id)})`;
            el.appendChild(icon);

            // Count label (if > 1)
            if (item.count > 1) {
                const count = document.createElement('span');
                count.className = 'item-count';
                count.innerText = item.count;
                el.appendChild(count);
            }

            // Durability bar (for tools)
            if (item.durability !== undefined && item.maxDurability !== undefined) {
                const bar = document.createElement('div');
                bar.className = 'durability-bar';
                
                const fill = document.createElement('div');
                fill.className = 'durability-fill';
                const percent = (item.durability / item.maxDurability) * 100;
                fill.style.width = `${percent}%`;
                
                // Color change based on status
                if (percent > 50) fill.style.backgroundColor = '#55ff55'; // green
                else if (percent > 20) fill.style.backgroundColor = '#ffff55'; // yellow
                else fill.style.backgroundColor = '#ff5555'; // red

                bar.appendChild(fill);
                el.appendChild(bar);
            }
        };

        // Render main storage & hotbar mirror slots (36 slots total)
        for (let i = 0; i < 36; i++) {
            const item = this.slots[i];
            
            // Render inside inventory screen slots
            const invSlot = document.querySelector(`.inv-slot[data-slot-index="${i}"]`);
            if (invSlot) drawSlot(invSlot, item);

            // Render inside bottom HUD hotbar slots
            const hudSlot = document.getElementById(`hud-slot-${i}`);
            if (hudSlot) {
                drawSlot(hudSlot, item);
                // Retain keyboard index labels in HUD hotbar
                const keyLabel = document.createElement('span');
                keyLabel.className = 'slot-key';
                keyLabel.innerText = i + 1;
                hudSlot.appendChild(keyLabel);
            }
        }

        // Render 3x3 crafting inputs
        for (let i = 0; i < 9; i++) {
            const item = this.craftingSlots[i];
            const craftSlot = document.querySelector(`.crafting-input[data-craft-index="${i}"]`);
            if (craftSlot) drawSlot(craftSlot, item);
        }

        // Render crafting output slot
        const outputSlot = document.getElementById('crafting-output');
        if (outputSlot) drawSlot(outputSlot, this.craftingOutput);

        // Render floating mouse cursor item
        if (this.floatingItem) {
            this.floatingEl.classList.remove('hidden');
            drawSlot(this.floatingEl, this.floatingItem);
        } else {
            this.floatingEl.classList.add('hidden');
            this.floatingEl.innerHTML = '';
        }
    }

    /**
     * Mouse pointer tracker for floating grabbed items
     */
    setupItemCursorTracking() {
        document.addEventListener('mousemove', (e) => {
            if (this.floatingItem) {
                // Offset slightly to center the item icon under cursor
                this.floatingEl.style.left = `${e.clientX - 22}px`;
                this.floatingEl.style.top = `${e.clientY - 22}px`;
            }
        });
    }

    /**
     * Handles slot selection, stack grabbing, splitting, and merging
     */
    handleSlotClick(e, el) {
        e.preventDefault();
        e.stopPropagation();

        const isLeftClick = e.button === 0;
        const isRightClick = e.button === 2;

        let slotType = 'storage'; // 'storage', 'craft-input', 'craft-output'
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

        // 1. Click Crafting Output (result pull)
        if (slotType === 'craft-output') {
            if (targetItem && isLeftClick) {
                // Pick up crafted items
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

        // 2. Click standard slots (Storage or Crafting Input)
        if (isLeftClick) {
            if (!this.floatingItem) {
                // Grab item stack from slot
                if (targetItem) {
                    this.floatingItem = targetItem;
                    setTarget(null);
                }
            } else {
                // Place floating item
                if (!targetItem) {
                    // Place full stack in empty slot
                    setTarget(this.floatingItem);
                    this.floatingItem = null;
                } else if (targetItem.id === this.floatingItem.id) {
                    // Merge stacks
                    const total = targetItem.count + this.floatingItem.count;
                    if (total <= 64) {
                        targetItem.count = total;
                        this.floatingItem = null;
                    } else {
                        this.floatingItem.count = total - 64;
                        targetItem.count = 64;
                    }
                } else {
                    // Swap items
                    const temp = targetItem;
                    setTarget(this.floatingItem);
                    this.floatingItem = temp;
                }
            }
        } else if (isRightClick) {
            if (!this.floatingItem) {
                // Split stack: pick up half
                if (targetItem) {
                    const half = Math.ceil(targetItem.count / 2);
                    this.floatingItem = { ...targetItem, count: half };
                    targetItem.count -= half;
                    if (targetItem.count === 0) setTarget(null);
                }
            } else {
                // Place 1 item from floating stack
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

        // Recalculate crafting output after modifying inputs
        if (slotType === 'craft-input') {
            this.checkCraftingRecipes();
        }

        this.render();
    }

    /**
     * Deducts 1 resource count from all slots inside the 3x3 grid when crafting
     */
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
     * Checks if the 3x3 crafting grid matches any recipes
     */
    checkCraftingRecipes() {
        // Get active IDs in the grid (using 0 for empty)
        const grid = this.craftingSlots.map(slot => slot ? slot.id : 0);

        // Helper to check if grid is completely empty except for list of indices
        const isGridClean = (validIndices) => {
            for (let i = 0; i < 9; i++) {
                if (grid[i] !== 0 && !validIndices.includes(i)) return false;
            }
            return true;
        };

        // 1. Recipe: Wood Trunk (4) -> Planks (14) x4
        // Check if there is exactly 1 wood trunk anywhere in the grid, others empty
        let trunkCount = 0;
        let trunkIdx = -1;
        for (let i = 0; i < 9; i++) {
            if (grid[i] === 4) {
                trunkCount++;
                trunkIdx = i;
            }
        }
        if (trunkCount === 1 && this.craftingSlots[trunkIdx].count >= 1 && isGridClean([trunkIdx])) {
            this.craftingOutput = { id: 14, count: 4 };
            return;
        }

        // 2. Recipe: Sticks
        // 2 Planks (14) vertically stacked
        // Can be anywhere, check index pairs: (0,3), (1,4), (2,5), (3,6), (4,7), (5,8)
        const stickPairs = [[0,3], [1,4], [2,5], [3,6], [4,7], [5,8]];
        for (const [top, bot] of stickPairs) {
            if (grid[top] === 14 && grid[bot] === 14 && isGridClean([top, bot])) {
                this.craftingOutput = { id: 'stick', count: 4 };
                return;
            }
        }

        // 3. Recipe: Wooden Pickaxe
        // 3 Planks (14) top row, 2 Sticks (stick) middle/bottom columns
        // Pattern: [14, 14, 14,  0, 'stick', 0,  0, 'stick', 0]
        if (grid[0] === 14 && grid[1] === 14 && grid[2] === 14 &&
            grid[4] === 'stick' && grid[7] === 'stick' &&
            isGridClean([0, 1, 2, 4, 7])) {
            this.craftingOutput = { id: 'wooden_pickaxe', count: 1, durability: 60, maxDurability: 60 };
            return;
        }

        // 4. Recipe: Torches
        // 1 Coal (coal) or Coal Ore (13) on top, 1 Stick (stick) below
        // Pairs: (0,3), (1,4), (2,5), (3,6), (4,7), (5,8)
        const torchPairs = [[0,3], [1,4], [2,5], [3,6], [4,7], [5,8]];
        for (const [top, bot] of torchPairs) {
            const isCoal = grid[top] === 'coal' || grid[top] === 13;
            if (isCoal && grid[bot] === 'stick' && isGridClean([top, bot])) {
                this.craftingOutput = { id: 10, count: 4 }; // Torches
                return;
            }
        }

        // 5. Recipe: Bricks
        // 4 Stones (3) in a 2x2 square anywhere
        // Quads: (0,1,3,4), (1,2,4,5), (3,4,6,7), (4,5,7,8)
        const brickQuads = [[0,1,3,4], [1,2,4,5], [3,4,6,7], [4,5,7,8]];
        for (const quad of brickQuads) {
            const allStone = quad.every(idx => grid[idx] === 3);
            if (allStone && isGridClean(quad)) {
                this.craftingOutput = { id: 9, count: 4 }; // Bricks
                return;
            }
        }

        // Default: No recipe matches
        this.craftingOutput = null;
    }

    /**
     * Gets the item in the active hotbar slot
     */
    getActiveHotbarItem(activeIndex) {
        if (activeIndex < 0 || activeIndex >= 9) return null;
        return this.slots[activeIndex];
    }

    /**
     * Decrease quantity of item in active hotbar slot by 1 (used when placing blocks)
     */
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

    /**
     * Adds an item to the inventory (e.g. from mining blocks or drops)
     */
    addItem(itemId, count = 1) {
        // 1. Try to merge with existing stacks
        for (let i = 0; i < 36; i++) {
            const item = this.slots[i];
            if (item && item.id === itemId && item.count < 64 && itemId !== 'wooden_pickaxe') {
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

        // 2. Find empty slot
        for (let i = 0; i < 36; i++) {
            if (!this.slots[i]) {
                if (itemId === 'wooden_pickaxe') {
                    this.slots[i] = { id: itemId, count: 1, durability: 60, maxDurability: 60 };
                } else {
                    this.slots[i] = { id: itemId, count: count };
                }
                this.render();
                return true;
            }
        }

        return false; // Inventory full
    }
}

// Make globally available
window.Inventory = Inventory;
