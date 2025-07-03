// sequenceManager.js

const sequenceManager = (() => {
    let theShader;
    let animatedParameters = {}; // Object to hold references to the animated parameters (e.g., slider objects)
    let isPlaying = false;
    let startTime = 0;
    let totalSequenceDuration = 0; // Will be determined from the sequence data
    let loopSequence = true; // Added a flag for looping
    let currentSequenceIndex = 0; // Added for tracking current step in the sequence
    let currentAnimatedValues = {}; // Store the interpolated values for the current frame

    // The easing function. This will now be a linear function.
    // We'll keep the name 'easing' for consistency, but its behavior is linear.
    function linearInterpolationFunction(t) {
        return t; // For linear interpolation, the progress 't' is returned as is.
    }

    // Function to calculate interpolated value
    // This function will now always perform linear interpolation for segmentProgress.
    function interpolate(startValue, endValue, progress) { // Removed easeFn parameter
        // The progress itself is what we need for linear interpolation
        return startValue + (endValue - startValue) * progress;
    }

    function init(shader, params) {
        theShader = shader;
        animatedParameters = params; // Store the references to the actual slider objects

        // Calculate total duration based on the last 'time' in the sequence
        if (typeof sequence !== 'undefined' && sequence.length > 0) {
            totalSequenceDuration = sequence[sequence.length - 1].time;
            console.log("Sequence Manager Initialized. Total Sequence Duration:", totalSequenceDuration, "ms");
        } else {
            console.warn("Sequence data is not defined or is empty. Please ensure sequenceData.js is loaded and contains 'const sequence = [...];'");
            totalSequenceDuration = 0; // Set to 0 if no sequence data
        }
    }

    function toggleSequence() {
        isPlaying = !isPlaying;
        if (isPlaying) {
            startTime = millis(); // Record the start time
            console.log("Sequence Started at:", startTime);
        } else {
            console.log("Sequence Paused.");
        }
        return isPlaying; // Return current playing state
    }

    // This function will be called by sketch.js's draw loop
    function getAnimatedParameters() {
        if (!isPlaying || totalSequenceDuration === 0 || !sequence || sequence.length === 0) {
            return null; // Return null if not playing or no sequence data
        }

        let elapsedTime = millis() - startTime;

        if (loopSequence) {
            elapsedTime %= totalSequenceDuration; // Loop the sequence
        } else if (elapsedTime >= totalSequenceDuration) {
            isPlaying = false; // Stop if not looping and sequence finished
            console.log("Sequence Finished.");
            return null; // Return null once finished
        }

        // Find the current and next keyframe
        let currentStep = null;
        let nextStep = null;

        for (let i = 0; i < sequence.length; i++) {
            if (elapsedTime >= sequence[i].time) {
                currentStep = sequence[i];
                currentSequenceIndex = i; // Keep track of the current step index
            }
            if (elapsedTime < sequence[i].time) {
                nextStep = sequence[i];
                break; // Found the next step
            }
        }

        // Handle the case where we are at or past the last keyframe
        if (!nextStep && currentStep) {
            // We are at the last keyframe or beyond (if not looping)
            // Use the last keyframe's values
            currentAnimatedValues = { ...currentStep }; // Clone the object
        } else if (currentStep && nextStep) {
            // Interpolate between current and next step
            let segmentDuration = nextStep.time - currentStep.time;
            let segmentProgress = (elapsedTime - currentStep.time) / segmentDuration;

            currentAnimatedValues = {}; // Reset for current frame's values

            // Iterate over all keys (parameters) in the current step
            for (const key in currentStep) {
                if (key !== 'time' && key !== 'easing') { // Don't interpolate 'time' or 'easing' function
                    let startValue = currentStep[key];
                    let endValue = nextStep[key] !== undefined ? nextStep[key] : startValue; // Use startValue if endValue is missing

                    // Directly use the segmentProgress for linear interpolation
                    currentAnimatedValues[key] = interpolate(startValue, endValue, segmentProgress);
                }
            }
        } else {
            // This case should ideally not happen if sequence[0].time is 0
            // but provides a fallback to the first step's values
            if (sequence.length > 0) {
                currentAnimatedValues = { ...sequence[0] };
            } else {
                return null; // No sequence data at all
            }
        }

        // --- Debugging Logs ---
        console.log("Sequence Manager Time:", elapsedTime);
        console.log("Sequence Manager Current Step:", currentStep ? currentStep.time : 'N/A');
        console.log("Sequence Manager Next Step:", nextStep ? nextStep.time : 'N/A');
        console.log("Calculated Interpolated Params:", currentAnimatedValues);
        // --- End Debugging Logs ---

        return currentAnimatedValues;
    }

    return {
        init,
        toggleSequence,
        getAnimatedParameters,
        get isPlaying() { return isPlaying; },
        setLoop: (shouldLoop) => { loopSequence = shouldLoop; },
        setStartTime: (time) => { startTime = time; }, // For resetting start time
        getSequenceProgress: () => {
             if (!isPlaying || totalSequenceDuration === 0) return 0;
             let elapsedTime = millis() - startTime;
             if (loopSequence) {
                 elapsedTime %= totalSequenceDuration;
             }
             return elapsedTime / totalSequenceDuration;
        }
    };
})();