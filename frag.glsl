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
in vec3 vPosition;      // Displaced position in View Space (interpolated)
in vec3 vNormal;         // Normal of the displaced surface in View Space (interpolated)
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
    // Normal.xy can be (0,0) for perfectly flat surface facing camera, normalize handles it
    vec2 temporalOffsetDir = normalize(vNormal.xy);
    // Avoid NaN if vNormal.xy is (0,0)
    if (length(vNormal.xy) < 0.0001) temporalOffsetDir = vec2(0.0);

    vec2 temporalOffset = temporalOffsetDir * uTemporalStrength * sin(uTime * 0.1);
    vec4 temporalSample = texture(uSampler, vTexCoord + temporalOffset * 0.005); // Small texture offset
    vec3 temporalColor = applyGammaCorrection(temporalSample.rgb, uGamma);
    gammaCorrectedColor = mix(gammaCorrectedColor, temporalColor, uTemporalStrength * (1.0 - uTemporalDecay));

    // --- Fresnel Effect and Enhanced Edge Detection ---
    vec3 N = normalize(vNormal); // N is the interpolated normal from vertex shader
    vec3 V = normalize(uCameraPosition - vPosition);

    // IMPORTANT FIX: Flip normal if rendering a back-face to ensure consistent lighting/shading
    // This makes sure the normal always points OUTWARDS relative to the camera for lighting/fresnel.
    if (!gl_FrontFacing) {
        N = -N; // Flip normal if we are rendering a back-face
    }

    float fresnel = dot(N, V);
    fresnel = 1.0 - abs(fresnel); // Using abs to make it symmetric for both front and back faces
    fresnel = pow(fresnel, 3.0); // Power of 3.0 makes it sharper at edges

    vec3 fresnelColor = vec3(0.8, 0.9, 1.0); // Light blue/white tint
    float fresnelIntensity = 0.6;

    gammaCorrectedColor += fresnelColor * fresnel * fresnelIntensity;

    float normalEdge = 0.0;
    float depthEdge = 0.0;

    // Normal-based edge calculation uses the potentially flipped N
    float normalDotViewAngle = abs(dot(N, V)); // 1.0 is facing camera, 0.0 is edge-on
    normalEdge = 1.0 - smoothstep(uEdgeThreshold, uEdgeThreshold + 0.1, normalDotViewAngle);

    // Depth-based edge calculation
    vec2 texelSize = 1.0 / vec2(textureSize(uSampler, 0));
    float centerDepth = vDisplacementZ;

    // Sample alpha channel as depth, and scale it based on uDepth as done in the vertex shader.
    // The -0.5 * uDepth * 10.0 centers it as in the vertex shader.
    float d1 = texture(uSampler, vTexCoord + texelSize * vec2(1.0, 0.0)).a * uDepth * 10.0 - 0.5 * uDepth * 10.0;
    float d2 = texture(uSampler, vTexCoord + texelSize * vec2(-1.0, 0.0)).a * uDepth * 10.0 - 0.5 * uDepth * 10.0;
    float d3 = texture(uSampler, vTexCoord + texelSize * vec2(0.0, 1.0)).a * uDepth * 10.0 - 0.5 * uDepth * 10.0;
    float d4 = texture(uSampler, vTexCoord + texelSize * vec2(0.0, -1.0)).a * uDepth * 10.0 - 0.5 * uDepth * 10.0;

    float depthDifference = abs(centerDepth - d1) + abs(centerDepth - d2) + abs(centerDepth - d3) + abs(centerDepth - d4);
    depthEdge = smoothstep(uEdgeThreshold * 0.1, uEdgeThreshold * 0.5, depthDifference); // Use smaller range for depth threshold

    // Combine normal and depth edges
    float calculatedFinalEdge = max(normalEdge * uNormalEdgeStrength, depthEdge * uDepthEdgeStrength);

    // *** REVISED FIX FOR LFO CROSSING ZERO ***
    // We want a minimum edge effect when uDepth is very small.
    float baseEdgeStrength = 0.35; // TUNE THIS: Minimum edge strength when uDepth is near zero.
                                    // Higher value = darker when flat.

    float minNonZeroDepth = 0.02; // How far from zero uDepth must be before baseEdgeStrength fully disappears.

    // Use smoothstep for a smoother transition.
    float mix_factor = 1.0 - smoothstep(0.0, minNonZeroDepth, abs(uDepth));

    // Blend the calculated final edge with the base edge strength.
    // When mix_factor is 1 (uDepth is 0), it's baseEdgeStrength.
    // When mix_factor is 0 (uDepth is > minNonZeroDepth), it's calculatedFinalEdge.
    float effectiveFinalEdge = mix(calculatedFinalEdge, baseEdgeStrength, mix_factor);

    // Apply edge effect by darkening the color
    vec3 finalColor = mix(gammaCorrectedColor, vec3(0.0), effectiveFinalEdge * uEdgeIntensity);


    // --- Color shift based on Z depth ---
    // Ensure this doesn't cause a jump.
    float normalizedZ = 0.5; // Default to middle gray if no displacement
    // Use abs(uDepth) for maxAbsZDisplacement to ensure it's always positive and consistent.
    if (abs(uDepth) > 0.0001) { // Only calculate if uDepth is significantly non-zero
        float maxAbsZDisplacement = abs(uDepth) * 10.0;
        // Check for maxAbsZDisplacement being non-zero before division.
        if (maxAbsZDisplacement > 0.0001) {
            normalizedZ = (vDisplacementZ + maxAbsZDisplacement * 0.5) / maxAbsZDisplacement;
            normalizedZ = clamp(normalizedZ, 0.0, 1.0);
        }
    }
    // If you were using normalizedZ for a color shift, ensure that effect is smooth.
    // For example, if you have a color shift:
    // finalColor.rgb = mix(finalColor.rgb, someColorBasedOnZ, someFactor);


    // Final clamping to ensure colors are valid
    finalColor = clamp(finalColor, 0.0, 1.0);

    fragColor = vec4(finalColor, sampledColor.a);
}