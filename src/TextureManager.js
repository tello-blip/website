/**
 * TextureManager - Generates procedural pixelated textures on HTML canvases
 * and compiles them into a single 8x8 Texture Atlas for optimal Three.js rendering.
 */
class TextureManager {
    constructor() {
        this.tileSize = 16;
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
            torch_top:    { c: 1, r: 2 },
            cobblestone:  { c: 2, r: 2 },
            iron_ore:     { c: 3, r: 2 }
        };

        // Create the atlas canvas
        this.atlasCanvas = document.createElement('canvas');
        this.atlasCanvas.width = this.atlasSize;
        this.atlasCanvas.height = this.atlasSize;
        this.ctx = this.atlasCanvas.getContext('2d');

        // Map block IDs to their face textures
        // Face order: +X, -X, +Y, -Y, +Z, -Z
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
            12: { top: 'snow',       bottom: 'dirt',        side: 'grass_side' },   // Snow
            13: { top: 'coal_ore',   bottom: 'coal_ore',    side: 'coal_ore' },     // Coal Ore
            14: { top: 'planks',     bottom: 'planks',      side: 'planks' },       // Planks
            15: { top: 'cobblestone',bottom: 'cobblestone', side: 'cobblestone' },  // Cobblestone
            16: { top: 'iron_ore',   bottom: 'iron_ore',    side: 'iron_ore' }      // Iron Ore
        };

        this.generateAtlas();
    }

    setPixel(ctx, x, y, r, g, b, a = 1, variation = 15) {
        const v = (Math.random() - 0.5) * variation;
        const R = Math.max(0, Math.min(255, Math.floor(r + v)));
        const G = Math.max(0, Math.min(255, Math.floor(g + v)));
        const B = Math.max(0, Math.min(255, Math.floor(b + v)));
        ctx.fillStyle = `rgba(${R},${G},${B},${a})`;
        ctx.fillRect(x, y, 1, 1);
    }

    generateAtlas() {
        const size = this.tileSize;

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

        // 5. Wood Side
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

        // 7. Leaves
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
                this.setPixel(coalOre.ctx, x, y, 125, 125, 128, 1, 12);
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
                    this.setPixel(cactusSide.ctx, x, y, 240, 240, 245, 1, 5);
                } else if (isRib) {
                    this.setPixel(cactusSide.ctx, x, y, 25, 90, 20, 1, 10);
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
                // Thicker stick (6 pixels wide: 5 to 10)
                const isStick = (x >= 5 && x <= 10) && y >= 6;
                const isCoalHead = (x >= 5 && x <= 10) && y >= 3 && y <= 5;
                const isFlame = (x >= 4 && x <= 11) && y <= 2;
                if (isFlame) {
                    this.setPixel(torchSide.ctx, x, y, 255, 150, 30, 1, 30);
                } else if (isCoalHead) {
                    this.setPixel(torchSide.ctx, x, y, 60, 55, 52, 1, 5);
                } else if (isStick) {
                    this.setPixel(torchSide.ctx, x, y, 150, 110, 70, 1, 12);
                }
            }
        }

        // 18. Torch Top
        const torchTop = createFace();
        torchTop.ctx.clearRect(0, 0, size, size);
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const isInnerFlame = x >= 7 && x <= 8 && y >= 7 && y <= 8;
                const isOuterGlow = x >= 5 && x <= 10 && y >= 5 && y <= 10;
                if (isInnerFlame) {
                    this.setPixel(torchTop.ctx, x, y, 255, 230, 80, 1, 10);
                } else if (isOuterGlow) {
                    this.setPixel(torchTop.ctx, x, y, 255, 140, 20, 0.9, 15);
                }
            }
        }

        // 19. Cobblestone (Rough rocky stones)
        const cobble = createFace();
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const isBorder = x === 0 || y === 0 || x === size - 1 || y === size - 1 || x % 5 === 0 || y % 5 === 0;
                if (isBorder) {
                    this.setPixel(cobble.ctx, x, y, 80, 80, 82, 1, 10); // Dark mortar seams
                } else {
                    this.setPixel(cobble.ctx, x, y, 115, 115, 118, 1, 15); // Rough stone panels
                }
            }
        }

        // 20. Iron Ore (Stone with orange specks)
        const ironOre = createFace();
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                this.setPixel(ironOre.ctx, x, y, 125, 125, 128, 1, 12); // Stone base
                const isIron = (x === 2 && y === 3) || (x === 3 && y === 3) || (x === 11 && y === 5) || 
                               (x === 12 && y === 6) || (x === 5 && y === 10) || (x === 6 && y === 9) || 
                               (x === 8 && y === 12) || (x === 9 && y === 11);
                if (isIron) {
                    this.setPixel(ironOre.ctx, x, y, 190, 140, 100, 1, 10); // Tan/orange raw iron deposits
                }
            }
        }

        // Blit all generated textures
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
        blit(cobble.c, 'cobblestone');
        blit(ironOre.c, 'iron_ore');

        // Generate item icons
        this.generateItemIcons();
    }

    generateItemIcons() {
        this.itemIcons = {};
        const size = 16;
        
        const createIcon = () => {
            const canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;
            return { c: canvas, ctx: canvas.getContext('2d') };
        };

        // 1. Stick
        const stick = createIcon();
        for (let i = 2; i < 14; i++) {
            this.setPixel(stick.ctx, i, 15 - i, 130, 95, 60, 1, 10);
            this.setPixel(stick.ctx, i + 1, 15 - i, 100, 70, 40, 1, 5);
        }
        this.itemIcons['stick'] = stick.c.toDataURL();

        // 2. Coal
        const coal = createIcon();
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const dx = x - 7.5;
                const dy = y - 7.5;
                const dist = Math.sqrt(dx*dx + dy*dy);
                if (dist < 4.5 && !(Math.abs(dx) > 3.0 && Math.abs(dy) > 3.0)) {
                    this.setPixel(coal.ctx, x, y, 40, 40, 45, 1, 15);
                }
            }
        }
        this.itemIcons['coal'] = coal.c.toDataURL();

        // 3. Raw Iron (rust brown lump)
        const rawIron = createIcon();
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const dx = x - 7.5;
                const dy = y - 7.5;
                const dist = Math.sqrt(dx*dx + dy*dy);
                if (dist < 4.5 && !(Math.abs(dx) > 3.0 && Math.abs(dy) > 3.0)) {
                    this.setPixel(rawIron.ctx, x, y, 190, 140, 100, 1, 15);
                }
            }
        }
        this.itemIcons['raw_iron'] = rawIron.c.toDataURL();

        // 4. Iron Ingot (diagonal shiny bar)
        const ingot = createIcon();
        for (let i = 4; i < 12; i++) {
            this.setPixel(ingot.ctx, i, 14 - i, 220, 220, 225, 1, 5);
            this.setPixel(ingot.ctx, i + 1, 15 - i, 230, 230, 235, 1, 0); // Shiny reflection
            this.setPixel(ingot.ctx, i - 1, 15 - i, 140, 140, 145, 1, 10); // Shaded edge
        }
        this.itemIcons['iron_ingot'] = ingot.c.toDataURL();

        // 5. Raw Porkchop (pink meat lump with a white bone tip)
        const meat = createIcon();
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const dx = x - 7.5;
                const dy = y - 7.5;
                const dist = Math.sqrt(dx*dx + dy*dy);
                if (dist < 5.0) {
                    this.setPixel(meat.ctx, x, y, 225, 120, 115, 1, 12);
                }
            }
        }
        // Bone tip (bottom-left)
        this.setPixel(meat.ctx, 2, 13, 245, 245, 245, 1, 0);
        this.setPixel(meat.ctx, 3, 12, 245, 245, 245, 1, 0);
        this.itemIcons['porkchop'] = meat.c.toDataURL();

        // Helper to draw tool shapes
        const drawTool = (headColor, shadedHeadColor) => {
            const tool = createIcon();
            // Handle
            for (let i = 2; i < 11; i++) {
                this.setPixel(tool.ctx, i, 15 - i, 130, 95, 60, 1, 0);
                this.setPixel(tool.ctx, i + 1, 14 - i, 100, 70, 40, 1, 0);
            }
            return { c: tool.c, ctx: tool.ctx };
        };

        // 6. Pickaxes
        const buildPick = (color, shade) => {
            const tool = drawTool();
            const headPoints = [
                {x: 8, y: 2}, {x: 9, y: 2}, {x: 10, y: 2}, {x: 11, y: 2}, {x: 12, y: 3}, {x: 13, y: 4}, {x: 14, y: 5},
                {x: 7, y: 2}, {x: 6, y: 2}, {x: 5, y: 2}, {x: 4, y: 2}, {x: 3, y: 3}, {x: 2, y: 4}, {x: 1, y: 5}
            ];
            headPoints.forEach(p => {
                this.setPixel(tool.ctx, p.x, p.y, color[0], color[1], color[2], 1, 10);
                this.setPixel(tool.ctx, p.x, p.y + 1, shade[0], shade[1], shade[2], 1, 5);
            });
            return tool.c.toDataURL();
        };

        this.itemIcons['wooden_pickaxe'] = buildPick([160, 130, 85], [115, 90, 55]);
        this.itemIcons['stone_pickaxe'] = buildPick([125, 125, 128], [90, 90, 95]);
        this.itemIcons['iron_pickaxe'] = buildPick([220, 220, 225], [140, 140, 145]);

        // 7. Swords (straight long diagonal blade)
        const buildSword = (color, shade) => {
            const tool = createIcon();
            // Handle hilt stick (bottom-left)
            this.setPixel(tool.ctx, 2, 13, 100, 70, 40, 1, 0);
            this.setPixel(tool.ctx, 3, 12, 100, 70, 40, 1, 0);
            // Hilt crossbar
            this.setPixel(tool.ctx, 4, 12, 130, 95, 60, 1, 0);
            this.setPixel(tool.ctx, 3, 13, 130, 95, 60, 1, 0);
            this.setPixel(tool.ctx, 4, 11, 130, 95, 60, 1, 0);
            this.setPixel(tool.ctx, 5, 12, 130, 95, 60, 1, 0);
            
            // Blade (diagonal up-right)
            for (let i = 5; i < 14; i++) {
                this.setPixel(tool.ctx, i, 15 - i, color[0], color[1], color[2], 1, 10);
                this.setPixel(tool.ctx, i + 1, 14 - i, shade[0], shade[1], shade[2], 1, 5);
            }
            return tool.c.toDataURL();
        };

        this.itemIcons['wooden_sword'] = buildSword([160, 130, 85], [115, 90, 55]);
        this.itemIcons['stone_sword'] = buildSword([125, 125, 128], [90, 90, 95]);
        this.itemIcons['iron_sword'] = buildSword([220, 220, 225], [140, 140, 145]);

        // 8. Torch Icon
        const torch = createIcon();
        for (let i = 4; i < 11; i++) {
            this.setPixel(torch.ctx, i, 15 - i, 140, 105, 65, 1, 5);
        }
        this.setPixel(torch.ctx, 11, 4, 50, 50, 52, 1, 0);
        this.setPixel(torch.ctx, 10, 5, 50, 50, 52, 1, 0);
        this.setPixel(torch.ctx, 11, 3, 255, 130, 10, 1, 15);
        this.setPixel(torch.ctx, 12, 2, 255, 160, 20, 1, 15);
        this.setPixel(torch.ctx, 12, 3, 255, 80, 0, 1, 15);
        this.itemIcons['torch'] = torch.c.toDataURL();
    }

    getItemIconDataURL(itemId) {
        if (this.itemIcons[itemId]) return this.itemIcons[itemId];
        if (itemId === 10) return this.itemIcons['torch'];

        const blockName = this.blockFaces[itemId] ? this.blockFaces[itemId].top : 'dirt';
        const coord = this.tileCoords[blockName];
        if (!coord) return '';

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
            0, 0, 16, 16
        );
        return tempCanvas.toDataURL();
    }

    createThreeTexture() {
        const texture = new THREE.CanvasTexture(this.atlasCanvas);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        texture.generateMipmaps = false;
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        return texture;
    }

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

        const eps = 0.0002;
        const u0 = uMin + eps;
        const u1 = uMax - eps;
        const v0 = vMin + eps;
        const v1 = vMax - eps;

        return { u0, u1, v0, v1 };
    }
}

window.TextureManager = TextureManager;
