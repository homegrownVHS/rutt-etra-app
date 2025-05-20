let uploadedVideo;
let stepSize = 6;
let gammaValue = 2.2;
let shapeXValue = 0; // Controls horizontal parabolic bend
let shapeYValue = 0; // Controls vertical parabolic bend

let depthSlider, tiltXSlider, tiltYSlider, scaleSlider, densitySlider, gammaSlider, generateButton, vidInput;
let shapeXSlider, shapeYSlider, shapeXLabel, shapeYLabel;

// REMOVED: let videoBuffer; // No longer needed

// NEW: Variables for the hidden HTML Canvas for pixel extraction
let hiddenPixelCanvas;
let hiddenPixelCtx;

function setup() {
  let p5Canvas = createCanvas(1280, 720, WEBGL);
  let canvasElement = p5Canvas.elt;

  let gl = canvasElement.getContext('webgl', { preserveDrawingBuffer: true });
  if (gl) {
    console.log("WEBGL context created.");
  } else {
    console.warn("Could not get WEBGL context.");
  }

  // NEW: Get reference to the hidden canvas and its 2D context
  hiddenPixelCanvas = document.getElementById('hiddenPixelCanvas');
  hiddenPixelCtx = hiddenPixelCanvas.getContext('2d', { willReadFrequently: true });
  console.log("Hidden pixel extraction canvas initialized.");


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
  generateButton.mousePressed(generateFrames);

  strokeWeight(1);
  noFill();
}

function handleVideoUpload() {
  if (vidInput.elt.files.length > 0) {
    let file = vidInput.elt.files[0];
    uploadedVideo = createVideo([URL.createObjectURL(file)], () => {
      console.log("Video loaded. Duration:", uploadedVideo.duration());
      uploadedVideo.hide();
      uploadedVideo.loop(); // Start loop for preview
      uploadedVideo.volume(0); // Mute the video

      // NEW: Set dimensions of hidden canvas to match video
      hiddenPixelCanvas.width = uploadedVideo.width;
      hiddenPixelCanvas.height = uploadedVideo.height;
      console.log(`Hidden pixel extraction canvas set to: ${hiddenPixelCanvas.width}x${hiddenPixelCanvas.height}`);
    });
  }
}

function applyParabolicBend(normalizedValue, shapeFactor) {
  const center = 0.5;
  return shapeFactor * (normalizedValue - center) * (normalizedValue - center);
}

function getWarpedCoordinates(x, y, videoWidth, videoHeight, shapeXFactor, shapeYFactor) {
  const normalizedY = y / videoHeight;
  const normalizedX = x / videoWidth;

  const horizontalBend = applyParabolicBend(normalizedY, shapeXFactor * 2);
  const warpedX = normalizedX * videoWidth + horizontalBend * videoWidth * 0.5;

  const verticalBend = applyParabolicBend(normalizedX, shapeYFactor * 2);
  const warpedY = normalizedY * videoHeight + verticalBend * videoHeight * 0.5;

  return { warpedX, warpedY };
}


function draw() {
  background(0);

  if (!uploadedVideo) return;

  let depth = Number(depthSlider.value());
  let tiltX = radians(Number(tiltXSlider.value()) + 90);
  let tiltY = radians(Number(tiltYSlider.value()));
  let scl = Number(scaleSlider.value());
  stepSize = int(densitySlider.value());

  // Use uploadedVideo.loadPixels() directly for the live preview
  uploadedVideo.loadPixels();

  push();
  rotateX(tiltX);
  rotateY(tiltY);
  scale(scl);
  translate(-uploadedVideo.width / 2, -uploadedVideo.height / 2, depth);

  if (uploadedVideo.pixels && uploadedVideo.pixels.length > 0) {
    for (let y = 0; y < uploadedVideo.height; y += stepSize) {
      beginShape();
      for (let x = 0; x < uploadedVideo.width; x += stepSize) {
        const { warpedX, warpedY } = getWarpedCoordinates(x, y, uploadedVideo.width, uploadedVideo.height, shapeXValue, shapeYValue);

        let idx = (x + y * uploadedVideo.width) * 4;
        let r = uploadedVideo.pixels[idx] / 255;
        let g = uploadedVideo.pixels[idx + 1] / 255;
        let b = uploadedVideo.pixels[idx + 2] / 255;
        let bright = (r + g + b) / 3;
        let gammaCorrectedBright = applyGamma(bright, gammaValue);
        let z = map(gammaCorrectedBright, 0, 1, -abs(depth), abs(depth));
        if (depth < 0) z *= -1;

        stroke(applyGamma(r, gammaValue) * 255, applyGamma(g, gammaValue) * 255, applyGamma(b, gammaValue) * 255);
        vertex(warpedX, warpedY, z);
      }
      endShape();
    }
  }
  pop();
}

function applyGamma(value, gamma) {
  return pow(value, 1 / gamma);
}

function seekToFrame(frameTime) {
  return new Promise(resolve => {
    const videoElement = uploadedVideo.elt;

    const onSeeked = () => {
      cleanupListeners();
      console.log(`Seeked to: ${videoElement.currentTime.toFixed(3)}s. Paused: true. Waiting for render...`);
      setTimeout(() => {
        console.log(`Delay finished for ${frameTime.toFixed(3)}s. Current time: ${videoElement.currentTime.toFixed(3)}s. Resolving seek.`);
        resolve();
      }, 1000); // 1 second delay
    };

    const onError = (e) => {
      cleanupListeners();
      console.error(`Video seek error at time ${frameTime.toFixed(3)}s:`, e);
      resolve();
    };

    const cleanupListeners = () => {
      videoElement.removeEventListener('seeked', onSeeked);
      videoElement.removeEventListener('error', onError);
    };

    videoElement.addEventListener('seeked', onSeeked);
    videoElement.addEventListener('error', onError);

    console.log(`Attempting to seek to: ${frameTime.toFixed(3)}s. Current time before seek: ${videoElement.currentTime.toFixed(3)}s.`);
    videoElement.currentTime = frameTime;
    videoElement.pause();
  });
}

async function generateFrames() {
  // Check for uploadedVideo and the hidden pixel canvas
  if (!uploadedVideo || !uploadedVideo.loadedmetadata || !hiddenPixelCanvas || !hiddenPixelCtx) { 
    console.log("No video uploaded, metadata not loaded, or hidden pixel canvas not ready for generation.");
    alert("Please upload a video first and ensure it loads correctly.");
    return;
  }

  console.log("Starting frame generation process...");
  
  uploadedVideo.pause();
  uploadedVideo.elt.currentTime = 0;

  let depth = Number(depthSlider.value());
  let tiltX = radians(Number(tiltXSlider.value()) + 90);
  let tiltY = radians(Number(tiltYSlider.value()));
  let scl = Number(scaleSlider.value());
  let currentStepSize = int(densitySlider.value());
  let currentShapeXValue = Number(shapeXSlider.value());
  let currentShapeYValue = Number(shapeYSlider.value());

  const targetFPS = 30;
  const totalFrames = Math.floor(uploadedVideo.duration() * targetFPS);
  let currentFrame = 0;

  generateButton.attribute('disabled', true);
  generateButton.html('Generating...');

  noLoop(); // Stop the draw loop permanently for preview

  while (currentFrame < totalFrames) {
    const frameTime = currentFrame / targetFPS;
    console.group(`Frame ${currentFrame} (Time: ${frameTime.toFixed(3)}s)`);

    try {
      await seekToFrame(frameTime);

      console.log(`Video state before drawing to hidden canvas: currentTime=${uploadedVideo.elt.currentTime.toFixed(3)}s, paused=${uploadedVideo.elt.paused}`);
      
      // NEW: Draw the raw video element onto the hidden 2D canvas
      hiddenPixelCtx.drawImage(uploadedVideo.elt, 0, 0, hiddenPixelCanvas.width, hiddenPixelCanvas.height);
      // NEW: Get pixel data directly from the hidden 2D canvas
      const imageData = hiddenPixelCtx.getImageData(0, 0, hiddenPixelCanvas.width, hiddenPixelCanvas.height);
      const pixelsData = imageData.data; // This is a Uint8ClampedArray

      // Use pixelsData and hiddenPixelCanvas dimensions for drawing
      if (pixelsData && pixelsData.length > 0) {
        console.log(`Pixels loaded for frame ${currentFrame} from hidden canvas. Array length: ${pixelsData.length}.`);
        let firstPixelR = pixelsData[0];
        let firstPixelG = pixelsData[1];
        let firstPixelB = pixelsData[2];
        console.log(`First pixel RGB: (${firstPixelR}, ${firstPixelG}, ${firstPixelB})`);

        // Manually draw the frame on the main WEBGL canvas
        background(0);
        push();
        rotateX(tiltX);
        rotateY(tiltY);
        scale(scl);
        // Translate based on the original video dimensions for consistency with effects
        translate(-uploadedVideo.width / 2, -uploadedVideo.height / 2, depth); 

        // Loop using hiddenPixelCanvas dimensions for pixel lookup
        for (let y = 0; y < hiddenPixelCanvas.height; y += currentStepSize) {
          beginShape();
          for (let x = 0; x < hiddenPixelCanvas.width; x += currentStepSize) {
            // getWarpedCoordinates also needs to use the same dimensions the pixels were extracted from
            const { warpedX, warpedY } = getWarpedCoordinates(x, y, hiddenPixelCanvas.width, hiddenPixelCanvas.height, currentShapeXValue, currentShapeYValue);

            let idx = (x + y * hiddenPixelCanvas.width) * 4;
            let r = pixelsData[idx] / 255;
            let g = pixelsData[idx + 1] / 255;
            let b = pixelsData[idx + 2] / 255;
            let bright = (r + g + b) / 3;
            let gammaCorrectedBright = applyGamma(bright, gammaValue);
            let z = map(gammaCorrectedBright, 0, 1, -abs(depth), abs(depth));
            if (depth < 0) z *= -1;

            stroke(applyGamma(r, gammaValue) * 255, applyGamma(g, gammaValue) * 255, applyGamma(b, gammaValue) * 255);
            vertex(warpedX, warpedY, z);
          }
          endShape();
        }
        pop();

        // Small delay BEFORE saving to allow canvas to fully render (especially with WEBGL)
        await new Promise(resolve => setTimeout(resolve, 50)); 

        saveCanvas(`frame_${nf(currentFrame, 4)}`, 'png');
        
        currentFrame++;
      } else {
        console.warn(`WARNING: Pixels array empty or null for frame ${currentFrame} at time ${frameTime.toFixed(3)}s. This frame might be identical or skipped.`);
        currentFrame++;
      }

      // Existing longer delay AFTER saving for browser processing downloads
      await new Promise(resolve => setTimeout(resolve, 500)); 
    } catch (error) {
      console.error(`ERROR processing frame ${currentFrame}:`, error);
      currentFrame++;
    }
    console.groupEnd();
  }

  generateButton.attribute('disabled', false);
  generateButton.html('Generate Processed Frames');
  
  uploadedVideo.stop();
  uploadedVideo.hide();

  console.log("Frame generation with parabolic bend complete. Check your downloads folder.");
}