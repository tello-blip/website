/**
 * Improved Noise / Perlin Noise class for procedural terrain generation
 */
class ImprovedNoise {
    constructor(seed = 42) {
        // Generate the permutation table
        const p = new Uint8Array(256);
        for (let i = 0; i < 256; i++) {
            p[i] = i;
        }

        // Custom LCG-based pseudo-random generator to ensure deterministic shuffle from a seed
        let currentSeed = seed;
        function random() {
            let x = Math.sin(currentSeed++) * 10000;
            return x - Math.floor(x);
        }

        // Fisher-Yates Shuffle
        for (let i = 255; i > 0; i--) {
            const j = Math.floor(random() * (i + 1));
            const tmp = p[i];
            p[i] = p[j];
            p[j] = tmp;
        }

        // Double the permutation table to avoid overflow bounds checks
        this.permutation = new Uint8Array(512);
        for (let i = 0; i < 256; i++) {
            this.permutation[i] = p[i];
            this.permutation[i + 256] = p[i];
        }
    }

    fade(t) {
        return t * t * t * (t * (t * 6 - 15) + 10);
    }

    lerp(t, a, b) {
        return a + t * (b - a);
    }

    grad(hash, x, y, z) {
        const h = hash & 15;
        const u = h < 8 ? x : y;
        const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
        return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
    }

    /**
     * Standard 3D Perlin Noise
     */
    noise(x, y, z = 0) {
        const X = Math.floor(x) & 255;
        const Y = Math.floor(y) & 255;
        const Z = Math.floor(z) & 255;

        x -= Math.floor(x);
        y -= Math.floor(y);
        z -= Math.floor(z);

        const u = this.fade(x);
        const v = this.fade(y);
        const w = this.fade(z);

        const A = this.permutation[X] + Y;
        const AA = this.permutation[A] + Z;
        const AB = this.permutation[A + 1] + Z;
        const B = this.permutation[X + 1] + Y;
        const BA = this.permutation[B] + Z;
        const BB = this.permutation[B + 1] + Z;

        return this.lerp(w, 
            this.lerp(v, 
                this.lerp(u, 
                    this.grad(this.permutation[AA], x, y, z),
                    this.grad(this.permutation[BA], x - 1, y, z)
                ),
                this.lerp(u, 
                    this.grad(this.permutation[AB], x, y - 1, z),
                    this.grad(this.permutation[BB], x - 1, y - 1, z)
                )
            ),
            this.lerp(v, 
                this.lerp(u, 
                    this.grad(this.permutation[AA + 1], x, y, z - 1),
                    this.grad(this.permutation[BA + 1], x - 1, y, z - 1)
                ),
                this.lerp(u, 
                    this.grad(this.permutation[AB + 1], x, y - 1, z - 1),
                    this.grad(this.permutation[BB + 1], x - 1, y - 1, z - 1)
                )
            )
        );
    }

    /**
     * Fractional Brownian Motion (FBM) - combines multiple octaves of noise 
     * to make complex, multi-layered terrain (mountains, valleys, roughness).
     */
    fbm2D(x, y, octaves = 4, persistence = 0.5, lacunarity = 2.0) {
        let total = 0;
        let frequency = 1.0;
        let amplitude = 1.0;
        let maxValue = 0;
        
        for (let i = 0; i < octaves; i++) {
            // Note: noise output is in range [-1, 1], so we map it or keep it centered
            total += this.noise(x * frequency, y * frequency, 0) * amplitude;
            maxValue += amplitude;
            amplitude *= persistence;
            frequency *= lacunarity;
        }
        
        return total / maxValue;
    }

    fbm3D(x, y, z, octaves = 3, persistence = 0.5, lacunarity = 2.0) {
        let total = 0;
        let frequency = 1.0;
        let amplitude = 1.0;
        let maxValue = 0;
        
        for (let i = 0; i < octaves; i++) {
            total += this.noise(x * frequency, y * frequency, z * frequency) * amplitude;
            maxValue += amplitude;
            amplitude *= persistence;
            frequency *= lacunarity;
        }
        
        return total / maxValue;
    }
}

// Make globally available
window.ImprovedNoise = ImprovedNoise;
