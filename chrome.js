let midiMap = {
    0: 'depthSlider',
    1: 'tiltXSlider',
    2: 'tiltYSlider',
    3: 'scaleSlider',
    4: 'densitySlider',
    5: 'lfoFreq',
    6: 'lfoAmp',
    7: 'colorPicker',
    32: 'lfoDepth',
    33: 'lfoTiltX',
    34: 'lfoTiltY',
    35: 'lfoScale'
  };
  
  if (navigator.requestMIDIAccess) {
    navigator.requestMIDIAccess().then(midiAccess => {
      for (let input of midiAccess.inputs.values()) {
        input.onmidimessage = function (msg) {
          let [status, cc, val] = msg.data;
          console.log('MIDI:', { status, cc, val });
  
          if (cc >= 32 && cc <= 35) { // Solo buttons
            let checkbox = select(`#${midiMap[cc]}`);
            if (checkbox && checkbox.elt && checkbox.elt.type === "checkbox") {
              if (val > 0) checkbox.elt.checked = !checkbox.elt.checked;
            }
          } else if (cc >= 0 && cc <= 7) { // Faders
            let slider = select(`#${midiMap[cc]}`);
            if (slider && slider.elt && slider.elt.type === "range") {
              let min = Number(slider.elt.min);
              let max = Number(slider.elt.max);
              let mid = (min + max) / 2;
              let range = (max - min) / 2;
              // Bipolar mapping
              let bipolar = ((val - 64) / 63) * range;
              let value = mid + bipolar;
              slider.value(Math.max(min, Math.min(max, value)));
            }
          }
        };
      }
    });
  }
  