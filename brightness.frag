#version 300 es
precision mediump float;

// Input uniforms
uniform sampler2D uSampler;

// Input from vertex shader (must match 'out' in passthrough.vert)
in vec2 vTexCoord;

// Output fragment color (required for GLSL ES 3.0)
out vec4 fragColor;

void main() {
  // Get the color from the input texture
  vec4 color = texture(uSampler, vTexCoord); // Use texture() for GLSL ES 3.0

  // Calculate luminance (brightness) using a common formula
  // These weights approximate human perception of brightness:
  // Red: 29.9%, Green: 58.7%, Blue: 11.4%
  float brightness = dot(color.rgb, vec3(0.299, 0.587, 0.114));

  // Output the brightness as grayscale (R=G=B=brightness)
  fragColor = vec4(brightness, brightness, brightness, color.a);
}
