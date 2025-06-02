#version 300 es
in vec3 aPosition;
in vec2 aTexCoord;

uniform mat4 uProjectionMatrix;
uniform mat4 uModelViewMatrix;
uniform sampler2D uSampler; // Still needed to sample brightness in vertex shader

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
uniform float uTime; // For time-based animations if needed

uniform vec2 uTextureResolution; // Resolution of the input texture (e.g., 640x480)
uniform vec2 uResolution;        // Resolution of the canvas (e.g., 1280x720)

out vec2 vTexCoord; // Pass original texture coordinates to fragment shader for line drawing
out vec2 vDisplacedTexCoord; // Pass the *displaced* texture coordinates to fragment shader for sampling color

// Function to apply gamma correction
float applyGamma(float value, float gamma) {
    return pow(value, 1.0 / gamma);
}

// Function to apply parabolic bend (for shapeX/Y)
float applyParabolicBend(float normalizedValue, float shapeFactor) {
    const float center = 0.5;
    return shapeFactor * (normalizedValue - center) * (normalizedValue - center);
}

void main() {
    vTexCoord = aTexCoord; // Pass original texture coordinates to fragment shader

    // Sample the color from the texture at the current vertex's texture coordinate
    vec4 texColor = texture(uSampler, vTexCoord);
    float brightness = (texColor.r + texColor.g + texColor.b) / 3.0;
    float gammaCorrectedBrightness = applyGamma(brightness, uGamma);

    // --- Rutt-Etra Z-Displacement (Luma-based) ---
    // Center the brightness value: maps [0, 1] to [-0.5, 0.5]
    float centeredBrightness = gammaCorrectedBrightness - 0.5;

    // Increased scaling of uDepth to make the Z-displacement more prominent.
    // Multiplying by 5.0 will map the centered brightness to a Z range of roughly [-750, 750] when uDepth is at max.
    float zDisplacement = centeredBrightness * uDepth * 5.0;

    // --- Rutt-Etra Warping Logic (Horizontal/Vertical Bends and Waves) ---
    // Convert normalized texture coordinates (0-1) to pixel coordinates (0-textureResolution)
    vec2 pixelCoords = vTexCoord * uTextureResolution;

    float normalizedY_for_bends = pixelCoords.y / uTextureResolution.y;
    float normalizedX_for_bends = pixelCoords.x / uTextureResolution.x;

    float horizontalBendAmount = applyParabolicBend(normalizedY_for_bends, uShapeX);
    float verticalBendAmount = applyParabolicBend(normalizedX_for_bends, uShapeY);

    // Scale wave amplitude relative to texture size to keep consistent visual effect
    float scaledWaveAmplitudeX = uWaveAmp * (uTextureResolution.x / 640.0);
    float scaledWaveAmplitudeY = uWaveAmp * (uTextureResolution.y / 480.0);

    float waveDisplacementX = scaledWaveAmplitudeX * sin(normalizedY_for_bends * 6.283185307 * uWaveFreq); // 2 * PI
    float waveDisplacementY = scaledWaveAmplitudeY * sin(normalizedX_for_bends * 6.283185307 * uWaveFreq);

    // Apply amplification, bends, waves to pixel coordinates
    float warpedX_pixels = (pixelCoords.x * uHorizAmp) + waveDisplacementX;
    float warpedY_pixels = (pixelCoords.y * uVertAmp) + (verticalBendAmount * uTextureResolution.y) + (horizontalBendAmount * uTextureResolution.x) + waveDisplacementY;

    // Apply offsets
    warpedX_pixels += uOffsetX;
    warpedY_pixels += uOffsetY;

    // Convert these warped pixel coordinates to normalized device coordinates (NDC)
    // aPosition.xy ranges from -1 to 1 (for a unit plane), and p5.js scales it by width/2, height/2.
    // So, to convert pixel coordinates (0 to textureResolution) to NDC (-1 to 1) relative to canvas size.
    vec3 finalPosition = vec3(
        (warpedX_pixels / uTextureResolution.x - 0.5) * 2.0, // Map 0-1 to -1 to 1 based on texture resolution
        (warpedY_pixels / uTextureResolution.y - 0.5) * 2.0, // Map 0-1 to -1 to 1 based on texture resolution
        zDisplacement // Apply Z displacement here
    );

    // Clamp the final position to avoid extreme distortions
    finalPosition.xy = clamp(finalPosition.xy, -1.5, 1.5); // Adjust clamp range as needed

    // Pass the (potentially warped) texture coordinates to the fragment shader for sampling
    vDisplacedTexCoord = vec2(
        warpedX_pixels / uTextureResolution.x,
        warpedY_pixels / uTextureResolution.y
    );
    vDisplacedTexCoord = clamp(vDisplacedTexCoord, 0.0, 1.0); // Clamp displaced texture coords

    // Transform the vertex position by the model-view and projection matrices
    gl_Position = uProjectionMatrix * uModelViewMatrix * vec4(finalPosition, 1.0);
}
