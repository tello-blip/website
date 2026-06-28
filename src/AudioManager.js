/**
 * AudioManager - Procedural audio synthesizer using the Web Audio API.
 * Synthesizes retro 8-bit sound effects entirely in the browser to run 100% offline.
 */
class AudioManager {
    constructor() {
        this.ctx = null;
        this.noiseBuffer = null;
    }

    /**
     * Lazy initialiser for the Web Audio Context (needs a user click gesture to trigger in modern browsers)
     */
    init() {
        if (this.ctx) return;
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) {
            this.ctx = new AudioContextClass();
        }
    }

    /**
     * Generates a 1-second buffer of white noise in memory
     */
    getNoiseBuffer() {
        if (!this.ctx) return null;
        if (this.noiseBuffer) return this.noiseBuffer;
        
        const bufferSize = this.ctx.sampleRate * 1.0; 
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        
        this.noiseBuffer = buffer;
        return buffer;
    }

    /**
     * Synthesises a footstep sound based on the material block ID
     */
    playStep(blockType) {
        this.init();
        if (!this.ctx || this.ctx.state === 'suspended') return;
        
        const now = this.ctx.currentTime;
        
        // Stone-like blocks: Stone (3), Coal (13), Cobble (15), Iron (16), Brick (9)
        const isStone = blockType === 3 || blockType === 13 || blockType === 15 || blockType === 16 || blockType === 9;
        const isSand = blockType === 6;
        const isWater = blockType === 7;
        const isWood = blockType === 4 || blockType === 14;

        if (isWater) {
            this.synthSplash();
            return;
        }

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        
        if (isStone) {
            // Muffled thud + small high click
            osc.frequency.setValueAtTime(140, now);
            osc.frequency.exponentialRampToValueAtTime(40, now + 0.08);
            gain.gain.setValueAtTime(0.08, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
            
            osc.start(now);
            osc.stop(now + 0.08);
        } else if (isWood) {
            // Deeper hollow thud
            osc.frequency.setValueAtTime(90, now);
            osc.frequency.exponentialRampToValueAtTime(30, now + 0.12);
            gain.gain.setValueAtTime(0.12, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
            
            osc.start(now);
            osc.stop(now + 0.12);
        } else {
            // Grass, Dirt, Sand, Snow: filtered white noise crunch
            const noise = this.ctx.createBufferSource();
            const buffer = this.getNoiseBuffer();
            if (!buffer) return;
            noise.buffer = buffer;
            
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'bandpass';
            
            const gainNoise = this.ctx.createGain();
            
            if (isSand) {
                filter.frequency.setValueAtTime(420, now);
                filter.Q.setValueAtTime(1.0, now);
                gainNoise.gain.setValueAtTime(0.06, now);
            } else { // Grass / Dirt / Snow
                filter.frequency.setValueAtTime(220, now);
                filter.Q.setValueAtTime(0.8, now);
                gainNoise.gain.setValueAtTime(0.08, now);
            }
            
            noise.connect(filter);
            filter.connect(gainNoise);
            gainNoise.connect(this.ctx.destination);
            
            gainNoise.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
            noise.start(now);
            noise.stop(now + 0.09);
        }
    }

    /**
     * Synthesises a mining hit (metallic ring on stone, thud on wood/dirt)
     */
    playMine(blockType) {
        this.init();
        if (!this.ctx || this.ctx.state === 'suspended') return;

        const isStone = blockType === 3 || blockType === 13 || blockType === 15 || blockType === 16 || blockType === 9;
        const now = this.ctx.currentTime;

        if (isStone) {
            // Metallic high pitch ring (tink)
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(1400, now);
            osc.frequency.exponentialRampToValueAtTime(900, now + 0.05);
            gain.gain.setValueAtTime(0.04, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
            
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(now);
            osc.stop(now + 0.05);
        } else {
            // Muffled wood/dirt hit
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(110, now);
            osc.frequency.exponentialRampToValueAtTime(40, now + 0.08);
            gain.gain.setValueAtTime(0.12, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
            
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(now);
            osc.stop(now + 0.08);
        }
    }

    /**
     * Block destruction sound effect (satisfying explosion of noise and thuds)
     */
    playBreak(blockType) {
        this.init();
        if (!this.ctx || this.ctx.state === 'suspended') return;
        
        const now = this.ctx.currentTime;
        const isStone = blockType === 3 || blockType === 13 || blockType === 15 || blockType === 16 || blockType === 9;

        // Base low impact boom
        const osc = this.ctx.createOscillator();
        const gainOsc = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(140, now);
        osc.frequency.exponentialRampToValueAtTime(30, now + 0.14);
        gainOsc.gain.setValueAtTime(0.16, now);
        gainOsc.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
        osc.connect(gainOsc);
        gainOsc.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.14);

        // Muffled high frequency noise crunch
        const noise = this.ctx.createBufferSource();
        const buffer = this.getNoiseBuffer();
        if (!buffer) return;
        noise.buffer = buffer;
        
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(isStone ? 280 : 160, now);
        filter.Q.setValueAtTime(1.2, now);
        
        const gainNoise = this.ctx.createGain();
        gainNoise.gain.setValueAtTime(0.15, now);
        gainNoise.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
        
        noise.connect(filter);
        filter.connect(gainNoise);
        gainNoise.connect(this.ctx.destination);
        noise.start(now);
        noise.stop(now + 0.18);
    }

    /**
     * Muffled sound for placing blocks
     */
    playPlace() {
        this.init();
        if (!this.ctx || this.ctx.state === 'suspended') return;

        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(95, now);
        osc.frequency.exponentialRampToValueAtTime(30, now + 0.1);
        gain.gain.setValueAtTime(0.14, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.1);
    }

    /**
     * Retro 8-bit hurt sound (pitch sweep grunt)
     */
    playHurt() {
        this.init();
        if (!this.ctx || this.ctx.state === 'suspended') return;

        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(140, now);
        osc.frequency.linearRampToValueAtTime(60, now + 0.2);
        gain.gain.setValueAtTime(0.22, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(350, now);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);
        
        osc.start(now);
        osc.stop(now + 0.22);
    }

    /**
     * Sword swing / impact sound
     */
    playHit() {
        this.init();
        if (!this.ctx || this.ctx.state === 'suspended') return;

        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(450, now);
        osc.frequency.exponentialRampToValueAtTime(140, now + 0.1);
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.1);
    }

    /**
     * Munching sound for eating porkchops
     */
    playEat() {
        this.init();
        if (!this.ctx || this.ctx.state === 'suspended') return;
        
        const now = this.ctx.currentTime;
        // 3 consecutive bites
        for (let i = 0; i < 3; i++) {
            const time = now + i * 0.15;
            
            const noise = this.ctx.createBufferSource();
            const buffer = this.getNoiseBuffer();
            if (!buffer) return;
            noise.buffer = buffer;
            
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.setValueAtTime(130, time);
            filter.Q.setValueAtTime(1.5, time);
            
            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(0.07, time);
            gain.gain.exponentialRampToValueAtTime(0.001, time + 0.08);
            
            noise.connect(filter);
            filter.connect(gain);
            gain.connect(this.ctx.destination);
            
            noise.start(time);
            noise.stop(time + 0.08);
        }
    }

    /**
     * Muffled splash when falling in water
     */
    synthSplash() {
        const now = this.ctx.currentTime;
        const noise = this.ctx.createBufferSource();
        const buffer = this.getNoiseBuffer();
        if (!buffer) return;
        noise.buffer = buffer;
        
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(280, now);
        filter.Q.setValueAtTime(2.5, now);
        
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.07, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
        
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);
        
        noise.start(now);
        noise.stop(now + 0.16);
    }

    /* ========================================================
       NEW ANIMAL & MONSTER PROCEDURAL VOCALS
       ======================================================== */

    /**
     * Synthesises a Pig Oink (brief low sawtooth grunt)
     */
    playOink() {
        this.init();
        if (!this.ctx || this.ctx.state === 'suspended') return;

        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(95, now);
        osc.frequency.linearRampToValueAtTime(65, now + 0.12);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(260, now);

        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 0.14);
    }

    /**
     * Synthesises a Sheep Baa (detuned fuzzy triangles with tremolo pitch sweep)
     */
    playBaa() {
        this.init();
        if (!this.ctx || this.ctx.state === 'suspended') return;

        const now = this.ctx.currentTime;
        const duration = 0.45;

        // Two detuned oscillators for authentic retro chorus grit
        const osc1 = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();
        const gainNode = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();

        osc1.type = 'triangle';
        osc1.frequency.setValueAtTime(210, now);
        osc1.frequency.linearRampToValueAtTime(170, now + duration);

        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(215, now);
        osc2.frequency.linearRampToValueAtTime(173, now + duration);

        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(320, now);
        filter.Q.setValueAtTime(1.0, now);

        // 14Hz LFO tremolo gain effect (the vibrating baa-aa-aa sound)
        const lfo = this.ctx.createOscillator();
        const lfoGain = this.ctx.createGain();
        lfo.frequency.value = 14;
        lfoGain.gain.value = 0.08;

        lfo.connect(lfoGain);
        lfoGain.connect(gainNode.gain);

        gainNode.gain.setValueAtTime(0.1, now);
        gainNode.gain.linearRampToValueAtTime(0.001, now + duration);

        osc1.connect(filter);
        osc2.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(this.ctx.destination);

        lfo.start(now);
        osc1.start(now);
        osc2.start(now);

        lfo.stop(now + duration);
        osc1.stop(now + duration);
        osc2.stop(now + duration);
    }

    /**
     * Synthesises a Zombie growl / groan
     */
    playZombieGrowl() {
        this.init();
        if (!this.ctx || this.ctx.state === 'suspended') return;

        const now = this.ctx.currentTime;
        const duration = 0.6;

        const osc = this.ctx.createOscillator();
        const noise = this.ctx.createBufferSource();
        const noiseFilter = this.ctx.createBiquadFilter();
        const gainNode = this.ctx.createGain();

        // Deep rumbling tone
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(70, now);
        osc.frequency.linearRampToValueAtTime(45, now + duration);

        // Low-pass filtered noise grit
        const buffer = this.getNoiseBuffer();
        if (buffer) {
            noise.buffer = buffer;
            noiseFilter.type = 'bandpass';
            noiseFilter.frequency.setValueAtTime(220, now);
            noiseFilter.Q.setValueAtTime(1.5, now);
            noise.connect(noiseFilter);
            noiseFilter.connect(gainNode);
        }

        gainNode.gain.setValueAtTime(0.14, now);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration);

        osc.connect(gainNode);
        gainNode.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + duration);
        if (buffer) {
            noise.start(now);
            noise.stop(now + duration);
        }
    }

    /**
     * Synthesises the Creeper fuse Hiss (rising white noise)
     */
    playHiss() {
        this.init();
        if (!this.ctx || this.ctx.state === 'suspended') return;

        const now = this.ctx.currentTime;
        const duration = 1.4;

        const noise = this.ctx.createBufferSource();
        const buffer = this.getNoiseBuffer();
        if (!buffer) return;
        noise.buffer = buffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.setValueAtTime(1000, now);

        const gainNode = this.ctx.createGain();
        gainNode.gain.setValueAtTime(0.01, now);
        // Exponentially rises to mimic swelling pressure
        gainNode.gain.linearRampToValueAtTime(0.18, now + duration);

        noise.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(this.ctx.destination);

        noise.start(now);
        noise.stop(now + duration);
        
        // Save references if we need to abort early!
        this.activeHiss = { source: noise, gain: gainNode, stopTime: now + duration };
    }

    /**
     * Stops active creeper hiss if players flee
     */
    stopHiss() {
        if (this.activeHiss) {
            try {
                this.activeHiss.source.stop();
            } catch(e) {}
            this.activeHiss = null;
        }
    }

    /**
     * Synthesises a massive terrain-breaking Explosion
     */
    playExplosion() {
        this.init();
        if (!this.ctx || this.ctx.state === 'suspended') return;

        const now = this.ctx.currentTime;
        const duration = 0.8;

        const osc = this.ctx.createOscillator();
        const noise = this.ctx.createBufferSource();
        const filter = this.ctx.createBiquadFilter();
        const gainNode = this.ctx.createGain();

        // 1. Bass blast wave
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(120, now);
        osc.frequency.exponentialRampToValueAtTime(15, now + 0.4);

        // 2. Heavy low pass noise rubble
        const buffer = this.getNoiseBuffer();
        if (buffer) {
            noise.buffer = buffer;
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(160, now);
            filter.frequency.exponentialRampToValueAtTime(30, now + duration);
            noise.connect(filter);
            filter.connect(gainNode);
        }

        gainNode.gain.setValueAtTime(0.55, now); // Extra loud!
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration);

        osc.connect(gainNode);
        gainNode.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + duration);
        if (buffer) {
            noise.start(now);
            noise.stop(now + duration);
        }
    }
}

// Make globally available
window.AudioManager = AudioManager;
