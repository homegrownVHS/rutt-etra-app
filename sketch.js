// sketch.js  -  GPU-accelerated Rutt-Etra renderer
// All per-pixel math (depth, gamma, wave warp, shape bend) runs in the
// vertex shader so the JS main loop is free of pixel iteration.

// --- p5 / media globals ------------------------------------------------------
let cam, uploadedMedia, uploadedType = null;

let depthSlider, tiltXSlider, tiltYSlider, scaleSlider, densitySlider;
let camSelect, mediaInput;

let lfoDepth, lfoTiltX, lfoTiltY, lfoScale, lfoFreqSlider, lfoAmpSlider, lfoTypeSelector;
let lfoShapeX, lfoShapeY, lfoWaveAmp, lfoWaveFreqX, lfoWaveFreqY;
let shapeXSlider, shapeYSlider;
let waveAmpSlider, waveFreqXSlider, waveFreqYSlider;
let gammaSlider, gammaLabel;
let horizAmpSlider, vertAmpSlider;
let lfoHorizAmp, lfoVertAmp;
let offsetXSlider, offsetYSlider;
let lfoOffsetX, lfoOffsetY;

// --- FX globals --------------------------------------------------------------
let chromaSlider, sheenSlider, contactSlider, fogSlider, fogInvertChk, bloomSlider, hueShiftSlider, lfoHueShift, satSlider, lfoSat, scanModeSelect, temporalSlider, depthSmoothSlider, colorSmoothChk;
let depthMinSlider, depthMaxSlider, invertDepthChk;
let lfoPhaseOffsetSlider;
let fovSlider, lightAmtSlider, lightAzSlider, lightElSlider;
let lineWidthSlider;
let depthColorizeSlider, depthColorPaletteSelect;

// --- Audio reactivity globals ------------------------------------------------
let audioCtx = null, audioAnalyser = null, audioDataArray = null, audioStream = null;
let audioBass = 0, audioMid = 0, audioTreble = 0;
let audioStartBtn, audioSourceSelect, audioSensSlider, audioSmoothSlider;
let audioBassTargetSelect, audioMidTargetSelect, audioTrebleTargetSelect, audioAmtSlider;

// Uniform location caches – populated on first use, valid for program lifetime
let progUniCache = {}, blurUniCache = {}, compUniCache = {};

let currentSourceReady = false;
let selectedDeviceId = null;
let controlsHovering = false;
let mouseInteractionEnabled = false;

let rotX = 30, rotY = 0;
let targetRotX = 30, targetRotY = 0;

let lfoPhase = 0;

let downloadBtn;


// --- WebGL2 globals -----------------------------------------------------------
let gl2, prog, vao, lineVBO, srcTexture;
let lastGridW = -1, lastGridH = -1, lastStep = -1;
let rowCounts = [], rowOffsets = [];

// --- Vertex Shader -----------------------------------------------------------
const VERT_SRC = `#version 300 es
precision highp float;

in vec2 a_uv;

uniform mat4  u_mvp;
uniform vec2  u_srcSize;
uniform float u_depth;
uniform vec2  u_horizVert;
uniform float u_gamma;
uniform float u_shapeX;
uniform float u_shapeY;
uniform float u_waveAmp;
uniform float u_waveFreqX;
uniform float u_waveFreqY;
uniform float u_chromaShift;
uniform float u_tubeWidth;
uniform float u_rowStep;       // one scanline step in UV-Y space
uniform float u_colStep;       // one column step in UV-X space (for vertical scan)
uniform float u_contactShadow; // 0=off, 1=full occlusion
uniform float u_tubeAxis;      // 0=horizontal (Y offset), 1=vertical (X offset)
uniform float u_fog;           // depth fog: darkens sunken lines
uniform int   u_fogInvert;     // 1 = invert fog direction (darken raised instead)
uniform mat3  u_normalMat;     // rotation-only matrix for surface normal transform
uniform float u_normalScale;   // depth-to-spatial scale for gradient steepness
uniform float u_depthMin;      // depth input floor  (0-1)
uniform float u_depthMax;      // depth input ceiling (0-1)
uniform int   u_invertDepth;   // 1 = flip bright/dark driving z
uniform int   u_colorSmooth;   // 1 = pull colour from blurred depthTex

in float a_tubeT;
in float a_tubeAngle;          // clip-space tube extension direction (radians)

out vec4  v_color;
out float v_tubeT;
out float v_shadow;
out float v_z;                 // per-vertex brightness (fog driver)
out vec3  v_surfNormal;        // surface normal in view space
out float v_alpha;             // source alpha (for discard of transparent pixels)

uniform sampler2D u_tex;
uniform sampler2D u_depthTex;

const float PI = 3.14159265358979;

float applyGamma(float v, float g) {
  return pow(clamp(v, 0.0, 1.0), 1.0 / g);
}

void main() {
  vec2 sz = u_srcSize;

  // Chromatic aberration: split R and B channels laterally
  float cs = u_chromaShift;
  // Color source: raw tex or spatially-blurred depthTex when colorSmooth is on
  float csmooth = float(u_colorSmooth);
  vec4 texC = texture(u_tex, a_uv);
  float texAlpha = texC.a;
  float r = mix(texture(u_tex,      vec2(clamp(a_uv.x - cs, 0.0, 1.0), a_uv.y)).r,
                texture(u_depthTex, vec2(clamp(a_uv.x - cs, 0.0, 1.0), a_uv.y)).r, csmooth);
  float g = mix(texC.g, texture(u_depthTex, a_uv).g, csmooth);
  float b = mix(texture(u_tex,      vec2(clamp(a_uv.x + cs, 0.0, 1.0), a_uv.y)).b,
                texture(u_depthTex, vec2(clamp(a_uv.x + cs, 0.0, 1.0), a_uv.y)).b, csmooth);

  // Depth: remap input range then optionally invert
  vec3 ds = texture(u_depthTex, a_uv).rgb;
  float rawDepth = (ds.r + ds.g + ds.b) / 3.0;
  float remapped = clamp((rawDepth - u_depthMin) / max(u_depthMax - u_depthMin, 0.001), 0.0, 1.0);
  if (u_invertDepth == 1) remapped = 1.0 - remapped;
  float brightDepth = mix(0.5, remapped, texAlpha);
  float gammaBright = applyGamma(brightDepth, u_gamma);

  v_alpha = texAlpha;
  v_color = vec4(applyGamma(r, u_gamma),
                 applyGamma(g, u_gamma),
                 applyGamma(b, u_gamma),
                 1.0);
  v_tubeT = a_tubeT;

  // Inter-line contact shadow
  vec2 sOff1 = u_tubeAxis < 0.5 ? vec2(0.0, u_rowStep)       : vec2(u_colStep,       0.0);
  vec2 sOff2 = u_tubeAxis < 0.5 ? vec2(0.0, u_rowStep * 2.0) : vec2(u_colStep * 2.0, 0.0);
  vec3 a1 = texture(u_depthTex, clamp(a_uv - sOff1, vec2(0.0), vec2(1.0))).rgb;
  vec3 a2 = texture(u_depthTex, clamp(a_uv - sOff2, vec2(0.0), vec2(1.0))).rgb;
  vec3 b1 = texture(u_depthTex, clamp(a_uv + sOff1, vec2(0.0), vec2(1.0))).rgb;
  vec3 b2 = texture(u_depthTex, clamp(a_uv + sOff2, vec2(0.0), vec2(1.0))).rgb;
  float nAbove = max((a1.r+a1.g+a1.b)/3.0, (a2.r+a2.g+a2.b)/3.0);
  float nBelow = max((b1.r+b1.g+b1.b)/3.0, (b2.r+b2.g+b2.b)/3.0);
  float occl   = clamp((max(nAbove, nBelow) - brightDepth) * 12.0, 0.0, 1.0);
  v_shadow = 1.0 - u_contactShadow * occl * 0.88;

  // Surface normal from depth gradient
  vec2 sCross1 = u_tubeAxis < 0.5 ? vec2(u_colStep, 0.0) : vec2(0.0, u_rowStep);
  vec3 cxNear = texture(u_depthTex, clamp(a_uv - sCross1, vec2(0.0), vec2(1.0))).rgb;
  vec3 cxFar  = texture(u_depthTex, clamp(a_uv + sCross1, vec2(0.0), vec2(1.0))).rgb;
  float bA1    = (a1.r+a1.g+a1.b)/3.0;
  float bB1    = (b1.r+b1.g+b1.b)/3.0;
  float dAlong = bB1 - bA1;
  float dCross = (cxFar.r+cxFar.g+cxFar.b)/3.0 - (cxNear.r+cxNear.g+cxNear.b)/3.0;
  float gX = u_tubeAxis < 0.5 ? dCross : dAlong;
  float gY = u_tubeAxis < 0.5 ? dAlong : dCross;
  v_surfNormal = normalize(u_normalMat * normalize(vec3(-gX * u_normalScale, -gY * u_normalScale, 1.0)));

  float nx = a_uv.x;
  float ny = a_uv.y;

  float scaleWaveX = u_waveAmp * (sz.x / 640.0);
  float scaleWaveY = u_waveAmp * (sz.y / 480.0);
  float waveX = scaleWaveX * sin(ny * PI * 2.0 * u_waveFreqX);
  float waveY = scaleWaveY * sin(nx * PI * 2.0 * u_waveFreqY);

  // --- Sphere wrap ---------------------------------------------------------
  // lon = longitude (-π..+π across width  when shapeX=1)
  // lat = latitude  (-π/2..+π/2 top→bottom when shapeY=1)
  // The cos(lat) term in sphX is the key sphere property:
  //   circles of latitude shrink toward the poles, so lines pinch together
  //   at the top/bottom exactly like a real globe. Two independent cylinders
  //   have no such coupling and cannot form a sphere.
  float W  = sz.x * u_horizVert.x;
  float H  = sz.y * u_horizVert.y;
  float Rx = W / (PI * 2.0);   // equatorial radius  (arc = W when wrapH=1)
  float Ry = H / PI;            // meridional radius  (arc = H when wrapV=1)

  // abs() drives the xy sphere shape so both ±directions form a valid sphere.
  // The sign is preserved only for foldZ so negative = concave (folds toward viewer).
  float absShapeX = abs(u_shapeX);
  float absShapeY = abs(u_shapeY);

  float lon = (nx - 0.5) * PI * 2.0 * absShapeX;   // -π..+π
  float lat = (ny - 0.5) * PI       * absShapeY;    // -π/2..+π/2

  // Sphere surface positions (relative to raster centre)
  float sphX = Rx * cos(lat) * sin(lon);   // ← cos(lat) is what makes it a sphere
  float sphY = Ry * sin(lat);

  float px = W * 0.5 + mix((nx - 0.5) * W, sphX, absShapeX) + waveX;
  float py = H * 0.5 + mix((ny - 0.5) * H, sphY, absShapeY) + waveY;

  // Fold z: positive = edges fold away (convex), negative = edges fold toward viewer (concave).
  // foldZH is modulated by cos(lat) so the equatorial fold reduces near the poles.
  float foldZH = Rx * cos(lat) * (1.0 - cos(lon)) * u_shapeX;
  float foldZV = Ry * (1.0 - cos(lat))             * u_shapeY;
  float foldZ  = foldZH + foldZV;

  float depth = u_depth;
  float z = (gammaBright * 2.0 - 1.0) * abs(depth);
  if (depth < 0.0) z *= -1.0;
  z -= foldZ;

  vec4 clipPos = u_mvp * vec4(px, py, z, 1.0);
  // Multiply by clipPos.w so the NDC offset is constant after perspective divide.
  // With ortho clip.w=1 (no change); with perspective clip.w=D-z, compensating for foreshortening.
  clipPos.x += a_tubeT * u_tubeWidth * clipPos.w * cos(a_tubeAngle);
  clipPos.y += a_tubeT * u_tubeWidth * clipPos.w * sin(a_tubeAngle);
  v_z = gammaBright;
  gl_Position = clipPos;
}
`;

// --- Fragment Shader ----------------------------------------------------------
const FRAG_SRC = `#version 300 es
precision mediump float;
in vec4  v_color;
in float v_tubeT;
in float v_shadow;
in float v_z;
in vec3  v_surfNormal;
in float v_alpha;
uniform float u_sheen;
uniform float u_fog;
uniform int   u_fogInvert;
uniform float u_saturation;
uniform float u_hueShift;  // hue rotation in radians
uniform float u_lightAmt;
uniform float u_lightAz;
uniform float u_lightEl;
uniform float u_depthColorize;
uniform int   u_depthColorPalette;  // 0=spectrum, 1=heat, 2=neon
out vec4 fragColor;

// Depth-gradient palette: maps v_z (0-1) to a colour
vec3 depthGradient(float t, int mode) {
  t = clamp(t, 0.0, 1.0);
  if (mode == 1) {
    // Heat: black → red → orange/yellow → white
    if (t < 0.33) return mix(vec3(0.0), vec3(1.0, 0.0, 0.0), t * 3.03);
    if (t < 0.67) return mix(vec3(1.0, 0.0, 0.0), vec3(1.0, 0.8, 0.0), (t - 0.33) * 2.94);
    return mix(vec3(1.0, 0.8, 0.0), vec3(1.0), (t - 0.67) * 3.03);
  }
  if (mode == 2) {
    // Neon: deep purple → magenta → cyan
    if (t < 0.5) return mix(vec3(0.2, 0.0, 0.4), vec3(1.0, 0.0, 1.0), t * 2.0);
    return mix(vec3(1.0, 0.0, 1.0), vec3(0.0, 1.0, 1.0), (t - 0.5) * 2.0);
  }
  // mode == 0 (default): Spectrum  blue → cyan → green → yellow → red
  if (t < 0.25) return mix(vec3(0.0, 0.0, 1.0), vec3(0.0, 1.0, 1.0), t * 4.0);
  if (t < 0.5)  return mix(vec3(0.0, 1.0, 1.0), vec3(0.0, 1.0, 0.0), (t - 0.25) * 4.0);
  if (t < 0.75) return mix(vec3(0.0, 1.0, 0.0), vec3(1.0, 1.0, 0.0), (t - 0.5) * 4.0);
  return mix(vec3(1.0, 1.0, 0.0), vec3(1.0, 0.0, 0.0), (t - 0.75) * 4.0);
}

// Rotate hue by angle (radians) — rotates around the (1,1,1) axis in RGB space
vec3 hueRotate(vec3 col, float angle) {
  float c = cos(angle), s = sin(angle);
  float k = 1.0 / 3.0, sq = 0.57735027;
  return clamp(vec3(
    col.r*(k+(1.0-k)*c) + col.g*(k*(1.0-c)-sq*s) + col.b*(k*(1.0-c)+sq*s),
    col.r*(k*(1.0-c)+sq*s) + col.g*(k+(1.0-k)*c) + col.b*(k*(1.0-c)-sq*s),
    col.r*(k*(1.0-c)-sq*s) + col.g*(k*(1.0-c)+sq*s) + col.b*(k+(1.0-k)*c)
  ), 0.0, 1.0);
}

void main() {
  if (v_alpha < 0.05) discard;  // skip fully-transparent pixels — no depth write, no occlusion
  float sint  = clamp(v_tubeT, -1.0, 1.0);
  vec3 N = vec3(0.0, sint, sqrt(max(0.0, 1.0 - sint*sint)));
  vec3 L = normalize(vec3(0.3, 0.7, 1.0));
  float diffuse = max(0.0, dot(N, L));
  float spec    = pow(max(0.0, N.z), 32.0);
  float shade   = mix(1.0, 0.50 + diffuse * 0.46 + spec * 0.30, clamp(u_sheen, 0.0, 1.0));
  vec3 lit = v_color.rgb * shade * v_shadow;
  // depth fog: sunken or raised lines fade to black depending on fogInvert
  float fogFactor = u_fogInvert == 1 ? v_z : (1.0 - v_z);
  lit *= (1.0 - u_fog * fogFactor);
  // Surface normal lighting
  vec3 Ls = normalize(vec3(cos(u_lightEl)*sin(u_lightAz), cos(u_lightEl)*cos(u_lightAz), sin(u_lightEl)));
  vec3 surfN = normalize(v_surfNormal);
  float surf_diff = max(0.0, dot(surfN, Ls));
  float surf_spec = pow(max(0.0, dot(reflect(-Ls, surfN), vec3(0.0, 0.0, 1.0))), 16.0);
  float surf_shade = clamp(0.15 + surf_diff * 0.75 + surf_spec * 0.30, 0.0, 2.5);
  lit = mix(lit, lit * surf_shade, u_lightAmt);
  lit = hueRotate(lit, u_hueShift);
  // Saturation: 0=greyscale, 1=normal, 2=vivid
  float luma = dot(lit, vec3(0.299, 0.587, 0.114));
  lit = mix(vec3(luma), lit, u_saturation);
  // Depth colorize: blend source colour toward a depth-driven gradient
  if (u_depthColorize > 0.0) {
    vec3 gc = depthGradient(v_z, u_depthColorPalette);
    lit = mix(lit, gc, u_depthColorize);
  }
  fragColor = vec4(clamp(lit, 0.0, 1.0), 1.0);
}
`;

// --- Temporal blend shader (full-screen quad EMA pass) -----------------------
const BLEND_VERT = `#version 300 es
layout(location=0) in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;
const BLEND_FRAG = `#version 300 es
precision mediump float;
in vec2 v_uv;
uniform sampler2D u_cur;
uniform sampler2D u_prev;
uniform float u_alpha;
out vec4 fragColor;
void main() {
  fragColor = mix(texture(u_prev, v_uv), texture(u_cur, v_uv), u_alpha);
}
`;

// --- Separable Gaussian blur (bloom) ----------------------------------------
const BLUR_FRAG = `#version 300 es
precision mediump float;
in vec2 v_uv;
uniform sampler2D u_tex;
uniform vec2 u_dir;
out vec4 fragColor;
void main() {
  vec2 o1 = 1.4118 * u_dir; vec2 o2 = 3.2941 * u_dir; vec2 o3 = 5.1765 * u_dir;
  fragColor = texture(u_tex, v_uv)      * 0.19648
            + texture(u_tex, v_uv+o1)   * 0.29691
            + texture(u_tex, v_uv-o1)   * 0.29691
            + texture(u_tex, v_uv+o2)   * 0.09444
            + texture(u_tex, v_uv-o2)   * 0.09444
            + texture(u_tex, v_uv+o3)   * 0.01038
            + texture(u_tex, v_uv-o3)   * 0.01038;
}
`;

// --- Composite: scene + two-level screen-blend bloom -------------------------
const COMPOSITE_FRAG = `#version 300 es
precision mediump float;
in vec2 v_uv;
uniform sampler2D u_scene;
uniform sampler2D u_bloom0;  // tight glow  (CW/4)
uniform sampler2D u_bloom1;  // soft halo   (CW/8)
uniform float u_bloomAmt;
out vec4 fragColor;
void main() {
  vec3 s = texture(u_scene,  v_uv).rgb;
  vec3 b = (texture(u_bloom0, v_uv).rgb * 0.60
          + texture(u_bloom1, v_uv).rgb * 0.40) * u_bloomAmt * 2.0;
  // Screen blend: glows without blowing out highlights
  fragColor = vec4(clamp(1.0 - (1.0 - s) * (1.0 - b), 0.0, 1.0), 1.0);
}
`;

// --- Temporal smooth globals --------------------------------------------------
let blendProg, quadVAO;
let smoothTex = [null, null], smoothFBO = [null, null], smoothIdx = 0;
let smoothW = -1, smoothH = -1;

// --- Scene FBO + bloom globals -----------------------------------------------
let sceneFBO = null, sceneTex = null, sceneDepth = null, sceneCW = -1, sceneCH = -1;
let blurProg, compositeProg;
// Two-level bloom pyramid: [level][pingpong] — level 0 = CW/4, level 1 = CW/8
let bloomTex = [[null,null],[null,null]], bloomFBO = [[null,null],[null,null]];
let bloomDims = [[-1,-1],[-1,-1]]; // [[w,h], [w,h]] per level

// Depth blur (spatial smoothing of displacement texture)
let depthBlurTex = [null, null], depthBlurFBO = [null, null];
let depthBlurW = -1, depthBlurH = -1;

// --- Column VBO globals ------------------------------------------------------
let colVAO, colVBO;
let lastColW = -1, lastColH = -1, lastColStep = -1;
let polVAO, polVBO;
let lastPolW = -1, lastPolH = -1, lastPolStep = -1;
let polCounts = [], polOffsets = [];
let colCounts = [], colOffsets = [];

// --- Matrix helpers (column-major, matching WebGL convention) ----------------
function mat4Mul(a, b) {
  const o = new Float32Array(16);
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 4; c++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[r + k*4] * b[k + c*4];
      o[r + c*4] = s;
    }
  return o;
}
function rotX4(a) {
  const c=Math.cos(a), s=Math.sin(a);
  return new Float32Array([1,0,0,0, 0,c,s,0, 0,-s,c,0, 0,0,0,1]);
}
function rotY4(a) {
  const c=Math.cos(a), s=Math.sin(a);
  return new Float32Array([c,0,-s,0, 0,1,0,0, s,0,c,0, 0,0,0,1]);
}
function scale4(s) {
  return new Float32Array([s,0,0,0, 0,s,0,0, 0,0,s,0, 0,0,0,1]);
}
function trans4(tx, ty, tz) {
  return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, tx,ty,tz,1]);
}

// --- WebGL helpers -----------------------------------------------------------
function compileShader(type, src) {
  const sh = gl2.createShader(type);
  gl2.shaderSource(sh, src);
  gl2.compileShader(sh);
  if (!gl2.getShaderParameter(sh, gl2.COMPILE_STATUS))
    console.error('Shader error:', gl2.getShaderInfoLog(sh));
  return sh;
}

function buildProgram() {
  const vs = compileShader(gl2.VERTEX_SHADER,   VERT_SRC);
  const fs = compileShader(gl2.FRAGMENT_SHADER, FRAG_SRC);
  const p  = gl2.createProgram();
  gl2.attachShader(p, vs);
  gl2.attachShader(p, fs);
  gl2.linkProgram(p);
  if (!gl2.getProgramParameter(p, gl2.LINK_STATUS))
    console.error('Link error:', gl2.getProgramInfoLog(p));
  return p;
}

function buildBlendProg() {
  const vs = compileShader(gl2.VERTEX_SHADER,   BLEND_VERT);
  const fs = compileShader(gl2.FRAGMENT_SHADER, BLEND_FRAG);
  const p  = gl2.createProgram();
  gl2.attachShader(p, vs);
  gl2.attachShader(p, fs);
  gl2.linkProgram(p);
  if (!gl2.getProgramParameter(p, gl2.LINK_STATUS))
    console.error('Blend link error:', gl2.getProgramInfoLog(p));
  return p;
}

function buildQuadVAO() {
  const verts = new Float32Array([-1,-1, 1,-1, -1,1, 1,1]);
  quadVAO = gl2.createVertexArray();
  gl2.bindVertexArray(quadVAO);
  const buf = gl2.createBuffer();
  gl2.bindBuffer(gl2.ARRAY_BUFFER, buf);
  gl2.bufferData(gl2.ARRAY_BUFFER, verts, gl2.STATIC_DRAW);
  gl2.enableVertexAttribArray(0);
  gl2.vertexAttribPointer(0, 2, gl2.FLOAT, false, 0, 0);
  gl2.bindVertexArray(null);
}

function buildSmoothFBOs(w, h) {
  for (let i = 0; i < 2; i++) {
    if (smoothTex[i]) gl2.deleteTexture(smoothTex[i]);
    if (smoothFBO[i]) gl2.deleteFramebuffer(smoothFBO[i]);
    smoothTex[i] = gl2.createTexture();
    gl2.bindTexture(gl2.TEXTURE_2D, smoothTex[i]);
    gl2.texImage2D(gl2.TEXTURE_2D, 0, gl2.RGBA8, w, h, 0, gl2.RGBA, gl2.UNSIGNED_BYTE, null);
    gl2.texParameteri(gl2.TEXTURE_2D, gl2.TEXTURE_MIN_FILTER, gl2.LINEAR);
    gl2.texParameteri(gl2.TEXTURE_2D, gl2.TEXTURE_MAG_FILTER, gl2.LINEAR);
    gl2.texParameteri(gl2.TEXTURE_2D, gl2.TEXTURE_WRAP_S, gl2.CLAMP_TO_EDGE);
    gl2.texParameteri(gl2.TEXTURE_2D, gl2.TEXTURE_WRAP_T, gl2.CLAMP_TO_EDGE);
    smoothFBO[i] = gl2.createFramebuffer();
    gl2.bindFramebuffer(gl2.FRAMEBUFFER, smoothFBO[i]);
    gl2.framebufferTexture2D(gl2.FRAMEBUFFER, gl2.COLOR_ATTACHMENT0, gl2.TEXTURE_2D, smoothTex[i], 0);
  }
  gl2.bindFramebuffer(gl2.FRAMEBUFFER, null);
  gl2.bindTexture(gl2.TEXTURE_2D, null);
  smoothW = w; smoothH = h;
}

function buildSceneFBO(w, h) {
  if (sceneTex)   gl2.deleteTexture(sceneTex);
  if (sceneDepth) gl2.deleteRenderbuffer(sceneDepth);
  if (sceneFBO)   gl2.deleteFramebuffer(sceneFBO);
  sceneTex = gl2.createTexture();
  gl2.bindTexture(gl2.TEXTURE_2D, sceneTex);
  gl2.texImage2D(gl2.TEXTURE_2D, 0, gl2.RGBA8, w, h, 0, gl2.RGBA, gl2.UNSIGNED_BYTE, null);
  gl2.texParameteri(gl2.TEXTURE_2D, gl2.TEXTURE_MIN_FILTER, gl2.LINEAR);
  gl2.texParameteri(gl2.TEXTURE_2D, gl2.TEXTURE_MAG_FILTER, gl2.LINEAR);
  gl2.texParameteri(gl2.TEXTURE_2D, gl2.TEXTURE_WRAP_S, gl2.CLAMP_TO_EDGE);
  gl2.texParameteri(gl2.TEXTURE_2D, gl2.TEXTURE_WRAP_T, gl2.CLAMP_TO_EDGE);
  sceneDepth = gl2.createRenderbuffer();
  gl2.bindRenderbuffer(gl2.RENDERBUFFER, sceneDepth);
  gl2.renderbufferStorage(gl2.RENDERBUFFER, gl2.DEPTH_COMPONENT24, w, h);
  sceneFBO = gl2.createFramebuffer();
  gl2.bindFramebuffer(gl2.FRAMEBUFFER, sceneFBO);
  gl2.framebufferTexture2D(gl2.FRAMEBUFFER, gl2.COLOR_ATTACHMENT0, gl2.TEXTURE_2D, sceneTex, 0);
  gl2.framebufferRenderbuffer(gl2.FRAMEBUFFER, gl2.DEPTH_ATTACHMENT, gl2.RENDERBUFFER, sceneDepth);
  gl2.bindFramebuffer(gl2.FRAMEBUFFER, null);
  sceneCW = w; sceneCH = h;
}

function buildDepthBlurFBOs(w, h) {
  for (let i = 0; i < 2; i++) {
    if (depthBlurTex[i]) gl2.deleteTexture(depthBlurTex[i]);
    if (depthBlurFBO[i]) gl2.deleteFramebuffer(depthBlurFBO[i]);
    depthBlurTex[i] = gl2.createTexture();
    gl2.bindTexture(gl2.TEXTURE_2D, depthBlurTex[i]);
    gl2.texImage2D(gl2.TEXTURE_2D, 0, gl2.RGBA8, w, h, 0, gl2.RGBA, gl2.UNSIGNED_BYTE, null);
    gl2.texParameteri(gl2.TEXTURE_2D, gl2.TEXTURE_MIN_FILTER, gl2.LINEAR);
    gl2.texParameteri(gl2.TEXTURE_2D, gl2.TEXTURE_MAG_FILTER, gl2.LINEAR);
    gl2.texParameteri(gl2.TEXTURE_2D, gl2.TEXTURE_WRAP_S, gl2.CLAMP_TO_EDGE);
    gl2.texParameteri(gl2.TEXTURE_2D, gl2.TEXTURE_WRAP_T, gl2.CLAMP_TO_EDGE);
    depthBlurFBO[i] = gl2.createFramebuffer();
    gl2.bindFramebuffer(gl2.FRAMEBUFFER, depthBlurFBO[i]);
    gl2.framebufferTexture2D(gl2.FRAMEBUFFER, gl2.COLOR_ATTACHMENT0, gl2.TEXTURE_2D, depthBlurTex[i], 0);
  }
  gl2.bindFramebuffer(gl2.FRAMEBUFFER, null);
  depthBlurW = w; depthBlurH = h;
}

function buildBloomLevel(lv, w, h) {
  for (let i = 0; i < 2; i++) {
    if (bloomTex[lv][i]) gl2.deleteTexture(bloomTex[lv][i]);
    if (bloomFBO[lv][i]) gl2.deleteFramebuffer(bloomFBO[lv][i]);
    bloomTex[lv][i] = gl2.createTexture();
    gl2.bindTexture(gl2.TEXTURE_2D, bloomTex[lv][i]);
    gl2.texImage2D(gl2.TEXTURE_2D, 0, gl2.RGBA8, w, h, 0, gl2.RGBA, gl2.UNSIGNED_BYTE, null);
    gl2.texParameteri(gl2.TEXTURE_2D, gl2.TEXTURE_MIN_FILTER, gl2.LINEAR);
    gl2.texParameteri(gl2.TEXTURE_2D, gl2.TEXTURE_MAG_FILTER, gl2.LINEAR);
    gl2.texParameteri(gl2.TEXTURE_2D, gl2.TEXTURE_WRAP_S, gl2.CLAMP_TO_EDGE);
    gl2.texParameteri(gl2.TEXTURE_2D, gl2.TEXTURE_WRAP_T, gl2.CLAMP_TO_EDGE);
    bloomFBO[lv][i] = gl2.createFramebuffer();
    gl2.bindFramebuffer(gl2.FRAMEBUFFER, bloomFBO[lv][i]);
    gl2.framebufferTexture2D(gl2.FRAMEBUFFER, gl2.COLOR_ATTACHMENT0, gl2.TEXTURE_2D, bloomTex[lv][i], 0);
  }
  gl2.bindFramebuffer(gl2.FRAMEBUFFER, null);
  bloomDims[lv] = [w, h];
}

function buildBlurProg() {
  const vs = compileShader(gl2.VERTEX_SHADER,   BLEND_VERT);
  const fs = compileShader(gl2.FRAGMENT_SHADER, BLUR_FRAG);
  const p  = gl2.createProgram();
  gl2.attachShader(p, vs); gl2.attachShader(p, fs);
  gl2.linkProgram(p);
  if (!gl2.getProgramParameter(p, gl2.LINK_STATUS)) console.error('Blur link:', gl2.getProgramInfoLog(p));
  return p;
}

function buildCompositeProg() {
  const vs = compileShader(gl2.VERTEX_SHADER,   BLEND_VERT);
  const fs = compileShader(gl2.FRAGMENT_SHADER, COMPOSITE_FRAG);
  const p  = gl2.createProgram();
  gl2.attachShader(p, vs); gl2.attachShader(p, fs);
  gl2.linkProgram(p);
  if (!gl2.getProgramParameter(p, gl2.LINK_STATUS)) console.error('Composite link:', gl2.getProgramInfoLog(p));
  return p;
}

function buildColumnVBO(srcW, srcH, step) {
  if (srcW === lastColW && srcH === lastColH && step === lastColStep) return;
  lastColW = srcW; lastColH = srcH; lastColStep = step;
  const cols = Math.ceil(srcW / step);
  const rows = Math.ceil(srcH / step);
  colCounts = []; colOffsets = [];
  const uvs = [];
  let offset = 0;
  for (let col = 0; col < cols; col++) {
    const nx = (col * step + step * 0.5) / srcW;
    colOffsets.push(offset);
    for (let row = 0; row < rows; row++) {
      const ny = (row * step + step * 0.5) / srcH;
      uvs.push(nx, ny, -1.0, 0.0);  // tubeAngle 0.0 = +X clip (perpendicular to vertical scan)
      uvs.push(nx, ny,  1.0, 0.0);
    }
    colCounts.push(rows * 2);
    offset += rows * 2;
  }
  gl2.bindVertexArray(colVAO);
  gl2.bindBuffer(gl2.ARRAY_BUFFER, colVBO);
  gl2.bufferData(gl2.ARRAY_BUFFER, new Float32Array(uvs), gl2.DYNAMIC_DRAW);
  const aUV   = gl2.getAttribLocation(prog, 'a_uv');
  gl2.enableVertexAttribArray(aUV);
  gl2.vertexAttribPointer(aUV, 2, gl2.FLOAT, false, 16, 0);
  const aTubeT = gl2.getAttribLocation(prog, 'a_tubeT');
  gl2.enableVertexAttribArray(aTubeT);
  gl2.vertexAttribPointer(aTubeT, 1, gl2.FLOAT, false, 16, 8);
  const aTubeAngleC = gl2.getAttribLocation(prog, 'a_tubeAngle');
  gl2.enableVertexAttribArray(aTubeAngleC);
  gl2.vertexAttribPointer(aTubeAngleC, 1, gl2.FLOAT, false, 16, 12);
  gl2.bindVertexArray(null);
}

function buildPolarVBO(srcW, srcH, step) {
  if (srcW === lastPolW && srcH === lastPolH && step === lastPolStep) return;
  lastPolW = srcW; lastPolH = srcH; lastPolStep = step;
  const minDim  = Math.min(srcW, srcH);
  const maxR    = Math.SQRT2 / 2;                              // reaches all corners of UV [0,1]
  const nSpokes = Math.max(8, Math.round(Math.PI * minDim / step));
  const nPts    = Math.max(2, Math.ceil(maxR * minDim / step));
  polCounts = []; polOffsets = [];
  const uvs = [];
  let offset = 0;
  for (let si = 0; si < nSpokes; si++) {
    const theta   = (2 * Math.PI * si) / nSpokes;
    const cosT    = Math.cos(theta);
    const sinT    = Math.sin(theta);
    const tubeAng = Math.PI / 2 - theta; // clip-space perpendicular to this spoke direction
    polOffsets.push(offset);
    for (let ri = 0; ri < nPts; ri++) {
      const r = (ri + 0.5) / nPts * maxR;
      const u = 0.5 + r * cosT;
      const v = 0.5 + r * sinT;
      uvs.push(u, v, -1.0, tubeAng);
      uvs.push(u, v,  1.0, tubeAng);
    }
    polCounts.push(nPts * 2);
    offset += nPts * 2;
  }
  gl2.bindVertexArray(polVAO);
  gl2.bindBuffer(gl2.ARRAY_BUFFER, polVBO);
  gl2.bufferData(gl2.ARRAY_BUFFER, new Float32Array(uvs), gl2.DYNAMIC_DRAW);
  const aUVp = gl2.getAttribLocation(prog, 'a_uv');
  gl2.enableVertexAttribArray(aUVp);
  gl2.vertexAttribPointer(aUVp, 2, gl2.FLOAT, false, 16, 0);
  const aTubeTp = gl2.getAttribLocation(prog, 'a_tubeT');
  gl2.enableVertexAttribArray(aTubeTp);
  gl2.vertexAttribPointer(aTubeTp, 1, gl2.FLOAT, false, 16, 8);
  const aTubeAngleP = gl2.getAttribLocation(prog, 'a_tubeAngle');
  gl2.enableVertexAttribArray(aTubeAngleP);
  gl2.vertexAttribPointer(aTubeAngleP, 1, gl2.FLOAT, false, 16, 12);
  gl2.bindVertexArray(null);
}

// Rebuild VBO only when grid parameters change
function buildScanlineVBO(srcW, srcH, step) {
  if (srcW === lastGridW && srcH === lastGridH && step === lastStep) return;
  lastGridW = srcW; lastGridH = srcH; lastStep = step;

  const cols = Math.ceil(srcW / step);
  const rows = Math.ceil(srcH / step);
  rowCounts  = [];
  rowOffsets = [];

  const uvs = [];
  let offset = 0;
  for (let row = 0; row < rows; row++) {
    const ny = (row * step + step * 0.5) / srcH;
    rowOffsets.push(offset);
    for (let col = 0; col < cols; col++) {
      const nx = (col * step + step * 0.5) / srcW;
      uvs.push(nx, ny, -1.0, Math.PI / 2);  // tubeAngle PI/2 = +Y clip (perpendicular to H scan)
      uvs.push(nx, ny,  1.0, Math.PI / 2);
    }
    rowCounts.push(cols * 2);
    offset += cols * 2;
  }

  gl2.bindVertexArray(vao);
  gl2.bindBuffer(gl2.ARRAY_BUFFER, lineVBO);
  gl2.bufferData(gl2.ARRAY_BUFFER, new Float32Array(uvs), gl2.DYNAMIC_DRAW);
  const aUV = gl2.getAttribLocation(prog, 'a_uv');
  gl2.enableVertexAttribArray(aUV);
  gl2.vertexAttribPointer(aUV, 2, gl2.FLOAT, false, 16, 0);
  const aTubeT = gl2.getAttribLocation(prog, 'a_tubeT');
  gl2.enableVertexAttribArray(aTubeT);
  gl2.vertexAttribPointer(aTubeT, 1, gl2.FLOAT, false, 16, 8);
  const aTubeAngleH = gl2.getAttribLocation(prog, 'a_tubeAngle');
  gl2.enableVertexAttribArray(aTubeAngleH);
  gl2.vertexAttribPointer(aTubeAngleH, 1, gl2.FLOAT, false, 16, 12);
  gl2.bindVertexArray(null);
}

// Upload source pixels to GPU texture each frame
function updateTexture(src) {
  let elt = src.canvas ? src.canvas : (src.elt ? src.elt : src);
  // Skip if video element has no decoded frame data.
  // readyState < 2 means metadata not ready; videoWidth===0 means codec unsupported
  // (e.g. .mov HEVC/ProRes that Chrome can't decode — metadata loads but pixels never come).
  if (elt instanceof HTMLVideoElement && (elt.readyState < 2 || elt.videoWidth === 0)) return;
  gl2.bindTexture(gl2.TEXTURE_2D, srcTexture);
  gl2.pixelStorei(gl2.UNPACK_FLIP_Y_WEBGL, false);
  gl2.texImage2D(gl2.TEXTURE_2D, 0, gl2.RGBA, gl2.RGBA, gl2.UNSIGNED_BYTE, elt);
  gl2.bindTexture(gl2.TEXTURE_2D, null);
}

// --- setup -------------------------------------------------------------------
function setup() {
  // Tiny hidden p5 canvas (p5 needs a canvas to exist)
  const cnv = createCanvas(1, 1);
  cnv.elt.style.display = 'none';

  // Our own WebGL2 canvas
  const canvas = document.createElement('canvas');
  canvas.width  = 3840;
  canvas.height = 2160;
  canvas.style.display = 'block';
  canvas.style.margin  = '0 auto';
  canvas.style.width   = '100%';
  canvas.style.height  = 'auto';
  const main = document.querySelector('main') || document.body;
  main.insertBefore(canvas, main.firstChild);
  window._gpuCanvas = canvas;

  gl2 = canvas.getContext('webgl2', { antialias: true, preserveDrawingBuffer: true });
  if (!gl2) { alert('WebGL2 not supported by this browser.'); return; }

  prog          = buildProgram();
  blendProg     = buildBlendProg();
  blurProg      = buildBlurProg();
  compositeProg = buildCompositeProg();
  vao     = gl2.createVertexArray();
  lineVBO = gl2.createBuffer();
  colVAO  = gl2.createVertexArray();
  colVBO  = gl2.createBuffer();
  polVAO  = gl2.createVertexArray();
  polVBO  = gl2.createBuffer();
  buildQuadVAO();

  srcTexture = gl2.createTexture();
  gl2.bindTexture(gl2.TEXTURE_2D, srcTexture);
  gl2.texParameteri(gl2.TEXTURE_2D, gl2.TEXTURE_WRAP_S, gl2.CLAMP_TO_EDGE);
  gl2.texParameteri(gl2.TEXTURE_2D, gl2.TEXTURE_WRAP_T, gl2.CLAMP_TO_EDGE);
  gl2.texParameteri(gl2.TEXTURE_2D, gl2.TEXTURE_MIN_FILTER, gl2.LINEAR);
  gl2.texParameteri(gl2.TEXTURE_2D, gl2.TEXTURE_MAG_FILTER, gl2.LINEAR);
  gl2.bindTexture(gl2.TEXTURE_2D, null);

  // --- UI wiring -------------------------------------------------------------
  depthSlider   = select("#depthSlider");
  tiltXSlider   = select("#tiltXSlider");
  tiltYSlider   = select("#tiltYSlider");
  scaleSlider   = select("#scaleSlider");
  densitySlider = select("#densitySlider");
  camSelect     = select("#camSelect");
  mediaInput    = select("#mediaInput");

  lfoDepth        = select("#lfoDepth");
  lfoTiltX        = select("#lfoTiltX");
  lfoTiltY        = select("#lfoTiltY");
  lfoScale        = select("#lfoScale");
  lfoFreqSlider   = select("#lfoFreq");
  lfoAmpSlider    = select("#lfoAmp");
  lfoTypeSelector = select("#lfoType");

  shapeXSlider   = select("#shapeXSlider");
  shapeYSlider   = select("#shapeYSlider");
  waveAmpSlider  = select("#waveAmpSlider");
  waveFreqXSlider = select("#waveFreqXSlider");
  waveFreqYSlider = select("#waveFreqYSlider");

  lfoShapeX    = select("#lfoShapeX");
  lfoShapeY    = select("#lfoShapeY");
  lfoWaveAmp   = select("#lfoWaveAmp");
  lfoWaveFreqX = select("#lfoWaveFreqX");
  lfoWaveFreqY = select("#lfoWaveFreqY");

  gammaSlider = select("#gammaSlider");
  gammaLabel  = select("#gammaLabel");

  chromaSlider      = select("#chromaSlider");
  sheenSlider       = select("#sheenSlider");
  contactSlider     = select("#contactSlider");
  fogSlider         = select("#fogSlider");
  fogInvertChk      = select("#fogInvertChk");
  bloomSlider       = select("#bloomSlider");
  hueShiftSlider    = select("#hueShiftSlider");
  lfoHueShift       = select("#lfoHueShift");
  satSlider         = select("#satSlider");
  lfoSat            = select("#lfoSat");
  depthMinSlider    = select("#depthMinSlider");
  depthMaxSlider    = select("#depthMaxSlider");
  invertDepthChk    = select("#invertDepthChk");
  colorSmoothChk    = select("#colorSmoothChk");
  lfoPhaseOffsetSlider = select("#lfoPhaseOffsetSlider");
  depthColorizeSlider    = select("#depthColorizeSlider");
  depthColorPaletteSelect = select("#depthColorPaletteSelect");
  scanModeSelect    = select("#scanModeSelect");
  temporalSlider    = select("#temporalSlider");
  depthSmoothSlider = select("#depthSmoothSlider");
  fovSlider         = select("#fovSlider");
  lightAmtSlider    = select("#lightAmtSlider");
  lightAzSlider     = select("#lightAzSlider");
  lightElSlider     = select("#lightElSlider");
  lineWidthSlider   = select("#lineWidthSlider");

  horizAmpSlider = select("#horizAmpSlider");
  vertAmpSlider  = select("#vertAmpSlider");
  lfoHorizAmp    = select("#lfoHorizAmp");
  lfoVertAmp     = select("#lfoVertAmp");

  offsetXSlider = select("#offsetXSlider");
  offsetYSlider = select("#offsetYSlider");
  lfoOffsetX    = select("#lfoOffsetX");
  lfoOffsetY    = select("#lfoOffsetY");

  select("#resetParamsBtn").mousePressed(resetParams);
  downloadBtn = select("#downloadBtn");
  downloadBtn.mousePressed(saveImage);

  // Audio reactivity
  audioStartBtn           = select('#audioStartBtn');
  audioSourceSelect       = select('#audioSourceSelect');
  audioSensSlider         = select('#audioSensSlider');
  audioSmoothSlider       = select('#audioSmoothSlider');
  audioBassTargetSelect   = select('#audioBassTargetSelect');
  audioMidTargetSelect    = select('#audioMidTargetSelect');
  audioTrebleTargetSelect = select('#audioTrebleTargetSelect');
  audioAmtSlider          = select('#audioAmtSlider');
  audioStartBtn.mousePressed(startAudio);

  vidPlayPauseBtn = select("#vidPlayPauseBtn");
  vidPlayPauseBtn.mousePressed(() => {
    if (!uploadedMedia || uploadedType !== 'video') return;
    const v = uploadedMedia.elt;
    if (v.paused) { v.play(); vidPlayPauseBtn.html('\u23F8'); }
    else          { v.pause(); vidPlayPauseBtn.html('\u25B6'); }
  });
  vidLoopChk = select("#vidLoopChk");
  vidLoopChk.changed(() => {
    if (uploadedMedia && uploadedType === 'video')
      uploadedMedia.elt.loop = vidLoopChk.elt.checked;
  });
  vidScrubber = select("#vidScrubber");
  vidScrubber.elt.addEventListener('mousedown', () => { vidScrubbing = true; });
  vidScrubber.elt.addEventListener('touchstart', () => { vidScrubbing = true; }, { passive: true });
  vidScrubber.elt.addEventListener('input', () => {
    if (!uploadedMedia || uploadedType !== 'video') return;
    const v = uploadedMedia.elt;
    const t = (Number(vidScrubber.value()) / 1000) * v.duration;
    if (isFinite(t)) v.currentTime = t;
  });
  window.addEventListener('mouseup',  () => { vidScrubbing = false; });
  window.addEventListener('touchend', () => { vidScrubbing = false; });
  vidTimeLabel = select("#vidTimeLabel");

  const controlsDiv = select("#controls");
  controlsDiv.mouseOver(() => controlsHovering = true);
  controlsDiv.mouseOut (() => controlsHovering = false);

  mediaInput.changed(handleMediaUpload);

  // Native drag-and-drop on the GPU canvas
  canvas.addEventListener('dragover', e => e.preventDefault());
  canvas.addEventListener('drop', e => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    if (file.type.startsWith('image/'))      _loadDroppedImage(url, file.name);
    else if (file.type.startsWith('video/')) _loadDroppedVideo(url);
  });

  // Left-drag  → tilt X/Y   |   Right-drag → pan (offset X/Y)
  {
    let dragging = false, dragButton = -1, lastX = 0, lastY = 0;

    canvas.addEventListener('contextmenu', e => { if (mouseInteractionEnabled) e.preventDefault(); });

    canvas.addEventListener('mousedown', e => {
      if (!mouseInteractionEnabled) return;
      if (e.button !== 0 && e.button !== 2) return;
      dragging    = true;
      dragButton  = e.button;
      lastX       = e.clientX;
      lastY       = e.clientY;
      e.preventDefault();
    });

    window.addEventListener('mousemove', e => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;

      if (dragButton === 0) {
        // Left-drag: tilt.  1 px cursor = 0.5° tilt.
        const txEl = document.getElementById('tiltXSlider');
        const tyEl = document.getElementById('tiltYSlider');
        txEl.value = Math.max(-180, Math.min(180, Number(txEl.value) + dy * 0.5));
        tyEl.value = Math.max(-180, Math.min(180, Number(tyEl.value) + dx * 0.5));
        // Mirror back into p5 select wrapper so renderLoop reads it correctly
        tiltXSlider.elt.value = txEl.value;
        tiltYSlider.elt.value = tyEl.value;
      } else if (dragButton === 2) {
        // Right-drag: pan.  1 px cursor ≈ 1 unit offset.
        const oxEl = document.getElementById('offsetXSlider');
        const oyEl = document.getElementById('offsetYSlider');
        oxEl.value = Math.max(-300, Math.min(300, Number(oxEl.value) + dx));
        oyEl.value = Math.max(-300, Math.min(300, Number(oyEl.value) + dy));
        offsetXSlider.elt.value = oxEl.value;
        offsetYSlider.elt.value = oyEl.value;
      }
    });

    window.addEventListener('mouseup', () => { dragging = false; });

    // Scroll-to-zoom: wheel on the GPU canvas adjusts the Scale slider
    canvas.addEventListener('wheel', e => {
      if (!mouseInteractionEnabled) return;
      e.preventDefault();
      const sEl = document.getElementById('scaleSlider');
      // Use delta matching the slider step (0.1) and round to avoid
      // IEEE 754 drift (e.g. 2.3+0.05 = 2.3499... snaps back to 2.3 forever).
      const raw  = Number(sEl.value) - Math.sign(e.deltaY) * 0.1;
      const next = Math.round(Math.max(Number(sEl.min), Math.min(Number(sEl.max), raw)) * 100) / 100;
      sEl.value             = next;
      scaleSlider.elt.value = next;
    }, { passive: false });
  }

  navigator.mediaDevices.enumerateDevices().then(devices => {
    const videoDevices = devices.filter(d => d.kind === 'videoinput');
    videoDevices.forEach((device, i) => {
      const option = createElement('option', device.label || `Camera ${i + 1}`);
      option.attribute('value', device.deviceId);
      camSelect.child(option);
    });
    selectedDeviceId = videoDevices[0]?.deviceId;
    startCam(selectedDeviceId);
  });

  camSelect.changed(() => {
    selectedDeviceId = camSelect.value();
    if (cam) cam.remove();
    uploadedMedia = null; uploadedType = null; currentSourceReady = false;
    startCam(selectedDeviceId);
  });

  if (navigator.requestMIDIAccess) navigator.requestMIDIAccess().then(onMIDISuccess);

  requestAnimationFrame(renderLoop);
}

// p5 draw() is intentionally empty -- rendering happens in renderLoop()
function draw() {}

// --- Hotkeys ----------------------------------------------------------------
function keyPressed() {
  // M  →  toggle canvas mouse interaction (drag/scroll/right-click)
  if (key === 'm' || key === 'M') {
    mouseInteractionEnabled = !mouseInteractionEnabled;
    showToast(mouseInteractionEnabled ? 'Mouse interaction ON' : 'Mouse interaction OFF (M to re-enable)');
    return false; // prevent browser default
  }
}

function showToast(msg) {
  let t = document.getElementById('_hotkeyToast');
  if (!t) {
    t = document.createElement('div');
    t.id = '_hotkeyToast';
    Object.assign(t.style, {
      position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)',
      background: 'rgba(0,0,0,0.75)', color: '#fff', padding: '8px 18px',
      borderRadius: '6px', fontSize: '14px', pointerEvents: 'none',
      zIndex: 9999, transition: 'opacity 0.4s'
    });
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.opacity = '1';
  clearTimeout(t._tid);
  t._tid = setTimeout(() => { t.style.opacity = '0'; }, 2000);
}

// --- Video scrub state ------------------------------------------------------
let vidPlayPauseBtn, vidLoopChk, vidScrubber, vidTimeLabel;
let vidScrubbing = false;

function fmtTime(s) {
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return m + ':' + String(sec).padStart(2, '0');
}

function showVideoControls(vid) {
  document.getElementById('videoControls').style.display = '';
  document.getElementById('videoScrubGroup').style.display = '';
  vidPlayPauseBtn.html(vid.elt.paused ? '\u25B6' : '\u23F8');
  vidLoopChk.elt.checked = vid.elt.loop;
}

function hideVideoControls() {
  document.getElementById('videoControls').style.display = 'none';
  document.getElementById('videoScrubGroup').style.display = 'none';
}

// --- Audio capture -----------------------------------------------------------
function startAudio() {
  if (audioCtx) { stopAudio(); return; }
  const srcMode = audioSourceSelect.value();
  const prom = srcMode === 'mic'
    ? navigator.mediaDevices.getUserMedia({ audio: true, video: false })
    : navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
  prom.then(stream => {
    audioStream = stream;
    stream.getVideoTracks().forEach(t => t.stop()); // drop video – we only need audio
    audioCtx      = new AudioContext();
    audioAnalyser = audioCtx.createAnalyser();
    audioAnalyser.fftSize = 1024;
    audioAnalyser.smoothingTimeConstant = 0; // we apply per-frame EMA ourselves
    audioDataArray = new Float32Array(audioAnalyser.frequencyBinCount);
    audioCtx.createMediaStreamSource(stream).connect(audioAnalyser);
    audioStartBtn.html('Stop Audio');
    document.getElementById('audioMeterGroup').style.opacity = '1';
  }).catch(e => {
    console.error('Audio capture error:', e);
    showToast('Audio capture failed – ' + e.message);
  });
}

function stopAudio() {
  if (audioStream) { audioStream.getTracks().forEach(t => t.stop()); audioStream = null; }
  if (audioCtx)   { audioCtx.close(); audioCtx = null; }
  audioAnalyser = null; audioDataArray = null;
  audioBass = audioMid = audioTreble = 0;
  audioStartBtn.html('Start');
  document.getElementById('audioMeterGroup').style.opacity = '0.4';
}

function updateAudioBands() {
  if (!audioAnalyser || !audioDataArray) return;
  audioAnalyser.getFloatFrequencyData(audioDataArray);
  const binHz  = audioCtx.sampleRate / (audioAnalyser.frequencyBinCount * 2);
  const sens   = Number(audioSensSlider.value());
  const smooth = Number(audioSmoothSlider.value());
  function bandEnergy(loHz, hiHz) {
    const lo = Math.max(1, Math.floor(loHz / binHz));
    const hi = Math.min(audioAnalyser.frequencyBinCount - 1, Math.ceil(hiHz / binHz));
    let sum = 0, n = 0;
    for (let i = lo; i <= hi; i++) { sum += Math.pow(10, audioDataArray[i] / 20); n++; }
    return n > 0 ? sum / n : 0;
  }
  const rb = Math.min(1, bandEnergy(60,   250)  * sens);
  const rm = Math.min(1, bandEnergy(250,  2000) * sens);
  const rt = Math.min(1, bandEnergy(2000, 8000) * sens);
  audioBass   = audioBass   * smooth + rb * (1 - smooth);
  audioMid    = audioMid    * smooth + rm * (1 - smooth);
  audioTreble = audioTreble * smooth + rt * (1 - smooth);
}

function renderLoop() {
  requestAnimationFrame(renderLoop);

  let src = null;
  if (uploadedMedia && currentSourceReady) src = uploadedMedia;
  else if (cam && currentSourceReady)      src = cam;
  if (!src || !src.width || !src.height)   return;

  // Read controls
  const baseDepth  = Number(depthSlider.value());
  const baseTiltX  = (Number(tiltXSlider.value()) + 90) * Math.PI / 180;
  const baseTiltY  = Number(tiltYSlider.value()) * Math.PI / 180;
  const baseScale  = Number(scaleSlider.value());
  const step       = Math.max(1, Math.floor(Number(densitySlider.value()) / 2));

  const lfoFreq        = Number(lfoFreqSlider.value());
  const lfoAmp         = Number(lfoAmpSlider.value());
  const lfoType        = lfoTypeSelector.value();
  const lfoPhaseOffset = Number(lfoPhaseOffsetSlider.value());
  const lfo = getLFOValue(lfoType, lfoFreq, lfoPhaseOffset);

  let depth  = baseDepth + (lfoDepth.checked() ? lfo * 300 * lfoAmp : 0);
  const tiltX  = baseTiltX + (lfoTiltX.checked() ? lfo * Math.PI * lfoAmp : 0);
  const tiltY  = baseTiltY + (lfoTiltY.checked() ? lfo * Math.PI * lfoAmp : 0);
  let scl    = baseScale + (lfoScale.checked() ? lfo * 1.5 * lfoAmp : 0);

  let shapeX    = Math.max(-1, Math.min(1, (Number(shapeXSlider.value()) + (lfoShapeX.checked()  ? lfo * 50 * lfoAmp : 0)) / 100));
  let shapeY    = Math.max(-1, Math.min(1, (Number(shapeYSlider.value()) + (lfoShapeY.checked()  ? lfo * 50 * lfoAmp : 0)) / 100));
  let waveAmp   = Number(waveAmpSlider.value()) + (lfoWaveAmp.checked() ? lfo * 200 * lfoAmp : 0);
  const waveFreqX = Math.max(0, Number(waveFreqXSlider.value()) + (lfoWaveFreqX.checked() ? lfo * 20 * lfoAmp : 0));
  const waveFreqY = Math.max(0, Number(waveFreqYSlider.value()) + (lfoWaveFreqY.checked() ? lfo * 20 * lfoAmp : 0));

  const horizAmp = Math.max(0, Number(horizAmpSlider.value()) + (lfoHorizAmp.checked() ? lfo * 0.5 * lfoAmp : 0));
  const vertAmp  = Math.max(0, Number(vertAmpSlider.value())  + (lfoVertAmp.checked()  ? lfo * 0.5 * lfoAmp : 0));

  const offsetX  = Number(offsetXSlider.value()) + (lfoOffsetX.checked() ? lfo * 100 * lfoAmp : 0);
  const offsetY  = Number(offsetYSlider.value()) + (lfoOffsetY.checked() ? lfo * 100 * lfoAmp : 0);

  const gamma       = Math.max(0.01, Number(gammaSlider.value()));
  const chromaShift = Number(chromaSlider.value());
  const sheen       = Number(sheenSlider.value());
  const contact     = Number(contactSlider.value());
  let fog         = Number(fogSlider.value());
  const fogInvert   = fogInvertChk.elt.checked ? 1 : 0;
  const bloomAmt       = Number(bloomSlider.value());
  const depthColorize  = Number(depthColorizeSlider.value());
  const depthColorPalette = parseInt(depthColorPaletteSelect.value());
  let hueShift    = Number(hueShiftSlider.value()) + (lfoHueShift.checked() ? lfo * 180 * lfoAmp : 0);
  let saturation  = Math.max(0, Number(satSlider.value())   + (lfoSat.checked()     ? lfo * 1.0 * lfoAmp : 0));
  const depthMin    = Number(depthMinSlider.value()) / 100.0;
  const depthMax    = Number(depthMaxSlider.value()) / 100.0;
  const invertDepth = invertDepthChk.elt.checked ? 1 : 0;
  const colorSmooth = colorSmoothChk.elt.checked ? 1 : 0;
  const scanMode    = scanModeSelect.value();
  const temporal    = Number(temporalSlider.value());
  const depthSmooth = Number(depthSmoothSlider.value());
  const fovDeg      = Number(fovSlider.value());
  const lightAmt    = Number(lightAmtSlider.value());
  const lightAz     = Number(lightAzSlider.value()) * Math.PI / 180.0;
  const lightEl     = Number(lightElSlider.value()) * Math.PI / 180.0;
  const lineWidth   = Number(lineWidthSlider.value());

  // --- Audio reactivity -------------------------------------------------------
  updateAudioBands();
  {
    const audioAmt = Number(audioAmtSlider.value());
    const _ab = (target, band) => {
      const a = band * audioAmt;
      if      (target === 'depth')    depth      += a * 300;
      else if (target === 'waveAmp')  waveAmp    += a * 200;
      else if (target === 'shapeX')   shapeX      = Math.max(-1, Math.min(1, shapeX + a));
      else if (target === 'shapeY')   shapeY      = Math.max(-1, Math.min(1, shapeY + a));
      else if (target === 'hueShift') hueShift   += a * 180;
      else if (target === 'sat')      saturation  = Math.max(0, saturation + a);
      else if (target === 'scale')    scl        += a * 1.5;
      else if (target === 'fog')      fog         = Math.min(1, fog + a);
    };
    _ab(audioBassTargetSelect.value(),   audioBass);
    _ab(audioMidTargetSelect.value(),    audioMid);
    _ab(audioTrebleTargetSelect.value(), audioTreble);
  }

  // Update video scrubber
  if (uploadedType === 'video' && uploadedMedia) {
    const v = uploadedMedia.elt;
    if (!vidScrubbing && isFinite(v.duration) && v.duration > 0) {
      vidScrubber.elt.value = Math.round((v.currentTime / v.duration) * 1000);
    }
    if (isFinite(v.duration))
      vidTimeLabel.html(fmtTime(v.currentTime) + ' / ' + fmtTime(v.duration));
    vidPlayPauseBtn.html(v.paused ? '\u25B6' : '\u23F8');
  }

  select("#depthLabel").html(depth.toFixed(0));
  select("#tiltXLabel").html(Number(tiltXSlider.value()) + "\u00B0");
  select("#tiltYLabel").html(tiltYSlider.value() + "\u00B0");
  select("#scaleLabel").html(scl.toFixed(2));
  select("#densityLabel").html(step);
  select("#shapeXLabel").html(Math.round(shapeX * 100));
  select("#shapeYLabel").html(Math.round(shapeY * 100));
  select("#waveAmpLabel").html(waveAmp.toFixed(1));
  select("#waveFreqXLabel").html(waveFreqX.toFixed(1));
  select("#waveFreqYLabel").html(waveFreqY.toFixed(1));
  select("#gammaLabel").html(gamma.toFixed(1));
  select("#chromaLabel").html(chromaShift.toFixed(3));
  select("#sheenLabel").html(sheen.toFixed(2));
  select("#contactLabel").html(contact.toFixed(2));
  select("#fogLabel").html(fog.toFixed(2));
  select("#bloomLabel").html(bloomAmt.toFixed(2));
  select("#depthColorizeLabel").html(depthColorize.toFixed(2));
  select("#hueShiftLabel").html(Math.round(hueShift) + '\u00B0');
  select("#satLabel").html(saturation.toFixed(2));
  select("#depthMinLabel").html(Math.round(depthMin * 100) + '%');
  select("#depthMaxLabel").html(Math.round(depthMax * 100) + '%');
  select("#temporalLabel").html(temporal.toFixed(2));
  select("#depthSmoothLabel").html(depthSmooth.toFixed(1));
  select("#horizAmpLabel").html(horizAmp.toFixed(1));
  select("#vertAmpLabel").html(vertAmp.toFixed(1));
  select("#offsetXLabel").html(offsetX.toFixed(0));
  select("#offsetYLabel").html(offsetY.toFixed(0));
  select("#fovLabel").html(fovDeg + '\u00B0');
  select("#lightAmtLabel").html(lightAmt.toFixed(2));
  select("#lightAzLabel").html(Math.round(lightAz * 180 / Math.PI) + '\u00B0');
  select("#lightElLabel").html(Math.round(lightEl * 180 / Math.PI) + '\u00B0');
  select("#lineWidthLabel").html(lineWidth.toFixed(2));
  select("#lfoPhaseOffsetLabel").html(Math.round(lfoPhaseOffset) + '\u00B0');
  if (audioAnalyser) {
    const bar = v => '\u2581\u2582\u2583\u2584\u2585\u2586\u2587\u2588'[Math.min(7, Math.round(v * 7))];
    select('#audioMeterLabel').html('B' + bar(audioBass) + ' M' + bar(audioMid) + ' T' + bar(audioTreble));
  }
  select('#audioSensLabel').html(Number(audioSensSlider.value()).toFixed(1));
  select('#audioSmoothLabel').html(Number(audioSmoothSlider.value()).toFixed(2));
  select('#audioAmtLabel').html(Number(audioAmtSlider.value()).toFixed(2));
  // Smooth rotation
  rotX += (targetRotX - rotX) * 0.1;
  rotY += (targetRotY - rotY) * 0.1;

  const srcW = src.width, srcH = src.height;

  // Render at actual display pixels to eliminate Moiré from browser downscaling.
  {
    const gpuCanvas = window._gpuCanvas;
    const dpr     = window.devicePixelRatio || 1;
    const dispW   = gpuCanvas.clientWidth || 1280;
    const targetW = Math.min(3840, Math.max(320, Math.round(dispW * dpr)));
    const targetH = Math.round(targetW * 9 / 16);
    if (gpuCanvas.width !== targetW || gpuCanvas.height !== targetH) {
      gpuCanvas.width  = targetW;
      gpuCanvas.height = targetH;
      sceneCW = sceneCH = -1;        // force scene FBO rebuild
      bloomDims = [[-1,-1],[-1,-1]]; // force bloom FBO rebuild
    }
  }
  const CW = window._gpuCanvas.width;
  const CH = window._gpuCanvas.height;

  buildScanlineVBO(srcW, srcH, step);
  updateTexture(src);

  // --- Temporal smooth pass -------------------------------------------------
  // Build/rebuild smooth FBOs if source dimensions changed
  if (srcW !== smoothW || srcH !== smoothH) buildSmoothFBOs(srcW, srcH);

  const sWrite = smoothIdx ^ 1, sRead = smoothIdx;
  gl2.bindFramebuffer(gl2.FRAMEBUFFER, smoothFBO[sWrite]);
  gl2.viewport(0, 0, srcW, srcH);
  gl2.disable(gl2.DEPTH_TEST);
  gl2.useProgram(blendProg);
  gl2.activeTexture(gl2.TEXTURE0); gl2.bindTexture(gl2.TEXTURE_2D, srcTexture);
  gl2.uniform1i(gl2.getUniformLocation(blendProg, 'u_cur'),  0);
  gl2.activeTexture(gl2.TEXTURE1); gl2.bindTexture(gl2.TEXTURE_2D, smoothTex[sRead]);
  gl2.uniform1i(gl2.getUniformLocation(blendProg, 'u_prev'), 1);
  gl2.uniform1f(gl2.getUniformLocation(blendProg, 'u_alpha'), temporal);
  gl2.bindVertexArray(quadVAO);
  gl2.drawArrays(gl2.TRIANGLE_STRIP, 0, 4);
  smoothIdx = sWrite;

  // --- Depth blur pass (spatial smoothing of displacement texture) ----------
  let depthTexForDisplace = smoothTex[smoothIdx];
  if (depthSmooth > 0) {
    if (srcW !== depthBlurW || srcH !== depthBlurH) buildDepthBlurFBOs(srcW, srcH);
    gl2.bindVertexArray(quadVAO);
    gl2.useProgram(blurProg);
    const bul = name => name in blurUniCache
      ? blurUniCache[name]
      : (blurUniCache[name] = gl2.getUniformLocation(blurProg, name));
    const sr = depthSmooth / srcW;  // step radius in UV space
    gl2.viewport(0, 0, srcW, srcH);
    gl2.activeTexture(gl2.TEXTURE0);
    gl2.uniform1i(bul('u_tex'), 0);
    // H pass: smoothTex → depthBlurFBO[0]
    gl2.bindFramebuffer(gl2.FRAMEBUFFER, depthBlurFBO[0]);
    gl2.bindTexture(gl2.TEXTURE_2D, smoothTex[smoothIdx]);
    gl2.uniform2f(bul('u_dir'), sr, 0.0);
    gl2.drawArrays(gl2.TRIANGLE_STRIP, 0, 4);
    // V pass: depthBlurTex[0] → depthBlurFBO[1]
    gl2.bindFramebuffer(gl2.FRAMEBUFFER, depthBlurFBO[1]);
    gl2.bindTexture(gl2.TEXTURE_2D, depthBlurTex[0]);
    gl2.uniform2f(bul('u_dir'), 0.0, sr * srcW / srcH);
    gl2.drawArrays(gl2.TRIANGLE_STRIP, 0, 4);
    depthTexForDisplace = depthBlurTex[1];
  }

  // Build MVP matrix (mirrors original p5 WEBGL transforms)
  //   rotateX(rotX+tiltX) -> rotateY(rotY+tiltY) -> scale(scl*scaleFactor)
  //   translate(-bufW*horizAmp/2+offsetX, -bufH*vertAmp/2+offsetY)
  const bufAspect = srcW / srcH;
  const canAspect = CW / CH;
  const sf = (bufAspect > canAspect ? CW / srcW : CH / srcH);

  const centreX = -(srcW * horizAmp / 2) + offsetX;
  const centreY = -(srcH * vertAmp  / 2) + offsetY;

  // column-major: translate first (innermost), then rotations, then scale
  let m = trans4(centreX, centreY, 0);
  m = mat4Mul(rotX4(rotX + tiltX), m);
  m = mat4Mul(rotY4(rotY + tiltY), m);
  m = mat4Mul(scale4(scl * sf), m);

  // Projection: ortho at fov=0, perspective at fov>0
  const hw = CW / 2, hh = CH / 2;
  let proj;
  if (fovDeg < 0.5) {
    proj = new Float32Array([
      1/hw,  0,      0,       0,
      0,    -1/hh,   0,       0,
      0,     0,      1/10000, 0,
      0,     0,      0,       1
    ]);
  } else {
    const D = hh / Math.tan(fovDeg * Math.PI / 360.0);
    // column-major: clip_w = D - z  →  perspective divide gives x/(hw*(1-z/D))
    proj = new Float32Array([
      D/hw, 0,     0,        0,
      0,   -D/hh,  0,        0,
      0,    0,     D/10000, -1,
      0,    0,     0,        D
    ]);
  }

  const mvp = mat4Mul(proj, m);

  // Normal matrix: rotation only (no scale/translate) for surface lighting
  const rotOnly   = mat4Mul(rotX4(rotX + tiltX), rotY4(rotY + tiltY));
  const normalMat3 = new Float32Array([
    rotOnly[0], rotOnly[1], rotOnly[2],
    rotOnly[4], rotOnly[5], rotOnly[6],
    rotOnly[8], rotOnly[9], rotOnly[10]
  ]);
  const normalScale = (step > 0 && horizAmp > 0)
    ? Math.abs(depth) / (step * Math.max(horizAmp, 0.01))
    : 0.0;

  // --- Scene FBO: 2× SSAA — render at double display resolution so sub-pixel
  //     scan lines get proper coverage, then bilinear downsample in composite.
  //     Cap at 4K so we don't go nuts on very high-DPI displays.
  const ssaW = Math.min(3840, CW * 2);
  const ssaH = Math.min(2160, CH * 2);
  if (ssaW !== sceneCW || ssaH !== sceneCH) buildSceneFBO(ssaW, ssaH);

  // --- Main draw → sceneFBO ------------------------------------------------
  gl2.bindFramebuffer(gl2.FRAMEBUFFER, sceneFBO);
  gl2.viewport(0, 0, ssaW, ssaH);
  gl2.clearColor(0, 0, 0, 1);
  gl2.clear(gl2.COLOR_BUFFER_BIT | gl2.DEPTH_BUFFER_BIT);
  gl2.enable(gl2.DEPTH_TEST);
  gl2.depthFunc(gl2.LEQUAL);

  gl2.useProgram(prog);

  const ul = name => name in progUniCache
    ? progUniCache[name]
    : (progUniCache[name] = gl2.getUniformLocation(prog, name));
  gl2.uniformMatrix4fv(ul('u_mvp'),          false, mvp);
  gl2.uniform2f(ul('u_srcSize'),             srcW, srcH);
  gl2.uniform1f(ul('u_depth'),               depth);
  gl2.uniform2f(ul('u_horizVert'),           horizAmp, vertAmp);
  gl2.uniform1f(ul('u_gamma'),               gamma);
  gl2.uniform1f(ul('u_shapeX'),              shapeX);
  gl2.uniform1f(ul('u_shapeY'),              shapeY);
  gl2.uniform1f(ul('u_waveAmp'),             waveAmp);
  gl2.uniform1f(ul('u_waveFreqX'),           waveFreqX);
  gl2.uniform1f(ul('u_waveFreqY'),           waveFreqY);
  gl2.uniform1f(ul('u_chromaShift'),         chromaShift);
  gl2.uniform1f(ul('u_sheen'),               sheen);
  gl2.uniform1f(ul('u_contactShadow'),       contact);
  gl2.uniform1f(ul('u_rowStep'),             step / srcH);
  gl2.uniform1f(ul('u_colStep'),             step / srcW);
  gl2.uniform1f(ul('u_fog'),                 fog);
  gl2.uniform1i(ul('u_fogInvert'),           fogInvert);
  gl2.uniform1f(ul('u_hueShift'),            hueShift * Math.PI / 180.0);
  gl2.uniform1f(ul('u_saturation'),          saturation);
  gl2.uniform1f(ul('u_depthMin'),            depthMin);
  gl2.uniform1f(ul('u_depthMax'),            depthMax);
  gl2.uniform1i(ul('u_invertDepth'),         invertDepth);
  gl2.uniform1i(ul('u_colorSmooth'),         colorSmooth);
  gl2.uniformMatrix3fv(ul('u_normalMat'),    false, normalMat3);
  gl2.uniform1f(ul('u_normalScale'),         normalScale);
  gl2.uniform1f(ul('u_lightAmt'),            lightAmt);
  gl2.uniform1f(ul('u_lightAz'),             lightAz);
  gl2.uniform1f(ul('u_lightEl'),             lightEl);
  gl2.uniform1f(ul('u_depthColorize'),       depthColorize);
  gl2.uniform1i(ul('u_depthColorPalette'),   depthColorPalette);
  // tube fill: lineWidth sets base gap fraction; sheen shrinks it toward 19% (tight 3D line)
  const tubeFill       = lineWidth * (1.0 - Math.min(sheen, 1.0) * 0.81);
  const tubeHalfNDC    = (step * scl * sf * vertAmp)  / (CH / 2) * tubeFill;
  const tubeHalfColNDC = (step * scl * sf * horizAmp) / (CW / 2) * tubeFill;

  gl2.activeTexture(gl2.TEXTURE0);
  gl2.bindTexture(gl2.TEXTURE_2D, srcTexture);
  gl2.uniform1i(ul('u_tex'), 0);
  gl2.activeTexture(gl2.TEXTURE1);
  gl2.bindTexture(gl2.TEXTURE_2D, depthTexForDisplace);
  gl2.uniform1i(ul('u_depthTex'), 1);

  // Horizontal scanlines
  if (scanMode !== 'V' && scanMode !== 'P') {
    gl2.uniform1f(ul('u_tubeAxis'),  0.0);
    gl2.uniform1f(ul('u_tubeWidth'), tubeHalfNDC);
    gl2.bindVertexArray(vao);
    for (let i = 0; i < rowCounts.length; i++)
      gl2.drawArrays(gl2.TRIANGLE_STRIP, rowOffsets[i], rowCounts[i]);
    gl2.bindVertexArray(null);
  }

  // Vertical scan columns
  if (scanMode !== 'H' && scanMode !== 'P') {
    buildColumnVBO(srcW, srcH, step);
    gl2.uniform1f(ul('u_tubeAxis'),  1.0);
    gl2.uniform1f(ul('u_tubeWidth'), tubeHalfColNDC);
    gl2.bindVertexArray(colVAO);
    for (let i = 0; i < colCounts.length; i++)
      gl2.drawArrays(gl2.TRIANGLE_STRIP, colOffsets[i], colCounts[i]);
    gl2.bindVertexArray(null);
  }

  // Polar (radial) scan
  if (scanMode === 'P') {
    buildPolarVBO(srcW, srcH, step);
    gl2.uniform1f(ul('u_tubeAxis'),  0.0);  // H-convention for contact shadow
    gl2.uniform1f(ul('u_tubeWidth'), tubeHalfNDC);
    gl2.bindVertexArray(polVAO);
    for (let i = 0; i < polCounts.length; i++)
      gl2.drawArrays(gl2.TRIANGLE_STRIP, polOffsets[i], polCounts[i]);
    gl2.bindVertexArray(null);
  }

  // --- Bloom: two-level pyramid (skip blur passes when bloomAmt ≈ 0) ----------
  const bw0 = Math.max(1, Math.floor(CW / 4));
  const bh0 = Math.max(1, Math.floor(CH / 4));
  const bw1 = Math.max(1, Math.floor(CW / 8));
  const bh1 = Math.max(1, Math.floor(CH / 8));
  if (bloomDims[0][0] !== bw0 || bloomDims[0][1] !== bh0) buildBloomLevel(0, bw0, bh0);
  if (bloomDims[1][0] !== bw1 || bloomDims[1][1] !== bh1) buildBloomLevel(1, bw1, bh1);

  if (bloomAmt > 0.001) {
    gl2.disable(gl2.DEPTH_TEST);
    gl2.bindVertexArray(quadVAO);
    gl2.useProgram(blurProg);
    const bul = name => name in blurUniCache
      ? blurUniCache[name]
      : (blurUniCache[name] = gl2.getUniformLocation(blurProg, name));
    gl2.activeTexture(gl2.TEXTURE0);
    gl2.uniform1i(bul('u_tex'), 0);
    // Level 0 H: sceneTex → bloomFBO[0][0]
    gl2.bindFramebuffer(gl2.FRAMEBUFFER, bloomFBO[0][0]);
    gl2.viewport(0, 0, bw0, bh0);
    gl2.bindTexture(gl2.TEXTURE_2D, sceneTex);
    gl2.uniform2f(bul('u_dir'), 1.0/bw0, 0.0);
    gl2.drawArrays(gl2.TRIANGLE_STRIP, 0, 4);
    // Level 0 V: bloomTex[0][0] → bloomFBO[0][1]
    gl2.bindFramebuffer(gl2.FRAMEBUFFER, bloomFBO[0][1]);
    gl2.bindTexture(gl2.TEXTURE_2D, bloomTex[0][0]);
    gl2.uniform2f(bul('u_dir'), 0.0, 1.0/bh0);
    gl2.drawArrays(gl2.TRIANGLE_STRIP, 0, 4);
    // Level 1 H: bloomTex[0][1] → bloomFBO[1][0]
    gl2.bindFramebuffer(gl2.FRAMEBUFFER, bloomFBO[1][0]);
    gl2.viewport(0, 0, bw1, bh1);
    gl2.bindTexture(gl2.TEXTURE_2D, bloomTex[0][1]);
    gl2.uniform2f(bul('u_dir'), 1.0/bw1, 0.0);
    gl2.drawArrays(gl2.TRIANGLE_STRIP, 0, 4);
    // Level 1 V: bloomTex[1][0] → bloomFBO[1][1]
    gl2.bindFramebuffer(gl2.FRAMEBUFFER, bloomFBO[1][1]);
    gl2.bindTexture(gl2.TEXTURE_2D, bloomTex[1][0]);
    gl2.uniform2f(bul('u_dir'), 0.0, 1.0/bh1);
    gl2.drawArrays(gl2.TRIANGLE_STRIP, 0, 4);
  }

  // --- Composite scene + bloom → default FBO --------------------------------
  gl2.bindFramebuffer(gl2.FRAMEBUFFER, null);
  gl2.viewport(0, 0, CW, CH);
  gl2.disable(gl2.DEPTH_TEST);
  gl2.bindVertexArray(quadVAO);
  gl2.useProgram(compositeProg);
  const cul = name => name in compUniCache
    ? compUniCache[name]
    : (compUniCache[name] = gl2.getUniformLocation(compositeProg, name));
  gl2.activeTexture(gl2.TEXTURE0); gl2.bindTexture(gl2.TEXTURE_2D, sceneTex);
  gl2.uniform1i(cul('u_scene'), 0);
  gl2.activeTexture(gl2.TEXTURE1); gl2.bindTexture(gl2.TEXTURE_2D, bloomTex[0][1]);
  gl2.uniform1i(cul('u_bloom0'), 1);
  gl2.activeTexture(gl2.TEXTURE2); gl2.bindTexture(gl2.TEXTURE_2D, bloomTex[1][1]);
  gl2.uniform1i(cul('u_bloom1'), 2);
  gl2.uniform1f(cul('u_bloomAmt'), bloomAmt);
  gl2.drawArrays(gl2.TRIANGLE_STRIP, 0, 4);
  gl2.bindVertexArray(null);
}

// --- LFO ----------------------------------------------------------------------
function getLFOValue(type, freq, phaseOffset) {
  lfoPhase += freq * 0.01;
  if (lfoPhase > 1) lfoPhase -= 1;
  const p = (lfoPhase + (phaseOffset || 0) / 360.0) % 1.0;
  switch (type) {
    case 'saw': return p * 2.0 - 1.0;
    case 'sin': return Math.sin(Math.PI * 2 * p);
    case 'tri': return Math.abs(p * 4 - 2) - 1;
    default: return 0;
  }
}

// --- Camera / media ----------------------------------------------------------
function startCam(deviceId) {
  uploadedMedia = null; uploadedType = null; currentSourceReady = false;
  if (cam) cam.remove();
  cam = createCapture({ video: { deviceId: { exact: deviceId } } }, () => {
    cam.size(640, 480); cam.hide(); currentSourceReady = true;
  });
  cam.elt.onloadedmetadata = () => { currentSourceReady = true; };
  cam.elt.onerror = e => { console.error('Camera error:', e); currentSourceReady = false; cam = null; };
}

function _isTiff(typeOrName) {
  return /tiff?$/i.test(typeOrName) || typeOrName === 'image/tiff';
}

// Decode a TIFF from a URL (blob: or object URL) using UTIF, resize to 640x480,
// then store as a plain canvas object that updateTexture() can upload.
function _loadTiff(url, onReady) {
  fetch(url)
    .then(r => r.arrayBuffer())
    .then(buf => {
      const ifds = UTIF.decode(buf);
      UTIF.decodeImage(buf, ifds[0]);
      const ifd  = ifds[0];
      const rgba = UTIF.toRGBA8(ifd);
      // Draw full-res onto a temp canvas
      const tmp  = document.createElement('canvas');
      tmp.width  = ifd.width;
      tmp.height = ifd.height;
      const tctx = tmp.getContext('2d');
      const id   = tctx.createImageData(ifd.width, ifd.height);
      id.data.set(rgba);
      tctx.putImageData(id, 0, 0);
      // Resize to 640x480 into a second canvas
      const out  = document.createElement('canvas');
      out.width  = 640;
      out.height = 480;
      out.getContext('2d').drawImage(tmp, 0, 0, 640, 480);
      onReady(out);
    })
    .catch(e => console.error('TIFF load error:', e));
}

function handleMediaUpload() {
  if (!mediaInput.elt.files.length) return;
  const file = mediaInput.elt.files[0];
  if (file.type.startsWith('image/')) {
    handleImageUpload(file);
  } else if (file.type.startsWith('video/')) {
    handleVideoUpload(file);
  }
}

function handleImageUpload(file) {
  currentSourceReady = false;
  if (cam) { cam.remove(); cam = null; }
  uploadedMedia = null; uploadedType = null;
  hideVideoControls();
  const url = URL.createObjectURL(file);
  if (_isTiff(file.type) || _isTiff(file.name)) {
    _loadTiff(url, canvas => {
      uploadedMedia = canvas; uploadedType = 'image'; currentSourceReady = true;
    });
    return;
  }
  loadImage(url, img => {
    img.resize(640, 480);
    uploadedMedia = img; uploadedType = 'image'; currentSourceReady = true;
  }, e => console.error('Image error:', e));
}

function resetParams() {
  const defaults = [
    ['#depthSlider',         '0'],
    ['#depthMinSlider',      '0'],
    ['#depthMaxSlider',      '100'],
    ['#tiltXSlider',         '0'],
    ['#tiltYSlider',         '0'],
    ['#scaleSlider',         '1'],
    ['#densitySlider',       '6'],
    ['#gammaSlider',         '2.2'],
    ['#chromaSlider',        '0'],
    ['#sheenSlider',         '0'],
    ['#contactSlider',       '0'],
    ['#fogSlider',           '0'],
    ['#bloomSlider',         '0'],
    ['#hueShiftSlider',      '0'],
    ['#satSlider',           '1'],
    ['#depthSmoothSlider',   '0'],
    ['#temporalSlider',      '1'],
    ['#shapeXSlider',        '0'],
    ['#shapeYSlider',        '0'],
    ['#waveAmpSlider',       '0'],
    ['#waveFreqXSlider',     '0'],
    ['#waveFreqYSlider',     '0'],
    ['#horizAmpSlider',      '1'],
    ['#vertAmpSlider',       '1'],
    ['#offsetXSlider',       '0'],
    ['#offsetYSlider',       '0'],
    ['#lfoFreq',             '0.3'],
    ['#lfoAmp',              '0.5'],
    ['#lfoPhaseOffsetSlider','0'],
    ['#fovSlider',           '0'],
    ['#lightAmtSlider',      '0'],
    ['#lightAzSlider',       '45'],
    ['#lightElSlider',       '45'],
    ['#lineWidthSlider',     '0.48'],
    ['#depthColorizeSlider', '0'],
    ['#audioSensSlider',     '5'],
    ['#audioSmoothSlider',   '0.8'],
    ['#audioAmtSlider',      '1'],
  ];
  defaults.forEach(([sel, val]) => { document.querySelector(sel).value = val; });
  document.querySelector('#scanModeSelect').value = 'H';
  document.querySelector('#depthColorPaletteSelect').value = '0';
  document.querySelector('#lfoType').value        = 'saw';
  ['#invertDepthChk','#fogInvertChk','#colorSmoothChk'].forEach(sel => {
    document.querySelector(sel).checked = false;
  });
  ['#lfoDepth','#lfoTiltX','#lfoTiltY','#lfoScale',
   '#lfoShapeX','#lfoShapeY','#lfoWaveAmp','#lfoWaveFreqX','#lfoWaveFreqY',
   '#lfoHorizAmp','#lfoVertAmp','#lfoOffsetX','#lfoOffsetY','#lfoHueShift','#lfoSat']
    .forEach(sel => { document.querySelector(sel).checked = false; });
}

function handleVideoUpload(file) {
  currentSourceReady = false;
  if (cam) { cam.remove(); cam = null; }
  uploadedMedia = null; uploadedType = null;
  const vid = createVideo([URL.createObjectURL(file)]);
  vid.elt.onloadedmetadata = () => {
    if (vid.elt.videoWidth === 0 || vid.elt.videoHeight === 0) {
      console.error('Video codec not supported by this browser (videoWidth=0). Try MP4/H.264.');
      uploadedMedia = null; currentSourceReady = false; return;
    }
    vid.size(640, 480); vid.hide(); vid.loop(); vid.volume(0);
    uploadedMedia = vid; uploadedType = 'video'; currentSourceReady = true;
    showVideoControls(vid);
  };
  vid.elt.onerror = e => { console.error('Video error:', e); currentSourceReady = false; uploadedMedia = null; };
  vid.elt.load();
}

function _loadDroppedImage(url, fileName) {
  currentSourceReady = false;
  if (cam) { cam.remove(); cam = null; }
  uploadedMedia = null; uploadedType = null;
  if (fileName && (_isTiff(fileName))) {
    _loadTiff(url, canvas => {
      uploadedMedia = canvas; uploadedType = 'image'; currentSourceReady = true;
    });
    return;
  }
  loadImage(url, img => {
    img.resize(640, 480);
    uploadedMedia = img; uploadedType = 'image'; currentSourceReady = true;
  }, e => console.error('Drop image error:', e));
}

function _loadDroppedVideo(url) {
  currentSourceReady = false;
  if (cam) { cam.remove(); cam = null; }
  uploadedMedia = null; uploadedType = null;
  const vid = createVideo([url]);
  vid.elt.onloadedmetadata = () => {
    if (vid.elt.videoWidth === 0 || vid.elt.videoHeight === 0) {
      console.error('Video codec not supported by this browser (videoWidth=0). Try MP4/H.264.');
      uploadedMedia = null; currentSourceReady = false; return;
    }
    vid.size(640, 480); vid.hide(); vid.loop(); vid.volume(0);
    uploadedMedia = vid; uploadedType = 'video'; currentSourceReady = true;
    showVideoControls(vid);
  };
  vid.elt.onerror = e => { console.error('Drop video error:', e); currentSourceReady = false; uploadedMedia = null; };
  vid.elt.load();
}

// Legacy p5 drop handler -- superseded by native listener
function handleFileDrop() {}

// --- Export ------------------------------------------------------------------
function saveImage() {
  const canvas = window._gpuCanvas;
  if (!canvas) return;
  const a = document.createElement('a');
  a.download = 'rutt-etra-output.png';
  a.href = canvas.toDataURL('image/png');
  a.click();
}

// --- MIDI --------------------------------------------------------------------
function onMIDISuccess(midiAccess) {
  for (let input of midiAccess.inputs.values())
    input.onmidimessage = handleCustomMIDIMessage;
}

function handleCustomMIDIMessage(message) {
  const [, cc, val] = message.data;
  const midiMap = {
    120:'depthSlider', 121:'tiltXSlider', 122:'tiltYSlider',
    123:'scaleSlider', 124:'densitySlider', 125:'lfoFreq', 126:'lfoAmp',
     40:'shapeXSlider', 41:'shapeYSlider', 42:'waveAmpSlider',
     43:'waveFreqXSlider', 55:'waveFreqYSlider', 46:'gammaSlider',
     47:'horizAmpSlider', 48:'vertAmpSlider',
     51:'offsetXSlider', 52:'offsetYSlider',
     32:'lfoDepth', 33:'lfoTiltX', 34:'lfoTiltY', 35:'lfoScale',
     38:'lfoShapeX', 39:'lfoShapeY', 44:'lfoWaveAmp', 45:'lfoWaveFreqX',
     56:'lfoWaveFreqY', 49:'lfoHorizAmp', 50:'lfoVertAmp',
     53:'lfoOffsetX', 54:'lfoOffsetY'
  };
  const id = midiMap[cc];
  if (!id) return;
  const ctrl = select('#' + id);
  if (!ctrl) return;
  if (ctrl.elt.type === 'range') {
    const mn = Number(ctrl.elt.min), mx = Number(ctrl.elt.max);
    ctrl.value(mn + (val / 127) * (mx - mn));
  } else if (ctrl.elt.type === 'checkbox' && val > 0) {
    ctrl.elt.checked = !ctrl.elt.checked;
  }
}
