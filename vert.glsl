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

uniform vec2 uTextureResolution; // The resolution of the texture (e.g., vec2(512.0, 512.0))
uniform vec2 uResolution;        // Screen resolution

uniform float uBlurRadius;       // Controls the radius/intensity of the blur (e.0 to 1.0 or more)

out vec2 vTexCoord;
out float vProjectedY;
out vec3 vPosition;      // Displaced vertex position in View Space
out vec3 vNormal;        // Refined Normal of the displaced surface in View Space
out float vDisplacementZ; // The actual Z-offset applied to the vertex

float applyGamma(float value, float gamma) {
    return pow(value, 1.0 / gamma);
}

float applyParabolicBend(float normalizedValue, float shapeFactor) {
    const float center = 0.5;
    return shapeFactor * (normalizedValue - center) * (normalizedValue - center);
}

// Function to get brightness from a texture coordinate with a simple box blur
float getBlurredBrightness(vec2 texCoord, float radius) {
    float totalBrightness = 0.0;
    float numSamples = 0.0;

    vec2 oneTexel = 1.0 / uTextureResolution;

    vec2 offsets[9];
    offsets[0] = vec2(-1.0, -1.0); offsets[1] = vec2(0.0, -1.0); offsets[2] = vec2(1.0, -1.0);
    offsets[3] = vec2(-1.0,  0.0); offsets[4] = vec2(0.0,  0.0); offsets[5] = vec2(1.0,  0.0);
    offsets[6] = vec2(-1.0,  1.0); offsets[7] = vec2(0.0,  1.0); offsets[8] = vec2(1.0,  1.0);

    for (int i = 0; i < 9; i++) {
        vec2 offsetTexCoord = texCoord + offsets[i] * oneTexel * radius;
        offsetTexCoord = clamp(offsetTexCoord, 0.0, 1.0);
        vec4 sampledColor = texture(uSampler, offsetTexCoord);
        totalBrightness += (sampledColor.r + sampledColor.g + sampledColor.b) / 3.0;
        numSamples += 1.0;
    }
    return totalBrightness / numSamples;
}

// Function to calculate Z-displacement based on texture brightness
float calculateZDisplacement(vec2 texCoord, float depthAmplitude, float gammaValue, float blurRadius) {
    float brightness = getBlurredBrightness(texCoord, blurRadius);
    float gammaCorrectedBrightness = applyGamma(brightness, gammaValue);
    float centeredBrightness = gammaCorrectedBrightness - 0.5;
    return centeredBrightness * depthAmplitude * 10.0;
}

void main() {
    vTexCoord = aTexCoord;

    // --- Rutt-Etra Z-Displacement (Luma-based) ---
    float zDisplacement = calculateZDisplacement(aTexCoord, uDepth, uGamma, uBlurRadius);
    vDisplacementZ = zDisplacement; // Pass the actual Z-offset applied

    vec3 transformedPosition = aPosition;

    // --- Apply 2D Warping Logic to the GEOMETRY'S XY position (in NDC space) ---
    vec2 normalizedPosXY = (transformedPosition.xy + 1.0) / 2.0;

    float horizontalBend = applyParabolicBend(normalizedPosXY.y, uShapeX);
    float verticalBend = applyParabolicBend(normalizedPosXY.x, uShapeY);

    float scaledWaveAmpX_NDC = uWaveAmp / uResolution.x * 2.0;
    float scaledWaveAmpY_NDC = uWaveAmp / uResolution.y * 2.0;

    float waveDisplacementX = scaledWaveAmpX_NDC * sin(normalizedPosXY.y * 6.283185307 * uWaveFreq + uTime * 0.5); // Add time for subtle animation
    float waveDisplacementY = scaledWaveAmpY_NDC * sin(normalizedPosXY.x * 6.283185307 * uWaveFreq + uTime * 0.5);

    transformedPosition.x += waveDisplacementX;
    transformedPosition.y += verticalBend * 0.5 + waveDisplacementY + horizontalBend * 0.5;

    transformedPosition.x = transformedPosition.x / uHorizAmp;
    transformedPosition.y = transformedPosition.y / uVertAmp;

    transformedPosition.x += uOffsetX / uResolution.x * 2.0;
    transformedPosition.y += uOffsetY / uResolution.y * 2.0;

    // Apply Z displacement
    transformedPosition.z = zDisplacement;

    // Clamp to prevent extreme distortions
    transformedPosition.xy = clamp(transformedPosition.xy, -1.5, 1.5);

    // --- Transform to View Space and Pass Data ---
    vec4 viewPos = uModelViewMatrix * vec4(transformedPosition, 1.0);
    vPosition = viewPos.xyz;

    // --- Refined Normal Calculation ---
    // Calculate normals by sampling neighboring points and computing cross products.
    // This provides a more accurate normal that accounts for Z-displacement.
    vec2 oneTexelNDC = 2.0 / uResolution; // Size of one pixel in NDC space
    vec2 normalSampleOffset = oneTexelNDC * 5.0; // Adjust for smoother normal (like a blur for normals)

    // Calculate Z displacement at neighboring points
    float z_x_plus = calculateZDisplacement(aTexCoord + vec2(oneTexelNDC.x, 0.0), uDepth, uGamma, uBlurRadius);
    float z_x_minus = calculateZDisplacement(aTexCoord - vec2(oneTexelNDC.x, 0.0), uDepth, uGamma, uBlurRadius);
    float z_y_plus = calculateZDisplacement(aTexCoord + vec2(0.0, oneTexelNDC.y), uDepth, uGamma, uBlurRadius);
    float z_y_minus = calculateZDisplacement(aTexCoord - vec2(0.0, oneTexelNDC.y), uDepth, uGamma, uBlurRadius);

    // Approximate tangent and bitangent vectors based on displacement in Z
    // These vectors are in the local plane of the mesh.
    vec3 tangent = normalize(vec3(2.0 * oneTexelNDC.x, 0.0, z_x_plus - z_x_minus));
    vec3 bitangent = normalize(vec3(0.0, 2.0 * oneTexelNDC.y, z_y_plus - z_y_minus));

    // Calculate the normal as the cross product of tangent and bitangent
    vec3 calculatedNormal = normalize(cross(tangent, bitangent));

    // Transform the calculated normal to view space
    vNormal = uNormalMatrix * calculatedNormal;


    // Final position transformation to clip space
    gl_Position = uProjectionMatrix * viewPos;

    // Calculate projected Y in screen space (pixel coordinates) and pass to fragment shader
    vProjectedY = (gl_Position.y / gl_Position.w * 0.5 + 0.5) * uResolution.y;
}