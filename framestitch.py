import subprocess
import os
import re

def create_video_from_frames(image_folder, output_video_path, fps=30, image_pattern="frame_%04d.png"):
    """
    Stitches a sequence of image frames into a video file using FFmpeg.

    Args:
        image_folder (str): The path to the folder containing the image frames.
        output_video_path (str): The desired path and filename for the output video file (e.g., "output.mp4").
        fps (int, optional): The frames per second for the output video. Defaults to 30.
        image_pattern (str, optional): The filename pattern of the image frames.  Defaults to "frame_%04d.png".
            The `%04d` part is crucial; it tells FFmpeg to expect a 4-digit number in the filename.
            If your frames are named differently (e.g., "image_001.png", "frame-0001.jpg"), adjust this accordingly.
    """
    # 1. Check if the image folder exists
    if not os.path.exists(image_folder):
        print(f"Error: Image folder not found: {image_folder}")
        return

    # 2. Check if there are images in the folder
    image_files = [f for f in os.listdir(image_folder) if f.lower().endswith(('.png', '.jpg', '.jpeg'))]
    if not image_files:
        print(f"Error: No PNG or JPG images found in the folder: {image_folder}")
        return

    # 3. Determine the full path to the first image to ensure FFmpeg can find the pattern
    first_image_path = os.path.join(image_folder, image_files[0])

    # 4. Construct the FFmpeg command
    ffmpeg_command = [
        "ffmpeg",
        "-y",  # Overwrite output file if it exists
        "-framerate", str(fps),  # Set the input frame rate
        "-i", os.path.join(image_folder, image_pattern),  # Input image sequence pattern
        "-c:v", "libx264",  # Use the H.264 video codec (good compatibility)
        "-pix_fmt", "yuv420p",  # Pixel format (important for compatibility)
        output_video_path  # Output video file path
    ]

    # 5. Print the FFmpeg command (for debugging)
    print("FFmpeg command:")
    print(" ".join(ffmpeg_command))

    # 6. Execute the FFmpeg command
    try:
        result = subprocess.run(ffmpeg_command, check=True, capture_output=True) # Store the result
        print(f"Video created successfully: {output_video_path}")
        print(f"FFmpeg output (stdout):\n{result.stdout.decode('utf-8')}")
    except subprocess.CalledProcessError as e:
        print(f"Error: FFmpeg failed to create video.")
        print(f"Return code: {e.returncode}")
        print(f"FFmpeg output (stderr):\n{e.stderr.decode('utf-8')}")
        return
    except FileNotFoundError:
        print("Error: FFmpeg not found. Please ensure FFmpeg is installed and in your system's PATH.")
        return

if __name__ == "__main__":
    # Get user inputs
    image_folder = "/Users/adam/Desktop/frames" # Hardcoded path
    #output_video_path = input("Enter the desired path and filename for the output video (e.g., 'output.mp4'): ")
    fps_input = input("Enter the frames per second for the output video (default is 30): ")
    image_pattern = input("Enter the filename pattern of the image frames (default is 'frame_%04d.png'): ")

    # Get the user's Desktop directory
    desktop_path = os.path.join(os.path.expanduser("~"), "Desktop")
    output_video_name = "output.mp4"  # You can change the default name if you want
    output_video_path = os.path.join(desktop_path, output_video_name)

    #convert fps_input to int
    if fps_input:
        try:
            fps = int(fps_input)
        except ValueError:
            print("Invalid fps value.  Using default of 30.")
            fps = 30
    else:
        fps = 30

    if not image_pattern:
        image_pattern = "frame_%04d.png" #default

    # Call the function to create the video
    create_video_from_frames(image_folder, output_video_path, fps, image_pattern)
    print("Done! Video saved to your Desktop: ", output_video_path)
