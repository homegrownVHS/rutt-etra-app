#version 300 es
precision mediump float;

uniform sampler2D uSampler; // Input texture (e.g., blurTempFBO)
uniform float uBlurRadius;       // Your slider value
uniform vec2 uResolution;        // Canvas resolution

in vec2 vTexCoord; // Input from vertex shader

out vec4 fragColor; // Output fragment color

const float GAUSSIAN_SIGMA_FACTOR = 0.3; // Relates blur radius to Gaussian sigma
const int MAX_SAMPLES = 10;              // Must match MAX_SAMPLES in horizontal_blur.frag

void main() {
    vec4 sum = vec4(0.0);
    float texelSizeY = 1.0 / uResolution.y;

    // Gaussian blur weights (simplified for example)
    float weights[5]; // Using 5 samples for simplicity, adjust MAX_SAMPLES if more are used
    weights[0] = 0.227027;
    weights[1] = 0.1945946;
    weights[2] = 0.1216216;
    weights[3] = 0.054054;
    weights[4] = 0.016216;

    // Center pixel
    vec4 centerColor = texture(uSampler, vTexCoord); // FIXED: Changed texture2D to texture
    sum += centerColor * weights[0]; // No need to re-convert to luminance, as input is already luminance

    // Sample vertically
    for (int i = 1; i < 5; i++) {
        // Calculate the offset in UV space, scaled by blurRadius and texelSize
        float offset = float(i) * texelSizeY * uBlurRadius; // Only Y offset
        sum += texture(uSampler, vTexCoord + vec2(0.0, offset)) * weights[i]; // FIXED: Changed texture2D to texture
        sum += texture(uSampler, vTexCoord - vec2(0.0, offset)) * weights[i]; // FIXED: Changed texture2D to texture
    }

    fragColor = sum;
}
