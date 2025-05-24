import os
import time
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException, NoSuchElementException, WebDriverException

def process_images_with_selenium(image_folder_path, output_folder_path, html_file_path):
    """
    Automates a web browser using Selenium to upload images to a p5.js Rutt-Etra
    application, process them, and download the results. It prompts the user
    to set parameters after loading the first image and uses robust waits.

    Args:
        image_folder_path (str): The absolute path to the folder containing input images.
        output_folder_path (str): The absolute path where processed images will be saved.
        html_file_path (str): The absolute path to your index.html file.
    """

    # --- Configuration ---
    os.makedirs(output_folder_path, exist_ok=True)

    image_files = [f for f in os.listdir(image_folder_path)
                   if f.lower().endswith(('.png', '.jpg', '.jpeg', '.gif', '.webp'))]
    if not image_files:
        print(f"No image files found in the specified folder: {image_folder_path}")
        return

    print(f"Found {len(image_files)} images to process from {image_folder_path}.")

    # Configure Chrome options for automatic downloads
    chrome_options = webdriver.ChromeOptions()
    prefs = {
        "download.default_directory": output_folder_path,
        "download.prompt_for_download": False, # Disable download prompt
        "download.directory_upgrade": True,
        "safeBrowse.enabled": True
    }
    chrome_options.add_experimental_option("prefs", prefs)
    chrome_options.add_argument("--window-size=1400,900")
    # chrome_options.add_argument("--headless") # Keep commented for interactive parameter setting
    # Optional: arguments to potentially help with cache/state
    # chrome_options.add_argument("--disable-application-cache")
    # chrome_options.add_argument("--disk-cache-size=1")
    # chrome_options.add_argument("--media-cache-size=1")
    # chrome_options.add_argument("--disable-gpu-shader-disk-cache") # Clear shader cache too

    driver = None # Initialize driver to None for finally block

    try:
        driver = webdriver.Chrome(options=chrome_options)
    except WebDriverException as e:
        print(f"Error initializing WebDriver. Ensure chromedriver is correctly installed and accessible. Error: {e}")
        print("Tip: Check if the chromedriver version matches your Chrome for Testing browser version.")
        print("You can download the correct chromedriver from: https://googlechromelabs.github.io/chrome-for-testing/")
        return

    def wait_for_js_flag(js_flag_name, timeout=15):
        """Waits for a JavaScript flag (e.g., window.imageProcessed) to become true."""
        start_time = time.time()
        while time.time() - start_time < timeout:
            try:
                flag_status = driver.execute_script(f"return window.{js_flag_name};")
                if flag_status:
                    return True
            except WebDriverException:
                # Page might be loading, or JS context not ready
                pass
            time.sleep(0.5) # Check every 0.5 seconds
        return False

    def wait_for_file_download(expected_path, timeout=15):
        """Waits for a file to appear at a given path on disk."""
        start_time = time.time()
        while time.time() - start_time < timeout:
            if os.path.exists(expected_path):
                # Add a small buffer to ensure file write is complete
                time.sleep(0.5)
                return True
            time.sleep(0.5)
        return False

    try:
        # Navigate to your local HTML file
        driver.get(f"file:///{os.path.abspath(html_file_path)}")
        print(f"Web application loaded from: {os.path.abspath(html_file_path)}")

        driver.maximize_window()
        # Initial short sleep for the browser to settle
        time.sleep(2)

        try:
            img_input = WebDriverWait(driver, 15).until(
                EC.presence_of_element_located((By.ID, "imgInput"))
            )
            print("Image input element found.")
        except TimeoutException:
            print("Error: Could not find the image input element (#imgInput). Check your HTML ID.")
            return

        try:
            download_button = WebDriverWait(driver, 15).until(
                EC.element_to_be_clickable((By.ID, "downloadBtn"))
            )
            print("Download button found.")
        except TimeoutException:
            print("Error: Could not find the download button (#downloadBtn). Check your HTML ID.")
            return

        # --- Process the first image and pause for user input ---
        first_image_file = image_files[0]
        full_first_image_path = os.path.join(image_folder_path, first_image_file)
        print(f"\nLoading first image: {first_image_file}")
        img_input.send_keys(full_first_image_path)
        print(f"Uploaded: {full_first_image_path}")

        # Wait for the first image to be processed by the p5.js app
        if not wait_for_js_flag("imageProcessed", timeout=20): # Increased timeout for initial load
            print(f"Warning: First image ({first_image_file}) processing not confirmed within timeout. Proceeding anyway.")

        print("\n" + "="*80)
        print(">>> FIRST IMAGE LOADED. <<<")
        print("Please go to the browser window and set your desired parameters (depth, tilt, scale, etc.).")
        print("Once you are satisfied with the settings, press ENTER in THIS terminal to continue processing.")
        print("="*80 + "\n")

        input("Press ENTER to continue...") # This pauses the script and waits for user input

        print("\nContinuing batch processing with the set parameters...")
        # --- End of pause for user input ---

        # Process all images
        for i, image_file in enumerate(image_files):
            full_image_path = os.path.join(image_folder_path, image_file)
            print(f"\nProcessing {image_file} ({i + 1}/{len(image_files)})...")

            # Reset the JS flag for the next image
            driver.execute_script("window.imageProcessed = false;")

            # Upload the image file
            # If it's the first image, it's already uploaded. Re-uploading for consistency.
            # You might optimize this by skipping send_keys for the first image.
            img_input.send_keys(full_image_path)
            print(f"Uploaded: {full_image_path}")

            # Wait for the p5.js app to signal it has processed this image
            if not wait_for_js_flag("imageProcessed"):
                print(f"Warning: Image ({image_file}) processing not confirmed within timeout. Attempting download.")
            else:
                print(f"Confirmed {image_file} processed by web app.")

            # Click the download button
            try:
                download_button.click()
                print(f"Download button clicked for {image_file}.")

                # Default downloaded file name from saveCanvas is 'rutt-etra-output.png'
                downloaded_file_name_default = "rutt-etra-output.png"
                expected_download_path = os.path.join(output_folder_path, downloaded_file_name_default)

                # Wait for the file to actually appear on disk
                if wait_for_file_download(expected_download_path):
                    # Create a unique name for the processed image
                    base_name = os.path.splitext(image_file)[0] # Get original filename without extension
                    new_file_name = f"processed_{base_name}.png" # Append '.png' if output is always png
                    new_file_path = os.path.join(output_folder_path, new_file_name)
                    try:
                        # Ensure we rename after the file is fully written
                        os.rename(expected_download_path, new_file_path)
                        print(f"Renamed downloaded file to: {new_file_path}")
                    except OSError as e:
                        print(f"Error renaming {downloaded_file_name_default} to {new_file_name}: {e}")
                else:
                    print(f"Error: Downloaded file '{downloaded_file_name_default}' not found for '{image_file}' after timeout. It might have failed to download or was renamed by the browser.")

            except NoSuchElementException:
                print(f"Download button disappeared or was not interactable for {image_file}. Skipping.")
            except Exception as e:
                print(f"An unexpected error occurred during download processing for {image_file}: {e}")

        print("\nAll images processed (or attempted). Check the output folder.")

    except Exception as e:
        print(f"An error occurred during the automation process: {e}")
    finally:
        if driver:
            driver.quit()
            print("Browser closed.")

# --- Define your paths here ---
# Ensure these are absolute paths.
IMAGE_INPUT_FOLDER = "/Users/adam/Library/CloudStorage/OneDrive-Personal/photo/Gradient gifs/Concentric/flower/45"
PROCESSED_OUTPUT_FOLDER = "/Users/adam/Desktop/processed_rutt_etra_images" # This folder will be created if it doesn't exist
HTML_FILE_PATH = "/Users/adam/Documents/GLSL/rutt-etra-app/index.html" # Corrected path to your index.html

if __name__ == "__main__":
    process_images_with_selenium(IMAGE_INPUT_FOLDER, PROCESSED_OUTPUT_FOLDER, HTML_FILE_PATH)