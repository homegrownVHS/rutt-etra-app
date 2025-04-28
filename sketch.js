let cam, uploadedMedia, uploadedType = null;
let stepSize = 6;

let depthSlider, tiltXSlider, tiltYSlider, scaleSlider, densitySlider;
let camSelect, colorPicker, resetBtn, imgInput, vidInput;
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

// --- MIDI mapping based on your clarified CCs ---
const midiMap = {
  120: ['depthSlider'],
  121: ['tiltXSlider'],
  122: ['tiltYSlider'],
  123: ['scaleSlider'],
  124: ['densitySlider'],
  125: ['lfoFreq'],
  126: ['lfoAmp'],
  127: ['colorPicker'],
  46:  ['cycleBtn'],        // Cycle Button (LFO type)
  32:  ['lfoDepth'],
  33:  ['lfoTiltX'],
  34:  ['lfoTiltY'],
  35:  ['lfoScale']
};

function setup() {
  createCanvas(1280, 720, WEBGL);

  depthSlider = select("#depthSlider");
  tiltXSlider = select("#tiltXSlider");
  tiltYSlider = select("#tiltYSlider");
  scaleSlider = select("#scaleSlider");
  densitySlider = select("#densitySlider");
  camSelect = select("#camSelect");
  colorPicker = select("#colorPicker");
  resetBtn = select("#resetBtn");
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

  resetBtn.mousePressed(() => {
    rotX = targetRotX = 30;
    rotY = targetRotY = 0;
  });

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

  // --- MIDI: Set up access ---
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
    cam.size(width, height);
    cam.hide();
  }).catch(err => {
    console.error("Camera access error:", err);
  });
}

function handleImageUpload() {
  if (imgInput.elt.files.length > 0) {
    let file = imgInput.elt.files[0];
    let img = createImg(URL.createObjectURL(file), '', '', () => {
      img.hide();
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
      uploadedMedia = vid;
      uploadedType = 'video';
    });
  }
}

function getLFOValue(type, freq) {
  lfoPhase += freq * 0.01;
  if (lfoPhase > 1) lfoPhase -= 1;

  switch (type) {
    case "saw": return (lfoPhase * 2.0) - 1.0; // -1 to 1
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

  rotateX(rotX + tiltX);
  rotateY(rotY + tiltY);
  scale(scl);
  translate(-width / 2, -height / 2);

  src.loadPixels();
  if (src.pixels.length === 0) return;

  let col = colorPicker.value();
  stroke(col);

  // ===== Foreground-only scanline mode (draw only where bright) =====
  for (let y = 0; y < src.height; y += stepSize) {
    let started = false;
    beginShape();
    for (let x = 0; x < src.width; x += stepSize) {
      let index = (x + y * src.width) * 4;
      let r = src.pixels[index];
      let g = src.pixels[index + 1];
      let b = src.pixels[index + 2];
      let bright = (r + g + b) / (3 * 255);

      if (bright > 0.04) { // Only start drawing if brightness is present
        let z = map(bright, 0, 1, -abs(depth), abs(depth));
        if (depth < 0) z *= -1;
        vertex(x, y, z);
        started = true;
      } else if (started) {
        break; // stop drawing this scanline after the last bright pixel
      }
    }
    endShape();

    // ==== Classic Rutt-Etra scanline mode (draw entire scanline) ====
    
    beginShape();
    for (let x = 0; x < src.width; x += stepSize) {
      let index = (x + y * src.width) * 4;
      let r = src.pixels[index];
      let g = src.pixels[index + 1];
      let b = src.pixels[index + 2];
      let bright = (r + g + b) / (3 * 255);
      let z = map(bright, 0, 1, -abs(depth), abs(depth));
      if (depth < 0) z *= -1;
      vertex(x, y, z);
    }
    endShape();
    
  }
}


// ---- MIDI ----
function onMIDISuccess(midiAccess) {
  for (let input of midiAccess.inputs.values()) {
    input.onmidimessage = handleCustomMIDIMessage;
  }
}

function handleCustomMIDIMessage(message) {
  const [status, cc, val] = message.data;
  //console.log('MIDI:', {status, cc, val});
  
  // Cycle button: change LFO type
  if (cc === 46 && val > 0) {
    lfoTypeIndex = (lfoTypeIndex + 1) % lfoTypes.length;
    select("#lfoType").value(lfoTypes[lfoTypeIndex]);
    return;
  }

  // Faders & Knobs
  if (cc >= 120 && cc <= 127) {
    let controls = midiMap[cc];
    let targetControl = Array.isArray(controls) ? controls[0] : controls;
    if (targetControl === 'colorPicker') {
      let hue = Math.floor((val / 127) * 360);
      let rgb = hsvToRgb(hue / 360, 1, 1);
      let hex = rgbToHex(rgb[0], rgb[1], rgb[2]);
      let picker = select("#colorPicker");
      if (picker) picker.value(hex);
      return;
    }
    let slider = select(`#${targetControl}`);
    if (slider && slider.elt && slider.elt.type === "range") {
      let min = Number(slider.elt.min);
      let max = Number(slider.elt.max);
      let value;
      if (
        targetControl === "depthSlider" ||
        targetControl === "tiltXSlider" ||
        targetControl === "tiltYSlider" ||
        targetControl === "scaleSlider"
      ) {
        // Bipolar mapping: center=64
        let mid = (min + max) / 2;
        let range = (max - min) / 2;
        let bipolar = ((val - 64) / 63) * range;
        value = mid + bipolar;
      } else {
        // Unipolar mapping
        value = min + (val / 127) * (max - min);
      }
      let step = slider.elt.step ? Number(slider.elt.step) : 1;
      if (step >= 1) value = Math.round(value);
      value = Math.max(min, Math.min(max, value));
      if (!isNaN(value)) slider.value(value);
    }
    return;
  }

  // Solo buttons (LFO toggles)
  if ([32,33,34,35].includes(cc)) {
    let checkbox = select(`#${midiMap[cc][0]}`);
    if (checkbox && checkbox.elt && checkbox.elt.type === "checkbox") {
      if (val > 0) checkbox.elt.checked = !checkbox.elt.checked;
    }
    return;
  }
}

// --- Color helpers ---
function hsvToRgb(h, s, v) {
  let r, g, b;
  let i = Math.floor(h * 6);
  let f = h * 6 - i;
  let p = v * (1 - s);
  let q = v * (1 - f * s);
  let t = v * (1 - (1 - f) * s);
  switch (i % 6) {
    case 0: r = v, g = t, b = p; break;
    case 1: r = q, g = v, b = p; break;
    case 2: r = p, g = v, b = t; break;
    case 3: r = p, g = q, b = v; break;
    case 4: r = t, g = p, b = v; break;
    case 5: r = v, g = p, b = q; break;
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}
function rgbToHex(r, g, b) {
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b)
    .toString(16)
    .slice(1)
    .toUpperCase();
}
