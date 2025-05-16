let uploadedVideo;
let previewImage;

function setup() {
  createCanvas(640, 480, WEBGL);
}

function handleVideoUpload() {
  if (vidInput.elt.files.length > 0) {
    let file = vidInput.elt.files[0];
    previewImage = null;
    uploadedVideo = createVideo([URL.createObjectURL(file)], () => {
      console.log("Video loaded (callback).");
      uploadedVideo.hide();
    });

    uploadedVideo.elt.onloadedmetadata = () => {
      console.log("Video metadata loaded. Dimensions:", uploadedVideo.width, uploadedVideo.height);
      uploadedVideo.play(); // Start playing briefly
      setTimeout(() => {
        uploadedVideo.pause();
        uploadedVideo.loadPixels();
        previewImage = createImage(uploadedVideo.width, uploadedVideo.height);
        previewImage.copy(uploadedVideo, 0, 0, uploadedVideo.width, uploadedVideo.height, 0, 0, previewImage.width, previewImage.height);
        console.log("Preview Image created. Dimensions:", previewImage.width, previewImage.height);
      }, 100); // Wait a short time (100ms)
    };
  } else {
    console.log("No video file selected.");
    previewImage = null;
  }
}

function draw() {
  background(0);
  ortho();
  if (previewImage) {
    image(previewImage, -previewImage.width / 2, -previewImage.height / 2);
  } else {
    text('No preview image...', -50, 0);
  }
}

// Ensure your index.html has the video input element:
// <input type="file" id="vidInput" accept="video/*">