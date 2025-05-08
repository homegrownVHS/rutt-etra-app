import os
import json
import subprocess
import shutil
import platform

def ensure_main_js():
    if not os.path.exists("main.js"):
        with open("main.js", "w") as f:
            f.write("""\
const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: true
    }
  });
  win.loadFile('index.html');
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
""")
        print("✅ Created main.js")

def ensure_package_json():
    pkg_path = "package.json"
    if not os.path.exists(pkg_path):
        with open(pkg_path, "w") as f:
            f.write(json.dumps({
                "name": "rutt-etra-app",
                "version": "1.0.0",
                "main": "main.js",
                "scripts": {
                    "start": "electron ."
                },
                "dependencies": {},
                "devDependencies": {
                    "electron": "^25.3.1",
                    "electron-packager": "^17.1.2"
                }
            }, indent=2))
        print("✅ Created default package.json")

    with open(pkg_path, "r+") as f:
        data = json.load(f)
        updated = False
        if data.get("main") != "main.js":
            data["main"] = "main.js"
            updated = True
        if "scripts" not in data or "start" not in data["scripts"]:
            data.setdefault("scripts", {})["start"] = "electron ."
            updated = True
        f.seek(0)
        json.dump(data, f, indent=2)
        f.truncate()
        if updated:
            print("✅ Updated package.json")

def install_dependencies():
    print("📦 Installing npm dependencies...")
    try:
        subprocess.run(["npm", "install"], check=True)
    except subprocess.CalledProcessError as e:
        print("❌ npm install failed.")
        raise e

def clean_old_builds():
    for folder in ["release-builds", "rutt-etra-win32-x64"]:
        if os.path.exists(folder):
            print(f"🧹 Removing old build: {folder}")
            shutil.rmtree(folder, ignore_errors=True)

def build_app():
    print("🚀 Building Windows Electron app...")
    subprocess.run([
        "npx", "electron-packager", ".", "rutt-etra-app",
        "--platform=win32", "--arch=x64",
        "--overwrite", "--out=release-builds"
    ], check=True)

if __name__ == "__main__":
    if platform.system() != "Windows":
        print("⚠️ This script is intended for Windows. Use the macOS version on a Mac.")
    ensure_main_js()
    ensure_package_json()
    clean_old_builds()
    install_dependencies()
    build_app()
