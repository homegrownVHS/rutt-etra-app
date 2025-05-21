let uploadedVideo;
let stepSize = 6;
let gammaValue = 2.2;
let shapeXValue = 0; // Controls horizontal parabolic bend (affects Y displacement based on Y-pos)
let shapeYValue = 0; // Controls vertical parabolic bend (affects Y displacement based on X-pos)

// NEW: Variables for Wave Displacement effect
let waveAmplitude = 0;
let waveFrequency = 0;

let depthSlider, tiltXSlider, tiltYSlider, scaleSlider, densitySlider, gammaSlider, generateButton, vidInput;
let shapeXSlider, shapeYSlider, shapeXLabel, shapeYLabel;
// NEW: Sliders and labels for Wave Displacement
let waveAmpSlider, waveAmpLabel;
let waveFreqSlider, waveFreqLabel;

// Variables for the hidden HTML Canvas for pixel extraction
let hiddenPixelCanvas;
let hiddenPixelCtx;

function setup() {
  // Create the main p5.js canvas in WEBGL mode
  let p5Canvas = createCanvas(1280, 720, WEBGL);
  let canvasElement = p5Canvas.elt;

  // Get the WEBGL rendering context. preserveDrawingBuffer can help with capture in some cases.
  let gl = canvasElement.getContext('webgl', { preserveDrawingBuffer: true });
  if (gl) {
    console.log("WEBGL context created.");
  } else {
    console.warn("Could not get WEBGL context.");
  }

  // Get reference to the hidden HTML canvas and its 2D context for reliable pixel extraction.
  // The 'willReadFrequently' attribute is crucial for performance when calling getImageData often.
  hiddenPixelCanvas = document.getElementById('hiddenPixelCanvas');
  hiddenPixelCtx = hiddenPixelCanvas.getContext('2d', { willReadFrequently: true });
  console.log("Hidden pixel extraction canvas initialized.");

  // Select all control elements from the HTML
  depthSlider = select("#depthSlider");
  tiltXSlider = select("#tiltXSlider");
  tiltYSlider = select("#tiltYSlider");
  scaleSlider = select("#scaleSlider");
  densitySlider = select("#densitySlider");
  gammaSlider = select("#gammaSlider");
  generateButton = select("#generateButton");
  vidInput = select("#vidInput");
  shapeXSlider = select("#shapeXSlider");
  shapeYSlider = select("#shapeYSlider");
  shapeXLabel = select("#shapeXLabel");
  shapeYLabel = select("#shapeYLabel");

  // NEW: Select Wave Displacement sliders and labels
  waveAmpSlider = select("#waveAmpSlider");
  waveAmpLabel = select("#waveAmpLabel");
  waveFreqSlider = select("#waveFreqSlider");
  waveFreqLabel = select("#waveFreqLabel");


  // Attach event listeners to update values and trigger actions
  vidInput.changed(handleVideoUpload);
  gammaSlider.input(() => {
    gammaValue = Number(gammaSlider.value());
    select("#gammaLabel").html(gammaValue.toFixed(1));
  });
  shapeXSlider.input(() => {
    shapeXValue = Number(shapeXSlider.value());
    shapeXLabel.html(shapeXValue.toFixed(1));
  });
  shapeYSlider.input(() => {
    shapeYValue = Number(shapeYSlider.value());
    shapeYLabel.html(shapeYValue.toFixed(1));
  });
  // NEW: Event listeners for Wave Displacement sliders
  waveAmpSlider.input(() => {
    waveAmplitude = Number(waveAmpSlider.value());
    waveAmpLabel.html(waveAmplitude.toFixed(1));
  });
  waveFreqSlider.input(() => {
    waveFrequency = Number(waveFreqSlider.value());
    waveFreqLabel.html(waveFrequency.toFixed(1));
  });

  generateButton.mousePressed(generateFrames);

  // Set drawing styles for the lines
  strokeWeight(1);
  noFill();
}

// Handles video file upload
function handleVideoUpload() {
  if (vidInput.elt.files.length > 0) {
    let file = vidInput.elt.files[0];
    // Create a p5.Video object from the uploaded file
    uploadedVideo = createVideo([URL.createObjectURL(file)], () => {
      console.log("Video loaded. Duration:", uploadedVideo.duration());
      uploadedVideo.hide(); // Hide the actual HTML video element
      uploadedVideo.loop(); // Start looping for the live preview
      uploadedVideo.volume(0); // Mute the video to prevent sound

      // Set the dimensions of the hidden pixel extraction canvas to match the video
      hiddenPixelCanvas.width = uploadedVideo.width;
      hiddenPixelCanvas.height = uploadedVideo.height;
      console.log(`Hidden pixel extraction canvas set to: ${hiddenPixelCanvas.width}x${hiddenPixelCanvas.height}`);
    });
  }
}

// Calculates a parabolic bend amount based on a normalized value and shape factor.
// The bend is strongest at the center (0.5) and 0 at the edges (0 and 1).
function applyParabolicBend(normalizedValue, shapeFactor) {
  const center = 0.5;
  // This formula creates a parabola that is 0 at normalizedValue = 0 and 1,
  // and reaches its maximum/minimum at normalizedValue = 0.5.
  // The shapeFactor scales the magnitude of this bend.
  return shapeFactor * (normalizedValue - center) * (normalizedValue - center);
}

// Calculates the warped X and Y coordinates for a given point, applying the shape effects.
function getWarpedCoordinates(x, y, videoWidth, videoHeight, shapeXFactor, shapeYFactor, currentWaveAmplitude, currentWaveFrequency) {
  const normalizedY = y / videoHeight; // Normalized vertical position (0 to 1)
  const normalizedX = x / videoWidth;  // Normalized horizontal position (0 to 1)

  // Parabolic shape bends (from original design)
  const horizontalBendAmount = applyParabolicBend(normalizedY, shapeXFactor);
  const verticalBendAmount = applyParabolicBend(normalizedX, shapeYFactor);

  // Apply wave displacement
  // Scale wave amplitude relative to video dimensions for a more consistent visual impact
  // The 200 here is a chosen scaling factor; adjust if effect is too strong/weak.
  const scaledWaveAmplitudeX = currentWaveAmplitude * (videoWidth / 1280); // Scale relative to video width
  const scaledWaveAmplitudeY = currentWaveAmplitude * (videoHeight / 720); // Scale relative to video height

  // Wave on X based on Y-position (horizontal wave)
  const waveDisplacementX = scaledWaveAmplitudeX * sin(normalizedY * PI * 2 * currentWaveFrequency);
  // Wave on Y based on X-position (vertical wave)
  const waveDisplacementY = scaledWaveAmplitudeY * sin(normalizedX * PI * 2 * currentWaveFrequency);

  // Combine all displacements
  let warpedX = x + waveDisplacementX;
  // IMPORTANT: Added waveDisplacementY to warpedY calculation
  let warpedY = y + (verticalBendAmount * videoHeight * 1.0) + (horizontalBendAmount * videoWidth * 1.0) + waveDisplacementY;


  return { warpedX, warpedY };
}


// The main p5.js drawing loop for live preview
function draw() {
  background(0); // Clear the canvas with black

  if (!uploadedVideo) {
    return;
  }

  // Get current slider values
  let depth = Number(depthSlider.value());
  let tiltX = radians(Number(tiltXSlider.value()) + 90); // +90 to align with typical 3D orientation
  let tiltY = radians(Number(tiltYSlider.value()));
  let scl = Number(scaleSlider.value());
  stepSize = int(densitySlider.value());

  // Load pixels directly from the uploaded video for the live preview
  uploadedVideo.loadPixels();

  push(); // Isolate transformations
  rotateX(tiltX);
  rotateY(tiltY);
  scale(scl);
  translate(-uploadedVideo.width / 2, -uploadedVideo.height / 2, depth);

  // Draw the Rutt-Etra effect using the video's pixels
  if (uploadedVideo.pixels && uploadedVideo.pixels.length > 0) {
    for (let y = 0; y < uploadedVideo.height; y += stepSize) {
      beginShape(); // Start drawing a line segment
      for (let x = 0; x < uploadedVideo.width; x += stepSize) {
        // Get warped coordinates for the current pixel, now including wave parameters
        const { warpedX, warpedY } = getWarpedCoordinates(x, y, uploadedVideo.width, uploadedVideo.height, shapeXValue, shapeYValue, waveAmplitude, waveFrequency);

        // Calculate pixel index and color
        let idx = (x + y * uploadedVideo.width) * 4;
        let r = uploadedVideo.pixels[idx]; // Raw R value (0-255)
        let g = uploadedVideo.pixels[idx + 1]; // Raw G value (0-255)
        let b = uploadedVideo.pixels[idx + 2]; // Raw B value (0-255)

        let bright = (r + g + b) / 3 / 255; // Sum raw values, average, then normalize to 0-1
        let gammaCorrectedBright = applyGamma(bright, gammaValue);

        // Z remains based on brightness
        let z = map(gammaCorrectedBright, 0, 1, -abs(depth), abs(depth));
        if (depth < 0) z *= -1; // Keep original depth inversion logic if overall depth is negative

        // Set stroke color and add vertex (r, g, b are raw values, so divide by 255 for applyGamma, then multiply back for stroke)
        stroke(applyGamma(r / 255, gammaValue) * 255, applyGamma(g / 255, gammaValue) * 255, applyGamma(b / 255, gammaValue) * 255);
        vertex(warpedX, warpedY, z);
      }
      endShape(); // End drawing the line segment
    }
  }
  pop(); // Restore previous transformations
}

// Applies gamma correction to a color value
function applyGamma(value, gamma) {
  return pow(value, 1 / gamma);
}

// Asynchronously seeks the video to a specific frame time and waits for it to render.
function seekToFrame(frameTime) {
  return new Promise(resolve => {
    const videoElement = uploadedVideo.elt;

    // Listener for when the video has finished seeking
    const onSeeked = () => {
      cleanupListeners(); // Remove listeners to prevent multiple calls
      console.log(`Seeked to: ${videoElement.currentTime.toFixed(3)}s. Paused: true. Waiting for render...`);
      // Crucial delay to ensure the video frame is fully decoded and rendered internally
      setTimeout(() => {
        console.log(`Delay finished for ${frameTime.toFixed(3)}s. Current time: ${videoElement.currentTime.toFixed(3)}s. Resolving seek.`);
        resolve();
      }, 1000); // 1 second delay
    };

    // Listener for video errors during seeking
    const onError = (e) => {
      cleanupListeners();
      console.error(`Video seek error at time ${frameTime.toFixed(3)}s:`, e);
      resolve(); // Resolve even on error to prevent blocking the generation process
    };

    // Helper to remove event listeners
    const cleanupListeners = () => {
      videoElement.removeEventListener('seeked', onSeeked);
      videoElement.removeEventListener('error', onError);
    };

    // Add listeners
    videoElement.addEventListener('seeked', onSeeked);
    videoElement.addEventListener('error', onError);

    // Set the video's current time and pause it
    console.log(`Attempting to seek to: ${frameTime.toFixed(3)}s. Current time before seek: ${videoElement.currentTime.toFixed(3)}s.`);
    videoElement.currentTime = frameTime;
    videoElement.pause();
  });
}

// Asynchronously generates and saves processed frames from the video.
async function generateFrames() {
  // Check if video and hidden canvas are ready
  if (!uploadedVideo || !uploadedVideo.loadedmetadata || !hiddenPixelCanvas || !hiddenPixelCtx) {
    console.log("No video uploaded, metadata not loaded, or hidden pixel canvas not ready for generation.");
    alert("Please upload a video first and ensure it loads correctly.");
    return;
  }

  console.log("Starting frame generation process...");

  uploadedVideo.pause(); // Pause the live preview video
  uploadedVideo.elt.currentTime = 0; // Reset video to the beginning for generation

  // Get current slider values once at the start of generation
  let depth = Number(depthSlider.value());
  let tiltX = radians(Number(tiltXSlider.value()) + 90);
  let tiltY = radians(Number(tiltYSlider.value()));
  let scl = Number(scaleSlider.value());
  let currentStepSize = int(densitySlider.value());
  let currentShapeXValue = Number(shapeXSlider.value());
  let currentShapeYValue = Number(shapeYSlider.value());
  let currentWaveAmplitude = Number(waveAmpSlider.value()); // NEW
  let currentWaveFrequency = Number(waveFreqSlider.value()); // NEW


  const targetFPS = 30; // Desired output frame rate
  const totalFrames = Math.floor(uploadedVideo.duration() * targetFPS);
  let currentFrame = 0;

  // Disable the generate button and update its text
  generateButton.attribute('disabled', true);
  generateButton.html('Generating...');

  // Stop the continuous draw loop permanently for preview, as generation takes over.
  noLoop();

  // Loop through each frame to generate and save
  while (currentFrame < totalFrames) {
    const frameTime = currentFrame / targetFPS;
    console.group(`Frame ${currentFrame} (Time: ${frameTime.toFixed(3)}s)`);

    try {
      await seekToFrame(frameTime); // Seek video and wait for it to render

      console.log(`Video state before drawing to hidden canvas: currentTime=${uploadedVideo.elt.currentTime.toFixed(3)}s, paused=${uploadedVideo.elt.paused}`);

      // Draw the raw video element onto the hidden 2D canvas for pixel extraction
      hiddenPixelCtx.drawImage(uploadedVideo.elt, 0, 0, hiddenPixelCanvas.width, hiddenPixelCanvas.height);
      // Get pixel data directly from the hidden 2D canvas
      const imageData = hiddenPixelCtx.getImageData(0, 0, hiddenPixelCanvas.width, hiddenPixelCanvas.height);
      const pixelsData = imageData.data; // This is the Uint8ClampedArray of pixel data

      if (pixelsData && pixelsData.length > 0) {
        console.log(`Pixels loaded for frame ${currentFrame} from hidden canvas. Array length: ${pixelsData.length}.`);
        let firstPixelR = pixelsData[0];
        let firstPixelG = pixelsData[1];
        let firstPixelB = pixelsData[2];
        console.log(`First pixel RGB: (${firstPixelR}, ${firstPixelG}, ${firstPixelB})`);

        // Manually draw the current frame's effect onto the main WEBGL canvas
        background(0); // Clear the main canvas
        push(); // Isolate transformations for this frame
        rotateX(tiltX);
        rotateY(tiltY);
        scale(scl);
        translate(-uploadedVideo.width / 2, -uploadedVideo.height / 2, depth);

        // Loop through pixels using hiddenPixelCanvas dimensions for consistency
        for (let y = 0; y < hiddenPixelCanvas.height; y += currentStepSize) {
          beginShape();
          for (let x = 0; x < hiddenPixelCanvas.width; x += currentStepSize) {
            // Get warped coordinates using the current frame's pixel data and shape factors, now with wave parameters
            const { warpedX, warpedY } = getWarpedCoordinates(x, y, hiddenPixelCanvas.width, hiddenPixelCanvas.height, currentShapeXValue, currentShapeYValue, currentWaveAmplitude, currentWaveFrequency);

            // Calculate pixel index and color from the extracted pixelsData
            let idx = (x + y * hiddenPixelCanvas.width) * 4;
            let r = pixelsData[idx];
            let g = pixelsData[idx + 1];
            let b = pixelsData[idx + 2];
            let bright = (r + g + b) / 3 / 255; // Corrected brightness calculation
            let gammaCorrectedBright = applyGamma(bright, gammaValue);

            // Z remains based on brightness
            let z = map(gammaCorrectedBright, 0, 1, -abs(depth), abs(depth));
            if (depth < 0) z *= -1; // Keep original depth inversion logic if overall depth is negative

            // Set stroke color and add vertex
            stroke(applyGamma(r / 255, gammaValue) * 255, applyGamma(g / 255, gammaValue) * 255, applyGamma(b / 255, gammaValue) * 255);
            vertex(warpedX, warpedY, z);
          }
          endShape();
        }
        pop(); // Restore transformations

        // Small delay BEFORE saving to allow the canvas to fully render (especially with WEBGL)
        await new Promise(resolve => setTimeout(resolve, 50));

        saveCanvas(`frame_${nf(currentFrame, 4)}`, 'png'); // Save the current frame

        currentFrame++;
      } else {
        console.warn(`WARNING: Pixels array empty or null for frame ${currentFrame} at time ${frameTime.toFixed(3)}s. This frame might be identical or skipped.`);
        currentFrame++;
      }

      // Longer delay AFTER saving for browser processing downloads and to prevent overwhelming
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      console.error(`ERROR processing frame ${currentFrame}:`, error);
      currentFrame++; // Increment to avoid getting stuck on a problematic frame
    }
    console.groupEnd(); // End console group for this frame
  }

  // Restore button state and log completion
  generateButton.attribute('disabled', false);
  generateButton.html('Generate Processed Frames');

  // Stop video entirely and hide it, as preview is no longer needed.
  uploadedVideo.stop();
  uploadedVideo.hide();

  console.log("Frame generation with parabolic bend complete. Check your downloads folder.");
}