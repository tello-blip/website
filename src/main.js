/**
 * main.js - Core application entry point.
 * Coordinates Three.js, game loop, UI events, Inventory triggers, and Mob loops.
 */

// Game states
const STATES = {
    MENU: 'menu',
    PLAYING: 'playing',
    PAUSED: 'paused',
    INVENTORY: 'inventory' // New state for inventory editing
};
let gameState = STATES.MENU;

// Three.js Globals
let scene, camera, renderer;
let textureManager, world, player, inventory, mobManager;
let clock;

// UI Elements
const mainMenu = document.getElementById('main-menu');
const pauseMenu = document.getElementById('pause-menu');
const controlsModal = document.getElementById('controls-modal');
const inventoryOverlay = document.getElementById('inventory-overlay');
const resumePrompt = document.getElementById('resume-prompt');
const btnPlay = document.getElementById('btn-play');
const btnControls = document.getElementById('btn-controls');
const btnControlsBack = document.getElementById('btn-controls-back');
const btnResume = document.getElementById('btn-resume');
const btnReset = document.getElementById('btn-reset');
const btnMenu = document.getElementById('btn-menu');
const hotbarSlots = document.querySelectorAll('.hotbar-slot');

let activeSlotIndex = 0;

/**
 * Main Initialization
 */
function init() {
    // 1. Scene setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x7ec0ee); // Sky blue
    scene.fog = new THREE.FogExp2(0x7ec0ee, 0.015); // Fog fading

    // 2. Camera setup
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

    // 3. Renderer setup
    renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    document.getElementById('canvas-container').appendChild(renderer.domElement);

    // 4. Lighting setup
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.45);
    scene.add(ambientLight);

    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.3);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xffffff, 0.6);
    sunLight.position.set(20, 60, 10);
    scene.add(sunLight);

    // 5. Initialize Subsystems
    textureManager = new TextureManager();
    inventory = new Inventory(textureManager);
    world = new World(scene, textureManager);
    player = new Player(camera, world, inventory);
    mobManager = new MobManager(scene, world);

    clock = new THREE.Clock();

    // 6. Bind Event Listeners
    setupUIEvents();
    setupInteractionEvents();

    // 7. Start the game loop
    animate();
}

/**
 * Handle game loop (rendering, updates)
 */
function animate() {
    requestAnimationFrame(animate);

    const dt = clock.getDelta();

    if (gameState === STATES.PLAYING) {
        // Update physics, player position, raycasts, and mining timers
        player.update(dt, activeSlotIndex);
        
        // Dynamically load chunks around player
        world.updateChunksAroundPlayer(player.position.x, player.position.z);

        // Update animals wandering AI and physics
        mobManager.update(dt, player.position.x, player.position.z);
    } else if (gameState === STATES.MENU) {
        // Rotating camera panorama in Main Menu
        const time = Date.now() * 0.00012;
        const radius = 36;
        const centerX = 8;
        const centerZ = 8;
        
        camera.position.x = centerX + Math.cos(time) * radius;
        camera.position.z = centerZ + Math.sin(time) * radius;
        camera.position.y = 18 + Math.sin(time * 2) * 3;
        
        camera.lookAt(centerX, 10, centerZ);

        world.updateChunksAroundPlayer(centerX, centerZ);
    } else if (gameState === STATES.INVENTORY) {
        // Keep torch lights flickering even when paused in inventory screen
        world.updateTorchLights(player.position.x, player.position.z);
    }

    renderer.render(scene, camera);
}

/**
 * Set up Title/Pause/Inventory Menu UI clicks and Pointer Lock changes
 */
function setupUIEvents() {
    // 1. Pointer Lock state changes
    document.addEventListener('pointerlockchange', () => {
        if (document.pointerLockElement === document.body) {
            // Pointer locked -> Play state
            gameState = STATES.PLAYING;
            mainMenu.classList.add('hidden');
            pauseMenu.classList.add('hidden');
            inventoryOverlay.classList.add('hidden');
            resumePrompt.classList.add('hidden');
            controlsModal.classList.add('hidden');
        } else {
            // Pointer unlocked -> Pause state (unless we are opening inventory or quit to title)
            if (gameState === STATES.PLAYING) {
                gameState = STATES.PAUSED;
                pauseMenu.classList.remove('hidden');
                resumePrompt.classList.remove('hidden');
            }
        }
    });

    // 2. Play Game Button
    btnPlay.addEventListener('click', () => {
        document.body.requestPointerLock();
    });

    // 3. Controls Modal toggle
    btnControls.addEventListener('click', () => {
        controlsModal.classList.remove('hidden');
    });

    btnControlsBack.addEventListener('click', () => {
        controlsModal.classList.add('hidden');
    });

    // 4. Resume Game Button
    btnResume.addEventListener('click', () => {
        document.body.requestPointerLock();
    });

    // 5. Reset World Button
    btnReset.addEventListener('click', () => {
        world.clearWorld();
        mobManager.clearMobs();
        
        // Reset inventory to default
        inventory.slots.fill(null);
        inventory.initStarterInventory();
        inventory.render();

        // Respawn player
        player.position.set(8, 24, 8);
        player.velocity.set(0, 0, 0);
        player.onGround = false;
        player.resetMining();
        
        world.updateChunksAroundPlayer(player.position.x, player.position.z);
        document.body.requestPointerLock();
    });

    // 6. Quit to Title
    btnMenu.addEventListener('click', () => {
        gameState = STATES.MENU;
        mainMenu.classList.remove('hidden');
        pauseMenu.classList.add('hidden');
        inventoryOverlay.classList.add('hidden');
        resumePrompt.classList.add('hidden');
        mobManager.clearMobs();
    });

    // 7. Window Resizing
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // 8. Hotbar Click Selection
    hotbarSlots.forEach((slot, index) => {
        slot.addEventListener('click', () => {
            if (gameState === STATES.PLAYING) {
                selectHotbarSlot(index);
            }
        });
    });
}

/**
 * Handle in-game clicks (mine, place) and hotkey selections
 */
function setupInteractionEvents() {
    window.addEventListener('contextmenu', (e) => {
        e.preventDefault();
    });

    // Left click (Mine START) and Right click (Place)
    window.addEventListener('mousedown', (e) => {
        if (gameState !== STATES.PLAYING) return;

        if (e.button === 0) {
            // Left Click -> Start holding mining button
            player.isMining = true;
        } else if (e.button === 2) {
            // Right Click -> Place block
            if (player.targetedBlock) {
                const hitBlock = player.targetedBlock.pos;
                const hitNormal = player.targetedBlock.normal;

                // Check active block in inventory
                const activeItem = inventory.getActiveHotbarItem(activeSlotIndex);
                if (!activeItem || activeItem.count <= 0) return;

                // Safety: Only placeable blocks allowed (not tools or raw sticks/coal)
                const isBlock = typeof activeItem.id === 'number';
                if (!isBlock) return;

                const placePos = hitBlock.clone().add(hitNormal);

                // Collision Check: Prevent placing blocks inside player
                const playerMinX = player.position.x - player.width / 2;
                const playerMaxX = player.position.x + player.width / 2;
                const playerMinY = player.position.y;
                const playerMaxY = player.position.y + player.height;
                const playerMinZ = player.position.z - player.width / 2;
                const playerMaxZ = player.position.z + player.width / 2;

                const blockMinX = placePos.x;
                const blockMaxX = placePos.x + 1;
                const blockMinY = placePos.y;
                const blockMaxY = placePos.y + 1;
                const blockMinZ = placePos.z;
                const blockMaxZ = placePos.z + 1;

                const intersectsPlayer = (
                    playerMaxX > blockMinX && playerMinX < blockMaxX &&
                    playerMaxY > blockMinY && playerMinY < blockMaxY &&
                    playerMaxZ > blockMinZ && playerMinZ < blockMaxZ
                );

                // Torches do not block players, but other blocks do
                const blockId = activeItem.id;
                const blocksPlayer = blockId !== 10; // Torches are ID 10

                if (!intersectsPlayer || !blocksPlayer) {
                    // Place the block
                    world.setBlock(placePos.x, placePos.y, placePos.z, blockId);
                    
                    // Consume 1 item from inventory
                    inventory.consumeActiveItem(activeSlotIndex);
                }
            }
        }
    });

    // Left click release (Mine STOP)
    window.addEventListener('mouseup', (e) => {
        if (e.button === 0) {
            player.isMining = false;
            player.resetMining();
        }
    });

    // If focus is lost or cursor leaves window, stop mining
    window.addEventListener('blur', () => {
        player.isMining = false;
        player.resetMining();
    });

    // 2. Hotbar keys (1-9)
    window.addEventListener('keydown', (e) => {
        if (gameState === STATES.PLAYING) {
            if (e.key >= '1' && e.key <= '9') {
                const index = parseInt(e.key) - 1;
                selectHotbarSlot(index);
            }
        }

        // Toggle Inventory Overlay screen (Key E)
        if (e.code === 'KeyE') {
            if (gameState === STATES.PLAYING) {
                // Open inventory screen
                gameState = STATES.INVENTORY;
                player.isMining = false;
                player.resetMining();
                
                document.exitPointerLock();
                inventoryOverlay.classList.remove('hidden');
                
                // Render updated quantities
                inventory.render();
            } else if (gameState === STATES.INVENTORY) {
                // Close inventory screen
                inventoryOverlay.classList.add('hidden');
                // Return to game pointer lock
                document.body.requestPointerLock();
            }
        }
    });

    // 3. Scroll wheel to switch slots
    window.addEventListener('wheel', (e) => {
        if (gameState !== STATES.PLAYING) return;

        if (e.deltaY > 0) {
            selectHotbarSlot((activeSlotIndex + 1) % 9);
        } else if (e.deltaY < 0) {
            selectHotbarSlot((activeSlotIndex - 1 + 9) % 9);
        }
    });
}

/**
 * Selection index helper for active hotbar slot
 */
function selectHotbarSlot(index) {
    if (index < 0 || index >= 9) return;
    
    hotbarSlots[activeSlotIndex].classList.remove('active');
    
    // De-activate inventory grid slot mirrors too
    const oldInvSlot = document.querySelector(`.inv-slot[data-slot-index="${activeSlotIndex}"]`);
    if (oldInvSlot) oldInvSlot.classList.remove('active');

    activeSlotIndex = index;
    hotbarSlots[activeSlotIndex].classList.add('active');

    const newInvSlot = document.querySelector(`.inv-slot[data-slot-index="${activeSlotIndex}"]`);
    if (newInvSlot) newInvSlot.classList.add('active');
}

// Launch application on load
window.addEventListener('DOMContentLoaded', init);
