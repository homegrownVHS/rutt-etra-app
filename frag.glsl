#version 300 es
precision highp float;

uniform sampler2D uSampler;
uniform float uStepSize; // From sketch.js, controls line density

in vec2 vTexCoord; // Original texture coordinates (can be used for effects, but not direct sampling)
in vec2 vDisplacedTexCoord; // The texture coordinate calculated and displaced in the vertex shader

out vec4 fragColor;

void main() {
    // Determine if the current fragment should be drawn as part of a scanline
    // gl_FragCoord.y is the pixel coordinate of the current fragment on the screen
    // uStepSize defines the height of each line/gap
    if (mod(gl_FragCoord.y, uStepSize * 2.0) < uStepSize) {
        // This fragment is part of a "line"
        fragColor = texture(uSampler, vDisplacedTexCoord);
    } else {
        // This fragment is part of the "gap" between lines
        fragColor = vec4(0.0, 0.0, 0.0, 1.0); // Make it black to create the gaps
    }
}
