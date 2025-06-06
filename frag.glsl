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
in vec3 vPosition;       // Displaced position in View Space (interpolated)
in vec3 vNormal;         // Normal of the displaced surface in View Space (interpolated)
in float vDisplacementZ; // The actual Z-offset applied (interpolated)

out vec4 fragColor;

vec3 applyGammaCorrection(vec3 color, float gamma) {
    return pow(color, vec3(1.0 / gamma));
}

// Function to calculate luminosity for temporal effect
float getLuminosity(vec3 color) {
    return dot(color, vec3(0.299, 0.587, 0.114));
}

void main() {
    vec4 sampledColor = texture(uSampler, vTexCoord);
    vec3 gammaCorrectedColor = applyGammaCorrection(sampledColor.rgb, uGamma);

    // --- Temporal Effects (Simple motion blur/smear) ---
    // Sample texture slightly offset in time or position to create a smear effect
    // This is a simplified approach, a true temporal effect requires a previous frame buffer.
    // Here, we'll simulate it by sampling nearby pixels based on uTime and a scaled displacement.
    vec2 temporalOffset = normalize(vNormal.xy) * uTemporalStrength * sin(uTime * 0.1); // Use normal direction for smear
    vec4 temporalSample = texture(uSampler, vTexCoord + temporalOffset * 0.005); // Small offset
    vec3 temporalColor = applyGammaCorrection(temporalSample.rgb, uGamma);

    // Blend the current color with the temporal sample
    gammaCorrectedColor = mix(gammaCorrectedColor, temporalColor, uTemporalStrength * (1.0 - uTemporalDecay));

    // --- Fresnel Effect (Simulated Rim Lighting) ---
    vec3 N = normalize(vNormal);
    vec3 V = normalize(uCameraPosition - vPosition);

    float fresnel = dot(N, V);
    fresnel = 1.0 - fresnel;
    fresnel = pow(fresnel, 3.0);

    vec3 fresnelColor = vec3(0.8, 0.9, 1.0);
    float fresnelIntensity = 0.9;

    gammaCorrectedColor += fresnelColor * fresnel * fresnelIntensity;

    // --- Enhanced Edge Detection ---
    // Combine normal-based and depth-based edge detection
    // 1. Normal-based edge: Where the normal is more perpendicular to the view vector
    float normalDotView = abs(dot(N, V));
    float normalEdge = 1.0 - smoothstep(uEdgeThreshold, uEdgeThreshold + 0.1, normalDotView); // Smooth transition

    // 2. Depth-based edge: Detects sharp changes in depth (displacement)
    // Sample neighbors to detect depth discontinuities
    vec2 texelSize = 1.0 / vec2(textureSize(uSampler, 0)); // Get texel size for accurate sampling
    float centerDepth = vDisplacementZ;
    float depthEdge = 0.0;

    // Sample depths of neighboring pixels
    float d1 = texture(uSampler, vTexCoord + texelSize * vec2(1.0, 0.0)).a * uDepth * 10.0 - 0.5 * uDepth * 10.0; // Assuming alpha stores brightness for depth
    float d2 = texture(uSampler, vTexCoord + texelSize * vec2(-1.0, 0.0)).a * uDepth * 10.0 - 0.5 * uDepth * 10.0;
    float d3 = texture(uSampler, vTexCoord + texelSize * vec2(0.0, 1.0)).a * uDepth * 10.0 - 0.5 * uDepth * 10.0;
    float d4 = texture(uSampler, vTexCoord + texelSize * vec2(0.0, -1.0)).a * uDepth * 10.0 - 0.5 * uDepth * 10.0;

    depthEdge += abs(centerDepth - d1);
    depthEdge += abs(centerDepth - d2);
    depthEdge += abs(centerDepth - d3);
    depthEdge += abs(centerDepth - d4);

    depthEdge = smoothstep(uEdgeThreshold * 0.1, uEdgeThreshold * 0.5, depthEdge); // Adjust sensitivity for depth edge

    // Combine normal and depth edges
    float finalEdge = max(normalEdge * uNormalEdgeStrength, depthEdge * uDepthEdgeStrength);

    // Apply edge effect by darkening the color
    gammaCorrectedColor *= (1.0 - finalEdge * uEdgeIntensity);

    // --- Color shift based on Z depth ---
    // Normalize vDisplacementZ to a 0-1 range based on the expected max displacement
    float maxAbsZDisplacement = uDepth * 10.0; // Match the scaling in the vertex shader
    float normalizedZ = (vDisplacementZ + maxAbsZDisplacement * 0.5) / maxAbsZDisplacement;
    normalizedZ = clamp(normalizedZ, 0.0, 1.0);

    // Final clamping to ensure colors are valid
    gammaCorrectedColor = clamp(gammaCorrectedColor, 0.0, 1.0);

    fragColor = vec4(gammaCorrectedColor, sampledColor.a);
}