#version 300 es
precision mediump float;

uniform sampler2D uSampler; // Input texture (e.g., brightnessFBO)
uniform vec2 uResolution;   // Canvas resolution
uniform float uBlurRadius;  // Blur radius in pixels

in vec2 vTexCoord; // Input from vertex shader

out vec4 fragColor; // Output fragment color

const float GAUSSIAN_SIGMA_FACTOR = 0.3; // Relates blur radius to Gaussian sigma
const int MAX_SAMPLES = 10;              // Must match MAX_SAMPLES in vertical_blur.frag

void main() {
    vec4 sum = vec4(0.0);
    float texelSizeX = 1.0 / uResolution.x;
    
    // Gaussian blur weights (simplified for example, typically pre-calculated)
    // For a real Gaussian blur, you'd use a more accurate set of weights.
    // This is a basic approximation.
    float weights[5]; // Using 5 samples for simplicity, adjust MAX_SAMPLES if more are used
    weights[0] = 0.227027;
    weights[1] = 0.1945946;
    weights[2] = 0.1216216;
    weights[3] = 0.054054;
    weights[4] = 0.016216;

    // Center pixel
    sum += texture(uSampler, vTexCoord) * weights[0]; // FIXED: Changed texture2D to texture

    // Sample pixels horizontally
    for (int i = 1; i < 5; i++) {
        float offset = float(i) * texelSizeX * uBlurRadius; // Scale offset by blur radius
        sum += texture(uSampler, vTexCoord + vec2(offset, 0.0)) * weights[i]; // FIXED: Changed texture2D to texture
        sum += texture(uSampler, vTexCoord - vec2(offset, 0.0)) * weights[i]; // FIXED: Changed texture2D to texture
    }

    fragColor = sum;
}
