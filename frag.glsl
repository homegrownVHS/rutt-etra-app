#version 300 es
precision highp float;

uniform sampler2D uSampler;
uniform float uStepSize; // No longer directly used for striping, but kept for consistency
uniform vec2 uResolution; // Keeping for consistency
uniform float uGamma; // Gamma value from sketch.js

in vec2 vTexCoord; // Original texture coordinates
in float vProjectedY; // Projected Y-coordinate from vertex shader (screen space pixels)

out vec4 fragColor;

// Function to apply gamma correction
vec3 applyGammaCorrection(vec3 color, float gamma) {
    return pow(color, vec3(1.0 / gamma));
}

void main() {
    // Sample the texture color using the original texture coordinates
    vec4 sampledColor = texture(uSampler, vTexCoord);

    // Apply gamma correction to the sampled color
    vec3 gammaCorrectedColor = applyGammaCorrection(sampledColor.rgb, uGamma);

    // Directly output the gamma-corrected color.
    // The 3D displacement is handled by the vertex shader deforming the geometry.
    // This removes the horizontal striping (scanline effect).
    fragColor = vec4(gammaCorrectedColor, sampledColor.a);
}
