/**
 * main.js - Core application entry point.
 * Coordinates Three.js setup, WebGL shadow maps, day/night cycles, combat loops,
 * and handles HUD rendering and mobile virtual controllers.
 */

const STATES = {
    MENU: 'menu',
    PLAYING: 'playing',
    PAUSED: 'paused',
    INVENTORY: 'inventory'
};
let gameState = STATES.MENU;

let scene, camera, renderer;
let textureManager, world, player, inventory, mobManager;
let clock;

// Day/Night Cycle Duration (in seconds)
const dayDuration = 180; 
let dayTime = 40; // Start at late morning/noon
let sunLight, ambientLight;

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

// Mobile swipe-looking state variables
let touchStartPos = null;

/**
 * Main Initialization
 */
function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x7ec0ee);
    scene.fog = new THREE.FogExp2(0x7ec0ee, 0.015);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

    renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    
    // Enable WebGL Shadow Map rendering
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Beautiful soft shadows
    
    document.getElementById('canvas-container').appendChild(renderer.domElement);

    // Dynamic light cycle binds
    ambientLight = new THREE.AmbientLight(0xffffff, 0.45);
    scene.add(ambientLight);

    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.15);
    scene.add(hemiLight);

    // Sun directional shadow light
    sunLight = new THREE.DirectionalLight(0xffffff, 0.6);
    sunLight.position.set(20, 60, 10);
    
    // Configure shadows
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 1024;
    sunLight.shadow.mapSize.height = 1024;
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 150;
    
    const d = 35; // Shadow frustum coverage bounds
    sunLight.shadow.camera.left = -d;
    sunLight.shadow.camera.right = d;
    sunLight.shadow.camera.top = d;
    sunLight.shadow.camera.bottom = -d;
    sunLight.shadow.bias = -0.0006; // Solves shadow acne artifacts
    
    scene.add(sunLight);
    scene.add(sunLight.target); // Required in Three.js for target tracking

    // Initialize systems
    textureManager = new TextureManager();
    inventory = new Inventory(textureManager);
    window.gameInventory = inventory; 

    world = new World(scene, textureManager);
    player = new Player(camera, world, inventory);
    mobManager = new MobManager(scene, world);

    // Initialize Audio Engine globally
    window.gameAudio = new AudioManager();

    clock = new THREE.Clock();

    setupUIEvents();
    setupInteractionEvents();
    setupMobileControls();

    animate();
}

/**
 * Game Loop
 */
function animate() {
    requestAnimationFrame(animate);

    const dt = clock.getDelta();

    if (gameState === STATES.PLAYING) {
        // Ticks cycle time
        dayTime += dt;
        const timePercent = (dayTime % dayDuration) / dayDuration;
        
        // Update day/night lighting colors
        world.updateDayNightCycle(timePercent, sunLight, ambientLight);

        // Update player physics, collisions, mining
        player.update(dt, activeSlotIndex);

        // 24-hour cycle: Dawn (0.0), Noon (0.25), Dusk (0.5), Midnight (0.75)
        const angle = (timePercent * Math.PI * 2) - Math.PI / 2;
        const cosAngle = Math.cos(angle);
        const sinAngle = Math.sin(angle);
        
        if (cosAngle >= 0) {
            // Day Phase: Sun rises in East (sinAngle = -1), sets in West (sinAngle = 1)
            sunLight.color.setHex(0xffffff);
            sunLight.position.set(
                player.position.x + sinAngle * 45,
                player.position.y + cosAngle * 45,
                player.position.z + 12
            );
            sunLight.castShadow = true;
        } else {
            // Night Phase: Moon rises in East, Y stays positive
            const moonCos = -cosAngle;
            const moonSin = -sinAngle;
            sunLight.color.setHex(0xaaccff); // Silver moon glow
            sunLight.position.set(
                player.position.x + moonSin * 45,
                player.position.y + moonCos * 45,
                player.position.z + 12
            );
            sunLight.castShadow = true; // Enables moon shadows at night
        }
        sunLight.target.position.copy(player.position);

        // Dynamic chunk updates
        world.updateChunksAroundPlayer(player.position.x, player.position.z, sunLight.intensity);

        // Update animal and Zombie/Creeper AI
        mobManager.update(dt, player, timePercent);

        // Check if player died this frame
        if (player.isDead) {
            triggerDeathScreen();
        }

        // Render HUD metrics
        updateHUD();
    } else if (gameState === STATES.MENU) {
        const time = Date.now() * 0.00012;
        const radius = 36;
        const centerX = 8;
        const centerZ = 8;
        
        camera.position.x = centerX + Math.cos(time) * radius;
        camera.position.z = centerZ + Math.sin(time) * radius;
        camera.position.y = 18 + Math.sin(time * 2) * 3;
        
        camera.lookAt(centerX, 10, centerZ);

        world.updateChunksAroundPlayer(centerX, centerZ);
        world.updateDayNightCycle(0.2, sunLight, ambientLight); 
    } else if (gameState === STATES.INVENTORY) {
        // Flickers placed torches even in inventory screen
        world.updateTorchLights(player.position.x, player.position.z);
    }

    renderer.render(scene, camera);
}

/**
 * Renders Heart, Drumstick, and Bubble SVGs onto HUD dynamically
 */
function updateHUD() {
    const healthBar = document.getElementById('health-bar');
    const hungerBar = document.getElementById('hunger-bar');
    const oxygenBar = document.getElementById('oxygen-bar');

    // 1. Health (10 Hearts, each heart = 10 HP)
    let healthHTML = '';
    const hp = player.health;
    for (let i = 0; i < 10; i++) {
        const threshold = i * 10;
        if (hp >= threshold + 10) {
            healthHTML += `<svg class="hud-icon" viewBox="0 0 9 9" fill="none"><path d="M2 1h1v1h1v1h1V2h1V1h1v1h1v3H7v1H6v1H5v1H4V7H3V6H2V5H1V2h1V1z" fill="#ff2222"/><path d="M2 2h1v1H2V2z" fill="#ffaaaa"/><rect x="0" y="0" width="9" height="9" stroke="#000" stroke-width="0.5" fill="none"/></svg>`;
        } else if (hp >= threshold + 5) {
            healthHTML += `<svg class="hud-icon" viewBox="0 0 9 9" fill="none"><path d="M2 1h1v1h1v1h1V2h1V1h1v1h1v3H7v1H6v1H5v1H4V7H3V6H2V5H1V2h1V1z" fill="#444444"/><path d="M2 1h1v1h1v5H4V7H3V6H2V5H1V2h1V1z" fill="#ff2222"/><path d="M2 2h1v1H2V2z" fill="#ffaaaa"/><rect x="0" y="0" width="9" height="9" stroke="#000" stroke-width="0.5" fill="none"/></svg>`;
        } else {
            healthHTML += `<svg class="hud-icon" viewBox="0 0 9 9" fill="none"><path d="M2 1h1v1h1v1h1V2h1V1h1v1h1v3H7v1H6v1H5v1H4V7H3V6H2V5H1V2h1V1z" fill="#444444"/><rect x="0" y="0" width="9" height="9" stroke="#000" stroke-width="0.5" fill="none"/></svg>`;
        }
    }
    healthBar.innerHTML = healthHTML;

    // 2. Hunger (10 Drumsticks, each drumstick = 10 Hunger)
    let hungerHTML = '';
    const hg = player.hunger;
    for (let i = 0; i < 10; i++) {
        const threshold = i * 10;
        if (hg >= threshold + 10) {
            hungerHTML += `<svg class="hud-icon" viewBox="0 0 9 9" fill="none"><path d="M2 2h4v3H5v1H4v1H3v1H2V7h1V6h1V5H2V2z" fill="#bd7633"/><path d="M4 2h2v1H4V2z" fill="#e2ad71"/><circle cx="7" cy="1" r="1" fill="#eeeeee"/><circle cx="8" cy="2" r="1" fill="#eeeeee"/><rect x="0" y="0" width="9" height="9" stroke="#000" stroke-width="0.5" fill="none"/></svg>`;
        } else if (hg >= threshold + 5) {
            hungerHTML += `<svg class="hud-icon" viewBox="0 0 9 9" fill="none"><path d="M2 2h4v3H5v1H4v1H3v1H2V7h1V6h1V5H2V2z" fill="#444444"/><path d="M2 2h2v3H3v1H2V2z" fill="#bd7633"/><rect x="0" y="0" width="9" height="9" stroke="#000" stroke-width="0.5" fill="none"/></svg>`;
        } else {
            hungerHTML += `<svg class="hud-icon" viewBox="0 0 9 9" fill="none"><path d="M2 2h4v3H5v1H4v1H3v1H2V7h1V6h1V5H2V2z" fill="#444444"/><rect x="0" y="0" width="9" height="9" stroke="#000" stroke-width="0.5" fill="none"/></svg>`;
        }
    }
    hungerBar.innerHTML = hungerHTML;

    // 3. Oxygen (10 bubbles)
    if (player.inWater || player.oxygen < 100) {
        oxygenBar.classList.remove('hidden');
        let oxygenHTML = '';
        const ox = player.oxygen;
        for (let i = 0; i < 10; i++) {
            const threshold = i * 10;
            if (ox >= threshold + 10) {
                oxygenHTML += `<svg class="hud-icon" viewBox="0 0 9 9" fill="none"><circle cx="4.5" cy="4.5" r="3.5" fill="#3399ff"/><circle cx="3.5" cy="3.5" r="1" fill="#ffffff"/><rect x="0" y="0" width="9" height="9" stroke="#000" stroke-width="0.5" fill="none"/></svg>`;
            } else {
                oxygenHTML += `<svg class="hud-icon" viewBox="0 0 9 9" fill="none"><circle cx="4.5" cy="4.5" r="3.5" fill="none" stroke="#3399ff" stroke-width="1"/><rect x="0" y="0" width="9" height="9" stroke="#000" stroke-width="0.5" fill="none"/></svg>`;
            }
        }
        oxygenBar.innerHTML = oxygenHTML;
    } else {
        oxygenBar.classList.add('hidden');
    }
}

/**
 * Modify pause modal elements to present "You Died!" instead of standard Paused overlay
 */
function triggerDeathScreen() {
    gameState = STATES.PAUSED;
    
    const heading = pauseMenu.querySelector('.menu-heading');
    if (heading) {
        heading.innerText = 'You Died!';
        heading.style.color = '#ff3333';
        heading.style.textShadow = '3px 3px 0 #000';
    }

    btnResume.style.display = 'none';
    btnReset.innerText = 'Respawn';
    pauseMenu.classList.remove('hidden');
}

/**
 * Restore standard pauses when player resets/respawns
 */
function resetPauseUIState() {
    const heading = pauseMenu.querySelector('.menu-heading');
    if (heading) {
        heading.innerText = 'Game Paused';
        heading.style.color = '#ffffff';
        heading.style.textShadow = '3px 3px 0 #3f3f3f';
    }
    btnResume.style.display = 'block';
    btnReset.innerText = 'Reset World';
}

function setupUIEvents() {
    // 1. Pointer Lock changes
    document.addEventListener('pointerlockchange', () => {
        if (document.pointerLockElement === document.body) {
            gameState = STATES.PLAYING;
            mainMenu.classList.add('hidden');
            pauseMenu.classList.add('hidden');
            inventoryOverlay.classList.add('hidden');
            resumePrompt.classList.add('hidden');
            controlsModal.classList.add('hidden');
        } else {
            if (gameState === STATES.PLAYING) {
                const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
                if (!isTouchDevice) {
                    gameState = STATES.PAUSED;
                    pauseMenu.classList.remove('hidden');
                    resumePrompt.classList.remove('hidden');
                }
            }
        }
    });

    // 2. Play Button
    btnPlay.addEventListener('click', () => {
        resumeAudio();
        const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
        if (isTouchDevice) {
            gameState = STATES.PLAYING;
            mainMenu.classList.add('hidden');
        } else {
            document.body.requestPointerLock();
        }
    });

    // 3. Controls Modal
    btnControls.addEventListener('click', () => {
        controlsModal.classList.remove('hidden');
    });

    btnControlsBack.addEventListener('click', () => {
        controlsModal.classList.add('hidden');
    });

    // 4. Resume Button
    btnResume.addEventListener('click', () => {
        document.body.requestPointerLock();
    });

    // 5. Reset / Respawn Button
    btnReset.addEventListener('click', () => {
        resetPauseUIState();

        world.clearWorld();
        mobManager.clearMobs();
        
        // Reset inventory
        inventory.slots.fill(null);
        inventory.initStarterInventory();
        inventory.render();

        // Reset player properties
        player.position.set(8, 24, 8);
        player.velocity.set(0, 0, 0);
        player.onGround = false;
        player.health = 100;
        player.hunger = 100;
        player.oxygen = 100;
        player.isDead = false;
        player.resetMining();

        dayTime = 40; 
        
        world.updateChunksAroundPlayer(player.position.x, player.position.z);
        
        const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
        if (isTouchDevice) {
            gameState = STATES.PLAYING;
            pauseMenu.classList.add('hidden');
        } else {
            document.body.requestPointerLock();
        }
    });

    // 6. Quit to Title
    btnMenu.addEventListener('click', () => {
        resetPauseUIState();
        gameState = STATES.MENU;
        mainMenu.classList.remove('hidden');
        pauseMenu.classList.add('hidden');
        inventoryOverlay.classList.add('hidden');
        resumePrompt.classList.add('hidden');
        mobManager.clearMobs();
    });

    // 7. Hotbar click select
    hotbarSlots.forEach((slot, index) => {
        slot.addEventListener('click', () => {
            if (gameState === STATES.PLAYING || gameState === STATES.INVENTORY) {
                selectHotbarSlot(index);
            }
        });
    });
}

function resumeAudio() {
    if (window.gameAudio) {
        window.gameAudio.init();
        if (window.gameAudio.ctx && window.gameAudio.ctx.state === 'suspended') {
            window.gameAudio.ctx.resume();
        }
    }
}

/**
 * Consolidated handler for placing blocks or eating food
 */
function handlePlaceAction() {
    if (gameState !== STATES.PLAYING || player.isDead) return;

    const activeItem = inventory.getActiveHotbarItem(activeSlotIndex);
    
    // 1. Food Check
    if (activeItem && activeItem.id === 'porkchop') {
        const ate = player.eatFood(activeItem.id);
        if (ate) {
            inventory.consumeActiveItem(activeSlotIndex);
            return;
        }
    }

    // 2. Block Placement
    if (player.targetedBlock) {
        const hitBlock = player.targetedBlock.pos;
        const hitNormal = player.targetedBlock.normal;

        if (!activeItem || activeItem.count <= 0) return;

        const isBlock = typeof activeItem.id === 'number';
        if (!isBlock) return;

        const placePos = hitBlock.clone().add(hitNormal);

        // Player Collision AABB checks
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

        const blockId = activeItem.id;
        const blocksPlayer = blockId !== 10; 

        if (!intersectsPlayer || !blocksPlayer) {
            world.setBlock(placePos.x, placePos.y, placePos.z, blockId);
            inventory.consumeActiveItem(activeSlotIndex);
            
            if (window.gameAudio) window.gameAudio.playPlace();
        }
    }
}

function setupInteractionEvents() {
    window.addEventListener('contextmenu', (e) => {
        e.preventDefault();
    });

    // Left click
    window.addEventListener('mousedown', (e) => {
        if (gameState !== STATES.PLAYING || player.isDead) return;
        resumeAudio();

        if (e.button === 0) {
            const hitMob = player.swingWeapon(mobManager.mobs, activeSlotIndex);
            if (hitMob) {
                player.isMining = false;
            } else {
                player.isMining = true;
            }
        } else if (e.button === 2) {
            handlePlaceAction();
        }
    });

    window.addEventListener('mouseup', (e) => {
        if (e.button === 0) {
            player.isMining = false;
            player.resetMining();
        }
    });

    window.addEventListener('blur', () => {
        player.isMining = false;
        player.resetMining();
    });

    window.addEventListener('keydown', (e) => {
        if (player.isDead) return;
        resumeAudio();

        if (gameState === STATES.PLAYING) {
            if (e.key >= '1' && e.key <= '9') {
                const index = parseInt(e.key) - 1;
                selectHotbarSlot(index);
            }
        }

        if (e.code === 'KeyE') {
            toggleInventoryUI();
        }
    });

    window.addEventListener('wheel', (e) => {
        if (gameState !== STATES.PLAYING || player.isDead) return;

        if (e.deltaY > 0) {
            selectHotbarSlot((activeSlotIndex + 1) % 9);
        } else if (e.deltaY < 0) {
            selectHotbarSlot((activeSlotIndex - 1 + 9) % 9);
        }
    });
}

function toggleInventoryUI() {
    if (gameState === STATES.PLAYING) {
        gameState = STATES.INVENTORY;
        player.isMining = false;
        player.resetMining();
        
        document.exitPointerLock();
        inventoryOverlay.classList.remove('hidden');
        inventory.render();
    } else if (gameState === STATES.INVENTORY) {
        inventoryOverlay.classList.add('hidden');
        
        const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
        if (isTouchDevice) {
            gameState = STATES.PLAYING;
        } else {
            document.body.requestPointerLock();
        }
    }
}

/**
 * Mobile Touch Virtual Buttons & Swipe Drag Listener
 */
function setupMobileControls() {
    const bindDpad = (btnId, keyName) => {
        const btn = document.getElementById(btnId);
        if (!btn) return;
        
        btn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            resumeAudio();
            if (!player.isDead) player.keys[keyName] = true;
        }, { passive: false });

        btn.addEventListener('touchend', (e) => {
            e.preventDefault();
            player.keys[keyName] = false;
        }, { passive: false });

        btn.addEventListener('touchcancel', (e) => {
            e.preventDefault();
            player.keys[keyName] = false;
        }, { passive: false });
    };

    bindDpad('md-up', 'forward');
    bindDpad('md-down', 'backward');
    bindDpad('md-left', 'left');
    bindDpad('md-right', 'right');

    const btnJump = document.getElementById('ma-jump');
    if (btnJump) {
        btnJump.addEventListener('touchstart', (e) => {
            e.preventDefault();
            resumeAudio();
            if (!player.isDead) player.keys.jump = true;
        }, { passive: false });
        btnJump.addEventListener('touchend', (e) => {
            e.preventDefault();
            player.keys.jump = false;
        }, { passive: false });
    }

    const btnInv = document.getElementById('ma-inv');
    if (btnInv) {
        btnInv.addEventListener('touchstart', (e) => {
            e.preventDefault();
            resumeAudio();
            toggleInventoryUI();
        }, { passive: false });
    }

    const btnMine = document.getElementById('ma-mine');
    if (btnMine) {
        btnMine.addEventListener('touchstart', (e) => {
            e.preventDefault();
            resumeAudio();
            if (gameState === STATES.PLAYING && !player.isDead) {
                const hitMob = player.swingWeapon(mobManager.mobs, activeSlotIndex);
                if (hitMob) {
                    player.isMining = false;
                } else {
                    player.isMining = true;
                }
            }
        }, { passive: false });

        btnMine.addEventListener('touchend', (e) => {
            e.preventDefault();
            player.isMining = false;
            player.resetMining();
        }, { passive: false });
    }

    const btnPlace = document.getElementById('ma-place');
    if (btnPlace) {
        btnPlace.addEventListener('touchstart', (e) => {
            e.preventDefault();
            resumeAudio();
            handlePlaceAction();
        }, { passive: false });
    }

    // Swipe-to-Look Camera listener
    const canvasContainer = document.getElementById('canvas-container');
    
    canvasContainer.addEventListener('touchstart', (e) => {
        if (e.target.closest('#mobile-controls') || e.target.closest('#inventory-overlay') || e.target.closest('#hud')) {
            return;
        }
        
        resumeAudio();
        
        if (gameState === STATES.PLAYING && !player.isDead) {
            touchStartPos = {
                x: e.touches[0].clientX,
                y: e.touches[0].clientY
            };
        }
    }, { passive: true });

    canvasContainer.addEventListener('touchmove', (e) => {
        if (!touchStartPos || gameState !== STATES.PLAYING || player.isDead) return;

        const touch = e.touches[0];
        const dx = touch.clientX - touchStartPos.x;
        const dy = touch.clientY - touchStartPos.y;

        player.handleTouchLook(dx, dy);

        touchStartPos = {
            x: touch.clientX,
            y: touch.clientY
        };
    }, { passive: true });

    canvasContainer.addEventListener('touchend', () => {
        touchStartPos = null;
    }, { passive: true });
}

function selectHotbarSlot(index) {
    if (index < 0 || index >= 9) return;
    
    hotbarSlots[activeSlotIndex].classList.remove('active');
    
    const oldInvSlot = document.querySelector(`.inv-slot[data-slot-index="${activeSlotIndex}"]`);
    if (oldInvSlot) oldInvSlot.classList.remove('active');

    activeSlotIndex = index;
    hotbarSlots[activeSlotIndex].classList.add('active');

    const newInvSlot = document.querySelector(`.inv-slot[data-slot-index="${activeSlotIndex}"]`);
    if (newInvSlot) newInvSlot.classList.add('active');
}

window.addEventListener('DOMContentLoaded', init);
