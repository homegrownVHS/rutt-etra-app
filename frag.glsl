#version 300 es
precision highp float;

in vec2 vTexCoord;      // Original texture coordinates from vertex shader
in vec2 vPositionNDC;   // Original normalized device coordinates from vertex shader

uniform sampler2D uSampler; // Our video/image texture
uniform float uStepSize;    // Density control from sketch.js
uniform vec2 uTextureResolution; // Resolution of the input texture (e.g., 640x480)
uniform vec2 uResolution;        // Resolution of the canvas (e.g., 1280x720)

// Parameters from sketch.js (now used in fragment shader)
uniform float uDepth; // Controls vertical displacement amplitude
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

out vec4 fragColor;

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
  // Calculate brightness from the original texture coordinate
  vec4 originalTexColor = texture(uSampler, vTexCoord);
  float brightness = (originalTexColor.r + originalTexColor.g + originalTexColor.b) / 3.0;
  float gammaCorrectedBrightness = applyGamma(brightness, uGamma);

  // --- Rutt-Etra Vertical Displacement (Luma-based) ---
  // Center the brightness value: maps [0, 1] to [-0.5, 0.5]
  float centeredBrightness = gammaCorrectedBrightness - 0.5;

  // Map uDepth from its slider range [-300, 300] to a desired pixel displacement range.
  // For example, map -300 to -100 pixels, and 300 to 100 pixels.
  float maxPixelDisplacement = 100.0; // Max displacement in pixels
  float lumaDisplacement_pixels = centeredBrightness * (uDepth / 300.0) * maxPixelDisplacement;

  // Convert pixel displacement to normalized texture coordinates
  float lumaDisplacementNormalized_Y = lumaDisplacement_pixels / uTextureResolution.y;

  // Start with the original texture coordinates
  vec2 currentTexCoord = vTexCoord;

  // Apply Luma Displacement first to the Y component of the texture coordinate
  currentTexCoord.y += lumaDisplacementNormalized_Y;

  // Clamp the texture coordinates after luma displacement to prevent artifacts
  currentTexCoord.y = clamp(currentTexCoord.y, 0.0, 1.0);


  // --- Rutt-Etra Warping Logic (Horizontal/Vertical Bends and Waves) ---
  // Convert the *luma-displaced* texture coordinates to pixel coordinates (0-textureResolution)
  vec2 pixelCoords = currentTexCoord * uTextureResolution;

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

  // Apply offsets (these are in pixel space, convert to normalized texture coords for final texture lookup)
  warpedX_pixels += uOffsetX;
  warpedY_pixels += uOffsetY;

  // Convert these warped pixel coordinates to normalized texture coordinates for sampling
  vec2 finalTexCoord = vec2(
    warpedX_pixels / uTextureResolution.x,
    warpedY_pixels / uTextureResolution.y
  );

  // Clamp the final texture coordinates again, just in case
  finalTexCoord = clamp(finalTexCoord, 0.0, 1.0);

  // Sample the color from the texture at the *displaced and warped* texture coordinate
  vec4 displacedTexColor = texture(uSampler, finalTexCoord);

  // --- Line Drawing Logic ---
  // Calculate the y-coordinate in pixel space based on the original texture resolution (vTexCoord)
  float pixelY_for_line = floor(vTexCoord.y * uTextureResolution.y);

  float lineThickness = 1.0; // Adjust for desired line thickness

  // If the pixelY is a multiple of uStepSize (or very close to it)
  if (mod(pixelY_for_line, uStepSize) < lineThickness) {
    fragColor = displacedTexColor; // Draw the line with the displaced texture color
  } else {
    // Set to solid black to clearly see the lines and displacement
    fragColor = vec4(0.0, 0.0, 0.0, 1.0);
  }
}
