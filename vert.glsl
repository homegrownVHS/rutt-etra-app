#version 300 es
in vec3 aPosition;
in vec2 aTexCoord;

uniform mat4 uProjectionMatrix;
uniform mat4 uModelViewMatrix;
uniform mat3 uNormalMatrix; // We'll still pass this, good practice for lighting

uniform sampler2D uSampler; // Used for brightness lookup

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

out vec2 vTexCoord;
out float vProjectedY;
out vec3 vPosition;       // NEW: Displaced vertex position in View Space
out vec3 vNormal;         // NEW: A simplified normal for lighting
out float vDisplacementZ; // NEW: The actual Z-offset applied to the vertex

float applyGamma(float value, float gamma) {
    return pow(value, 1.0 / gamma);
}

float applyParabolicBend(float normalizedValue, float shapeFactor) {
    const float center = 0.5;
    return shapeFactor * (normalizedValue - center) * (normalizedValue - center);
}

void main() {
    vTexCoord = aTexCoord; // Pass the ORIGINAL, UNDISTORTED texture coordinates

    // Sample the color from the texture at the current vertex's ORIGINAL texture coordinate
    vec4 texColor = texture(uSampler, aTexCoord);
    float brightness = (texColor.r + texColor.g + texColor.b) / 3.0;
    float gammaCorrectedBrightness = applyGamma(brightness, uGamma);

    // --- Rutt-Etra Z-Displacement (Luma-based) ---
    float centeredBrightness = gammaCorrectedBrightness - 0.5;
    float zDisplacement = centeredBrightness * uDepth * 10.0; // This is YOUR Z-offset

    vec3 transformedPosition = aPosition; // Start with the original vertex position in NDC space

    // --- Apply 2D Warping Logic to the GEOMETRY'S XY position (in NDC space) ---
    vec2 normalizedPosXY = (transformedPosition.xy + 1.0) / 2.0;

    float horizontalBend = applyParabolicBend(normalizedPosXY.x, uShapeX);
    float verticalBend = applyParabolicBend(normalizedPosXY.x, uShapeY);

    float scaledWaveAmpX_NDC = uWaveAmp / uResolution.x * 2.0;
    float scaledWaveAmpY_NDC = uWaveAmp / uResolution.y * 2.0;

    float waveDisplacementX = scaledWaveAmpX_NDC * sin(normalizedPosXY.y * 6.283185307 * uWaveFreq);
    float waveDisplacementY = scaledWaveAmpY_NDC * sin(normalizedPosXY.x * 6.283185307 * uWaveFreq);

    transformedPosition.x += horizontalBend * 0.5 + waveDisplacementX;
    transformedPosition.y += verticalBend * 0.5 + waveDisplacementY;

    transformedPosition.x = transformedPosition.x / uHorizAmp;
    transformedPosition.y = transformedPosition.y / uVertAmp;

    transformedPosition.x += uOffsetX / uResolution.x * 2.0;
    transformedPosition.y += uOffsetY / uResolution.y * 2.0;

    // Apply Z displacement
    transformedPosition.z = zDisplacement; // Apply the Z-offset to the transformed position

    // Clamp to prevent extreme distortions
    transformedPosition.xy = clamp(transformedPosition.xy, -1.5, 1.5);

    // --- NEW: Transform to View Space and Pass Data ---
    vec4 viewPos = uModelViewMatrix * vec4(transformedPosition, 1.0); // Transform displaced position to View Space

    vPosition = viewPos.xyz; // Pass the displaced position (in View Space) to the fragment shader

    // --- NEW: Simplified Normal Calculation ---
    // For a flat plane, the normal is (0,0,1). We transform it by uNormalMatrix
    // to put it in the same space as viewPos. This normal WON'T account for the folds,
    // but it will allow basic lighting/Fresnel to work.
    // It's a starting point that won't break compilation.
    vNormal = uNormalMatrix * vec3(0.0, 0.0, 1.0);

    // Pass the Z-offset directly for the depth color effect
    vDisplacementZ = zDisplacement;

    // Final position transformation to clip space
    gl_Position = uProjectionMatrix * viewPos;

    // Calculate projected Y in screen space (pixel coordinates) and pass to fragment shader
    vProjectedY = (gl_Position.y / gl_Position.w * 0.5 + 0.5) * uResolution.y;
}