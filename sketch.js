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
let chromaSlider, sheenSlider;

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

in float a_tubeT;

out vec4 v_color;
out float v_tubeT;

uniform sampler2D u_tex;
uniform sampler2D u_depthTex;

const float PI = 3.14159265358979;

float applyGamma(float v, float g) {
  return pow(clamp(v, 0.0, 1.0), 1.0 / g);
}

float parabolicBend(float n, float s) {
  float c = 0.5;
  return s * (n - c) * (n - c);
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

  float nx = a_uv.x;
  float ny = a_uv.y;

  float horizBend = parabolicBend(ny, u_shapeX);
  float vertBend  = parabolicBend(nx, u_shapeY);

  float scaleWaveX = u_waveAmp * (sz.x / 640.0);
  float scaleWaveY = u_waveAmp * (sz.y / 480.0);
  float waveX = scaleWaveX * sin(ny * PI * 2.0 * u_waveFreq);
  float waveY = scaleWaveY * sin(nx * PI * 2.0 * u_waveFreq);

  float px = nx * sz.x * u_horizVert.x + waveX;
  float py = ny * sz.y * u_horizVert.y
           + vertBend  * sz.y
           + horizBend * sz.x
           + waveY;

  float depth = u_depth;
  float z = (gammaBright * 2.0 - 1.0) * abs(depth);
  if (depth < 0.0) z *= -1.0;

  vec4 clipPos = u_mvp * vec4(px, py, z, 1.0);
  clipPos.y += a_tubeT * u_tubeWidth;
  gl_Position = clipPos;
}
`;

// --- Fragment Shader ----------------------------------------------------------
const FRAG_SRC = `#version 300 es
precision mediump float;
in vec4  v_color;
in float v_tubeT;    // -1 = tube bottom edge, 0 = facing camera, +1 = tube top edge
uniform float u_sheen;
out vec4 fragColor;
void main() {
  // Cylinder normal from cross-section position v_tubeT
  float sint = clamp(v_tubeT, -1.0, 1.0);
  float cost = sqrt(max(0.0, 1.0 - sint * sint));
  vec3 N = vec3(0.0, sint, cost);                   // tube surface normal
  vec3 L = normalize(vec3(0.3, 0.7, 1.0));          // light: right, up, toward camera
  float diffuse = max(0.0, dot(N, L));
  float spec    = pow(max(0.0, N.z), 24.0);          // tight specular, less blown-out
  // ambient + diffuse + specular; sheen=0 -> flat colour, sheen=1 -> full tube shading
  float shade = mix(1.0, 0.08 + diffuse * 0.55 + spec * 0.18, u_sheen);
  fragColor = vec4(clamp(v_color.rgb * shade, 0.0, 1.0), 1.0);
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

// --- Temporal smooth globals --------------------------------------------------
let blendProg, quadVAO;
let smoothTex = [null, null], smoothFBO = [null, null], smoothIdx = 0;
let smoothW = -1, smoothH = -1;

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
  canvas.width  = 1920;
  canvas.height = 1080;
  canvas.style.display = 'block';
  canvas.style.margin  = '0 auto';
  canvas.style.maxWidth = '100%';
  const main = document.querySelector('main') || document.body;
  main.insertBefore(canvas, main.firstChild);
  window._gpuCanvas = canvas;

  gl2 = canvas.getContext('webgl2', { antialias: true, preserveDrawingBuffer: true });
  if (!gl2) { alert('WebGL2 not supported by this browser.'); return; }

  prog    = buildProgram();
  blendProg = buildBlendProg();
  vao     = gl2.createVertexArray();
  lineVBO = gl2.createBuffer();
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

  chromaSlider = select("#chromaSlider");
  sheenSlider  = select("#sheenSlider");
  temporalSlider = select("#temporalSlider");

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

  const shapeX   = Number(shapeXSlider.value())  + (lfoShapeX.checked()  ? lfo * 5 * lfoAmp : 0);
  const shapeY   = Number(shapeYSlider.value())  + (lfoShapeY.checked()  ? lfo * 5 * lfoAmp : 0);
  const waveAmp  = Number(waveAmpSlider.value()) + (lfoWaveAmp.checked() ? lfo * 200 * lfoAmp : 0);
  const waveFreq = Math.max(0, Number(waveFreqSlider.value()) + (lfoWaveFreq.checked() ? lfo * 20 * lfoAmp : 0));

  const horizAmp = Math.max(0, Number(horizAmpSlider.value()) + (lfoHorizAmp.checked() ? lfo * 0.5 * lfoAmp : 0));
  const vertAmp  = Math.max(0, Number(vertAmpSlider.value())  + (lfoVertAmp.checked()  ? lfo * 0.5 * lfoAmp : 0));

  const offsetX  = Number(offsetXSlider.value()) + (lfoOffsetX.checked() ? lfo * 100 * lfoAmp : 0);
  const offsetY  = Number(offsetYSlider.value()) + (lfoOffsetY.checked() ? lfo * 100 * lfoAmp : 0);

  const gamma = Math.max(0.01, Number(gammaSlider.value()));
  const chromaShift = Number(chromaSlider.value());
  const sheen      = Number(sheenSlider.value());
  const temporal   = Number(temporalSlider.value()); // 0=max smooth, 1=none

  // Update labels
  select("#depthLabel").html(depth.toFixed(0));
  select("#tiltXLabel").html(Number(tiltXSlider.value()) + "\u00B0");
  select("#tiltYLabel").html(tiltYSlider.value() + "\u00B0");
  select("#scaleLabel").html(scl.toFixed(2));
  select("#densityLabel").html(step);
  select("#shapeXLabel").html(shapeX.toFixed(1));
  select("#shapeYLabel").html(shapeY.toFixed(1));
  select("#waveAmpLabel").html(waveAmp.toFixed(1));
  select("#waveFreqLabel").html(waveFreq.toFixed(1));
  select("#gammaLabel").html(gamma.toFixed(1));
  select("#chromaLabel").html(chromaShift.toFixed(3));
  select("#sheenLabel").html(sheen.toFixed(2));
  select("#temporalLabel").html(temporal.toFixed(2));
  select("#horizAmpLabel").html(horizAmp.toFixed(1));
  select("#vertAmpLabel").html(vertAmp.toFixed(1));
  select("#offsetXLabel").html(offsetX.toFixed(0));
  select("#offsetYLabel").html(offsetY.toFixed(0));
  // Smooth rotation
  rotX += (targetRotX - rotX) * 0.1;
  rotY += (targetRotY - rotY) * 0.1;

  const srcW = src.width, srcH = src.height;
  const CW = 1920, CH = 1080;

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

  // --- WebGL draw ------------------------------------------------------------
  gl2.bindFramebuffer(gl2.FRAMEBUFFER, null);  // must unbind FBO before sampling its texture
  gl2.viewport(0, 0, CW, CH);
  gl2.clearColor(0, 0, 0, 1);
  gl2.clear(gl2.COLOR_BUFFER_BIT | gl2.DEPTH_BUFFER_BIT);
  gl2.enable(gl2.DEPTH_TEST);
  gl2.depthFunc(gl2.LEQUAL);

  gl2.useProgram(prog);

  const ul = loc => gl2.getUniformLocation(prog, loc);
  gl2.uniformMatrix4fv(ul('u_mvp'),      false, mvp);
  gl2.uniform2f(ul('u_srcSize'),         srcW, srcH);
  gl2.uniform1f(ul('u_depth'),           depth);
  gl2.uniform2f(ul('u_horizVert'),       horizAmp, vertAmp);
  gl2.uniform1f(ul('u_gamma'),           gamma);
  gl2.uniform1f(ul('u_shapeX'),          shapeX);
  gl2.uniform1f(ul('u_shapeY'),          shapeY);
  gl2.uniform1f(ul('u_waveAmp'),         waveAmp);
  gl2.uniform1f(ul('u_waveFreq'),        waveFreq);
  gl2.uniform1f(ul('u_chromaShift'),     chromaShift);
  gl2.uniform1f(ul('u_sheen'),           sheen);
  // tube half-height in NDC: fills ~96% of the gap between scanlines
  const tubeHalfNDC = (step * scl * sf * vertAmp) / (CH / 2) * 0.48;
  gl2.uniform1f(ul('u_tubeWidth'),       tubeHalfNDC);

  gl2.activeTexture(gl2.TEXTURE0);
  gl2.bindTexture(gl2.TEXTURE_2D, srcTexture);
  gl2.uniform1i(ul('u_tex'), 0);
  gl2.activeTexture(gl2.TEXTURE1);
  gl2.bindTexture(gl2.TEXTURE_2D, smoothTex[smoothIdx]);
  gl2.uniform1i(ul('u_depthTex'), 1);

  gl2.bindVertexArray(vao);
  for (let i = 0; i < rowCounts.length; i++) {
    gl2.drawArrays(gl2.TRIANGLE_STRIP, rowOffsets[i], rowCounts[i]);
  }
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
