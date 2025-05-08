import os
import shutil
import subprocess
import sys

def ensure_node_tools():
    """Check if npm and npx are installed. If not, exit with instructions."""
    for tool in ['npm', 'npx']:
        if not find_executable(tool):
            print(f"❌ {tool} is not installed or not in PATH.")
            print("👉 Download and install Node.js from https://nodejs.org (includes npm and npx)")
            sys.exit(1)

def find_executable(name):
    """Attempt to find the full path to npm/npx across common install locations."""
    possible_dirs = [
        os.path.join(os.environ.get("ProgramFiles", ""), "nodejs"),
        os.path.join(os.environ.get("ProgramFiles(x86)", ""), "nodejs"),
        os.path.expandvars(r"%AppData%\npm"),
    ]
    for base in possible_dirs:
        exe_path = os.path.join(base, f"{name}.cmd")
        if os.path.isfile(exe_path):
            return exe_path
    return shutil.which(name)  # Fallback to PATH

def run_with_node_path(cmd):
    """Run npm/npx commands using full path resolution."""
    tool = cmd[0]
    full_tool_path = find_executable(tool)
    if not full_tool_path:
        raise FileNotFoundError(f"{tool} not found. Please ensure Node.js is installed.")
    full_cmd = [full_tool_path] + cmd[1:]
    return subprocess.run(full_cmd, check=True)

def create_main_js():
    main_js = "main.js"
    if not os.path.exists(main_js):
        print("✅ Creating main.js")
        with open(main_js, "w") as f:
            f.write("""const { app, BrowserWindow } = require('electron');
function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      nodeIntegration: true
    }
  });
  win.loadFile('index.html');
}
app.whenReady().then(createWindow);""")

def create_package_json():
    package_json = "package.json"
    if not os.path.exists(package_json):
        print("✅ Creating default package.json")
        with open(package_json, "w") as f:
            f.write("""{
  "name": "rutt-etra-app",
  "version": "1.0.0",
  "main": "main.js",
  "scripts": {
    "start": "electron ."
  },
  "devDependencies": {
    "electron": "^25.8.3",
    "electron-packager": "^17.1.2"
  }
}""")

def install_npm_dependencies():
    print("📦 Installing npm dependencies...")
    run_with_node_path(["npm", "install"])

def build_windows_app():
    print("🛠️ Building Electron app for Windows...")
    run_with_node_path([
        "npx", "electron-packager", ".", "rutt-etra-app",
        "--platform=win32", "--arch=x64",
        "--overwrite", "--out=release-builds"
    ])
    print("✅ Build complete. Check the 'release-builds' folder.")

if __name__ == "__main__":
    ensure_node_tools()
    create_main_js()
    create_package_json()
    install_npm_dependencies()
    build_windows_app()
