#version 300 es
in vec3 aPosition;
in vec2 aTexCoord;

uniform mat4 uProjectionMatrix;
uniform mat4 uModelViewMatrix;
uniform sampler2D uSampler;

// Parameters from sketch.js
uniform float uDepth; // Controls Z displacement amplitude
uniform float uGamma;
uniform float uShapeX;
uniform float uShapeY;
uniform float uWaveAmp;
uniform float uWaveFreq;
uniform float uHorizAmp;
uniform float uVertAmp;
uniform float uOffsetX;
uniform float uOffsetY;
uniform float uTime;

uniform vec2 uTextureResolution;
uniform vec2 uResolution;

out vec2 vTexCoord; // Pass ORIGINAL texture coordinates to fragment shader for sampling
out float vProjectedY; // New: Pass the projected Y-coordinate to the fragment shader

float applyGamma(float value, float gamma) {
    return pow(value, 1.0 / gamma);
}

float applyParabolicBend(float normalizedValue, float shapeFactor) {
    const float center = 0.5;
    return shapeFactor * (normalizedValue - center) * (normalizedValue - center);
}

void main() {
    vTexCoord = aTexCoord; // Pass the ORIGINAL, UNDISTORTED texture coordinates to the fragment shader

    // Sample the color from the texture at the current vertex's ORIGINAL texture coordinate
    vec4 texColor = texture(uSampler, aTexCoord); // Use aTexCoord for initial brightness lookup
    float brightness = (texColor.r + texColor.g + texColor.b) / 3.0;
    float gammaCorrectedBrightness = applyGamma(brightness, uGamma);

    // --- Rutt-Etra Z-Displacement (Luma-based) ---
    // Center the brightness value: maps [0, 1] to [-0.5, 0.5]
    float centeredBrightness = gammaCorrectedBrightness - 0.5;

    // Significantly increased scaling of uDepth to make the Z-displacement very prominent.
    float zDisplacement = centeredBrightness * uDepth * 10.0 ; // Increased multiplier for visibility

    // Start with the original vertex position in NDC space
    vec3 transformedPosition = aPosition;

    // --- Apply 2D Warping Logic to the GEOMETRY'S XY position (in NDC space) ---
    // Convert NDC [-1, 1] to [0, 1] for bend/wave calculations
    vec2 normalizedPosXY = (transformedPosition.xy + 1.0) / 2.0;

    float horizontalBend = applyParabolicBend(normalizedPosXY.x, uShapeX);
    float verticalBend = applyParabolicBend(normalizedPosXY.x, uShapeY);

    // Scale wave amplitude to NDC space (relative to canvas size)
    float scaledWaveAmpX_NDC = uWaveAmp / uResolution.x * 2.0; // *2.0 to map pixel amplitude to NDC
    float scaledWaveAmpY_NDC = uWaveAmp / uResolution.y * 2.0;

    float waveDisplacementX = scaledWaveAmpX_NDC * sin(normalizedPosXY.y * 6.283185307 * uWaveFreq);
    float waveDisplacementY = scaledWaveAmpY_NDC * sin(normalizedPosXY.x * 6.283185307 * uWaveFreq);

    // Apply bends and waves directly to transformedPosition.xy (in NDC)
    transformedPosition.x += horizontalBend * 0.5 + waveDisplacementX; // 0.5 is a scaling factor for bend strength
    transformedPosition.y += verticalBend * 0.5 + waveDisplacementY; // 0.5 is a scaling factor for bend strength

    // Apply amplification (scaling around center 0.0 in NDC)
    transformedPosition.x = transformedPosition.x / uHorizAmp;
    transformedPosition.y = transformedPosition.y / uVertAmp;

    // Apply offsets (convert pixel offset to NDC)
    transformedPosition.x += uOffsetX / uResolution.x * 2.0;
    transformedPosition.y += uOffsetY / uResolution.y * 2.0;

    // Apply Z displacement
    transformedPosition.z = zDisplacement;

    // Clamp to prevent extreme distortions
    transformedPosition.xy = clamp(transformedPosition.xy, -1.5, 1.5);

    // Final position transformation
    vec4 clipPosition = uProjectionMatrix * uModelViewMatrix * vec4(transformedPosition, 1.0);
    gl_Position = clipPosition;

    // Calculate projected Y in screen space (pixel coordinates) and pass to fragment shader
    // Convert from clip space [-1, 1] to screen space [0, resolution.y]
    vProjectedY = (clipPosition.y / clipPosition.w * 0.5 + 0.5) * uResolution.y;
}
