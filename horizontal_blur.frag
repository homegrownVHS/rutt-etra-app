#version 300 es
precision mediump float; // mediump is often sufficient for post-processing shaders

uniform sampler2D uInputTexture; // The texture rendered from the previous pass (your Rutt-Etra output)
uniform float uBlurRadius;       // Your slider value
uniform vec2 uResolution;        // Resolution of the texture (e.g., width, height of your canvas)

in vec2 vTexCoord;

out vec4 fragColor;

const float GAUSSIAN_SIGMA_FACTOR = 0.3; // Relates blur radius to Gaussian sigma
const int MAX_SAMPLES = 10;              // Max number of samples to take on each side (total 2*MAX_SAMPLES + 1)
                                         // Higher = slower, but better quality for large blurs.

void main() {
    vec4 sum = vec4(0.0);
    vec2 texelSize = 1.0 / uResolution;

    // Convert blur radius from slider to Gaussian sigma.
    // Ensure sigma is not too small to avoid issues with division by zero or extreme values in exp().
    float sigma = max(0.001, uBlurRadius * GAUSSIAN_SIGMA_FACTOR);

    // Pre-calculate Gaussian weights and total weight
    float weights[MAX_SAMPLES + 1];
    float totalWeight = 0.0;
    for (int i = 0; i <= MAX_SAMPLES; i++) {
        float offset = float(i);
        // Gaussian function: exp(-(x^2)/(2*sigma^2))
        weights[i] = exp(-0.5 * offset * offset / (sigma * sigma));
        totalWeight += (i == 0) ? weights[i] : (2.0 * weights[i]); // Center weight counted once, others twice
    }

    // Normalize weights so they sum to 1.0
    for (int i = 0; i <= MAX_SAMPLES; i++) {
        weights[i] /= totalWeight;
    }

    // Sample the center pixel
    sum += texture(uInputTexture, vTexCoord) * weights[0];

    // Sample horizontally
    for (int i = 1; i <= MAX_SAMPLES; i++) {
        // Calculate the offset in UV space, scaled by blurRadius and texelSize
        vec2 offset = vec2(float(i) * texelSize.x * uBlurRadius, 0.0);
        sum += texture(uInputTexture, vTexCoord + offset) * weights[i];
        sum += texture(uInputTexture, vTexCoord - offset) * weights[i];
    }

    fragColor = sum;
}