// sketch.js
let cam, uploadedMedia, uploadedType = null;
let stepSize = 6;

// Shader variable
let theShader;
let graphics;     // p5.Graphics object for offscreen rendering with shader

// Loading state indicator
let isLoading = false;
let loadingMessage = "Loading media...";

function preload() {
  // Load the shaders
  theShader = loadShader('vert.glsl', 'frag.glsl');
}

// Existing sliders
let depthSlider, tiltXSlider, tiltYSlider, scaleSlider, densitySlider;
let camSelect, imgInput, vidInput;

// Existing LFO controls
let lfoDepth, lfoTiltX, lfoTiltY, lfoScale, lfoFreqSlider, lfoAmpSlider, lfoTypeSelector;

// LFO checkboxes for Shape and Wave effects
let lfoShapeX, lfoShapeY, lfoWaveAmp, lfoWaveFreq;

// Variables for Shape and Wave Displacement effects
let shapeXValue = 0;
let shapeYValue = 0;
let waveAmplitude = 0;
let waveFrequency = 0;

// Gamma Correction variable
let gammaValue = 2.2;

// Sliders and labels for Shape and Wave Displacement
let shapeXSlider, shapeYSlider, shapeXLabel, shapeYLabel;
let waveAmpSlider, waveAmpLabel;
let waveFreqSlider, waveFreqLabel;

// Gamma Slider and Label
let gammaSlider, gammaLabel;

// Ramp Amplification variables
let horizAmpSlider, horizAmpLabel;
let vertAmpSlider, vertAmpLabel;
let lfoHorizAmp, lfoVertAmp;
let horizontalAmplification = 1.0;
let verticalAmplification = 1.0;

// NEW: Offset variables for the D-pad
let offsetXSlider, offsetYSlider, offsetXLabel, offsetYLabel;
let lfoOffsetX, lfoOffsetY;
let offsetX = 0;
let offsetY = 0;

// Single flag to indicate if the current source (camera or uploaded media) is ready
let currentSourceReady = false;

let selectedDeviceId = null;
let controlsHovering = false;

let rotX = 30;
let rotY = 0;
let targetRotX = 30;
let targetRotY = 0;

let lfoPhase = 0; // For real-time LFO
let lfoTypes = ['saw', 'sin', 'tri'];

// Download button variable
let downloadBtn;

// NEW: Export automation variables
let currentFrameForExportInput, totalFramesForExportInput, startExportBtn, nextFrameBtn, currentFrameLabel;
let currentFrameForExport = 0;
let totalFramesForExport = 0;
let exportMode = false; // Flag to indicate if we are in export mode

function setup() {
  createCanvas(1280, 720, WEBGL);
  graphics = createGraphics(width, height, WEBGL); // Create a WEBGL graphics object

  // Apply the shader to the graphics object
  graphics.shader(theShader);

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

  // Initialize new sliders and labels
  horizAmpSlider = select("#horizAmpSlider");
  horizAmpLabel = select("#horizAmpLabel");
  vertAmpSlider = select("#vertAmpSlider");
  vertAmpLabel = select("#vertAmpLabel");
  lfoHorizAmp = select("#lfoHorizAmp");
  lfoVertAmp = select("#lfoVertAmp");

  // NEW: Initialize offset sliders and labels
  offsetXSlider = select("#offsetXSlider");
  offsetYSlider = select("#offsetYSlider");
  offsetXLabel = select("#offsetXLabel");
  offsetYLabel = select("#offsetYLabel");
  lfoOffsetX = select("#lfoOffsetX");
  lfoOffsetY = select("#lfoOffsetY");

  // Initialize download button and add click listener
  downloadBtn = select("#downloadBtn");
  downloadBtn.mousePressed(saveImage);

  // NEW: Initialize export controls
  currentFrameForExportInput = select("#currentFrameForExportInput"); // Hidden input
  totalFramesForExportInput = select("#totalFramesForExportInput");
  startExportBtn = select("#startExportBtn");
  startExportBtn.mousePressed(startExport);
  nextFrameBtn = select("#nextFrameBtn"); // New button
  nextFrameBtn.mousePressed(goToNextFrame); // New button handler
  currentFrameLabel = select("#currentFrameLabel"); // New label


  let controlsDiv = select("#controls");
  controlsDiv.mouseOver(() => controlsHovering = true);
  controlsDiv.mouseOut(() => controlsHovering = false);

  imgInput.changed(handleImageUpload);
  vidInput.changed(handleVideoUpload);

  // Add drag and drop functionality
  let mainCanvas = select("main");
  mainCanvas.dragOver(() => {
    // Prevent default browser behavior for drag and drop
    return false;
  });
  mainCanvas.drop(handleFileDrop);


  shapeXSlider.input(() => {
    shapeXValue = Number(shapeXSlider.value());
    shapeXLabel.html(shapeXValue.toFixed(1));
  });
  shapeYSlider.input(() => {
    shapeYValue = Number(shapeYSlider.value());
    shapeYLabel.html(shapeYValue.toFixed(1));
  });
  waveAmpSlider.input(() => {
    waveAmplitude = Number(waveAmpSlider.value());
    waveAmpLabel.html(waveAmplitude.toFixed(1));
  });
  waveFreqSlider.input(() => {
    waveFrequency = Number(waveFreqSlider.value());
    waveFreqLabel.html(waveFrequency.toFixed(1));
  });

  gammaSlider.input(() => {
    gammaValue = Number(gammaSlider.value());
    gammaLabel.html(gammaValue.toFixed(1));
  });

  // Input handlers for new sliders
  horizAmpSlider.input(() => {
    horizontalAmplification = Number(horizAmpSlider.value());
    horizAmpLabel.html(horizontalAmplification.toFixed(1));
  });
  vertAmpSlider.input(() => {
    verticalAmplification = Number(vertAmpSlider.value());
    vertAmpLabel.html(verticalAmplification.toFixed(1));
  });

  // NEW: Input handlers for offset sliders
  offsetXSlider.input(() => {
    offsetX = Number(offsetXSlider.value());
    offsetXLabel.html(offsetX.toFixed(0));
  });
  offsetYSlider.input(() => {
    offsetY = Number(offsetYSlider.value());
    offsetYLabel.html(offsetY.toFixed(0));
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
  }).catch(err => {
    console.error("Error enumerating media devices:", err);
    loadingMessage = "Camera access denied or no devices found.";
  });

  camSelect.changed(() => {
    selectedDeviceId = camSelect.value();
    if (cam) cam.remove();
    uploadedMedia = null; // Clear uploaded media if switching to camera
    uploadedType = null;
    currentSourceReady = false; // Reset flag for new source
    isLoading = true; // Set loading state
    loadingMessage = "Starting camera...";
    startCam(selectedDeviceId);
  });

  strokeWeight(1);
  noFill();

  if (navigator.requestMIDIAccess) {
    navigator.requestMIDIAccess().then(onMIDISuccess).catch(err => {
      console.error("MIDI access denied:", err);
    });
  }

  // Initialize current frame display
  currentFrameLabel.html(currentFrameForExport);
}

function startCam(deviceId) {
  uploadedMedia = null;
  uploadedType = null;
  currentSourceReady = false; // Reset flag
  isLoading = true; // Set loading state
  loadingMessage = "Starting camera...";

  if (cam) cam.remove(); // Remove existing camera
  cam = createCapture({ video: { deviceId: { exact: deviceId } } },
    (stream) => { // Success callback
      cam.size(640, 480);
      cam.hide();
      currentSourceReady = true; // Camera is ready to be drawn
      isLoading = false; // Clear loading state
      loadingMessage = "";
    },
    (err) => { // Error callback
      console.error("Camera stream error:", err);
      currentSourceReady = false;
      isLoading = false; // Clear loading state
      loadingMessage = `Camera error: ${err.name} - ${err.message}`;
      cam = null;
    }
  );
  cam.elt.onloadedmetadata = () => { // Ensure dimensions are explicitly loaded for native element
    currentSourceReady = true;
    isLoading = false;
    loadingMessage = "";
  };
}

function handleImageUpload() {
  currentSourceReady = false; // Reset flag
  isLoading = true; // Set loading state
  loadingMessage = "Loading image...";

  if (cam) cam.remove();
  cam = null;
  uploadedMedia = null; // Clear previous media
  uploadedType = null;

  if (imgInput.elt.files.length > 0) {
    let file = imgInput.elt.files[0];
    loadImage(URL.createObjectURL(file), img => {
      img.resize(640, 480);
      uploadedMedia = img;
      uploadedType = 'image';
      currentSourceReady = true; // Image is fully loaded and ready
      isLoading = false; // Clear loading state
      loadingMessage = "";
    }, (event) => { // Error callback for loadImage
      console.error("Error loading image:", event);
      currentSourceReady = false;
      isLoading = false; // Clear loading state
      loadingMessage = `Image load error: ${event}`;
    });
  } else {
    isLoading = false;
    loadingMessage = "";
  }
}

function handleVideoUpload() {
  currentSourceReady = false; // Reset flag
  isLoading = true; // Set loading state
  loadingMessage = "Loading video...";

  if (cam) cam.remove();
  cam = null;
  uploadedMedia = null; // Clear previous media
  uploadedType = null;

  if (vidInput.elt.files.length > 0) {
    let file = vidInput.elt.files[0];
    let vid = createVideo([URL.createObjectURL(file)]);

    // Crucial: Wait for the video's metadata to be loaded
    vid.elt.onloadedmetadata = () => {
      vid.size(640, 480); // Set size after metadata is available
      vid.hide();
      vid.loop();
      vid.volume(0);
      vid.play(); // Explicitly play the video
      uploadedMedia = vid;
      uploadedType = 'video';
      currentSourceReady = true; // Video is now fully loaded and ready
      isLoading = false; // Clear loading state
      loadingMessage = "";
    };

    vid.elt.onerror = (e) => { // Basic error handling for video
      console.error("Video loading error:", e);
      currentSourceReady = false;
      isLoading = false; // Clear loading state
      loadingMessage = `Video load error: ${e.message || e}`;
      uploadedMedia = null;
    };

    vid.elt.load(); // Explicitly tell the video element to load
  } else {
    isLoading = false;
    loadingMessage = "";
  }
}

// Function to handle file drop
function handleFileDrop(file) {
  isLoading = true; // Set loading state
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
      console.error("Error loading dropped image:", event);
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
      vid.play(); // Explicitly play the video
      uploadedMedia = vid;
      uploadedType = 'video';
      currentSourceReady = true;
      isLoading = false;
      loadingMessage = "";
    };

    vid.elt.onerror = (e) => {
      console.error("Video loading error from drop:", e);
      currentSourceReady = false;
      isLoading = false;
      loadingMessage = `Dropped video error: ${e.message || e}`;
      uploadedMedia = null;
    };

    vid.elt.load();
  } else {
    isLoading = false;
    loadingMessage = "Unsupported file type dropped.";
    console.warn("Unsupported file type dropped:", file.type);
  }
}

// Function to save the canvas as an image
function saveImage() {
  if (exportMode) {
    saveCanvas(`rutt-etra-frame-${nf(currentFrameForExport, 4)}`, 'png');
  } else {
    saveCanvas('rutt-etra-output', 'png');
  }
}

function getLFOValue(type, freq) {
  lfoPhase += freq * 0.01;
  if (lfoPhase > 1) lfoPhase -= 1;

  switch (type) {
    case "saw": return (lfoPhase * -2.0); // Assuming this goes from -1 to 1, with 0 as midpoint
    case "sin":
      {
        const rawSine = sin(TWO_PI * lfoPhase);
        // This is the part that makes it steeper at 0
        // 'exponent' MUST be an odd integer (e.g., 3, 5, 7, ...)
        const exponent = 3; // Or 5, 7, etc., for more pronounced steepness
        return Math.pow(rawSine, exponent);
      }
    case "tri": return abs((lfoPhase * 4) - 2) - 1; // Assuming this goes from -1 to 1, with 0 as midpoint
    default: return 0;
  }
}

function getLFOValueForExport(type, currentFrame, totalFrames) {
  if (totalFrames <= 0) return 0;

  let phase = (currentFrame % totalFrames) / totalFrames;

  switch (type) {
    case "saw": return (phase * 2.0) - 1.0;
    case "sin": return sin(TWO_PI * lfoPhase);
    case "tri": return abs((phase * 4) - 2) - 1;
    default: return 0;
  }
}

function draw() {
  background(0); // Clear the main canvas

  let src = null;
  if (uploadedMedia && uploadedType === 'image' && currentSourceReady) src = uploadedMedia;
  else if (uploadedMedia && uploadedType === 'video' && currentSourceReady) src = uploadedMedia;
  else if (cam && currentSourceReady) src = cam;

  if (!src || !src.width || !src.height || isLoading) {
    // Display loading message if media is not ready or still loading
    fill(255);
    textSize(24);
    textAlign(CENTER, CENTER);
    text(loadingMessage, 0, 0); // Display in the center of the canvas
    return;
  }

  // Clear the graphics buffer before drawing to it
  graphics.clear();

  // Bind the source directly as a texture to the graphics object
  graphics.texture(src);

  // Set uniforms for the shader
  if (theShader) {
    graphics.shader(theShader);
    theShader.setUniform('uSampler', src);
    theShader.setUniform('uResolution', [width, height]);
    theShader.setUniform('uTextureResolution', [src.width, src.height]);
    theShader.setUniform('uGamma', gammaValue);

    // LFO calculations for uniforms
    let lfoFreq = Number(lfoFreqSlider.value());
    let lfoAmp = Number(lfoAmpSlider.value());
    let lfoType = lfoTypeSelector.value();
    let lfo;

    if (exportMode) {
      lfo = getLFOValueForExport(lfoType, currentFrameForExport, totalFramesForExport);
    } else {
      lfo = getLFOValue(lfoType, lfoFreq);
    }

    // Apply LFO to existing base values and pass as uniforms
    let depth = Number(depthSlider.value()) + (lfoDepth.checked() ? lfo * 300 * lfoAmp : 0);
    let tiltX = radians(Number(tiltXSlider.value())) + (lfoTiltX.checked() ? lfo * PI * lfoAmp : 0);
    let tiltY = radians(Number(tiltYSlider.value())) + (lfoTiltY.checked() ? lfo * PI * lfoAmp : 0);
    let scl = Number(scaleSlider.value()) + (lfoScale.checked() ? lfo * 1.5 * lfoAmp : 0);

    let currentShapeXValue = Number(shapeXSlider.value()) + (lfoShapeX.checked() ? lfo * 5 * lfoAmp : 0);
    let currentShapeYValue = Number(shapeYSlider.value()) + (lfoShapeY.checked() ? lfo * 5 * lfoAmp : 0);
    let currentWaveAmplitude = Number(waveAmpSlider.value()) + (lfoWaveAmp.checked() ? lfo * 200 * lfoAmp : 0);
    let currentWaveFrequency = Number(waveFreqSlider.value()) + (lfoWaveFreq.checked() ? lfo * 20 * lfoAmp : 0);
    currentWaveFrequency = max(0, currentWaveFrequency);

    let currentHorizAmp = Number(horizAmpSlider.value()) + (lfoHorizAmp.checked() ? lfo * 0.5 * lfoAmp : 0);
    let currentVertAmp = Number(vertAmpSlider.value()) + (lfoVertAmp.checked() ? lfo * 0.5 * lfoAmp : 0);
    currentHorizAmp = max(0, currentHorizAmp);
    currentVertAmp = max(0, currentVertAmp);

    let currentOffsetX = Number(offsetXSlider.value()) + (lfoOffsetX.checked() ? lfo * 100 * lfoAmp : 0);
    let currentOffsetY = Number(offsetYSlider.value()) + (lfoOffsetY.checked() ? lfo * 100 * lfoAmp : 0);

    // Pass all these calculated values as uniforms to the shader
    theShader.setUniform('uCameraPosition', [0.0, 0.0, 0.0]);
    theShader.setUniform('uDepth', depth);
    theShader.setUniform('uShapeX', currentShapeXValue);
    theShader.setUniform('uShapeY', currentShapeYValue);
    theShader.setUniform('uWaveAmp', currentWaveAmplitude);
    theShader.setUniform('uWaveFreq', currentWaveFrequency);
    theShader.setUniform('uHorizAmp', currentHorizAmp);
    theShader.setUniform('uVertAmp', currentVertAmp);
    theShader.setUniform('uOffsetX', currentOffsetX);
    theShader.setUniform('uOffsetY', currentOffsetY);
    theShader.setUniform('uTime', frameCount * 0.01);
    theShader.setUniform('uStepSize', float(int(densitySlider.value())));
    theShader.setUniform('uFrameCount', float(frameCount));

    // Apply transformations directly to the graphics object
    graphics.push();
    graphics.translate(0, 0, 0); // Z-displacement is handled in shader
    graphics.rotateX(tiltX);
    graphics.rotateY(tiltY);
    graphics.scale(scl);
    graphics.noStroke();

    // Calculate subdivisions for the plane based on density slider
    // This creates a mesh with enough vertices for per-line Z-displacement
    // A higher density (lower stepSize) means more vertical subdivisions.
    let detailY = max(2, int(height / densitySlider.value())); // Number of vertical subdivisions
    let detailX = max(2, int(width / densitySlider.value())); // Increased horizontal detail for smoother displacement

    // Draw a highly subdivided plane to cover the entire graphics canvas
    graphics.plane(width, height, detailX, detailY);
    graphics.pop();
  }

  // Render the graphics object to the main canvas
  image(graphics, -width / 2, -height / 2, width, height);

  // Update labels (these are still in JS)
  select("#depthLabel").html(Number(depthSlider.value()).toFixed(0));
  select("#tiltXLabel").html((Number(tiltXSlider.value())).toFixed(0) + "°");
  select("#tiltYLabel").html(tiltYSlider.value() + "°");
  select("#scaleLabel").html(Number(scaleSlider.value()).toFixed(2));
  select("#densityLabel").html(int(densitySlider.value()));
  select("#shapeXLabel").html(Number(shapeXSlider.value()).toFixed(1));
  select("#shapeYLabel").html(Number(shapeYSlider.value()).toFixed(1));
  select("#waveAmpLabel").html(Number(waveAmpSlider.value()).toFixed(1));
  select("#waveFreqLabel").html(Number(waveFreqSlider.value()).toFixed(1));
  select("#gammaLabel").html(Number(gammaSlider.value()).toFixed(1));
  select("#horizAmpLabel").html(Number(horizAmpSlider.value()).toFixed(1));
  select("#vertAmpLabel").html(Number(vertAmpSlider.value()).toFixed(1));
  select("#offsetXLabel").html(Number(offsetXSlider.value()).toFixed(0));
  select("#offsetYLabel").html(Number(offsetYSlider.value()).toFixed(0));
}

function resetExport() {
  exportMode = false;
  currentFrameForExport = 0;
  currentFrameForExportInput.value = 0;
  currentFrameLabel.html(currentFrameForExport);
  console.log("Export mode deactivated. Current frame reset to 0.");
}

function startExport() {
  if (!currentSourceReady) {
    console.warn("Source media not ready for export. Please upload an image or video first.");
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
    redraw();
  } else {
    console.log("Reached the last frame. Resetting export mode.");
    resetExport();
  }
}

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
    54: 'lfoOffsetY'
  };

  let controlId = midiMap[cc];
  if (!controlId) return;

  let control = select(`#${controlId}`);
  if (!control) return;

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
