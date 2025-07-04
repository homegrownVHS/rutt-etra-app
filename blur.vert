#version 300 es
precision mediump float;

// The vertex data (a quad covering the screen)
in vec3 aPosition;
in vec2 aTexCoord;

// Varying to pass the texture coordinate to the fragment shader
out vec2 vTexCoord;

void main() {
    vTexCoord = aTexCoord; // Pass the texture coordinate directly
    gl_Position = vec4(aPosition, 1.0); // Output vertex position
}