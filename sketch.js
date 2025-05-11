let videoEl;
let streamReady = false;
let pg;

let rotX = 30, rotY = 0;
let targetRotX = 30, targetRotY = 0;
let scl = 1.0, depth = 100;
let stepSize = 6;

let pinchStartDist = null;
let twoFingerStartY = null;
let startButton, errorMsg;

function setup() {
  createCanvas(windowWidth, windowHeight, WEBGL);
  noFill();
  strokeWeight(1);

  errorMsg = select("#errorMsg");

  startButton = createButton('Start Camera');
  startButton.position(20, 20);
  startButton.mousePressed(startManualCamera);

  videoEl = document.getElementById("cameraFeed");
  pg = createGraphics(640, 480);
  pg.pixelDensity(1);
}

function startManualCamera() {
  startButton.hide();

  navigator.mediaDevices.getUserMedia({ video: true })
    .then(stream => {
      videoEl.srcObject = stream;
      videoEl.onloadeddata = () => {
        streamReady = true;
      };
    })
    .catch(err => {
      errorMsg.html("Camera error: " + err.message);
      console.error(err);
    });
}

function draw() {
  background(0);

  if (!streamReady || videoEl.readyState < 2) {
    return;
  }

  pg.image(videoEl, 0, 0, pg.width, pg.height);
  pg.loadPixels();

  if (pg.pixels.length === 0) return;

  rotX = lerp(rotX, targetRotX, 0.1);
  rotY = lerp(rotY, targetRotY, 0.1);

  let bufferWidth = pg.width;
  let bufferHeight = pg.height;
  let canvasAspect = width / height;
  let bufferAspect = bufferWidth / bufferHeight;
  let scaleFactor = bufferAspect > canvasAspect
    ? width / bufferWidth
    : height / bufferHeight;

  push();
  rotateX(rotX + radians(90));
  rotateY(rotY);
  scale(scl * scaleFactor);
  translate(-bufferWidth / 2, -bufferHeight / 2);

  for (let y = 0; y < bufferHeight; y += stepSize) {
    beginShape();
    for (let x = 0; x < bufferWidth; x += stepSize) {
      let idx = (x + y * bufferWidth) * 4;
      let r = pg.pixels[idx];
      let g = pg.pixels[idx + 1];
      let b = pg.pixels[idx + 2];
      let bright = (r + g + b) / (3 * 255);
      let z = map(bright, 0, 1, -abs(depth), abs(depth));
      if (depth < 0) z *= -1;
      stroke(r, g, b);
      vertex(x, y, z);
    }
    endShape();
  }
  pop();
}

function touchMoved() {
  if (touches.length === 1) {
    targetRotY += movedX * 0.01;
    targetRotX -= movedY * 0.01;
  } else if (touches.length === 2) {
    let d = dist(touches[0].x, touches[0].y, touches[1].x, touches[1].y);
    if (pinchStartDist === null) pinchStartDist = d;
    else {
      let zoomDelta = d - pinchStartDist;
      scl += zoomDelta * 0.001;
      scl = constrain(scl, 0.5, 3);
      pinchStartDist = d;
    }

    let avgY = (touches[0].y + touches[1].y) / 2;
    if (twoFingerStartY === null) twoFingerStartY = avgY;
    else {
      let deltaY = avgY - twoFingerStartY;
      depth += deltaY * 0.5;
      depth = constrain(depth, -300, 300);
      twoFingerStartY = avgY;
    }
  }

  return false;
}

function touchEnded() {
  if (touches.length < 2) {
    pinchStartDist = null;
    twoFingerStartY = null;
  }
}
