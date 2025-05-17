let uploadedVideo;
let stepSize = 6;
let gammaValue = 2.2;

let depthSlider, tiltXSlider, tiltYSlider, scaleSlider, densitySlider, gammaSlider, generateButton;

function setup() {
  createCanvas(1280, 720, WEBGL);

  depthSlider = select("#depthSlider");
  tiltXSlider = select("#tiltXSlider");
  tiltYSlider = select("#tiltYSlider");
  scaleSlider = select("#scaleSlider");
  densitySlider = select("#densitySlider");
  gammaSlider = select("#gammaSlider");
  generateButton = select("#generateButton");
  vidInput = select("#vidInput");

  vidInput.changed(handleVideoUpload);
  gammaSlider.input(() => {
    gammaValue = Number(gammaSlider.value());
    select("#gammaLabel").html(gammaValue.toFixed(1));
  });
  generateButton.mousePressed(generateFrames); // Ensure the button press calls the function

  strokeWeight(1);
  noFill();
}

function handleVideoUpload() {
  if (vidInput.elt.files.length > 0) {
    let file = vidInput.elt.files[0];
    uploadedVideo = createVideo([URL.createObjectURL(file)], () => {
      console.log("Video loaded.");
      uploadedVideo.hide();
      uploadedVideo.loop(); // Start and loop the video for live preview
    });
  }
}

function draw() {
  background(0);

  if (!uploadedVideo) return;

  let depth = Number(depthSlider.value());
  let tiltX = radians(Number(tiltXSlider.value()) + 90);
  let tiltY = radians(Number(tiltYSlider.value()));
  let scl = Number(scaleSlider.value());
  stepSize = int(densitySlider.value());

  push();
  rotateX(tiltX);
  rotateY(tiltY);
  scale(scl);
  translate(-uploadedVideo.width / 2, -uploadedVideo.height / 2, depth);

  uploadedVideo.loadPixels();
  if (uploadedVideo.pixels.length > 0) {
    for (let y = 0; y < uploadedVideo.height; y += stepSize) {
      beginShape();
      for (let x = 0; x < uploadedVideo.width; x += stepSize) {
        let idx = (x + y * uploadedVideo.width) * 4;
        let r = uploadedVideo.pixels[idx] / 255;
        let g = uploadedVideo.pixels[idx + 1] / 255;
        let b = uploadedVideo.pixels[idx + 2] / 255;
        let bright = (r + g + b) / 3;
        let gammaCorrectedBright = applyGamma(bright, gammaValue);
        let z = map(gammaCorrectedBright, 0, 1, -abs(depth), abs(depth));
        if (depth < 0) z *= -1;
        stroke(applyGamma(r, gammaValue) * 255, applyGamma(g, gammaValue) * 255, applyGamma(b, gammaValue) * 255);
        vertex(x, y, z);
      }
      endShape();
    }
  }
  pop();
}

function generateFrames() {
  if (!uploadedVideo) {
    console.log("No video uploaded yet for generation.");
    return;
  }

  console.log("Generating frames...");
  uploadedVideo.pause(); // Pause the live preview
  uploadedVideo.elt.currentTime = 0;
  const totalFrames = uploadedVideo.duration() * 30; // Adjust FPS as needed
  let currentFrame = 0;

  function processFrame() {
    if (currentFrame < totalFrames) {
      uploadedVideo.elt.currentTime = currentFrame / 30;
      uploadedVideo.elt.onseeked = () => {
        uploadedVideo.loadPixels();
        if (uploadedVideo.pixels.length > 0) {
          push();
          rotateX(radians(Number(tiltXSlider.value()) + 90));
          rotateY(radians(Number(tiltYSlider.value())));
          scale(Number(scaleSlider.value()));
          translate(-uploadedVideo.width / 2, -uploadedVideo.height / 2, Number(depthSlider.value()));

          for (let y = 0; y < uploadedVideo.height; y += int(densitySlider.value())) {
            beginShape();
            for (let x = 0; x < uploadedVideo.width; x += int(densitySlider.value())) {
              let idx = (x + y * uploadedVideo.width) * 4;
              let r = uploadedVideo.pixels[idx] / 255;
              let g = uploadedVideo.pixels[idx + 1] / 255;
              let b = uploadedVideo.pixels[idx + 2] / 255;
              let bright = (r + g + b) / 3;
              let gammaCorrectedBright = applyGamma(bright, gammaValue);
              let z = map(gammaCorrectedBright, 0, 1, -abs(Number(depthSlider.value())), abs(Number(depthSlider.value())));
              if (Number(depthSlider.value()) < 0) z *= -1;

              stroke(applyGamma(r, gammaValue) * 255, applyGamma(g, gammaValue) * 255, applyGamma(b, gammaValue) * 255);
              vertex(x, y, z);
            }
            endShape();
          }
          pop();
          saveCanvas(`frame_${nf(currentFrame, 4)}`, 'png');
        }
        currentFrame++;
        processFrame();
      };
    } else {
      uploadedVideo.loop(); // Resume live preview after generation
      console.log("Frame generation complete. Check your downloads folder.");
    }
  }

  processFrame();
}

function applyGamma(value, gamma) {
  return pow(value, 1 / gamma);
}