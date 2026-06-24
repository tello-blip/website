/**
 * TextureManager - Generates procedural pixelated textures on HTML canvases
 * and compiles them into a single 8x8 Texture Atlas for optimal Three.js rendering.
 */
class TextureManager {
    constructor() {
        this.tileSize = 16; // 16x16 pixels per block face
        this.atlasCols = 8;
        this.atlasRows = 8;
        this.atlasSize = this.tileSize * this.atlasCols; // 128x128 pixels total
        
        // Define tile coordinates in the atlas (column, row) 0-indexed
        this.tileCoords = {
            grass_top:    { c: 0, r: 0 },
            grass_side:   { c: 1, r: 0 },
            dirt:         { c: 2, r: 0 },
            stone:        { c: 3, r: 0 },
            wood_side:    { c: 4, r: 0 },
            wood_top:     { c: 5, r: 0 },
            leaves:       { c: 6, r: 0 },
            sand:         { c: 7, r: 0 },
            
            water:        { c: 0, r: 1 },
            glass:        { c: 1, r: 1 },
            brick:        { c: 2, r: 1 },
            planks:       { c: 3, r: 1 },
            coal_ore:     { c: 4, r: 1 },
            cactus_side:  { c: 5, r: 1 },
            cactus_top:   { c: 6, r: 1 },
            snow:         { c: 7, r: 1 },
            
            torch_side:   { c: 0, r: 2 },
            torch_top:    { c: 1, r: 2 }
        };

        // Create the atlas canvas
        this.atlasCanvas = document.createElement('canvas');
        this.atlasCanvas.width = this.atlasSize;
        this.atlasCanvas.height = this.atlasSize;
        this.ctx = this.atlasCanvas.getContext('2d');

        // Map block IDs to their face textures
        // Face order: +X, -X, +Y, -Y, +Z, -Z (Right, Left, Top, Bottom, Front, Back)
        this.blockFaces = {
            1: { top: 'grass_top',   bottom: 'dirt',        side: 'grass_side' },   // Grass
            2: { top: 'dirt',        bottom: 'dirt',        side: 'dirt' },         // Dirt
            3: { top: 'stone',       bottom: 'stone',       side: 'stone' },        // Stone
            4: { top: 'wood_top',    bottom: 'wood_top',    side: 'wood_side' },    // Wood Trunk
            5: { top: 'leaves',      bottom: 'leaves',      side: 'leaves' },       // Leaves
            6: { top: 'sand',        bottom: 'sand',        side: 'sand' },         // Sand
            7: { top: 'water',       bottom: 'water',       side: 'water' },        // Water
            8: { top: 'glass',       bottom: 'glass',       side: 'glass' },        // Glass
            9: { top: 'brick',       bottom: 'brick',       side: 'brick' },        // Brick
            10: { top: 'torch_top',  bottom: 'torch_side',  side: 'torch_side' },   // Torch
            11: { top: 'cactus_top', bottom: 'cactus_top',  side: 'cactus_side' },  // Cactus
            12: { top: 'snow',       bottom: 'dirt',        side: 'grass_side' },   // Snow (Snow cover top, grassy side, dirt bottom)
            13: { top: 'coal_ore',   bottom: 'coal_ore',    side: 'coal_ore' },     // Coal Ore
            14: { top: 'planks',     bottom: 'planks',      side: 'planks' }        // Wood Planks
        };

        // Generate the atlas and item icons
        this.generateAtlas();
    }

    /**
     * Set a pixel with color variation
     */
    setPixel(ctx, x, y, r, g, b, a = 1, variation = 15) {
        const v = (Math.random() - 0.5) * variation;
        const R = Math.max(0, Math.min(255, Math.floor(r + v)));
        const G = Math.max(0, Math.min(255, Math.floor(g + v)));
        const B = Math.max(0, Math.min(255, Math.floor(b + v)));
        ctx.fillStyle = `rgba(${R},${G},${B},${a})`;
        ctx.fillRect(x, y, 1, 1);
    }

    /**
     * Draw individual textures onto temporary canvases and blit them onto the atlas
     */
    generateAtlas() {
        const size = this.tileSize;

        // Helper to create a face canvas
        const createFace = () => {
            const canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;
            return { c: canvas, ctx: canvas.getContext('2d') };
        };

        // 1. Dirt
        const dirt = createFace();
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                this.setPixel(dirt.ctx, x, y, 115, 80, 52, 1, 20);
            }
        }

        // 2. Grass Top
        const grassTop = createFace();
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                this.setPixel(grassTop.ctx, x, y, 90, 145, 62, 1, 24);
            }
        }

        // 3. Grass Side
        const grassSide = createFace();
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const grassHeight = 3 + Math.floor(Math.sin(x * 1.5) * 1.2) + (x % 2 === 0 ? 1 : 0);
                if (y < grassHeight) {
                    this.setPixel(grassSide.ctx, x, y, 90, 145, 62, 1, 24);
                } else {
                    this.setPixel(grassSide.ctx, x, y, 115, 80, 52, 1, 20);
                }
            }
        }

        // 4. Stone
        const stone = createFace();
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const isCrack = (x + y) % 5 === 0 || (x - y) % 7 === 2 || Math.random() < 0.05;
                if (isCrack) {
                    this.setPixel(stone.ctx, x, y, 90, 90, 95, 1, 10);
                } else {
                    this.setPixel(stone.ctx, x, y, 125, 125, 128, 1, 12);
                }
            }
        }

        // 5. Wood Side (Bark)
        const woodSide = createFace();
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const isVerticalLines = x % 4 === 0 || (x + y * 2) % 8 === 0;
                if (isVerticalLines) {
                    this.setPixel(woodSide.ctx, x, y, 70, 50, 32, 1, 10);
                } else {
                    this.setPixel(woodSide.ctx, x, y, 100, 75, 48, 1, 15);
                }
            }
        }

        // 6. Wood Top
        const woodTop = createFace();
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const dx = x - 7.5;
                const dy = y - 7.5;
                const dist = Math.sqrt(dx*dx + dy*dy);
                const isRing = Math.floor(dist) % 3 === 0;
                if (isRing) {
                    this.setPixel(woodTop.ctx, x, y, 155, 120, 80, 1, 8);
                } else {
                    this.setPixel(woodTop.ctx, x, y, 180, 145, 100, 1, 10);
                }
            }
        }

        // 7. Leaves (Semi-transparent)
        const leaves = createFace();
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const isHole = (x + y * 3) % 7 === 0 || (x * 2 - y) % 9 === 0;
                if (isHole) {
                    leaves.ctx.clearRect(x, y, 1, 1);
                } else {
                    this.setPixel(leaves.ctx, x, y, 35, 110, 30, 1, 20);
                }
            }
        }

        // 8. Sand
        const sand = createFace();
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                this.setPixel(sand.ctx, x, y, 222, 205, 145, 1, 10);
            }
        }

        // 9. Water
        const water = createFace();
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const isWave = (x + y) % 4 === 0 || Math.sin(x * 0.5) * 2 + y === 8;
                if (isWave) {
                    this.setPixel(water.ctx, x, y, 70, 120, 230, 0.75, 15);
                } else {
                    this.setPixel(water.ctx, x, y, 50, 95, 210, 0.70, 10);
                }
            }
        }

        // 10. Glass
        const glass = createFace();
        glass.ctx.clearRect(0, 0, size, size);
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const isBorder = x === 0 || x === size - 1 || y === 0 || y === size - 1;
                const isSheen = (x - y === 3 || x - y === 4) && x > 2 && x < 12;
                if (isBorder) {
                    this.setPixel(glass.ctx, x, y, 200, 220, 235, 0.6, 5);
                } else if (isSheen) {
                    this.setPixel(glass.ctx, x, y, 255, 255, 255, 0.4, 0);
                }
            }
        }

        // 11. Brick
        const brick = createFace();
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const isMortarRow = y % 4 === 0;
                const isMortarCol = (Math.floor(y / 4) % 2 === 0) ? (x === 0 || x === 8) : (x === 4 || x === 12);
                if (isMortarRow || isMortarCol) {
                    this.setPixel(brick.ctx, x, y, 195, 195, 195, 1, 5);
                } else {
                    this.setPixel(brick.ctx, x, y, 155, 60, 48, 1, 15);
                }
            }
        }

        // 12. Wood Planks
        const planks = createFace();
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const isPlankBorder = y % 4 === 0 || x === 0 || (y < 4 && x === 8) || (y >= 4 && y < 8 && x === 4) || (y >= 8 && y < 12 && x === 12) || (y >= 12 && x === 6);
                if (isPlankBorder) {
                    this.setPixel(planks.ctx, x, y, 115, 90, 55, 1, 10);
                } else {
                    this.setPixel(planks.ctx, x, y, 160, 130, 85, 1, 12);
                }
            }
        }

        // 13. Coal Ore
        const coalOre = createFace();
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                // Stone base
                this.setPixel(coalOre.ctx, x, y, 125, 125, 128, 1, 12);
                
                // Add Coal spots
                const isCoal = (x === 3 && y === 4) || (x === 4 && y === 4) || (x === 3 && y === 5) ||
                               (x === 10 && y === 2) || (x === 11 && y === 3) ||
                               (x === 6 && y === 10) || (x === 7 && y === 11) || (x === 8 && y === 11) ||
                               (x === 12 && y === 12);
                if (isCoal) {
                    this.setPixel(coalOre.ctx, x, y, 30, 30, 30, 1, 5);
                }
            }
        }

        // 14. Cactus Side
        const cactusSide = createFace();
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const isRib = x % 4 === 0;
                const isSpike = (x + y * 2) % 6 === 0 && Math.random() < 0.3;
                if (isSpike) {
                    this.setPixel(cactusSide.ctx, x, y, 240, 240, 245, 1, 5); // White needles
                } else if (isRib) {
                    this.setPixel(cactusSide.ctx, x, y, 25, 90, 20, 1, 10); // Dark ribs
                } else {
                    this.setPixel(cactusSide.ctx, x, y, 35, 120, 30, 1, 12);
                }
            }
        }

        // 15. Cactus Top
        const cactusTop = createFace();
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const dx = x - 7.5;
                const dy = y - 7.5;
                const dist = Math.sqrt(dx*dx + dy*dy);
                const isNeedleCenter = dist > 6.5;
                if (isNeedleCenter) {
                    this.setPixel(cactusTop.ctx, x, y, 240, 240, 245, 1, 5);
                } else if (Math.abs(Math.floor(dist) - 4) < 1) {
                    this.setPixel(cactusTop.ctx, x, y, 25, 90, 20, 1, 10);
                } else {
                    this.setPixel(cactusTop.ctx, x, y, 35, 120, 30, 1, 12);
                }
            }
        }

        // 16. Snow
        const snow = createFace();
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                this.setPixel(snow.ctx, x, y, 242, 246, 255, 1, 6);
            }
        }

        // 17. Torch Side
        const torchSide = createFace();
        torchSide.ctx.clearRect(0, 0, size, size);
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                // Torch matches a stick centered horizontally in X (columns 7-8)
                const isStick = (x === 7 || x === 8) && y >= 6;
                const isCoalHead = (x === 7 || x === 8) && y >= 3 && y <= 5;
                const isFlame = (x >= 6 && x <= 9) && y <= 2;
                
                if (isFlame) {
                    this.setPixel(torchSide.ctx, x, y, 255, 150, 30, 1, 30); // Orange/yellow glow
                } else if (isCoalHead) {
                    this.setPixel(torchSide.ctx, x, y, 40, 40, 42, 1, 5); // Dark coal
                } else if (isStick) {
                    this.setPixel(torchSide.ctx, x, y, 140, 105, 65, 1, 10); // Brown stick
                }
            }
        }

        // 18. Torch Top (Flame cross section)
        const torchTop = createFace();
        torchTop.ctx.clearRect(0, 0, size, size);
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const isInnerFlame = x >= 7 && x <= 8 && y >= 7 && y <= 8;
                const isOuterGlow = x >= 6 && x <= 9 && y >= 6 && y <= 9;
                if (isInnerFlame) {
                    this.setPixel(torchTop.ctx, x, y, 255, 230, 80, 1, 10); // Bright core
                } else if (isOuterGlow) {
                    this.setPixel(torchTop.ctx, x, y, 255, 140, 20, 0.9, 15); // Outer flame
                }
            }
        }

        // Blit all generated textures to our atlas canvas
        const blit = (canvas, name) => {
            const coord = this.tileCoords[name];
            if (coord) {
                this.ctx.drawImage(canvas, coord.c * size, coord.r * size);
            }
        };

        blit(grassTop.c, 'grass_top');
        blit(grassSide.c, 'grass_side');
        blit(dirt.c, 'dirt');
        blit(stone.c, 'stone');
        blit(woodSide.c, 'wood_side');
        blit(woodTop.c, 'wood_top');
        blit(leaves.c, 'leaves');
        blit(sand.c, 'sand');
        
        blit(water.c, 'water');
        blit(glass.c, 'glass');
        blit(brick.c, 'brick');
        blit(planks.c, 'planks');
        blit(coalOre.c, 'coal_ore');
        blit(cactusSide.c, 'cactus_side');
        blit(cactusTop.c, 'cactus_top');
        blit(snow.c, 'snow');
        
        blit(torchSide.c, 'torch_side');
        blit(torchTop.c, 'torch_top');

        // Generate non-block item icons for the inventory screen
        this.generateItemIcons();
    }

    /**
     * Generates separate icons for items (Stick, Coal, Wooden Pickaxe, Torch icon)
     */
    generateItemIcons() {
        this.itemIcons = {};
        const size = 16;
        
        const createIcon = () => {
            const canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;
            return { c: canvas, ctx: canvas.getContext('2d') };
        };

        // 1. Stick Icon (slanted line)
        const stick = createIcon();
        for (let i = 2; i < 14; i++) {
            // Draw diagonal wood line
            this.setPixel(stick.ctx, i, 15 - i, 130, 95, 60, 1, 10);
            this.setPixel(stick.ctx, i + 1, 15 - i, 100, 70, 40, 1, 5);
        }
        this.itemIcons['stick'] = stick.c.toDataURL();

        // 2. Coal Icon (rock lump)
        const coal = createIcon();
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const dx = x - 7.5;
                const dy = y - 7.5;
                const dist = Math.sqrt(dx*dx + dy*dy);
                if (dist < 5.0 && !(Math.abs(dx) > 3.5 && Math.abs(dy) > 3.5)) {
                    this.setPixel(coal.ctx, x, y, 40, 40, 45, 1, 15);
                }
            }
        }
        this.itemIcons['coal'] = coal.c.toDataURL();

        // 3. Wooden Pickaxe Icon
        const pick = createIcon();
        // Handle (diagonal stick)
        for (let i = 2; i < 11; i++) {
            this.setPixel(pick.ctx, i, 15 - i, 130, 95, 60, 1, 0);
            this.setPixel(pick.ctx, i + 1, 14 - i, 100, 70, 40, 1, 0);
        }
        // Pickaxe head (curved top-left to top-right)
        // Draw head using Wood Planks colors
        const headPoints = [
            {x: 8, y: 2}, {x: 9, y: 2}, {x: 10, y: 2}, {x: 11, y: 2}, {x: 12, y: 3}, {x: 13, y: 4}, {x: 14, y: 5},
            {x: 7, y: 2}, {x: 6, y: 2}, {x: 5, y: 2}, {x: 4, y: 2}, {x: 3, y: 3}, {x: 2, y: 4}, {x: 1, y: 5}
        ];
        headPoints.forEach(p => {
            this.setPixel(pick.ctx, p.x, p.y, 160, 130, 85, 1, 10);
            this.setPixel(pick.ctx, p.x, p.y + 1, 115, 90, 55, 1, 5); // Bottom shading
        });
        this.itemIcons['wooden_pickaxe'] = pick.c.toDataURL();

        // 4. Torch Icon (little slanted torch)
        const torch = createIcon();
        for (let i = 4; i < 11; i++) {
            this.setPixel(torch.ctx, i, 15 - i, 140, 105, 65, 1, 5);
        }
        // Coal head
        this.setPixel(torch.ctx, 11, 4, 50, 50, 52, 1, 0);
        this.setPixel(torch.ctx, 10, 5, 50, 50, 52, 1, 0);
        // Flame
        this.setPixel(torch.ctx, 11, 3, 255, 130, 10, 1, 15);
        this.setPixel(torch.ctx, 12, 2, 255, 160, 20, 1, 15);
        this.setPixel(torch.ctx, 12, 3, 255, 80, 0, 1, 15);
        this.itemIcons['torch'] = torch.c.toDataURL();
    }

    /**
     * Returns the procedural DataURL icon for any item or block
     */
    getItemIconDataURL(itemId) {
        // If it's a non-block item
        if (itemId === 'stick') return this.itemIcons['stick'];
        if (itemId === 'coal') return this.itemIcons['coal'];
        if (itemId === 'wooden_pickaxe') return this.itemIcons['wooden_pickaxe'];
        if (itemId === 10) return this.itemIcons['torch']; // Special torch icon

        // For blocks, grab their TOP texture from the atlas and scale it for the slot
        const blockName = this.blockFaces[itemId] ? this.blockFaces[itemId].top : 'dirt';
        const coord = this.tileCoords[blockName];
        if (!coord) return '';

        // Extract the 16x16 square from our atlas and draw it onto a temp canvas
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = 16;
        tempCanvas.height = 16;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.drawImage(
            this.atlasCanvas, 
            coord.c * this.tileSize, 
            coord.r * this.tileSize, 
            this.tileSize, 
            this.tileSize, 
            0, 
            0, 
            16, 
            16
        );
        return tempCanvas.toDataURL();
    }

    /**
     * Create Three.js Texture from the compiled Atlas canvas
     */
    createThreeTexture() {
        const texture = new THREE.CanvasTexture(this.atlasCanvas);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        texture.generateMipmaps = false;
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        return texture;
    }

    /**
     * Returns the 4 pairs of [u, v] texture coordinates for a given face of a block
     */
    getFaceUVs(blockId, faceName) {
        const config = this.blockFaces[blockId];
        if (!config) return { u0: 0, u1: 0.125, v0: 0, v1: 0.125 };

        let textureName = config.side;
        if (faceName === 'top') textureName = config.top;
        if (faceName === 'bottom') textureName = config.bottom;

        const coord = this.tileCoords[textureName];
        if (!coord) return { u0: 0, u1: 0.125, v0: 0, v1: 0.125 };

        const uMin = coord.c / this.atlasCols;
        const uMax = (coord.c + 1) / this.atlasCols;
        
        const vMin = (this.atlasRows - 1 - coord.r) / this.atlasRows;
        const vMax = (this.atlasRows - coord.r) / this.atlasRows;

        // Inset slightly to prevent bleeding
        const eps = 0.0002;
        const u0 = uMin + eps;
        const u1 = uMax - eps;
        const v0 = vMin + eps;
        const v1 = vMax - eps;

        return { u0, u1, v0, v1 };
    }
}

// Make globally available
window.TextureManager = TextureManager;
