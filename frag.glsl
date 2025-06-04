#version 300 es
precision highp float;

uniform sampler2D uSampler;
uniform float uGamma;
uniform float uTime;
uniform float uDepth; // Max depth from JS slider, used for normalizing vDisplacementZ
uniform vec3 uCameraPosition; // Pass (0,0,0) from JS for default P5.js camera
uniform float uTemporalStrength; // New uniform for controlling temporal effect intensity

in vec2 vTexCoord;
in float vProjectedY;
in vec3 vPosition;       // Displaced position in View Space (interpolated)
in vec3 vNormal;         // Normal of the displaced surface in View Space (interpolated)
in float vDisplacementZ; // The actual Z-offset applied (interpolated)

out vec4 fragColor;

vec3 applyGammaCorrection(vec3 color, float gamma) {
    return pow(color, vec3(1.0 / gamma));
}

void main() {
    vec4 sampledColor = texture(uSampler, vTexCoord);
    vec3 gammaCorrectedColor = applyGammaCorrection(sampledColor.rgb, uGamma);

    // --- Fresnel Effect (Simulated Rim Lighting) ---
    // N: Normalized interpolated normal from vertex shader
    vec3 N = normalize(vNormal); // This will be mostly (0,0,1) transformed, so expects a flat surface
    // V: View direction from fragment to camera (normalized)
    vec3 V = normalize(uCameraPosition - vPosition);

    float fresnel = dot(N, V);
    fresnel = 1.0 - fresnel; // Invert so 1.0 is glancing angle (rim)
    fresnel = pow(fresnel, 3.0); // Power to control falloff (adjust 3.0 for subtle/sharpness)

    vec3 fresnelColor = vec3(0.8, 0.9, 1.0); // Light blue/white rim light
    float fresnelIntensity = 0.2; // How strong is the rim light? (0.0 to 1.0)

    gammaCorrectedColor += fresnelColor * fresnel * fresnelIntensity;


    // --- Color shift based on Z depth ---
    // CORRECTED NORMALIZATION:
    // Your zDisplacement range is [-0.5 * uDepth * 10.0, 0.5 * uDepth * 10.0]
    // which simplifies to [-5.0 * uDepth, 5.0 * uDepth].
    // So, the total range width is 10.0 * uDepth.
    float maxAbsZDisplacement = uDepth * 5.0; // Max absolute value of zDisplacement

    float normalizedZ = (vDisplacementZ + maxAbsZDisplacement) / (2.0 * maxAbsZDisplacement);
    normalizedZ = clamp(normalizedZ, 0.0, 1.0); // Ensure it's 0-1

    vec3 deepColor = vec3(0.05, 0.0, 0.15); // Dark blue/purple for "deep" areas
    vec3 shallowColor = vec3(0.3, 0.2, 0.0); // Orange/yellow for "shallow" areas

    vec3 depthTint = mix(deepColor, shallowColor, normalizedZ); // Interpolate between colors

    float depthBlendFactor = 0.3; // How much of the depth tint to apply (0.0 to 1.0)
    gammaCorrectedColor = mix(gammaCorrectedColor, depthTint, depthBlendFactor);

    // --- Temporal Effect ---
    // Use sine wave based on time for a pulsating effect
    float timePulse = sin(uTime * 2.0); // Adjust 2.0 for speed of pulse
    timePulse = timePulse * 0.5 + 0.5; // Remap from [-1, 1] to [0, 1]

    // Create a slight color shift or brightness variation based on time
    vec3 temporalShiftColor = vec3(0.1, 0.05, 0.0); // A subtle warm shift
    vec3 temporalEffect = temporalShiftColor * timePulse;

    // Blend the temporal effect with the current color
    gammaCorrectedColor = mix(gammaCorrectedColor, gammaCorrectedColor + temporalEffect, uTemporalStrength);


    // Final clamping to ensure colors are valid
    gammaCorrectedColor = clamp(gammaCorrectedColor, 0.0, 1.0);

    fragColor = vec4(gammaCorrectedColor, sampledColor.a);
}
