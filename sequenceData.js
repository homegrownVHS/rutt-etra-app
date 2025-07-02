// sequenceData.js

const sequence = [
  {
    time: 0,    // START: Initial state - flat raster, no depth, default scale
    depth: 0,
    tiltX: 0,
    tiltY: 0,
    scale: 0.5,
    shapeX: 1.0,
    shapeY: 1.0,
    waveAmp: 0,
    waveFreq: 0,
    horizAmp: 0.4,
    vertAmp: 0.4,
    offsetX: 0,
    offsetY: -123,
    blurRadius: 1.5,
    edgeIntensity: 0.5,
    temporalStrength: 0.0, // Ensure temporal effects start off
    temporalDecay: 0.9     // Default decay
  },
  {
    time: 4000, // STEP 1: Tilt raster back and increase depth
    // The raster is seen from above and pushed away, creating a sense of depth.
    depth: 45,     // Push the raster deeper into Z space
    tiltX: 36,      // Tilt back (rotate around X-axis)
    tiltY: 0,
    scale: 0.5,     // Slightly scale up as it moves away to maintain visual size
    shapeX: 1.0,
    shapeY: 1.0,
    waveAmp: 0,
    waveFreq: 0,
    horizAmp: 0.4,
    vertAmp: 0.4,
    offsetX: 0,
    offsetY: -123,
    blurRadius: 1.5,
    edgeIntensity: 0.8,
    temporalStrength: 0.0,
    temporalDecay: 0.9
  },
  {
    time: 10000, // STEP 2: Start the "Flyover" - Move horizontally while tilted
    // We'll move the raster to the right (positive offsetX)
    depth: 35,
    tiltX: 26,
    tiltY: 0,
    scale: 1.0,
    shapeX: -10.0,
    shapeY: -5.0,
    waveAmp: 0,
    waveFreq: 0,
    horizAmp: 1.0,
    vertAmp: 0.4,
    offsetX: 0,   // Move raster to the right (camera appears to fly left)
    offsetY: 0,
    blurRadius: 1.5,
    edgeIntensity: 0.8,
    temporalStrength: 0.0,
    temporalDecay: 0.9
  },
  {
    time: 16000, // STEP 3: Continue "Flyover" - Move further right, perhaps with some vertical movement
    // Now move left (negative offsetX)
    depth: 35,
    tiltX: 26,
    tiltY: 0,
    scale: 1.0,
    shapeX: 10.0,
    shapeY: 10.0,
    waveAmp: 0,
    waveFreq: 0,
    horizAmp: 1.0,
    vertAmp: 0.4,
    offsetX: 0,   // Move raster to the right (camera appears to fly left)
    offsetY: -10,
    blurRadius: 1.5,
    edgeIntensity: 0.8,
    temporalStrength: 0.0,
    temporalDecay: 0.9
  },
  {
    time: 20000,    // START: Initial state - flat raster, no depth, default scale
    depth: 0,
    tiltX: 0,
    tiltY: 0,
    scale: 0.5,
    shapeX: 1.0,
    shapeY: 1.0,
    waveAmp: 0,
    waveFreq: 0,
    horizAmp: 0.4,
    vertAmp: 0.4,
    offsetX: 0,
    offsetY: -123,
    blurRadius: 1.5,
    edgeIntensity: 0.8,
    temporalStrength: 0.0, // Ensure temporal effects start off
    temporalDecay: 0.9  
  }
];

// Easing function for interpolation (ensure this is present and accessible globally)
function easing(t) {
  return t < 0.5 ? 16 * t * t * t * t * t : 1 - pow(-2 * t + 2, 5) / 2;
}