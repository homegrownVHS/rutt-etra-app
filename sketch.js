// sketch.js
let cam, uploadedMedia, uploadedType = null;
let stepSize = 6;

// Shader variable
let theShader;
let graphics; // p5.Graphics object for offscreen rendering with shader

// Loading state indicator
let isLoading = false;
let loadingMessage = "Initializing...";

// Existing sliders (global declaration)
let depthSlider, tiltXSlider, tiltYSlider, scaleSlider, densitySlider;
let camSelect, imgInput, vidInput;

// Existing LFO controls (global declaration)
let lfoDepth, lfoTiltX, lfoTiltY, lfoScale, lfoFreqSlider, lfoAmpSlider, lfoTypeSelector;

// LFO checkboxes for Shape and Wave effects (global declaration)
let lfoShapeX, lfoShapeY, lfoWaveAmp, lfoWaveFreq;

// Variables for Shape and Wave Displacement effects (global declaration)
// These now will be overridden by sequence or populated by sliders
let shapeXValue = 0; // Will be set in draw
let shapeYValue = 0; // Will be set in draw
let waveAmplitude = 0; // Will be set in draw
let waveFrequency = 0; // Will be set in draw

// Gamma Correction variable (global declaration)
let gammaValue = 2.2;

// Sliders and labels for Shape and Wave Displacement (global declaration)
let shapeXSlider, shapeYSlider, shapeXLabel, shapeYLabel;
let waveAmpSlider, waveAmpLabel;
let waveFreqSlider, waveFreqLabel;

// Gamma Slider and Label (global declaration)
let gammaSlider, gammaLabel;

// Ramp Amplification variables (global declaration)
let horizAmpSlider, horizAmpLabel;
let vertAmpSlider, vertAmpLabel;
let lfoHorizAmp, lfoVertAmp;
// These now will be overridden by sequence or populated by sliders
let horizontalAmplification = 1.0; // Will be set in draw
let verticalAmplification = 1.0; // Will be set in draw

// Offset variables for the D-pad (global declaration)
let offsetXSlider, offsetYSlider, offsetXLabel, offsetYLabel;
let lfoOffsetX, lfoOffsetY;
// These now will be overridden by sequence or populated by sliders
let offsetX = 0; // Will be set in draw
let offsetY = 0; // Will be set in draw

// New / Connected Sliders for Shader Uniforms (Global Declaration)
let blurRadiusSlider, blurRadiusLabel;
let edgeThresholdSlider, edgeThresholdLabel;
let edgeIntensitySlider, edgeIntensityLabel;
let normalEdgeStrengthSlider, normalEdgeStrengthLabel;
let depthEdgeStrengthSlider, depthEdgeStrengthLabel;
let temporalStrengthSlider, temporalStrengthLabel;
let temporalDecaySlider, temporalDecayLabel;


// Single flag to indicate if the current source (camera or uploaded media) is ready
let currentSourceReady = false;

let selectedDeviceId = null;
let controlsHovering = false;

let lfoPhase = 0; // For real-time LFO
let lfoTypes = ['saw', 'sin', 'tri']; // Not directly used in draw, but good for context

// Moving average filter for depth smoothing
let finalDepthHistory = [];
const finalDepthHistorySize = 20;

// Download button variable
let downloadBtn;

// Export automation variables
let currentFrameForExportInput, totalFramesForExportInput, startExportBtn, nextFrameBtn, currentFrameLabel;
let currentFrameForExport = 0;
let totalFramesForExport = 0;
let exportMode = false; // Flag to indicate if we are in export mode

// NEW: Global variable for the sequence toggle button
let sequenceToggleButton;


function preload() {
  // Load the shaders
  theShader = loadShader('vert.glsl', 'frag.glsl');
}

function setup() {
  createCanvas(1280, 720, WEBGL);
  graphics = createGraphics(width, height, WEBGL);

  graphics.drawingContext.disable(graphics.drawingContext.CULL_FACE);
  graphics.shader(theShader);

  // --- UI Element Selections ---
  depthSlider = select("#depthSlider");
  tiltXSlider = select("#tiltXSlider");
  tiltYSlider = select("#tiltYSlider");
  scaleSlider = select("#scaleSlider");
  densitySlider = select("#densitySlider");
  camSelect = select("#camSelect");
  imgInput = select("#imgInput");
  vidInput = select("#vidInput");

  lfoDepth = select("#lfoDepth");
  lfoTiltX = select("#lfoTiltX");
  lfoTiltY = select("#lfoTiltY");
  lfoScale = select("#lfoScale");
  lfoFreqSlider = select("#lfoFreq");
  lfoAmpSlider = select("#lfoAmp");
  lfoTypeSelector = select("#lfoType");

  shapeXSlider = select("#shapeXSlider");
  shapeYSlider = select("#shapeYSlider");
  shapeXLabel = select("#shapeXLabel");
  shapeYLabel = select("#shapeYLabel");
  waveAmpSlider = select("#waveAmpSlider");
  waveAmpLabel = select("#waveAmpLabel");
  waveFreqSlider = select("#waveFreqSlider");
  waveFreqLabel = select("#waveFreqLabel");

  lfoShapeX = select("#lfoShapeX");
  lfoShapeY = select("#lfoShapeY");
  lfoWaveAmp = select("#lfoWaveAmp");
  lfoWaveFreq = select("#lfoWaveFreq");

  gammaSlider = select("#gammaSlider");
  gammaLabel = select("#gammaLabel");

  horizAmpSlider = select("#horizAmpSlider");
  horizAmpLabel = select("#horizAmpLabel");
  vertAmpSlider = select("#vertAmpSlider");
  vertAmpLabel = select("#vertAmpLabel");
  lfoHorizAmp = select("#lfoHorizAmp");
  lfoVertAmp = select("#lfoVertAmp");

  offsetXSlider = select("#offsetXSlider");
  offsetYSlider = select("#offsetYSlider");
  offsetXLabel = select("#offsetXLabel");
  offsetYLabel = select("#offsetYLabel");
  lfoOffsetX = select("#lfoOffsetX");
  lfoOffsetY = select("#lfoOffsetY");

  // --- New Shader Uniform Sliders Selection ---
  blurRadiusSlider = select("#blurRadiusSlider");
  blurRadiusLabel = select("#blurRadiusLabel");
  edgeThresholdSlider = select("#edgeThresholdSlider");
  edgeThresholdLabel = select("#edgeThresholdLabel");
  edgeIntensitySlider = select("#edgeIntensitySlider");
  edgeIntensityLabel = select("#edgeIntensityLabel");
  normalEdgeStrengthSlider = select("#normalEdgeStrengthSlider");
  normalEdgeStrengthLabel = select("#normalEdgeStrengthLabel");
  depthEdgeStrengthSlider = select("#depthEdgeStrengthSlider");
  depthEdgeStrengthLabel = select("#depthEdgeStrengthLabel");
  temporalStrengthSlider = select("#temporalStrengthSlider");
  temporalStrengthLabel = select("#temporalStrengthLabel");
  temporalDecaySlider = select("#temporalDecaySlider");
  temporalDecayLabel = select("#temporalDecayLabel");

  downloadBtn = select("#downloadBtn");
  downloadBtn.mousePressed(saveImage);

  currentFrameForExportInput = select("#currentFrameForExportInput");
  totalFramesForExportInput = select("#totalFramesForExportInput");
  startExportBtn = select("#startExportBtn");
  startExportBtn.mousePressed(startExport);
  nextFrameBtn = select("#nextFrameBtn");
  nextFrameBtn.mousePressed(goToNextFrame);
  currentFrameLabel = select("#currentFrameLabel");

  // NEW: Sequence Button Setup - CORRECTED FUNCTION NAME HERE
  sequenceToggleButton = select("#sequenceToggleButton");
  sequenceToggleButton.mousePressed(() => {
    // Corrected from sequenceManager.togglePlay() to sequenceManager.toggleSequence()
    const isPlaying = sequenceManager.toggleSequence();
    sequenceToggleButton.html(isPlaying ? 'Stop Sequence' : 'Start Sequence');
    // Optionally update UI elements here if sequence overrides them
    // (e.g., reset LFO checkboxes)
    lfoDepth.checked(false); // Make sure LFOs are off when sequence starts
    lfoTiltX.checked(false);
    lfoTiltY.checked(false);
    lfoScale.checked(false);
    lfoShapeX.checked(false);
    lfoShapeY.checked(false);
    lfoWaveAmp.checked(false);
    lfoWaveFreq.checked(false);
    lfoHorizAmp.checked(false);
    lfoVertAmp.checked(false);
    lfoOffsetX.checked(false);
    lfoOffsetY.checked(false);
  });

  let controlsDiv = select("#controls");
  controlsDiv.mouseOver(() => controlsHovering = true);
  controlsDiv.mouseOut(() => controlsHovering = false);

  // --- Event Listeners for UI ---
  imgInput.changed(handleImageUpload);
  vidInput.changed(handleVideoUpload);

  let mainCanvas = select("main");
  if (!mainCanvas) {
    mainCanvas = select("canvas");
  }
  if (mainCanvas) {
    mainCanvas.dragOver(() => {
      return false;
    });
    mainCanvas.drop(handleFileDrop);
  } else {
    console.warn("Could not find a canvas element for drag and drop. Make sure your canvas is in <main> or has a direct ID.");
  }

  // --- Input handlers for sliders to update labels ---
  depthSlider.input(() => { select("#depthLabel").html(Number(depthSlider.value()).toFixed(0)); });
  tiltXSlider.input(() => { select("#tiltXLabel").html((Number(tiltXSlider.value())).toFixed(0) + "°"); });
  tiltYSlider.input(() => { select("#tiltYLabel").html(tiltYSlider.value() + "°"); });
  scaleSlider.input(() => { select("#scaleLabel").html(Number(scaleSlider.value()).toFixed(2)); });
  densitySlider.input(() => { select("#densityLabel").html(int(densitySlider.value())); });
  shapeXSlider.input(() => { shapeXLabel.html(Number(shapeXSlider.value()).toFixed(1)); });
  shapeYSlider.input(() => { shapeYLabel.html(Number(shapeYSlider.value()).toFixed(1)); });
  waveAmpSlider.input(() => { waveAmpLabel.html(Number(waveAmpSlider.value()).toFixed(1)); });
  waveFreqSlider.input(() => { waveFreqLabel.html(Number(waveFreqSlider.value()).toFixed(1)); });
  gammaSlider.input(() => { gammaValue = Number(gammaSlider.value()); gammaLabel.html(gammaValue.toFixed(1)); });
  horizAmpSlider.input(() => { horizAmpLabel.html(Number(horizAmpSlider.value()).toFixed(1)); });
  vertAmpSlider.input(() => { vertAmpLabel.html(Number(vertAmpSlider.value()).toFixed(1)); });
  offsetXSlider.input(() => { offsetXLabel.html(Number(offsetXSlider.value()).toFixed(0)); });
  offsetYSlider.input(() => { offsetYLabel.html(Number(offsetYSlider.value()).toFixed(0)); });

  // Add input handlers for the new shader uniform sliders
  blurRadiusSlider.input(() => { blurRadiusLabel.html(Number(blurRadiusSlider.value()).toFixed(1)); });
  edgeThresholdSlider.input(() => { edgeThresholdLabel.html(Number(edgeThresholdSlider.value()).toFixed(2)); });
  edgeIntensitySlider.input(() => { edgeIntensityLabel.html(Number(edgeIntensitySlider.value()).toFixed(1)); });
  normalEdgeStrengthSlider.input(() => { normalEdgeStrengthLabel.html(Number(normalEdgeStrengthSlider.value()).toFixed(1)); });
  depthEdgeStrengthSlider.input(() => { depthEdgeStrengthLabel.html(Number(depthEdgeStrengthSlider.value()).toFixed(1)); });
  temporalStrengthSlider.input(() => { temporalStrengthLabel.html(Number(temporalStrengthSlider.value()).toFixed(2)); });
  temporalDecaySlider.input(() => { temporalDecayLabel.html(Number(temporalDecaySlider.value()).toFixed(2)); });


  // --- Camera Device Enumeration and Initial Start ---
  navigator.mediaDevices.enumerateDevices().then(devices => {
    const videoDevices = devices.filter(d => d.kind === 'videoinput');
    videoDevices.forEach((device, i) => {
      const option = createElement('option', device.label || `Camera ${i + 1}`);
      option.attribute('value', device.deviceId);
      camSelect.child(option);
    });
    selectedDeviceId = videoDevices[0]?.deviceId;
    if (selectedDeviceId) {
      startCam(selectedDeviceId);
    } else {
      loadingMessage = "No camera devices found.";
      isLoading = false;
      currentSourceReady = false;
    }
  }).catch(err => {
    console.error("Error enumerating media devices:", err);
    loadingMessage = "Camera access denied or no devices found.";
    isLoading = false;
    currentSourceReady = false;
  });

  camSelect.changed(() => {
    selectedDeviceId = camSelect.value();
    if (cam) cam.remove();
    uploadedMedia = null;
    uploadedType = null;
    startCam(selectedDeviceId);
  });

  strokeWeight(1);
  noFill();

  // --- MIDI Setup ---
  if (navigator.requestMIDIAccess) {
    navigator.requestMIDIAccess().then(onMIDISuccess).catch(err => {
      console.error("MIDI access denied:", err);
    });
  }

  // Initialize current frame display for export
  currentFrameLabel.html(currentFrameForExport);

  // Initialize all slider labels at setup
  gammaValue = Number(gammaSlider.value());
  gammaLabel.html(gammaValue.toFixed(1));

  select("#depthLabel").html(Number(depthSlider.value()).toFixed(0));
  select("#tiltXLabel").html((Number(tiltXSlider.value())).toFixed(0) + "°");
  select("#tiltYLabel").html(tiltYSlider.value() + "°");
  select("#scaleLabel").html(Number(scaleSlider.value()).toFixed(2));
  select("#densityLabel").html(int(densitySlider.value()));
  shapeXLabel.html(Number(shapeXSlider.value()).toFixed(1));
  shapeYLabel.html(Number(shapeYSlider.value()).toFixed(1));
  waveAmpLabel.html(Number(waveAmpSlider.value()).toFixed(1));
  waveFreqLabel.html(Number(waveFreqSlider.value()).toFixed(1));
  horizAmpLabel.html(Number(horizAmpSlider.value()).toFixed(1));
  vertAmpLabel.html(Number(vertAmpSlider.value()).toFixed(1));
  offsetXLabel.html(Number(offsetXSlider.value()).toFixed(0));
  offsetYLabel.html(Number(offsetYSlider.value()).toFixed(0));
  blurRadiusLabel.html(Number(blurRadiusSlider.value()).toFixed(1));
  edgeThresholdLabel.html(Number(edgeThresholdSlider.value()).toFixed(2));
  edgeIntensityLabel.html(Number(edgeIntensitySlider.value()).toFixed(1));
  normalEdgeStrengthLabel.html(Number(normalEdgeStrengthSlider.value()).toFixed(1));
  depthEdgeStrengthLabel.html(Number(depthEdgeStrengthSlider.value()).toFixed(1));
  temporalStrengthLabel.html(Number(temporalStrengthSlider.value()).toFixed(2));
  temporalDecayLabel.html(Number(temporalDecaySlider.value()).toFixed(2));

  // NEW: Initialize Sequence Manager (THE KEY STEP)
  if (typeof sequenceManager !== 'undefined') {
    sequenceManager.init(theShader, {
      depthSlider, tiltXSlider, tiltYSlider, scaleSlider, densitySlider,
      shapeXSlider, shapeYSlider, waveAmpSlider, waveFreqSlider,
      horizAmpSlider, vertAmpSlider, offsetXSlider, offsetYSlider,
      blurRadiusSlider, edgeThresholdSlider, edgeIntensitySlider,
      normalEdgeStrengthSlider, depthEdgeStrengthSlider,
      temporalStrengthSlider, temporalDecaySlider
    });
  } else {
    console.error("sequenceManager.js not loaded or defined! Check index.html script order.");
  }
}

// --- Camera & Media Handling Functions ---
function startCam(deviceId) {
  uploadedMedia = null;
  uploadedType = null;
  currentSourceReady = false;
  isLoading = true;
  loadingMessage = "Starting camera...";

  if (cam) {
    cam.remove();
    cam = null;
  }

  cam = createCapture({
    video: {
      deviceId: { exact: deviceId },
      width: 640,
      height: 480
    }
  });

  setTimeout(() => {
    if (cam && cam.elt) {
      cam.size(640, 480);
      cam.hide();

      cam.elt.onloadedmetadata = () => {
        console.log("DEBUG: Camera metadata loaded! Stream ready.");
        currentSourceReady = true;
        isLoading = false;
        loadingMessage = "";
      };

      cam.elt.onerror = (e) => {
        console.error("DEBUG: Camera (HTML Video Element) error:", e);
        currentSourceReady = false;
        isLoading = false;
        loadingMessage = `Camera error: ${e.message || 'Unknown error'}. Check permissions and device.`;
        if (cam) cam.remove();
        cam = null;
      };

      if (cam.elt.readyState >= HTMLMediaElement.HAVE_METADATA) {
        console.log("DEBUG: Camera metadata already loaded (fast path). Triggering onloadedmetadata.");
        cam.elt.onloadedmetadata();
      }
    } else {
      console.error("DEBUG: Failed to create camera capture object (cam or cam.elt is null after timeout).");
      isLoading = false;
      currentSourceReady = false;
      loadingMessage = "Failed to access camera.";
    }
  }, 50);
}


function handleImageUpload() {
  currentSourceReady = false;
  isLoading = true;
  loadingMessage = "Loading image...";

  if (cam) cam.remove();
  cam = null;
  uploadedMedia = null;
  uploadedType = null;

  if (imgInput.elt.files.length > 0) {
    let file = imgInput.elt.files[0];
    loadImage(URL.createObjectURL(file), img => {
      img.resize(640, 480);
      uploadedMedia = img;
      uploadedType = 'image';
      currentSourceReady = true;
      isLoading = false;
      loadingMessage = "";
    }, (event) => {
      console.error("DEBUG: Error loading image:", event);
      currentSourceReady = false;
      isLoading = false;
      loadingMessage = `Image load error: ${event}`;
    });
  } else {
    isLoading = false;
    loadingMessage = "";
  }
}

function handleVideoUpload() {
  currentSourceReady = false;
  isLoading = true;
  loadingMessage = "Loading video...";

  if (cam) cam.remove();
  cam = null;
  uploadedMedia = null;
  uploadedType = null;

  if (vidInput.elt.files.length > 0) {
    let file = vidInput.elt.files[0];
    let vid = createVideo([URL.createObjectURL(file)]);

    vid.elt.onloadedmetadata = () => {
      vid.size(640, 480);
      vid.hide();
      vid.loop();
      vid.volume(0);

      const playPromise = vid.elt.play();
      if (playPromise !== undefined) {
        playPromise.then(() => {
          console.log("DEBUG: Video autoplay started successfully.");
        }).catch(error => {
          console.warn("DEBUG: Video autoplay prevented:", error.name, error.message);
        });
      } else {
        console.warn("DEBUG: vid.elt.play() did not return a Promise. Attempting direct play.");
        vid.elt.play();
      }

      uploadedMedia = vid;
      uploadedType = 'video';
      currentSourceReady = true;
      isLoading = false;
      loadingMessage = "";
    };

    vid.elt.onerror = (e) => {
      console.error("DEBUG: Video loading error:", e);
      currentSourceReady = false;
      isLoading = false;
      loadingMessage = `Video load error: ${e.message || e}`;
      uploadedMedia = null;
    };

    vid.elt.load();
  } else {
    isLoading = false;
    loadingMessage = "";
  }
}

function handleFileDrop(file) {
  isLoading = true;
  loadingMessage = `Loading dropped ${file.type}...`;
  currentSourceReady = false;
  if (cam) cam.remove();
  cam = null;
  uploadedMedia = null;
  uploadedType = null;

  if (file.type === 'image') {
    loadImage(file.data, img => {
      img.resize(640, 480);
      uploadedMedia = img;
      uploadedType = 'image';
      currentSourceReady = true;
      isLoading = false;
      loadingMessage = "";
    }, (event) => {
      console.error("DEBUG: Error loading dropped image:", event);
      currentSourceReady = false;
      isLoading = false;
      loadingMessage = `Dropped image error: ${event}`;
    });
  } else if (file.type === 'video') {
    let vid = createVideo([file.data]);
    vid.elt.onloadedmetadata = () => {
      vid.size(640, 480);
      vid.hide();
      vid.loop();
      vid.volume(0);

      const playPromise = vid.elt.play();
      if (playPromise !== undefined) {
        playPromise.then(() => {
          console.log("DEBUG: Dropped video autoplay started successfully.");
        }).catch(error => {
          console.warn("DEBUG: Dropped video autoplay prevented:", error.name, error.message);
        });
      } else {
        console.warn("DEBUG: vid.elt.play() did not return a Promise for dropped video. Attempting direct play.");
        vid.elt.play();
      }

      uploadedMedia = vid;
      uploadedType = 'video';
      currentSourceReady = true;
      isLoading = false;
      loadingMessage = "";
    };

    vid.elt.onerror = (e) => {
      console.error("DEBUG: Video loading error from drop:", e);
      currentSourceReady = false;
      isLoading = false;
      loadingMessage = `Dropped video error: ${e.message || e}`;
      uploadedMedia = null;
    };

    vid.elt.load();
  } else {
    isLoading = false;
    loadingMessage = "Unsupported file type dropped.";
    console.warn("DEBUG: Unsupported file type dropped:", file.type);
  }
}

function saveImage() {
  if (exportMode) {
    saveCanvas(`rutt-etra-frame-${nf(currentFrameForExport, 4)}`, 'png');
  } else {
    saveCanvas('rutt-etra-output', 'png');
  }
}

// --- LFO Functions ---
function getLFOValue(type, freq) {
  lfoPhase += freq * 0.01;
  if (lfoPhase > 1) lfoPhase -= 1;

  switch (type) {
    case "saw":
      return (lfoPhase * 2.0) - 1.0;
    case "sin":
      {
        const rawSine = sin(TWO_PI * lfoPhase);
        const exponent = 3;
        return Math.pow(rawSine, exponent);
      }
    case "tri":
      return abs((lfoPhase * 4) - 2) - 1;
    default:
      return 0;
  }
}

function getLFOValueForExport(type, currentFrame, totalFrames) {
  if (totalFrames <= 0) return 0;

  let phase = (currentFrame % totalFrames) / totalFrames;

  switch (type) {
    case "saw":
      return (phase * 2.0) - 1.0;
    case "sin":
      {
        const rawSine = sin(TWO_PI * phase);
        const exponent = 3;
        return Math.pow(rawSine, exponent);
      }
    case "tri":
      return abs((phase * 4) - 2) - 1;
    default:
      return 0;
  }
}

// --- Main Drawing Loop ---
function draw() {
  background(0);

  let src = null;
  if (uploadedMedia && uploadedType === 'image' && currentSourceReady) src = uploadedMedia;
  else if (uploadedMedia && uploadedType === 'video' && currentSourceReady) src = uploadedMedia;
  else if (cam && currentSourceReady) src = cam;

  if (!src || !src.width || !src.height || isLoading) {
    fill(255);
    textSize(24);
    textAlign(CENTER, CENTER);
    text(loadingMessage, 0, 0);
    return;
  }

  graphics.clear();
  graphics.shader(theShader);
  graphics.texture(src);

  theShader.setUniform('uSampler', src);
  theShader.setUniform('uResolution', [width, height]);
  theShader.setUniform('uTextureResolution', [src.width, src.height]);
  theShader.setUniform('uGamma', gammaValue);
  theShader.setUniform('uCameraPosition', [0.0, 0.0, 0.0]);

  // Declare variables for parameters, to be filled by either sequence or sliders/LFOs
  let currentDepth, currentTiltX, currentTiltY, currentScale, currentDensity;
  let currentShapeX, currentShapeY, currentWaveAmp, currentWaveFreq;
  let currentHorizAmp, currentVertAmp, currentOffsetX, currentOffsetY;
  let currentBlurRadius, currentEdgeThreshold, currentEdgeIntensity,
      currentNormalEdgeStrength, currentDepthEdgeStrength,
      currentTemporalStrength, currentTemporalDecay;

  // --- Determine Parameters (Sequence or Sliders/LFOs) ---
  let animatedParams = null;
  if (typeof sequenceManager !== 'undefined' && sequenceManager.isPlaying) {
    animatedParams = sequenceManager.getAnimatedParameters();
  }

  if (animatedParams) {
    // Use values from the sequence manager
    currentDepth = animatedParams.depth;
    currentTiltX = radians(animatedParams.tiltX); // Convert degrees to radians for shader
    currentTiltY = radians(animatedParams.tiltY); // Convert degrees to radians for shader
    currentScale = animatedParams.scale;
    currentShapeX = animatedParams.shapeX;
    currentShapeY = animatedParams.shapeY;
    currentWaveAmp = animatedParams.waveAmp;
    currentWaveFreq = animatedParams.waveFreq;
    currentHorizAmp = animatedParams.horizAmp;
    currentVertAmp = animatedParams.vertAmp;
    currentOffsetX = animatedParams.offsetX;
    currentOffsetY = animatedParams.offsetY;
    currentBlurRadius = animatedParams.blurRadius;
    currentEdgeIntensity = animatedParams.edgeIntensity;

    // For parameters not explicitly animated in the sequence, use slider values
    currentDensity = int(densitySlider.value());
    currentEdgeThreshold = Number(edgeThresholdSlider.value());
    currentNormalEdgeStrength = Number(normalEdgeStrengthSlider.value());
    currentDepthEdgeStrength = Number(depthEdgeStrengthSlider.value());
    currentTemporalStrength = Number(temporalStrengthSlider.value());
    currentTemporalDecay = Number(temporalDecaySlider.value());

  } else {
    // Use slider and LFO values (your existing logic)
    let lfoFreq = Number(lfoFreqSlider.value());
    let lfoAmp = Number(lfoAmpSlider.value());
    let lfoType = lfoTypeSelector.value();
    let lfoValue;

    if (exportMode) { // Use export LFO if in export mode
      lfoValue = getLFOValueForExport(lfoType, currentFrameForExport, totalFramesForExport);
    } else { // Otherwise, use real-time LFO
      lfoValue = getLFOValue(lfoType, lfoFreq);
    }

    let rawDepth = Number(depthSlider.value()) + (lfoDepth.checked() ? lfoValue * 300 * lfoAmp : 0);
    finalDepthHistory.push(rawDepth);
    if (finalDepthHistory.length > finalDepthHistorySize) {
      finalDepthHistory.shift();
    }
    currentDepth = finalDepthHistory.reduce((sum, val) => sum + val, 0) / finalDepthHistory.length;
    const MIN_ALLOWED_DEPTH_MAGNITUDE = 0.01;
    if (!lfoDepth.checked() && Number(depthSlider.value()) === 0) {
      currentDepth = 0;
    } else {
      if (abs(currentDepth) < MIN_ALLOWED_DEPTH_MAGNITUDE && abs(currentDepth) > 0) {
        currentDepth = (currentDepth >= 0) ? MIN_ALLOWED_DEPTH_MAGNITUDE : -MIN_ALLOWED_DEPTH_MAGNITUDE;
      } else if (abs(currentDepth) === 0 && lfoDepth.checked()) {
        currentDepth = MIN_ALLOWED_DEPTH_MAGNITUDE;
      }
    }

    currentTiltX = radians(Number(tiltXSlider.value())) + (lfoTiltX.checked() ? lfoValue * PI * lfoAmp : 0);
    currentTiltY = radians(Number(tiltYSlider.value())) + (lfoTiltY.checked() ? lfoValue * PI * lfoAmp : 0);
    currentScale = Number(scaleSlider.value()) + (lfoScale.checked() ? lfoValue * 1.5 * lfoAmp : 0);

    currentShapeX = Number(shapeXSlider.value()) + (lfoShapeX.checked() ? lfoValue * 5 * lfoAmp : 0);
    currentShapeY = Number(shapeYSlider.value()) + (lfoShapeY.checked() ? lfoValue * 5 * lfoAmp : 0);
    currentWaveAmp = Number(waveAmpSlider.value()) + (lfoWaveAmp.checked() ? lfoValue * 200 * lfoAmp : 0);
    currentWaveFreq = Number(waveFreqSlider.value()) + (lfoWaveFreq.checked() ? lfoValue * 20 * lfoAmp : 0);
    currentWaveFreq = max(0, currentWaveFreq);

    currentHorizAmp = Number(horizAmpSlider.value()) + (lfoHorizAmp.checked() ? lfoValue * 0.5 * lfoAmp : 0);
    currentVertAmp = Number(vertAmpSlider.value()) + (lfoVertAmp.checked() ? lfoValue * 0.5 * lfoAmp : 0);
    currentHorizAmp = max(0.01, currentHorizAmp);
    currentVertAmp = max(0.01, currentVertAmp);

    currentOffsetX = Number(offsetXSlider.value()) + (lfoOffsetX.checked() ? lfoValue * 100 * lfoAmp : 0);
    currentOffsetY = Number(offsetYSlider.value()) + (lfoOffsetY.checked() ? lfoValue * 100 * lfoAmp : 0);

    currentDensity = int(densitySlider.value());
    currentBlurRadius = Number(blurRadiusSlider.value());
    currentEdgeThreshold = Number(edgeThresholdSlider.value());
    currentEdgeIntensity = Number(edgeIntensitySlider.value());
    currentNormalEdgeStrength = Number(normalEdgeStrengthSlider.value());
    currentDepthEdgeStrength = Number(depthEdgeStrengthSlider.value());
    currentTemporalStrength = Number(temporalStrengthSlider.value());
    currentTemporalDecay = Number(temporalDecaySlider.value());
  }


  // --- Set Uniforms for Vertex Shader ---
  theShader.setUniform('uDepth', currentDepth);
  theShader.setUniform('uShapeX', currentShapeX);
  theShader.setUniform('uShapeY', currentShapeY);
  theShader.setUniform('uWaveAmp', currentWaveAmp);
  theShader.setUniform('uWaveFreq', currentWaveFreq);
  theShader.setUniform('uHorizAmp', currentHorizAmp);
  theShader.setUniform('uVertAmp', currentVertAmp);
  theShader.setUniform('uOffsetX', currentOffsetX);
  theShader.setUniform('uOffsetY', currentOffsetY);
  theShader.setUniform('uTime', frameCount * 0.01);
  theShader.setUniform('uFrameCount', float(frameCount));

  // --- Set Uniforms for Fragment Shader ---
  theShader.setUniform('uBlurRadius', currentBlurRadius);
  theShader.setUniform('uEdgeThreshold', currentEdgeThreshold);
  theShader.setUniform('uEdgeIntensity', currentEdgeIntensity);
  theShader.setUniform('uNormalEdgeStrength', currentNormalEdgeStrength);
  theShader.setUniform('uDepthEdgeStrength', currentDepthEdgeStrength);
  theShader.setUniform('uTemporalStrength', currentTemporalStrength);
  theShader.setUniform('uTemporalDecay', currentTemporalDecay);


  // Apply transformations directly to the graphics object
  graphics.push();
  graphics.translate(0, 0, 0);
  graphics.rotateX(currentTiltX);
  graphics.rotateY(currentTiltY);
  graphics.scale(currentScale);
  graphics.noStroke();

  let detailY = max(2, int(height / currentDensity));
  let detailX = max(2, int(width / currentDensity));

  graphics.plane(width, height, detailX, detailY);
  graphics.pop();

  image(graphics, -width / 2, -height / 2, width, height);

  // Update UI Labels (only if sequence is NOT playing)
  if (!animatedParams) { // If animatedParams is null, sequence is not playing
    select("#depthLabel").html(Number(depthSlider.value()).toFixed(0));
    select("#tiltXLabel").html((Number(tiltXSlider.value())).toFixed(0) + "°");
    select("#tiltYLabel").html(tiltYSlider.value() + "°");
    select("#scaleLabel").html(Number(scaleSlider.value()).toFixed(2));
    select("#densityLabel").html(int(densitySlider.value()));
    shapeXLabel.html(Number(shapeXSlider.value()).toFixed(1));
    shapeYLabel.html(Number(shapeYSlider.value()).toFixed(1));
    waveAmpLabel.html(Number(waveAmpSlider.value()).toFixed(1));
    waveFreqLabel.html(Number(waveFreqSlider.value()).toFixed(1));
    horizAmpLabel.html(Number(horizAmpSlider.value()).toFixed(1));
    vertAmpLabel.html(Number(vertAmpSlider.value()).toFixed(1));
    offsetXLabel.html(Number(offsetXSlider.value()).toFixed(0));
    offsetYLabel.html(Number(offsetYSlider.value()).toFixed(0));

    blurRadiusLabel.html(Number(blurRadiusSlider.value()).toFixed(1));
    edgeThresholdLabel.html(Number(edgeThresholdSlider.value()).toFixed(2));
    edgeIntensityLabel.html(Number(edgeIntensitySlider.value()).toFixed(1));
    normalEdgeStrengthLabel.html(Number(normalEdgeStrengthSlider.value()).toFixed(1));
    depthEdgeStrengthLabel.html(Number(depthEdgeStrengthSlider.value()).toFixed(1));
    temporalStrengthLabel.html(Number(temporalStrengthSlider.value()).toFixed(2));
    temporalDecayLabel.html(Number(temporalDecaySlider.value()).toFixed(2));
  }
}

// --- Export Automation Functions ---
function resetExport() {
  exportMode = false;
  currentFrameForExport = 0;
  currentFrameForExportInput.value = 0;
  currentFrameLabel.html(currentFrameForExport);
  console.log("Export mode deactivated. Current frame reset to 0.");
}

function startExport() {
  if (!currentSourceReady) {
    console.warn("Source media not ready for export. Please upload an image or video first, or ensure camera is active.");
    return;
  }

  totalFramesForExport = Number(totalFramesForExportInput.value());
  if (totalFramesForExport <= 0) {
    console.error("Total frames for export must be a positive number.");
    return;
  }

  exportMode = true;
  currentFrameForExport = 0;
  currentFrameForExportInput.value = currentFrameForExport;
  currentFrameLabel.html(currentFrameForExport);
  // Redraw once to initialize the first frame
  redraw();

  console.log(`Export mode activated for ${totalFramesForExport} frames. Drag first image, then use 'Next Frame' and 'Download Image'.`);
}

function goToNextFrame() {
  if (!exportMode) {
    console.warn("Please click 'Start Export' first to begin the frame-based LFO process.");
    return;
  }

  if (currentFrameForExport < totalFramesForExport - 1) {
    currentFrameForExport++;
    currentFrameForExportInput.value = currentFrameForExport;
    currentFrameLabel.html(currentFrameForExport);
    redraw(); // Request a redraw for the next frame
  } else {
    console.log("Reached the last frame. Resetting export mode.");
    resetExport();
  }
}

// --- MIDI Functions ---
function onMIDISuccess(midiAccess) {
  for (let input of midiAccess.inputs.values()) {
    input.onmidimessage = handleCustomMIDIMessage;
  }
}

function handleCustomMIDIMessage(message) {
  const [status, cc, val] = message.data;
  const midiMap = {
    120: 'depthSlider',
    121: 'tiltXSlider',
    122: 'tiltYSlider',
    123: 'scaleSlider',
    124: 'densitySlider',
    125: 'lfoFreq',
    126: 'lfoAmp',
    40: 'shapeXSlider',
    41: 'shapeYSlider',
    42: 'waveAmpSlider',
    43: 'waveFreqSlider',
    46: 'gammaSlider',
    47: 'horizAmpSlider',
    48: 'vertAmpSlider',
    51: 'offsetXSlider',
    52: 'offsetYSlider',

    32: 'lfoDepth',
    33: 'lfoTiltX',
    34: 'lfoTiltY',
    35: 'lfoScale',
    38: 'lfoShapeX',
    39: 'lfoShapeY',
    44: 'lfoWaveAmp',
    45: 'lfoWaveFreq',
    49: 'lfoHorizAmp',
    50: 'lfoVertAmp',
    53: 'lfoOffsetX',
    54: 'lfoOffsetY',

    // --- MIDI Mappings for New Shader Uniform Sliders ---
    55: 'blurRadiusSlider',
    56: 'edgeThresholdSlider',
    57: 'edgeIntensitySlider',
    58: 'normalEdgeStrengthSlider',
    59: 'depthEdgeStrengthSlider',
    60: 'temporalStrengthSlider',
    61: 'temporalDecaySlider'
  };

  let controlId = midiMap[cc];
  if (!controlId) return;

  let control = select(`#${controlId}`);
  if (!control) {
    console.warn(`MIDI CC ${cc} mapped to non-existent control ID: ${controlId}`);
    return;
  }

  if (control.elt.type === 'range') {
    let min = Number(control.elt.min);
    let max = Number(control.elt.max);
    let mapped = min + (val / 127) * (max - min);
    control.value(mapped);
  } else if (control.elt.type === 'checkbox') {
    if (val > 0) {
      control.elt.checked = !control.elt.checked;
    }
  }
}