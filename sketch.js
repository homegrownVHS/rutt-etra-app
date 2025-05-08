let cam, uploadedMedia, uploadedType = null;
let stepSize = 6;

let depthSlider, tiltXSlider, tiltYSlider, scaleSlider, densitySlider;
let camSelect, imgInput, vidInput;
let lfoDepth, lfoTiltX, lfoTiltY, lfoScale, lfoFreqSlider, lfoAmpSlider, lfoTypeSelector;

let streamReady = false;
let selectedDeviceId = null;
let controlsHovering = false;

let rotX = 30;
let rotY = 0;
let targetRotX = 30;
let targetRotY = 0;

let lfoPhase = 0;
let lfoTypes = ['saw', 'sin', 'tri'];
let lfoTypeIndex = 0;

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

  let controlsDiv = select("#controls");
  controlsDiv.mouseOver(() => controlsHovering = true);
  controlsDiv.mouseOut(() => controlsHovering = false);

  imgInput.changed(handleImageUpload);
  vidInput.changed(handleVideoUpload);

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
    startCam(selectedDeviceId);
  });

  strokeWeight(1);
  noFill();

  if (navigator.requestMIDIAccess) {
    navigator.requestMIDIAccess().then(onMIDISuccess);
  }
}

function startCam(deviceId) {
  uploadedMedia = null;
  uploadedType = null;
  navigator.mediaDevices.getUserMedia({
    video: { deviceId: { exact: deviceId } }
  }).then(stream => {
    cam = createCapture({ video: { deviceId: { exact: deviceId } } }, () => {
      streamReady = true;
    });
    cam.size(640, 480);  // Force camera to 640x480
    cam.hide();
  }).catch(err => {
    console.error("Camera access error:", err);
  });
}

function handleImageUpload() {
  if (imgInput.elt.files.length > 0) {
    let file = imgInput.elt.files[0];
    loadImage(URL.createObjectURL(file), img => {
      img.resize(640, 480);  // Resize the p5.Image properly
      uploadedMedia = img;
      uploadedType = 'image';
    });
  }
}


function handleVideoUpload() {
  if (vidInput.elt.files.length > 0) {
    let file = vidInput.elt.files[0];
    let vid = createVideo([URL.createObjectURL(file)], () => {
      vid.hide();
      vid.loop();
      vid.volume(0);
      vid.size(640, 480); // Resize uploaded video
      uploadedMedia = vid;
      uploadedType = 'video';
    });
  }
}

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

function mouseDragged() {
  if (!controlsHovering) {
    targetRotY += (movedX * 0.01);
    targetRotX -= (movedY * 0.01);
  }
}

function draw() {
  background(0);

  let src = null;
  if (uploadedMedia && uploadedType === 'image') src = uploadedMedia;
  else if (uploadedMedia && uploadedType === 'video') src = uploadedMedia;
  else if (cam && streamReady && cam.loadedmetadata) src = cam;

  if (!src) return;

  let baseDepth = Number(depthSlider.value());
  let baseTiltX = radians(Number(tiltXSlider.value()) + 90);
  let baseTiltY = radians(Number(tiltYSlider.value()));
  let baseScale = Number(scaleSlider.value());
  stepSize = int(densitySlider.value());

  let lfoFreq = Number(lfoFreqSlider.value());
  let lfoAmp = Number(lfoAmpSlider.value());
  let lfoType = lfoTypeSelector.value();
  let lfo = getLFOValue(lfoType, lfoFreq);

  let depth = baseDepth + (lfoDepth.checked() ? lfo * 300 * lfoAmp : 0);
  let tiltX = baseTiltX + (lfoTiltX.checked() ? lfo * PI * lfoAmp : 0);
  let tiltY = baseTiltY + (lfoTiltY.checked() ? lfo * PI * lfoAmp : 0);
  let scl = baseScale + (lfoScale.checked() ? lfo * 1.5 * lfoAmp : 0);

  select("#depthLabel").html(depth.toFixed(0));
  select("#tiltXLabel").html((Number(tiltXSlider.value())).toFixed(0) + "°");
  select("#tiltYLabel").html(tiltYSlider.value() + "°");
  select("#scaleLabel").html(scl.toFixed(2));
  select("#densityLabel").html(stepSize);

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
  translate(-bufferWidth / 2, -bufferHeight / 2);

  src.loadPixels();
  if (src.pixels.length === 0) {
    pop();
    return;
  }

  for (let y = 0; y < bufferHeight; y += stepSize) {
    beginShape();
    for (let x = 0; x < bufferWidth; x += stepSize) {
      let idx = (x + y * bufferWidth) * 4;
      let r = src.pixels[idx];
      let g = src.pixels[idx + 1];
      let b = src.pixels[idx + 2];
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
    32: 'lfoDepth',
    33: 'lfoTiltX',
    34: 'lfoTiltY',
    35: 'lfoScale'
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
    if (val > 0) control.elt.checked = !control.elt.checked;
  }
}