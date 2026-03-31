// sketch.js  -  GPU-accelerated Rutt-Etra renderer
// All per-pixel math (depth, gamma, wave warp, shape bend) runs in the
// vertex shader so the JS main loop is free of pixel iteration.

// --- p5 / media globals ------------------------------------------------------
let cam, uploadedMedia, uploadedType = null;

let depthSlider, tiltXSlider, tiltYSlider, scaleSlider, densitySlider;
let camSelect, imgInput, vidInput;

let lfoDepth, lfoTiltX, lfoTiltY, lfoScale, lfoFreqSlider, lfoAmpSlider, lfoTypeSelector;
let lfoShapeX, lfoShapeY, lfoWaveAmp, lfoWaveFreq;
let shapeXSlider, shapeYSlider;
let waveAmpSlider, waveFreqSlider;
let gammaSlider, gammaLabel;
let horizAmpSlider, vertAmpSlider;
let lfoHorizAmp, lfoVertAmp;
let offsetXSlider, offsetYSlider;
let lfoOffsetX, lfoOffsetY;

// --- FX globals --------------------------------------------------------------
let chromaSlider, sheenSlider, contactSlider, fogSlider, bloomSlider, paletteSelect, paletteAmtSlider, scanModeSelect, temporalSlider, depthSmoothSlider;

// Uniform location caches – populated on first use, valid for program lifetime
let progUniCache = {}, blurUniCache = {}, compUniCache = {};

let currentSourceReady = false;
let selectedDeviceId = null;
let controlsHovering = false;

let rotX = 30, rotY = 0;
let targetRotX = 30, targetRotY = 0;

let lfoPhase = 0;

let downloadBtn;
let currentFrameForExportInput, totalFramesForExportInput, startExportBtn, nextFrameBtn, currentFrameLabel;
let currentFrameForExport = 0;
let totalFramesForExport = 0;
let exportMode = false;

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
uniform float u_waveFreq;
uniform float u_chromaShift;
uniform float u_tubeWidth;
uniform float u_rowStep;       // one scanline step in UV-Y space
uniform float u_colStep;       // one column step in UV-X space (for vertical scan)
uniform float u_contactShadow; // 0=off, 1=full occlusion
uniform float u_tubeAxis;      // 0=horizontal (Y offset), 1=vertical (X offset)
uniform float u_fog;           // depth fog: darkens sunken lines

in float a_tubeT;

out vec4  v_color;
out float v_tubeT;
out float v_shadow;
out float v_z;                 // per-vertex brightness (fog driver)

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
  float r = texture(u_tex, vec2(clamp(a_uv.x - cs, 0.0, 1.0), a_uv.y)).r;
  vec4 texC = texture(u_tex, a_uv);
  float g = texC.g;
  float b = texture(u_tex, vec2(clamp(a_uv.x + cs, 0.0, 1.0), a_uv.y)).b;

  float bright = (r + g + b) / 3.0;
  // Sample smoothed texture for Z to reduce temporal jitter
  vec3 ds = texture(u_depthTex, a_uv).rgb;
  float brightDepth = (ds.r + ds.g + ds.b) / 3.0;
  float gammaBright = applyGamma(brightDepth, u_gamma);

  v_color = vec4(applyGamma(r, u_gamma),
                 applyGamma(g, u_gamma),
                 applyGamma(b, u_gamma),
                 1.0);
  v_tubeT = a_tubeT;

  // Inter-line contact shadow: sample 2 rows above and below, take the worst occlusion
  // Shadow sample direction: rows (Y) for horizontal scan, columns (X) for vertical
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

  float nx = a_uv.x;
  float ny = a_uv.y;

  float scaleWaveX = u_waveAmp * (sz.x / 640.0);
  float scaleWaveY = u_waveAmp * (sz.y / 480.0);
  float waveX = scaleWaveX * sin(ny * PI * 2.0 * u_waveFreq);
  float waveY = scaleWaveY * sin(nx * PI * 2.0 * u_waveFreq);

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

  float lon = (nx - 0.5) * PI * 2.0 * u_shapeX;   // -π..+π
  float lat = (ny - 0.5) * PI       * u_shapeY;    // -π/2..+π/2

  // Sphere surface positions (relative to raster centre)
  float sphX = Rx * cos(lat) * sin(lon);   // ← cos(lat) is what makes it a sphere
  float sphY = Ry * sin(lat);

  float px = W * 0.5 + mix((nx - 0.5) * W, sphX, u_shapeX) + waveX;
  float py = H * 0.5 + mix((ny - 0.5) * H, sphY, u_shapeY) + waveY;

  // Fold-back z: push wrapped edges away from the viewer.
  // foldZH is modulated by cos(lat) so the equatorial fold reduces near the poles.
  float foldZH = Rx * cos(lat) * (1.0 - cos(lon)) * u_shapeX;
  float foldZV = Ry * (1.0 - cos(lat))             * u_shapeY;
  float foldZ  = foldZH + foldZV;

  float depth = u_depth;
  float z = (gammaBright * 2.0 - 1.0) * abs(depth);
  if (depth < 0.0) z *= -1.0;
  z -= foldZ;

  vec4 clipPos = u_mvp * vec4(px, py, z, 1.0);
  clipPos.x += a_tubeT * u_tubeWidth *        u_tubeAxis;
  clipPos.y += a_tubeT * u_tubeWidth * (1.0 - u_tubeAxis);
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
uniform float u_sheen;
uniform float u_fog;
uniform int   u_palette;
uniform float u_paletteAmt;
out vec4 fragColor;

vec3 applyPalette(vec3 col, int pal) {
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  if (pal == 1) return mix(vec3(0.0), vec3(0.12, 1.0, 0.18), lum);   // phosphor green (P31)
  if (pal == 2) {                                                       // thermal
    if (lum < 0.25) return mix(vec3(0.0,0.0,0.0), vec3(0.5,0.0,0.8), lum * 4.0);
    if (lum < 0.5)  return mix(vec3(0.5,0.0,0.8), vec3(1.0,0.0,0.0), (lum-0.25)*4.0);
    if (lum < 0.75) return mix(vec3(1.0,0.0,0.0), vec3(1.0,0.6,0.0), (lum-0.5) *4.0);
                    return mix(vec3(1.0,0.6,0.0), vec3(1.0,1.0,0.8), (lum-0.75)*4.0);
  }
  if (pal == 3) return mix(vec3(0.0), vec3(0.04, 0.98, 0.90), lum);  // oscilloscope cyan
  if (pal == 4) return mix(vec3(0.0), vec3(1.0, 0.8, 0.5),   lum);   // sepia
  if (pal == 5) {                                                       // rainbow
    float h = lum * 6.0;
    float x = lum * (1.0 - abs(mod(h, 2.0) - 1.0));
    if (h < 1.0) return vec3(lum, x,   0.0);
    if (h < 2.0) return vec3(x,   lum, 0.0);
    if (h < 3.0) return vec3(0.0, lum, x  );
    if (h < 4.0) return vec3(0.0, x,   lum);
    if (h < 5.0) return vec3(x,   0.0, lum);
                 return vec3(lum, 0.0, x  );
  }
  return col;
}

void main() {
  float sint  = clamp(v_tubeT, -1.0, 1.0);
  vec3 N = vec3(0.0, sint, sqrt(max(0.0, 1.0 - sint*sint)));
  vec3 L = normalize(vec3(0.3, 0.7, 1.0));
  float diffuse = max(0.0, dot(N, L));
  float spec    = pow(max(0.0, N.z), 32.0);
  float shade   = mix(1.0, 0.50 + diffuse * 0.46 + spec * 0.30, clamp(u_sheen, 0.0, 1.0));
  vec3 lit = v_color.rgb * shade * v_shadow;
  // depth fog: dark/sunken lines fade fully to black
  lit *= (1.0 - u_fog * (1.0 - v_z));
  // color palette
  vec3 palCol = applyPalette(lit, u_palette);
  fragColor = vec4(clamp(mix(lit, palCol, u_paletteAmt), 0.0, 1.0), 1.0);
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
      uvs.push(nx, ny, -1.0);
      uvs.push(nx, ny,  1.0);
    }
    colCounts.push(rows * 2);
    offset += rows * 2;
  }
  gl2.bindVertexArray(colVAO);
  gl2.bindBuffer(gl2.ARRAY_BUFFER, colVBO);
  gl2.bufferData(gl2.ARRAY_BUFFER, new Float32Array(uvs), gl2.DYNAMIC_DRAW);
  const aUV   = gl2.getAttribLocation(prog, 'a_uv');
  gl2.enableVertexAttribArray(aUV);
  gl2.vertexAttribPointer(aUV, 2, gl2.FLOAT, false, 12, 0);
  const aTubeT = gl2.getAttribLocation(prog, 'a_tubeT');
  gl2.enableVertexAttribArray(aTubeT);
  gl2.vertexAttribPointer(aTubeT, 1, gl2.FLOAT, false, 12, 8);
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
      uvs.push(nx, ny, -1.0);  // tube top (NDC-down)
      uvs.push(nx, ny,  1.0);  // tube bottom (NDC-up)
    }
    rowCounts.push(cols * 2);
    offset += cols * 2;
  }

  gl2.bindVertexArray(vao);
  gl2.bindBuffer(gl2.ARRAY_BUFFER, lineVBO);
  gl2.bufferData(gl2.ARRAY_BUFFER, new Float32Array(uvs), gl2.DYNAMIC_DRAW);
  const aUV = gl2.getAttribLocation(prog, 'a_uv');
  gl2.enableVertexAttribArray(aUV);
  gl2.vertexAttribPointer(aUV, 2, gl2.FLOAT, false, 12, 0);
  const aTubeT = gl2.getAttribLocation(prog, 'a_tubeT');
  gl2.enableVertexAttribArray(aTubeT);
  gl2.vertexAttribPointer(aTubeT, 1, gl2.FLOAT, false, 12, 8);
  gl2.bindVertexArray(null);
}

// Upload source pixels to GPU texture each frame
function updateTexture(src) {
  gl2.bindTexture(gl2.TEXTURE_2D, srcTexture);
  // Row 0 of the source (top) lands at V=0 in the GL texture without any flip.
  // Our UV mapping also puts ny=0 at the screen top, so direct sampling is correct.
  gl2.pixelStorei(gl2.UNPACK_FLIP_Y_WEBGL, false);
  let elt = src.canvas ? src.canvas : (src.elt ? src.elt : src);
  try {
    gl2.texImage2D(gl2.TEXTURE_2D, 0, gl2.RGBA, gl2.RGBA, gl2.UNSIGNED_BYTE, elt);
  } catch (e) { /* video frame not ready yet */ }
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
  imgInput      = select("#imgInput");
  vidInput      = select("#vidInput");

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
  waveFreqSlider = select("#waveFreqSlider");

  lfoShapeX  = select("#lfoShapeX");
  lfoShapeY  = select("#lfoShapeY");
  lfoWaveAmp = select("#lfoWaveAmp");
  lfoWaveFreq= select("#lfoWaveFreq");

  gammaSlider = select("#gammaSlider");
  gammaLabel  = select("#gammaLabel");

  chromaSlider     = select("#chromaSlider");
  sheenSlider      = select("#sheenSlider");
  contactSlider    = select("#contactSlider");
  fogSlider        = select("#fogSlider");
  bloomSlider      = select("#bloomSlider");
  paletteSelect    = select("#paletteSelect");
  paletteAmtSlider = select("#paletteAmtSlider");
  scanModeSelect   = select("#scanModeSelect");
  temporalSlider   = select("#temporalSlider");
  depthSmoothSlider = select("#depthSmoothSlider");

  horizAmpSlider = select("#horizAmpSlider");
  vertAmpSlider  = select("#vertAmpSlider");
  lfoHorizAmp    = select("#lfoHorizAmp");
  lfoVertAmp     = select("#lfoVertAmp");

  offsetXSlider = select("#offsetXSlider");
  offsetYSlider = select("#offsetYSlider");
  lfoOffsetX    = select("#lfoOffsetX");
  lfoOffsetY    = select("#lfoOffsetY");

  downloadBtn = select("#downloadBtn");
  downloadBtn.mousePressed(saveImage);

  currentFrameForExportInput = select("#currentFrameForExportInput");
  totalFramesForExportInput  = select("#totalFramesForExportInput");
  startExportBtn = select("#startExportBtn");
  startExportBtn.mousePressed(startExport);
  nextFrameBtn = select("#nextFrameBtn");
  nextFrameBtn.mousePressed(goToNextFrame);
  currentFrameLabel = select("#currentFrameLabel");

  const controlsDiv = select("#controls");
  controlsDiv.mouseOver(() => controlsHovering = true);
  controlsDiv.mouseOut (() => controlsHovering = false);

  imgInput.changed(handleImageUpload);
  vidInput.changed(handleVideoUpload);

  // Native drag-and-drop on the GPU canvas
  canvas.addEventListener('dragover', e => e.preventDefault());
  canvas.addEventListener('drop', e => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    if (file.type.startsWith('image/'))      _loadDroppedImage(url);
    else if (file.type.startsWith('video/')) _loadDroppedVideo(url);
  });

  // Left-drag  → tilt X/Y   |   Right-drag → pan (offset X/Y)
  {
    let dragging = false, dragButton = -1, lastX = 0, lastY = 0;

    canvas.addEventListener('contextmenu', e => e.preventDefault());

    canvas.addEventListener('mousedown', e => {
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

  currentFrameLabel.html(currentFrameForExport);

  requestAnimationFrame(renderLoop);
}

// p5 draw() is intentionally empty -- rendering happens in renderLoop()
function draw() {}

// --- GPU render loop ---------------------------------------------------------
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

  const lfoFreq = Number(lfoFreqSlider.value());
  const lfoAmp  = Number(lfoAmpSlider.value());
  const lfoType = lfoTypeSelector.value();
  const lfo = exportMode
    ? getLFOValueForExport(lfoType, currentFrameForExport, totalFramesForExport)
    : getLFOValue(lfoType, lfoFreq);

  const depth  = baseDepth + (lfoDepth.checked() ? lfo * 300 * lfoAmp : 0);
  const tiltX  = baseTiltX + (lfoTiltX.checked() ? lfo * Math.PI * lfoAmp : 0);
  const tiltY  = baseTiltY + (lfoTiltY.checked() ? lfo * Math.PI * lfoAmp : 0);
  const scl    = baseScale + (lfoScale.checked() ? lfo * 1.5 * lfoAmp : 0);

  // Slider is 0-100; normalise to 0-1 for shader
  const shapeX   = Math.max(0, Math.min(1, (Number(shapeXSlider.value()) + (lfoShapeX.checked()  ? lfo * 50 * lfoAmp : 0)) / 100));
  const shapeY   = Math.max(0, Math.min(1, (Number(shapeYSlider.value()) + (lfoShapeY.checked()  ? lfo * 50 * lfoAmp : 0)) / 100));
  const waveAmp  = Number(waveAmpSlider.value()) + (lfoWaveAmp.checked() ? lfo * 200 * lfoAmp : 0);
  const waveFreq = Math.max(0, Number(waveFreqSlider.value()) + (lfoWaveFreq.checked() ? lfo * 20 * lfoAmp : 0));

  const horizAmp = Math.max(0, Number(horizAmpSlider.value()) + (lfoHorizAmp.checked() ? lfo * 0.5 * lfoAmp : 0));
  const vertAmp  = Math.max(0, Number(vertAmpSlider.value())  + (lfoVertAmp.checked()  ? lfo * 0.5 * lfoAmp : 0));

  const offsetX  = Number(offsetXSlider.value()) + (lfoOffsetX.checked() ? lfo * 100 * lfoAmp : 0);
  const offsetY  = Number(offsetYSlider.value()) + (lfoOffsetY.checked() ? lfo * 100 * lfoAmp : 0);

  const gamma = Math.max(0.01, Number(gammaSlider.value()));
  const chromaShift = Number(chromaSlider.value());
  const sheen         = Number(sheenSlider.value());
  const contact       = Number(contactSlider.value());
  const fog           = Number(fogSlider.value());
  const bloomAmt      = Number(bloomSlider.value());
  const paletteIdx    = Number(paletteSelect.value());
  const paletteAmt    = Number(paletteAmtSlider.value());
  const scanMode      = scanModeSelect.value(); // 'H', 'V', or 'X'
  const temporal      = Number(temporalSlider.value());
  const depthSmooth   = Number(depthSmoothSlider.value()); // 0-20 pixel radius

  // Update labels
  select("#depthLabel").html(depth.toFixed(0));
  select("#tiltXLabel").html(Number(tiltXSlider.value()) + "\u00B0");
  select("#tiltYLabel").html(tiltYSlider.value() + "\u00B0");
  select("#scaleLabel").html(scl.toFixed(2));
  select("#densityLabel").html(step);
  select("#shapeXLabel").html(Math.round(shapeX * 100));
  select("#shapeYLabel").html(Math.round(shapeY * 100));
  select("#waveAmpLabel").html(waveAmp.toFixed(1));
  select("#waveFreqLabel").html(waveFreq.toFixed(1));
  select("#gammaLabel").html(gamma.toFixed(1));
  select("#chromaLabel").html(chromaShift.toFixed(3));
  select("#sheenLabel").html(sheen.toFixed(2));
  select("#contactLabel").html(contact.toFixed(2));
  select("#fogLabel").html(fog.toFixed(2));
  select("#bloomLabel").html(bloomAmt.toFixed(2));
  select("#paletteAmtLabel").html(paletteAmt.toFixed(2));
  select("#temporalLabel").html(temporal.toFixed(2));
  select("#depthSmoothLabel").html(depthSmooth.toFixed(0));
  select("#horizAmpLabel").html(horizAmp.toFixed(1));
  select("#vertAmpLabel").html(vertAmp.toFixed(1));
  select("#offsetXLabel").html(offsetX.toFixed(0));
  select("#offsetYLabel").html(offsetY.toFixed(0));
  // Smooth rotation
  rotX += (targetRotX - rotX) * 0.1;
  rotY += (targetRotY - rotY) * 0.1;

  const srcW = src.width, srcH = src.height;

  // Render at actual display pixels to eliminate Moiré from browser downscaling.
  // Export mode always uses full 4K for high-res frames.
  {
    const gpuCanvas = window._gpuCanvas;
    const dpr     = window.devicePixelRatio || 1;
    const dispW   = gpuCanvas.clientWidth || 1280;
    const targetW = exportMode
      ? 3840
      : Math.min(3840, Math.max(320, Math.round(dispW * dpr)));
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

  // Orthographic projection: canvas-pixel space -> NDC, +y points down (p5 WEBGL default)
  const hw = CW / 2, hh = CH / 2;
  const ortho = new Float32Array([
    1/hw,  0,      0,  0,
    0,    -1/hh,   0,  0,
    0,     0,  1/10000, 0,
    0,     0,      0,  1
  ]);

  const mvp = mat4Mul(ortho, m);

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
  gl2.uniform1f(ul('u_waveFreq'),            waveFreq);
  gl2.uniform1f(ul('u_chromaShift'),         chromaShift);
  gl2.uniform1f(ul('u_sheen'),               sheen);
  gl2.uniform1f(ul('u_contactShadow'),       contact);
  gl2.uniform1f(ul('u_rowStep'),             step / srcH);
  gl2.uniform1f(ul('u_colStep'),             step / srcW);
  gl2.uniform1f(ul('u_fog'),                 fog);
  gl2.uniform1i(ul('u_palette'),             paletteIdx);
  gl2.uniform1f(ul('u_paletteAmt'),          paletteAmt);
  // tube fill: sheen=0 -> fills gap (0.48), sheen=1 -> tight line (0.09)
  const tubeFill       = 0.48 - Math.min(sheen, 1.0) * 0.39;
  const tubeHalfNDC    = (step * scl * sf * vertAmp)  / (CH / 2) * tubeFill;
  const tubeHalfColNDC = (step * scl * sf * horizAmp) / (CW / 2) * tubeFill;

  gl2.activeTexture(gl2.TEXTURE0);
  gl2.bindTexture(gl2.TEXTURE_2D, srcTexture);
  gl2.uniform1i(ul('u_tex'), 0);
  gl2.activeTexture(gl2.TEXTURE1);
  gl2.bindTexture(gl2.TEXTURE_2D, depthTexForDisplace);
  gl2.uniform1i(ul('u_depthTex'), 1);

  // Horizontal scanlines
  if (scanMode !== 'V') {
    gl2.uniform1f(ul('u_tubeAxis'),  0.0);
    gl2.uniform1f(ul('u_tubeWidth'), tubeHalfNDC);
    gl2.bindVertexArray(vao);
    for (let i = 0; i < rowCounts.length; i++)
      gl2.drawArrays(gl2.TRIANGLE_STRIP, rowOffsets[i], rowCounts[i]);
    gl2.bindVertexArray(null);
  }

  // Vertical scan columns
  if (scanMode !== 'H') {
    buildColumnVBO(srcW, srcH, step);
    gl2.uniform1f(ul('u_tubeAxis'),  1.0);
    gl2.uniform1f(ul('u_tubeWidth'), tubeHalfColNDC);
    gl2.bindVertexArray(colVAO);
    for (let i = 0; i < colCounts.length; i++)
      gl2.drawArrays(gl2.TRIANGLE_STRIP, colOffsets[i], colCounts[i]);
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
function getLFOValue(type, freq) {
  lfoPhase += freq * 0.01;
  if (lfoPhase > 1) lfoPhase -= 1;
  switch (type) {
    case 'saw': return lfoPhase * 2.0 - 1.0;
    case 'sin': return Math.sin(Math.PI * 2 * lfoPhase);
    case 'tri': return Math.abs(lfoPhase * 4 - 2) - 1;
    default: return 0;
  }
}

function getLFOValueForExport(type, frame, total) {
  if (total <= 0) return 0;
  const phase = (frame % total) / total;
  switch (type) {
    case 'saw': return phase * 2.0 - 1.0;
    case 'sin': return Math.sin(Math.PI * 2 * phase);
    case 'tri': return Math.abs(phase * 4 - 2) - 1;
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

function handleImageUpload() {
  currentSourceReady = false;
  if (cam) { cam.remove(); cam = null; }
  uploadedMedia = null; uploadedType = null;
  if (imgInput.elt.files.length > 0) {
    loadImage(URL.createObjectURL(imgInput.elt.files[0]), img => {
      img.resize(640, 480);
      uploadedMedia = img; uploadedType = 'image'; currentSourceReady = true;
    }, e => console.error('Image error:', e));
  }
}

function handleVideoUpload() {
  currentSourceReady = false;
  if (cam) { cam.remove(); cam = null; }
  uploadedMedia = null; uploadedType = null;
  if (vidInput.elt.files.length > 0) {
    const vid = createVideo([URL.createObjectURL(vidInput.elt.files[0])]);
    vid.elt.onloadedmetadata = () => {
      vid.size(640, 480); vid.hide(); vid.loop(); vid.volume(0);
      uploadedMedia = vid; uploadedType = 'video'; currentSourceReady = true;
    };
    vid.elt.onerror = e => { console.error('Video error:', e); currentSourceReady = false; uploadedMedia = null; };
    vid.elt.load();
  }
}

function _loadDroppedImage(url) {
  currentSourceReady = false;
  if (cam) { cam.remove(); cam = null; }
  uploadedMedia = null; uploadedType = null;
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
    vid.size(640, 480); vid.hide(); vid.loop(); vid.volume(0);
    uploadedMedia = vid; uploadedType = 'video'; currentSourceReady = true;
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
  a.download = exportMode
    ? 'rutt-etra-frame-' + String(currentFrameForExport).padStart(4, '0') + '.png'
    : 'rutt-etra-output.png';
  a.href = canvas.toDataURL('image/png');
  a.click();
}

function startExport() {
  if (!currentSourceReady) { console.warn('Source not ready.'); return; }
  totalFramesForExport = Number(totalFramesForExportInput.value());
  if (totalFramesForExport <= 0) { console.error('Total frames must be > 0.'); return; }
  exportMode = true;
  currentFrameForExport = 0;
  currentFrameForExportInput.value(0);
  currentFrameLabel.html(0);
}

function goToNextFrame() {
  if (!exportMode) { console.warn('Start export first.'); return; }
  if (currentFrameForExport < totalFramesForExport - 1) {
    currentFrameForExport++;
    currentFrameForExportInput.value(currentFrameForExport);
    currentFrameLabel.html(currentFrameForExport);
  } else {
    resetExport();
  }
}

function resetExport() {
  exportMode = false;
  currentFrameForExport = 0;
  currentFrameForExportInput.value(0);
  currentFrameLabel.html(0);
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
     43:'waveFreqSlider', 46:'gammaSlider',
     47:'horizAmpSlider', 48:'vertAmpSlider',
     51:'offsetXSlider', 52:'offsetYSlider',
     32:'lfoDepth', 33:'lfoTiltX', 34:'lfoTiltY', 35:'lfoScale',
     38:'lfoShapeX', 39:'lfoShapeY', 44:'lfoWaveAmp', 45:'lfoWaveFreq',
     49:'lfoHorizAmp', 50:'lfoVertAmp', 53:'lfoOffsetX', 54:'lfoOffsetY'
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
