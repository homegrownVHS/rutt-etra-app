// sketch.js
let cam, uploadedMedia, uploadedType = null;
let stepSize = 6;

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
let shapeXSlider, shapeYSlider, shapeXLabel, shapeYYLabel;
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
  });

  camSelect.changed(() => {
    selectedDeviceId = camSelect.value();
    if (cam) cam.remove();
    uploadedMedia = null; // Clear uploaded media if switching to camera
    uploadedType = null;
    currentSourceReady = false; // Reset flag for new source
    startCam(selectedDeviceId);
  });

  strokeWeight(1);
  noFill();

  if (navigator.requestMIDIAccess) {
    navigator.requestMIDIAccess().then(onMIDISuccess);
  }

  // Initialize current frame display
  currentFrameLabel.html(currentFrameForExport);
}

function startCam(deviceId) {
  uploadedMedia = null;
  uploadedType = null;
  currentSourceReady = false; // Reset flag
  if (cam) cam.remove(); // Remove existing camera
  cam = createCapture({ video: { deviceId: { exact: deviceId } } }, () => {
    // This callback runs when the camera stream is ready to be played.
    // Dimensions should be available shortly after this.
    cam.size(640, 480);
    cam.hide();
    currentSourceReady = true; // Camera is ready to be drawn
  });
  cam.elt.onloadedmetadata = () => { // Ensure dimensions are explicitly loaded for native element
      currentSourceReady = true;
  };

  cam.elt.onerror = (e) => { // Basic error handling for camera
      console.error("Camera stream error:", e);
      currentSourceReady = false;
      cam = null;
  };
}

function handleImageUpload() {
  currentSourceReady = false; // Reset flag
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
    }, (event) => { // Error callback for loadImage
        console.error("Error loading image:", event);
        currentSourceReady = false;
    });
  }
}

function handleVideoUpload() {
  currentSourceReady = false; // Reset flag
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
      uploadedMedia = vid;
      uploadedType = 'video';
      currentSourceReady = true; // Video is now fully loaded and ready
    };

    vid.elt.onerror = (e) => { // Basic error handling for video
      console.error("Video loading error:", e);
      currentSourceReady = false;
      uploadedMedia = null;
    };

    vid.elt.load(); // Explicitly tell the video element to load
  }
}

// Function to handle file drop
function handleFileDrop(file) {
  if (file.type === 'image') {
    currentSourceReady = false;
    if (cam) cam.remove();
    cam = null;
    uploadedMedia = null;
    uploadedType = null;

    loadImage(file.data, img => {
      img.resize(640, 480);
      uploadedMedia = img;
      uploadedType = 'image';
      currentSourceReady = true;
    }, (event) => {
        console.error("Error loading dropped image:", event);
        currentSourceReady = false;
    });
  } else if (file.type === 'video') {
    currentSourceReady = false;
    if (cam) cam.remove();
    cam = null;
    uploadedMedia = null;
    uploadedType = null;

    let vid = createVideo([file.data]);
    vid.elt.onloadedmetadata = () => {
      vid.size(640, 480);
      vid.hide();
      vid.loop();
      vid.volume(0);
      uploadedMedia = vid;
      uploadedType = 'video';
      currentSourceReady = true;
    };

    vid.elt.onerror = (e) => {
      console.error("Video loading error from drop:", e);
      currentSourceReady = false;
      uploadedMedia = null;
    };

    vid.elt.load();
  }
}

// Function to save the canvas as an image
function saveImage() {
  // Use saveCanvas() from p5.js to download the current canvas frame
  // Name the file with the current export frame if in export mode
  if (exportMode) {
    saveCanvas(`rutt-etra-frame-${nf(currentFrameForExport, 4)}`, 'png');
  } else {
    saveCanvas('rutt-etra-output', 'png');
  }
}

function applyGamma(value, gamma) {
  return pow(value, 1 / gamma);
}

function applyParabolicBend(normalizedValue, shapeFactor) {
  const center = 0.5;
  return shapeFactor * (normalizedValue - center) * (normalizedValue - center);
}

// MODIFIED: Added horizontalAmplification and verticalAmplification parameters
function getWarpedCoordinates(x, y, videoWidth, videoHeight, shapeXFactor, shapeYFactor, currentWaveAmplitude, currentWaveFrequency, horizontalAmplification, verticalAmplification) {
  const normalizedY = y / videoHeight;
  const normalizedX = x / videoWidth;

  const horizontalBendAmount = applyParabolicBend(normalizedY, shapeXFactor);
  const verticalBendAmount = applyParabolicBend(normalizedX, shapeYFactor);

  const scaledWaveAmplitudeX = currentWaveAmplitude * (videoWidth / 640);
  const scaledWaveAmplitudeY = currentWaveAmplitude * (videoHeight / 480);

  const waveDisplacementX = scaledWaveAmplitudeX * sin(normalizedY * PI * 2 * currentWaveFrequency);
  const waveDisplacementY = scaledWaveAmplitudeY * sin(normalizedX * PI * 2 * currentWaveFrequency);

  // Apply amplification to x and y coordinates
  let warpedX = (x * horizontalAmplification) + waveDisplacementX;
  let warpedY = (y * verticalAmplification) + (verticalBendAmount * videoHeight * 1.0) + (horizontalBendAmount * videoWidth * 1.0) + waveDisplacementY;

  return { warpedX, warpedY };
}

// Original LFO calculation for real-time
function getLFOValue(type, freq) {
  lfoPhase += freq * 0.01;
  if (lfoPhase > 1) lfoPhase -= 1;

  switch (type) {
    case "saw": return (lfoPhase * 2.0) - 1.0;
    case "sin": return sin(TWO_PI * lfoPhase);
    case "tri": return abs((lfoPhase * 4) - 2) - 1;
    default: return 0;
  }
}

// NEW: LFO calculation for export mode (frame-based)
function getLFOValueForExport(type, currentFrame, totalFrames) {
  if (totalFrames <= 0) return 0; // Avoid division by zero

  // Calculate phase based on the current frame and total frames
  // This ensures one full cycle over the totalFrames
  let phase = (currentFrame % totalFrames) / totalFrames;

  switch (type) {
    case "saw": return (phase * 2.0) - 1.0;
    case "sin": return sin(TWO_PI * phase);
    case "tri": return abs((phase * 4) - 2) - 1;
    default: return 0;
  }
}

// REMOVED: mouseDragged() function

function draw() {
  background(0);

  let src = null;
  if (uploadedMedia && uploadedType === 'image' && currentSourceReady) src = uploadedMedia;
  else if (uploadedMedia && uploadedType === 'video' && currentSourceReady) src = uploadedMedia;
  else if (cam && currentSourceReady) src = cam;

  // IMPORTANT: Only proceed if src exists and its dimensions are valid
  if (!src || !src.width || !src.height) {
    // Optional: Display a loading message
    // text("Loading media...", width / 2, height / 2);
    return;
  }

  let baseDepth = Number(depthSlider.value());
  let baseTiltX = radians(Number(tiltXSlider.value()) + 90);
  let baseTiltY = radians(Number(tiltYSlider.value()));
  let baseScale = Number(scaleSlider.value());
  stepSize = int(densitySlider.value()/2);

  let lfoFreq = Number(lfoFreqSlider.value());
  let lfoAmp = Number(lfoAmpSlider.value());
  let lfoType = lfoTypeSelector.value();
  let lfo;

  // Choose LFO calculation based on export mode
  if (exportMode) {
    lfo = getLFOValueForExport(lfoType, currentFrameForExport, totalFramesForExport);
  } else {
    lfo = getLFOValue(lfoType, lfoFreq);
  }


  // Apply LFO to existing base values
  let depth = baseDepth + (lfoDepth.checked() ? lfo * 300 * lfoAmp : 0);
  let tiltX = baseTiltX + (lfoTiltX.checked() ? lfo * PI * lfoAmp : 0);
  let tiltY = baseTiltY + (lfoTiltY.checked() ? lfo * PI * lfoAmp : 0);
  let scl = baseScale + (lfoScale.checked() ? lfo * 1.5 * lfoAmp : 0);


  // Get base values for Shape and Wave effects
  let baseShapeXValue = Number(shapeXSlider.value());
  let baseShapeYValue = Number(shapeYSlider.value());
  let baseWaveAmplitude = Number(waveAmpSlider.value());
  let baseWaveFrequency = Number(waveFreqSlider.value());

  // Apply LFO to Shape and Wave values
  let currentShapeXValue = baseShapeXValue + (lfoShapeX.checked() ? lfo * 5 * lfoAmp : 0);
  let currentShapeYValue = baseShapeYValue + (lfoShapeY.checked() ? lfo * 5 * lfoAmp : 0);
  let currentWaveAmplitude = baseWaveAmplitude + (lfoWaveAmp.checked() ? lfo * 200 * lfoAmp : 0);
  let currentWaveFrequency = baseWaveFrequency + (lfoWaveFreq.checked() ? lfo * 20 * lfoAmp : 0);

  // Ensure frequency doesn't go negative if LFO causes it
  currentWaveFrequency = max(0, currentWaveFrequency);

  // Get base values for Ramp Amplification effects
  let baseHorizAmp = Number(horizAmpSlider.value());
  let baseVertAmp = Number(vertAmpSlider.value());

  // Apply LFO to Ramp Amplification values
  let currentHorizAmp = baseHorizAmp + (lfoHorizAmp.checked() ? lfo * 0.5 * lfoAmp : 0);
  let currentVertAmp = baseVertAmp + (lfoVertAmp.checked() ? lfo * 0.5 * lfoAmp : 0);

  // Ensure amplification values don't go negative
  currentHorizAmp = max(0, currentHorizAmp);
  currentVertAmp = max(0, currentVertAmp);

  // NEW: Get base values for Offset and apply LFO
  let baseOffsetX = Number(offsetXSlider.value());
  let baseOffsetY = Number(offsetYSlider.value());
  let currentOffsetX = baseOffsetX + (lfoOffsetX.checked() ? lfo * 100 * lfoAmp : 0); // Adjust LFO amplitude as needed
  let currentOffsetY = baseOffsetY + (lfoOffsetY.checked() ? lfo * 100 * lfoAmp : 0); // Adjust LFO amplitude as needed

  // Update Labels for all controls
  select("#depthLabel").html(depth.toFixed(0));
  select("#tiltXLabel").html((Number(tiltXSlider.value())).toFixed(0) + "°");
  select("#tiltYLabel").html(tiltYSlider.value() + "°");
  select("#scaleLabel").html(scl.toFixed(2));
  select("#densityLabel").html(stepSize);
  select("#shapeXLabel").html(currentShapeXValue.toFixed(1));
  select("#shapeYLabel").html(currentShapeYValue.toFixed(1));
  select("#waveAmpLabel").html(currentWaveAmplitude.toFixed(1));
  select("#waveFreqLabel").html(currentWaveFrequency.toFixed(1));
  select("#gammaLabel").html(gammaValue.toFixed(1));
  // Update labels for new sliders
  select("#horizAmpLabel").html(currentHorizAmp.toFixed(1));
  select("#vertAmpLabel").html(currentVertAmp.toFixed(1));
  // NEW: Update labels for offset sliders
  select("#offsetXLabel").html(currentOffsetX.toFixed(0));
  select("#offsetYLabel").html(currentOffsetY.toFixed(0));


  rotX = lerp(rotX, targetRotX, 0.1);
  rotY = lerp(rotY, targetRotY, 0.1);

  let bufferWidth = src.width;
  let bufferHeight = src.height;

  let canvasAspect = width / height;
  let bufferAspect = bufferWidth / bufferHeight;
  let scaleFactor = bufferAspect > canvasAspect
    ? width / bufferWidth
    : height / bufferHeight;

  push();
  rotateX(rotX + tiltX);
  rotateY(rotY + tiltY);
  scale(scl * scaleFactor);

  // Adjust translation based on current amplification values to re-center the raster
  // NEW: Apply translation based on currentOffsetX and currentOffsetY
  translate(
    -bufferWidth * currentHorizAmp / 2 + currentOffsetX,
    -bufferHeight * currentVertAmp / 2 + currentOffsetY
  );

  src.loadPixels();
  if (src.pixels.length === 0) {
    pop();
    return;
  }

  for (let y = 0; y < bufferHeight; y += stepSize) {
    beginShape();
    for (let x = 0; x < bufferWidth; x += stepSize) {
      // Pass new amplification values
      const { warpedX, warpedY } = getWarpedCoordinates(x, y, bufferWidth, bufferHeight, currentShapeXValue, currentShapeYValue, currentWaveAmplitude, currentWaveFrequency, currentHorizAmp, currentVertAmp);

      let idx = (x + y * bufferWidth) * 4;
      let r = src.pixels[idx];
      let g = src.pixels[idx + 1];
      let b = src.pixels[idx + 2];

      let bright = (r + g + b) / (3 * 255);
      let gammaCorrectedBright = applyGamma(bright, gammaValue);

      let z = map(gammaCorrectedBright, 0, 1, -abs(depth), abs(depth));
      if (depth < 0) z *= -1;

      stroke(
        applyGamma(r / 255, gammaValue) * 255,
        applyGamma(g / 255, gammaValue) * 255,
        applyGamma(b / 255, gammaValue) * 255
      );
      vertex(warpedX, warpedY, z);
    }
    endShape();
  }
  pop();
}

// Function to reset export state (e.g., after completing a video)
function resetExport() {
  exportMode = false;
  currentFrameForExport = 0;
  currentFrameForExportInput.value = 0; // Update hidden input
  currentFrameLabel.html(currentFrameForExport); // Update UI label
  console.log("Export mode deactivated. Current frame reset to 0.");
}

// NEW: Automated export initiation
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

  // Set export mode to true, so draw() uses the frame-based LFO
  exportMode = true;
  currentFrameForExport = 0; // Reset frame counter for a new export session
  currentFrameForExportInput.value = currentFrameForExport; // Update hidden input
  currentFrameLabel.html(currentFrameForExport); // Update UI label

  console.log(`Export mode activated for ${totalFramesForExport} frames. Drag first image, then use 'Next Frame' and 'Download Image'.`);
}

// NEW: Function to go to the next frame
function goToNextFrame() {
  if (!exportMode) {
    console.warn("Please click 'Start Export' first to begin the frame-based LFO process.");
    return;
  }

  if (currentFrameForExport < totalFramesForExport - 1) {
    currentFrameForExport++;
    currentFrameForExportInput.value = currentFrameForExport; // Update hidden input
    currentFrameLabel.html(currentFrameForExport); // Update UI label
    console.log(`Moved to frame: ${currentFrameForExport}`);
    redraw(); // Force a redraw to show the updated LFO state for the current frame
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
    // MIDI mapping for new sliders
    47: 'horizAmpSlider',
    48: 'vertAmpSlider',
    // NEW: MIDI mapping for offset sliders
    51: 'offsetXSlider', // Assign a unique CC number for offsetX
    52: 'offsetYSlider', // Assign a unique CC number for offsetY

    32: 'lfoDepth',
    33: 'lfoTiltX',
    34: 'lfoTiltY',
    35: 'lfoScale',
    38: 'lfoShapeX',
    39: 'lfoShapeY',
    44: 'lfoWaveAmp',
    45: 'lfoWaveFreq',
    // MIDI mapping for new LFO checkboxes
    49: 'lfoHorizAmp',
    50: 'lfoVertAmp',
    // NEW: MIDI mapping for LFO offset checkboxes
    53: 'lfoOffsetX', // Assign a unique CC number for lfoOffsetX
    54: 'lfoOffsetY'  // Assign a unique CC number for lfoOffsetY
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
    // Toggle checkbox only if the MIDI value is non-zero (or a specific trigger value)
    if (val > 0) { // Assuming any non-zero value acts as a toggle signal
        control.elt.checked = !control.elt.checked;
    }
    // For MIDI buttons that send 0 and 127 for on/off:
    // control.elt.checked = (val > 63); // For on/off behavior
  }
}