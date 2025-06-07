#version 300 es
precision highp float;

uniform sampler2D uSampler;
uniform float uGamma;
uniform float uTime;
uniform float uDepth; // Max depth from JS slider, used for normalizing vDisplacementZ
uniform vec3 uCameraPosition; // Pass (0,0,0) from JS for default P5.js camera

// New uniforms for enhanced edge detection
uniform float uEdgeThreshold; // Controls the sensitivity/thickness of the edge
uniform float uEdgeIntensity; // Controls the darkness of the edge
uniform float uNormalEdgeStrength; // Strength of normal-based edge detection
uniform float uDepthEdgeStrength; // Strength of depth-based edge detection

// New uniforms for temporal effects
uniform float uTemporalStrength; // Controls the intensity of the temporal smear
uniform float uTemporalDecay; // How quickly the smear fades (0.0 - 1.0, 1.0 being no decay)

in vec2 vTexCoord;
in float vProjectedY;
in vec3 vPosition;        // Displaced position in View Space (interpolated)
in vec3 vNormal;          // Normal of the displaced surface in View Space (interpolated)
in float vDisplacementZ; // The actual Z-offset applied (interpolated)

out vec4 fragColor;

vec3 applyGammaCorrection(vec3 color, float gamma) {
    return pow(color, vec3(1.0 / gamma));
}

float getLuminosity(vec3 color) {
    return dot(color, vec3(0.299, 0.587, 0.114));
}

void main() {
    vec4 sampledColor = texture(uSampler, vTexCoord);
    vec3 gammaCorrectedColor = applyGammaCorrection(sampledColor.rgb, uGamma);

    // --- Temporal Effects ---
    vec2 temporalOffset = normalize(vNormal.xy) * uTemporalStrength * sin(uTime * 0.1);
    vec4 temporalSample = texture(uSampler, vTexCoord + temporalOffset * 0.005);
    vec3 temporalColor = applyGammaCorrection(temporalSample.rgb, uGamma);
    gammaCorrectedColor = mix(gammaCorrectedColor, temporalColor, uTemporalStrength * (1.0 - uTemporalDecay));

    // --- Fresnel Effect ---
    vec3 N = normalize(vNormal);
    vec3 V = normalize(uCameraPosition - vPosition);

    float fresnel = dot(N, V);
    fresnel = 1.0 - fresnel;
    fresnel = pow(fresnel, 3.0);

    vec3 fresnelColor = vec3(0.8, 0.9, 1.0);
    float fresnelIntensity = 0.6;

    gammaCorrectedColor += fresnelColor * fresnel * fresnelIntensity;

    // --- Enhanced Edge Detection ---
    float normalEdge = 0.0;
    float depthEdge = 0.0;

    // Normal-based edge calculation
    float normalDotView = abs(dot(N, V));
    normalEdge = 1.0 - smoothstep(uEdgeThreshold, uEdgeThreshold + 0.1, normalDotView);

    // Depth-based edge calculation
    // We can *always* perform these calculations. When uDepth is 0, vDisplacementZ will be 0,
    // and the sampled depths will also be 0, so depthDifference will correctly be 0.
    vec2 texelSize = 1.0 / vec2(textureSize(uSampler, 0));
    float centerDepth = vDisplacementZ;

    float d1 = texture(uSampler, vTexCoord + texelSize * vec2(1.0, 0.0)).a * uDepth * 10.0 - 0.5 * uDepth * 10.0;
    float d2 = texture(uSampler, vTexCoord + texelSize * vec2(-1.0, 0.0)).a * uDepth * 10.0 - 0.5 * uDepth * 10.0;
    float d3 = texture(uSampler, vTexCoord + texelSize * vec2(0.0, 1.0)).a * uDepth * 10.0 - 0.5 * uDepth * 10.0;
    float d4 = texture(uSampler, vTexCoord + texelSize * vec2(0.0, -1.0)).a * uDepth * 10.0 - 0.5 * uDepth * 10.0;

    float depthDifference = abs(centerDepth - d1) + abs(centerDepth - d2) + abs(centerDepth - d3) + abs(centerDepth - d4);
    depthEdge = smoothstep(uEdgeThreshold * 0.1, uEdgeThreshold * 0.5, depthDifference);

    // Combine normal and depth edges
    float calculatedFinalEdge = max(normalEdge * uNormalEdgeStrength, depthEdge * uDepthEdgeStrength);

    // *** REVISED FIX FOR LFO CROSSING ZERO ***
    // We want a minimum edge effect when uDepth is very small.
    // Instead of `if` or `max` with a smoothstep, let's use `mix` to blend.

    float baseEdgeStrength = 0.15; // TUNE THIS: Minimum edge strength when uDepth is near zero.
                                  // Higher value = darker when flat.

    // This 'mix_factor' smoothly transitions from 1.0 (when abs(uDepth) is 0)
    // down to 0.0 (when abs(uDepth) reaches minNonZeroDepth).
    // TUNE `minNonZeroDepth`: The range over which the base edge fades out.
    // If flash persists, try increasing this (e.g., 0.01, 0.05).
    float minNonZeroDepth = 0.02; // How far from zero uDepth must be before baseEdgeStrength fully disappears.

    // Use smoothstep for a smoother transition.
    float mix_factor = 1.0 - smoothstep(0.0, minNonZeroDepth, abs(uDepth));

    // Blend the calculated final edge with the base edge strength.
    // When mix_factor is 1 (uDepth is 0), it's baseEdgeStrength.
    // When mix_factor is 0 (uDepth is > minNonZeroDepth), it's calculatedFinalEdge.
    float effectiveFinalEdge = mix(calculatedFinalEdge, baseEdgeStrength, mix_factor);


    // Apply edge effect by darkening the color
    gammaCorrectedColor *= (1.0 - effectiveFinalEdge * uEdgeIntensity);


    // --- Color shift based on Z depth ---
    // Ensure this doesn't cause a jump.
    float normalizedZ = 0.5; // Default to middle gray if no displacement
    // Use abs(uDepth) for maxAbsZDisplacement to ensure it's always positive and consistent.
    if (abs(uDepth) > 0.0001) { // Only calculate if uDepth is significantly non-zero
        float maxAbsZDisplacement = abs(uDepth) * 10.0;
        // Check for maxAbsZDisplacement being non-zero before division.
        // This makes it more robust, though abs(uDepth) > 0.0001 already helps.
        if (maxAbsZDisplacement > 0.0001) {
            normalizedZ = (vDisplacementZ + maxAbsZDisplacement * 0.5) / maxAbsZDisplacement;
            normalizedZ = clamp(normalizedZ, 0.0, 1.0);
        }
    }
    // If you were using normalizedZ for a color shift, ensure that effect is smooth.
    // For example, if you have a color shift:
    // gammaCorrectedColor.rgb = mix(gammaCorrectedColor.rgb, someColorBasedOnZ, someFactor);


    // Final clamping to ensure colors are valid
    gammaCorrectedColor = clamp(gammaCorrectedColor, 0.0, 1.0);

    fragColor = vec4(gammaCorrectedColor, sampledColor.a);
}