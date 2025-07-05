#version 300 es
in vec3 aPosition;
in vec2 aTexCoord;

uniform mat4 uProjectionMatrix;
uniform mat4 uModelViewMatrix;
uniform mat3 uNormalMatrix;

uniform sampler2D uSampler; // Original color source (for vColor)
uniform sampler2D uBlurredBrightnessMap; // Blurred brightness for depth calculation

// Parameters from sketch.js
uniform float uDepth; // Controls Z displacement amplitude
uniform float uGamma; // Gamma for brightness calculation
uniform float uShapeX;
uniform float uShapeY;
uniform float uWaveAmp;
uniform float uWaveFreq;
uniform float uHorizAmp;
uniform float uVertAmp;
uniform float uOffsetX;
uniform float uOffsetY; // FIX: Corrected typo from 'float float uOffsetY;'
uniform float uTime;

uniform vec2 uTextureResolution; // The resolution of the texture (e.g., vec2(640.0, 480.0))
uniform vec2 uResolution;        // Screen resolution (e.g., vec2(1280.0, 720.0))

out vec2 vTexCoord;
out float vProjectedY;
out vec3 vPosition;      // Displaced vertex position in View Space
out vec3 vNormal;        // Refined Normal of the displaced surface in View Space
out float vDisplacementZ; // The actual Z-offset applied to the vertex
out vec4 vColor;         // Original color sampled from uSampler

float applyGamma(float value, float gamma) {
    // Ensure gamma is not zero or too small to prevent division by zero or large exponents
    gamma = max(0.001, gamma);
    return pow(value, 1.0 / gamma);
}

float applyParabolicBend(float normalizedValue, float shapeFactor) {
    const float center = 0.5;
    return shapeFactor * (normalizedValue - center) * (normalizedValue - center);
}

void main() {
    vTexCoord = aTexCoord;

    // Sample the original input texture and pass its color to the fragment shader
    vColor = texture(uSampler, vTexCoord); 

    // --- Rutt-Etra Z-Displacement (Luma-based) ---
    // Get the brightness directly from the pre-blurred brightness map
    // FIX: Invert Y-coordinate for brightness map sampling
    vec2 invertedYTexCoord = vec2(aTexCoord.x, 1.0 - aTexCoord.y);
    float brightness = texture(uBlurredBrightnessMap, invertedYTexCoord).r;
    float gammaCorrectedBrightness = applyGamma(brightness, uGamma);
    float centeredBrightness = gammaCorrectedBrightness - 0.5;
    
    // Z-displacement: negative to bring brighter areas TOWARDS the camera
    float zDisplacement = -centeredBrightness * uDepth * 10.0; 
    
    vDisplacementZ = zDisplacement; // Pass the actual Z-offset applied

    vec3 transformedPosition = aPosition;

    // --- Apply 2D Warping Logic to the GEOMETRY'S XY position (in NDC space) ---
    vec2 normalizedPosXY = (transformedPosition.xy + 1.0) / 2.0;

    float horizontalBend = applyParabolicBend(normalizedPosXY.y, uShapeX);
    float verticalBend = applyParabolicBend(normalizedPosXY.x, uShapeY);

    // Ensure uResolution components are at least 1.0 to prevent division by zero
    float safeResolutionX = max(1.0, uResolution.x);
    float safeResolutionY = max(1.0, uResolution.y);

    float scaledWaveAmpX_NDC = uWaveAmp / safeResolutionX * 2.0;
    float scaledWaveAmpY_NDC = uWaveAmp / safeResolutionY * 2.0;

    float waveDisplacementX = scaledWaveAmpX_NDC * sin(normalizedPosXY.y * 6.283185307 * uWaveFreq + uTime * 0.5); // Add time for subtle animation
    float waveDisplacementY = scaledWaveAmpY_NDC * sin(normalizedPosXY.x * 6.283185307 * uWaveFreq + uTime * 0.5);

    transformedPosition.x += waveDisplacementX;
    transformedPosition.y += verticalBend * 0.5 + waveDisplacementY + horizontalBend * 0.5;

    // Ensure uHorizAmp and uVertAmp are not zero before division
    transformedPosition.x = transformedPosition.x / max(0.001, uHorizAmp);
    transformedPosition.y = transformedPosition.y / max(0.001, uVertAmp);

    transformedPosition.x += uOffsetX / safeResolutionX * 2.0;
    transformedPosition.y += uOffsetY / safeResolutionY * 2.0;

    transformedPosition.z = zDisplacement; // Apply the (now correctly oriented) Z displacement

    transformedPosition.xy = clamp(transformedPosition.xy, -1.5, 1.5);

    vec4 viewPos = uModelViewMatrix * vec4(transformedPosition, 1.0);
    vPosition = viewPos.xyz;

    // --- Refined Normal Calculation ---
    // Calculate normals by sampling neighboring points and computing cross products.
    // This provides a more accurate normal that accounts for Z-displacement.
    // Ensure uTextureResolution components are at least 1.0 to prevent division by zero
    vec2 safeTextureResolution = max(vec2(1.0), uTextureResolution);
    vec2 oneTexelUV = 1.0 / safeTextureResolution; // Size of one pixel in UV space

    // Sample brightness values at neighboring points (using inverted Y-coords for consistency)
    float b_x_plus = texture(uBlurredBrightnessMap, invertedYTexCoord + vec2(oneTexelUV.x, 0.0)).r;
    float b_x_minus = texture(uBlurredBrightnessMap, invertedYTexCoord - vec2(oneTexelUV.x, 0.0)).r;
    float b_y_plus = texture(uBlurredBrightnessMap, invertedYTexCoord + vec2(0.0, oneTexelUV.y)).r;
    float b_y_minus = texture(uBlurredBrightnessMap, invertedYTexCoord - vec2(0.0, oneTexelUV.y)).r;

    // Get Z-displacements from neighboring brightness values (also inverted for consistency)
    float z_x_plus = -(applyGamma(b_x_plus, uGamma) - 0.5) * uDepth * 10.0;
    float z_x_minus = -(applyGamma(b_x_minus, uGamma) - 0.5) * uDepth * 10.0;
    float z_y_plus = -(applyGamma(b_y_plus, uGamma) - 0.5) * uDepth * 10.0;
    float z_y_minus = -(applyGamma(b_y_minus, uGamma) - 0.5) * uDepth * 10.0;

    // Calculate vectors along the surface
    // Tangent vector (along X-axis of the plane)
    vec3 tangent = vec3(2.0 * oneTexelUV.x, 0.0, z_x_plus - z_x_minus);
    // Bitangent vector (along Y-axis of the plane)
    vec3 bitangent = vec3(0.0, 2.0 * oneTexelUV.y, z_y_plus - z_y_minus);

    // Calculate the normal as the cross product of tangent and bitangent
    vec3 calculatedNormal = normalize(cross(tangent, bitangent));

    // Fallback for degenerate normals (e.g., if cross product results in zero vector)
    if (length(calculatedNormal) < 0.00001) {
        calculatedNormal = vec3(0.0, 0.0, 1.0); // Default to straight up
    }

    vNormal = uNormalMatrix * calculatedNormal;

    // Final position transformation to clip space
    gl_Position = uProjectionMatrix * viewPos;

    // Calculate projected Y in screen space (pixel coordinates) and pass to fragment shader
    vProjectedY = (gl_Position.y / gl_Position.w * 0.5 + 0.5) * uResolution.y;
}
