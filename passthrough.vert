#version 300 es
precision mediump float;

// Attributes from p5.js (vertices, texture coordinates)
in vec3 aPosition;
in vec2 aTexCoord;

// Output to fragment shader (FIXED: changed 'varying' to 'out' for GLSL ES 3.0)
out vec2 vTexCoord;

void main() {
  vTexCoord = aTexCoord;
  // p5.js's WEBGL mode uses a [-1, 1] range for gl_Position
  // We're essentially drawing a screen-filling rectangle
  gl_Position = vec4(aPosition, 1.0);
}
