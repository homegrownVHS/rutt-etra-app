#version 300 es
precision mediump float;

uniform sampler2D uInputTexture; // The texture output from the horizontal blur pass
uniform float uBlurRadius;       // Your slider value
uniform vec2 uResolution;        // Resolution of the texture

in vec2 vTexCoord;

out vec4 fragColor;

const float GAUSSIAN_SIGMA_FACTOR = 0.3; // Relates blur radius to Gaussian sigma
const int MAX_SAMPLES = 10;              // Must match MAX_SAMPLES in horizontal_blur.frag

void main() {
    vec4 sum = vec4(0.0);
    vec2 texelSize = 1.0 / uResolution;

    float sigma = max(0.001, uBlurRadius * GAUSSIAN_SIGMA_FACTOR);

    // Pre-calculate Gaussian weights and total weight (same as horizontal)
    float weights[MAX_SAMPLES + 1];
    float totalWeight = 0.0;
    for (int i = 0; i <= MAX_SAMPLES; i++) {
        float offset = float(i);
        weights[i] = exp(-0.5 * offset * offset / (sigma * sigma));
        totalWeight += (i == 0) ? weights[i] : (2.0 * weights[i]);
    }

    // Normalize weights
    for (int i = 0; i <= MAX_SAMPLES; i++) {
        weights[i] /= totalWeight;
    }

    // Sample the center pixel
    vec4 centerColor = texture(uInputTexture, vTexCoord); // This is already horizontally blurred luminance
    sum += centerColor * weights[0]; // No need to re-convert to luminance, as input is already luminance

    // Sample vertically
    for (int i = 1; i <= MAX_SAMPLES; i++) {
        // Calculate the offset in UV space, scaled by blurRadius and texelSize
        vec2 offset = vec2(0.0, float(i) * texelSize.y * uBlurRadius); // Only Y offset
        sum += texture(uInputTexture, vTexCoord + offset) * weights[i];
        sum += texture(uInputTexture, vTexCoord - offset) * weights[i];
    }

    fragColor = sum;
}