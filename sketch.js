// sketch.js
let cam, uploadedMedia, uploadedType = null;
let stepSize = 6;

// Shader variable
let theShader;
let graphics; // p5.Graphics object for offscreen rendering with shader

// Loading state indicator
let isLoading = false;
let loadingMessage = "Initializing..."; // Changed default message

// NO FONT VARIABLE HERE

function preload() {
  // Load the shaders
  theShader = loadShader('vert.glsl', 'frag.glsl');
  // NO FONT LOADING HERE
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

// Offset variables for the D-pad
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

// Moving average filter for depth smoothing
let finalDepthHistory = [];
const finalDepthHistorySize = 50; // Tune this value (e.g., 5, 10, 20) for more/less smoothing

// Download button variable
let downloadBtn;

// Export automation variables
let currentFrameForExportInput, totalFramesForExportInput, startExportBtn, nextFrameBtn, currentFrameLabel;
let currentFrameForExport = 0;
let totalFramesForExport = 0;
let exportMode = false; // Flag to indicate if we are in export mode

function setup() {
  createCanvas(1280, 720, WEBGL);
  graphics = createGraphics(width, height, WEBGL); // Create a WEBGL graphics object

  // IMPORTANT FIX: disableCull() must be called on the drawingContext of the graphics object
  graphics.drawingContext.disable(graphics.drawingContext.CULL_FACE);

  // Apply the shader to the graphics object
  graphics.shader(theShader);

  // NO FONT SETTING HERE textFont(myFont);

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

  downloadBtn = select("#downloadBtn");
  downloadBtn.mousePressed(saveImage);

  currentFrameForExportInput = select("#currentFrameForExportInput"); // Hidden input
  totalFramesForExportInput = select("#totalFramesForExportInput");
  startExportBtn = select("#startExportBtn");
  startExportBtn.mousePressed(startExport);
  nextFrameBtn = select("#nextFrameBtn");
  nextFrameBtn.mousePressed(goToNextFrame);
  currentFrameLabel = select("#currentFrameLabel");

  let controlsDiv = select("#controls");
  controlsDiv.mouseOver(() => controlsHovering = true);
  controlsDiv.mouseOut(() => controlsHovering = false);

  // --- Event Listeners for UI ---
  imgInput.changed(handleImageUpload);
  vidInput.changed(handleVideoUpload);

  // Add drag and drop functionality
  let mainCanvas = select("main"); // Assuming your canvas is directly in <main> or has an ID
  if (!mainCanvas) { // Fallback if <main> isn't directly selectable
    mainCanvas = select("canvas"); // Try to select the canvas element directly
  }
  if (mainCanvas) {
    mainCanvas.dragOver(() => {
      return false; // Prevent default browser behavior
    });
    mainCanvas.drop(handleFileDrop);
  } else {
    console.warn("Could not find a canvas element for drag and drop. Make sure your canvas is in <main> or has a direct ID.");
  }

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

  horizAmpSlider.input(() => {
    horizontalAmplification = Number(horizAmpSlider.value());
    horizAmpLabel.html(horizontalAmplification.toFixed(1));
  });
  vertAmpSlider.input(() => {
    verticalAmplification = Number(vertAmpSlider.value());
    vertAmpLabel.html(verticalAmplification.toFixed(1));
  });

  offsetXSlider.input(() => {
    offsetX = Number(offsetXSlider.value());
    offsetXLabel.html(offsetX.toFixed(0));
  });
  offsetYSlider.input(() => {
    offsetY = Number(offsetYSlider.value());
    offsetYLabel.html(offsetY.toFixed(0));
  });

  // --- Camera Device Enumeration and Initial Start ---
  navigator.mediaDevices.enumerateDevices().then(devices => {
    const videoDevices = devices.filter(d => d.kind === 'videoinput');
    videoDevices.forEach((device, i) => {
      const option = createElement('option', device.label || `Camera ${i + 1}`);
      option.attribute('value', device.deviceId);
      camSelect.child(option);
    });
    selectedDeviceId = videoDevices[0]?.deviceId;
    if (selectedDeviceId) { // Only try to start camera if a device exists
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
    if (cam) cam.remove(); // Remove old camera before starting new one
    uploadedMedia = null; // Clear uploaded media if switching to camera
    uploadedType = null;
    startCam(selectedDeviceId); // Start the selected camera
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
}

// --- Camera & Media Handling Functions ---

// REVISED startCam function for maximum reliability, closer to minimal sketch but with error handling
function startCam(deviceId) {
  uploadedMedia = null;
  uploadedType = null;
  currentSourceReady = false; // Reset flag
  isLoading = true; // Set loading state
  loadingMessage = "Starting camera...";

  if (cam) {
    cam.remove(); // Remove existing camera if any
    cam = null;   // Ensure cam is null before creating new
  }

  // Use createCapture with a single options object.
  // We will attach event listeners directly to cam.elt for robust state tracking.
  // No success/error callbacks here, relying on cam.elt events.
  cam = createCapture({
    video: {
      deviceId: { exact: deviceId },
      width: 640,
      height: 480
    }
  });

  // Give p5.js a very small moment to create the cam.elt before attaching listeners.
  // This helps avoid cam.elt being null immediately after createCapture.
  setTimeout(() => {
    if (cam && cam.elt) {
      cam.size(640, 480); // Ensure size is set
      cam.hide(); // Hide the HTML element

      // This is the most reliable way to know when the camera is ready to draw.
      // The `loadedmetadata` event fires when the browser has loaded enough of the
      // media to determine its dimensions and duration.
      cam.elt.onloadedmetadata = () => {
          console.log("DEBUG: Camera metadata loaded! Stream ready.");
          currentSourceReady = true; // Set this true only when confirmed ready
          isLoading = false;
          loadingMessage = "";
      };

      // General error handling for the underlying video element
      cam.elt.onerror = (e) => {
          console.error("DEBUG: Camera (HTML Video Element) error:", e);
          currentSourceReady = false; // Camera definitively failed
          isLoading = false;
          loadingMessage = `Camera error: ${e.message || 'Unknown error'}. Check permissions and device.`;
          if (cam) cam.remove(); // Clean up on error
          cam = null;
      };

      // Important: Check if metadata is already loaded (can happen if it's very fast).
      // If it's already ready, manually trigger the handler.
      if (cam.elt.readyState >= HTMLMediaElement.HAVE_METADATA) {
          console.log("DEBUG: Camera metadata already loaded (fast path). Triggering onloadedmetadata.");
          cam.elt.onloadedmetadata(); // Manually trigger it
      }
    } else {
      // This catches cases where createCapture fails to even produce a cam.elt object
      console.error("DEBUG: Failed to create camera capture object (cam or cam.elt is null after timeout).");
      isLoading = false;
      currentSourceReady = false;
      loadingMessage = "Failed to access camera.";
    }
  }, 50); // Reduced timeout slightly. It just needs to let the p5.js internal creation run.
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
      console.error("DEBUG: Error loading image:", event);
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

    vid.elt.onloadedmetadata = () => {
      vid.size(640, 480); // Set size after metadata is available
      vid.hide();
      vid.loop();
      vid.volume(0);

      // --- REVISED: Safe play attempt for video ---
      const playPromise = vid.elt.play(); // .play() returns a Promise
      if (playPromise !== undefined) {
          playPromise.then(() => {
              // Autoplay started!
              console.log("DEBUG: Video autoplay started successfully.");
          }).catch(error => {
              // Autoplay was prevented (e.g., by browser policy).
              console.warn("DEBUG: Video autoplay prevented:", error.name, error.message);
              // You might want to display a UI element (e.g., a "Play" button) here
              // so the user can manually initiate playback.
          });
      } else {
          // If play() doesn't return a Promise (older browser/environment)
          console.warn("DEBUG: vid.elt.play() did not return a Promise. Attempting direct play.");
          vid.elt.play(); // Just try to play it
      }
      // --- END REVISED play attempt ---

      uploadedMedia = vid;
      uploadedType = 'video';
      currentSourceReady = true; // Video is now fully loaded and ready
      isLoading = false; // Clear loading state
      loadingMessage = "";
    };

    vid.elt.onerror = (e) => { // Basic error handling for video
      console.error("DEBUG: Video loading error:", e);
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

      // --- REVISED: Safe play attempt for dropped video ---
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
      // --- END REVISED play attempt ---

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

// Function to save the canvas as an image
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
    case "saw": return (lfoPhase * 2.0) - 1.0; // Goes from -1 to 1
    case "sin":
      {
        const rawSine = sin(TWO_PI * lfoPhase);
        const exponent = 3; // For steeper curve at 0
        return Math.pow(rawSine, exponent);
      }
    case "tri": return abs((lfoPhase * 4) - 2) - 1; // Goes from -1 to 1
    default: return 0;
  }
}

function getLFOValueForExport(type, currentFrame, totalFrames) {
  if (totalFrames <= 0) return 0;

  let phase = (currentFrame % totalFrames) / totalFrames;

  switch (type) {
    case "saw": return (phase * 2.0) - 1.0;
    case "sin":
      {
        const rawSine = sin(TWO_PI * phase);
        const exponent = 3;
        return Math.pow(rawSine, exponent);
      }
    case "tri": return abs((phase * 4) - 2) - 1;
    default: return 0;
  }
}

// --- Main Drawing Loop ---
function draw() {
  background(0); // Clear the main canvas

  let src = null;
  // Check if currentSourceReady is true BEFORE attempting to use src
  if (uploadedMedia && uploadedType === 'image' && currentSourceReady) src = uploadedMedia;
  else if (uploadedMedia && uploadedType === 'video' && currentSourceReady) src = uploadedMedia;
  else if (cam && currentSourceReady) src = cam; // Only use cam if currentSourceReady is true

  if (!src || !src.width || !src.height || isLoading) {
    // Display loading message if media is not ready or still loading
    fill(255);
    textSize(24); // Size of the text (will use default p5 font if textFont not set)
    textAlign(CENTER, CENTER);
    text(loadingMessage, 0, 0); // For WEBGL, (0,0) is center
    return;
  }

  // Clear the graphics buffer before drawing to it
  graphics.clear();

  // Set uniforms for the shader
  if (theShader) {
    graphics.shader(theShader);
    graphics.texture(src); // IMPORTANT: Bind the texture AFTER setting the shader
    theShader.setUniform('uSampler', src);
    theShader.setUniform('uResolution', [width, height]);
    theShader.setUniform('uTextureResolution', [src.width, src.height]);
    theShader.setUniform('uGamma', gammaValue);

    // Initial values for new uniforms - feel free to make these sliders if desired
    theShader.setUniform('uTemporalStrength', 0.1);
    theShader.setUniform('uTemporalDecay', 0.9);
    theShader.setUniform('uEdgeThreshold', 0.1);
    theShader.setUniform('uEdgeIntensity', 0.8);
    theShader.setUniform('uNormalEdgeStrength', 1.0);
    theShader.setUniform('uDepthEdgeStrength', 0.5);

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

    // --- REVISED DEPTH CALCULATION WITH FINAL SMOOTHING AND THRESHOLD ---
    let rawDepth = Number(depthSlider.value()) + (lfoDepth.checked() ? lfo * 300 * lfoAmp : 0);

    finalDepthHistory.push(rawDepth);
    if (finalDepthHistory.length > finalDepthHistorySize) {
      finalDepthHistory.shift();
    }
    let depth = finalDepthHistory.reduce((sum, val) => sum + val, 0) / finalDepthHistory.length;

    const MIN_ALLOWED_DEPTH_MAGNITUDE = 0.01;
    if (!lfoDepth.checked() && Number(depthSlider.value()) === 0) {
        depth = 0;
    } else {
        if (abs(depth) < MIN_ALLOWED_DEPTH_MAGNITUDE && abs(depth) > 0) {
            depth = (depth >= 0) ? MIN_ALLOWED_DEPTH_MAGNITUDE : -MIN_ALLOWED_DEPTH_MAGNITUDE;
        } else if (abs(depth) === 0 && lfoDepth.checked()) {
             depth = MIN_ALLOWED_DEPTH_MAGNITUDE;
        }
    }
    // --- END REVISED DEPTH CALCULATION ---

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

    theShader.setUniform('uCameraPosition', [0.0, 0.0, 0.0]); // Camera is at origin in view space
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
    let detailY = max(2, int(height / densitySlider.value()));
    let detailX = max(2, int(width / densitySlider.value()));

    // Draw a highly subdivided plane to cover the entire graphics canvas
    graphics.plane(width, height, detailX, detailY);
    graphics.pop();
  }

  // Render the graphics object to the main canvas
  image(graphics, -width / 2, -height / 2, width, height);

  // Update UI Labels
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
    // Only toggle if the MIDI value is 'on' (e.g., button press)
    if (val > 0) {
        control.elt.checked = !control.elt.checked;
    }
  }
}