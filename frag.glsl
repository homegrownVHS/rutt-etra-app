#version 300 es
precision highp float;

uniform sampler2D uSampler; // Original color source (used by vert.glsl to pass vColor)
uniform sampler2D uBlurredBrightnessMap; // NEW: Blurred brightness map (used for depth-based effects)
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

uniform vec2 uTextureResolution; // Resolution of the texture (for texelSize calculation)

in vec2 vTexCoord;
in float vProjectedY;
in vec3 vPosition;       // Displaced position in View Space (interpolated)
in vec3 vNormal;         // Normal of the displaced surface in View Space (interpolated)
in float vDisplacementZ; // The actual Z-offset applied (interpolated)
in vec4 vColor;          // Original color from vertex shader

out vec4 fragColor;

vec3 applyGammaCorrection(vec3 color, float gamma) {
    gamma = max(0.001, gamma); // Safeguard against zero gamma
    return pow(color, vec3(1.0 / gamma));
}

float getLuminosity(vec3 color) {
    return dot(color, vec3(0.299, 0.587, 0.114));
}

void main() {
    // We get the original color from vColor, passed from the vertex shader
    vec3 baseColor = vColor.rgb; // Use vColor.rgb as the starting color for effects

    // --- CRUCIAL ADDITION: Discard fragment if fully transparent ---
    if (vColor.a < 0.001) { // Using a small epsilon to catch near-zero alpha
        discard;
    }

    // --- Temporal Effects ---
    vec2 temporalOffsetDir = normalize(vNormal.xy);
    if (length(vNormal.xy) < 0.0001) temporalOffsetDir = vec2(0.0); // Avoid NaN if vNormal.xy is (0,0)

    vec2 temporalOffset = temporalOffsetDir * uTemporalStrength * sin(uTime * 0.1);
    // Sample from uSampler (original color source) for temporal effect
    vec4 temporalSample = texture(uSampler, vTexCoord + temporalOffset * 0.005); // Small texture offset
    // Apply temporal effect to the base color BEFORE other effects
    baseColor = mix(baseColor, temporalSample.rgb, uTemporalStrength * (1.0 - uTemporalDecay));

    // --- Fresnel Effect and Enhanced Edge Detection ---
    vec3 N = normalize(vNormal); // N is the interpolated normal from vertex shader
    vec3 V = normalize(uCameraPosition - vPosition);

    // IMPORTANT FIX: Flip normal if rendering a back-face to ensure consistent lighting/shading
    if (!gl_FrontFacing) {
        N = -N; // Flip normal if we are rendering a back-face
    }

    float fresnel = dot(N, V);
    fresnel = 1.0 - abs(fresnel); // Using abs to make it symmetric for both front and back faces
    fresnel = pow(fresnel, 3.0); // Power of 3.0 makes it sharper at edges

    vec3 fresnelColor = vec3(0.8, 0.9, 1.0); // Light blue/white tint
    float fresnelIntensity = 0.6;

    baseColor += fresnelColor * fresnel * fresnelIntensity; // Add fresnel to the base color

    float normalEdge = 0.0;
    float depthEdge = 0.0;

    // Normal-based edge calculation uses the potentially flipped N
    float normalDotViewAngle = abs(dot(N, V)); // 1.0 is facing camera, 0.0 is edge-on
    normalEdge = 1.0 - smoothstep(uEdgeThreshold, uEdgeThreshold + 0.1, normalDotViewAngle);

    // Depth-based edge calculation - NOW USES uBlurredBrightnessMap
    vec2 safeTextureResolution = max(vec2(1.0), uTextureResolution); // Safeguard
    vec2 texelSize = 1.0 / safeTextureResolution;
    float centerDepthBrightness = texture(uBlurredBrightnessMap, vTexCoord).r; // Get brightness from blurred map

    // Sample neighboring pixels from the BLURRED BRIGHTNESS MAP
    float d1 = texture(uBlurredBrightnessMap, vTexCoord + texelSize * vec2(1.0, 0.0)).r;
    float d2 = texture(uBlurredBrightnessMap, vTexCoord + texelSize * vec2(-1.0, 0.0)).r;
    float d3 = texture(uBlurredBrightnessMap, vTexCoord + texelSize * vec2(0.0, 1.0)).r;
    float d4 = texture(uBlurredBrightnessMap, vTexCoord + texelSize * vec2(0.0, -1.0)).r;

    // Calculate depth difference from the brightness values (luminance difference)
    float depthDifference = abs(centerDepthBrightness - d1) + abs(centerDepthBrightness - d2) + abs(centerDepthBrightness - d3) + abs(centerDepthBrightness - d4);
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
    vec3 finalColor = mix(baseColor, vec3(0.0), effectiveFinalEdge * uEdgeIntensity);


    // --- Color shift based on Z depth ---
    float normalizedZ = 0.5; // Default to middle gray if no displacement
    if (abs(uDepth) > 0.0001) { // Only calculate if uDepth is significantly non-zero
        float maxAbsZDisplacement = abs(uDepth) * 10.0;
        if (maxAbsZDisplacement > 0.0001) {
            normalizedZ = (vDisplacementZ + maxAbsZDisplacement * 0.5) / maxAbsZDisplacement;
            normalizedZ = clamp(normalizedZ, 0.0, 1.0);
        }
    }
    // Example: finalColor.rgb = mix(finalColor.rgb, vec3(normalizedZ, 0.0, 1.0 - normalizedZ), 0.2);
    // If you want to use this, uncomment and adjust the mix factor and target color.


    // Final clamping to ensure colors are valid
    finalColor = clamp(finalColor, 0.0, 1.0);

    // Output the final color with the original alpha
    fragColor = vec4(finalColor, vColor.a);
}