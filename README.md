# Rutt-Etra WebGL

Live Rutt-Etra effect in browser. Real-time webcam/video/image, MIDI control, optimized for performance.

## 🧠 Rutt-Etra App – Setup Instructions

### ⚙️ Requirements (Both Platforms)

* **Python 3.10+**
* **Git**
* **Node.js** (includes `npm` and `npx`)

---

## 🍎 macOS Instructions

### 1. Open Terminal

Use `Cmd + Space`, type **Terminal**, press `Enter`.

### 2. Install Required Tools

```bash
xcode-select --install        # Installs developer tools (includes Git)
brew install python node      # Installs Python and Node.js
```

> ⚠️ If you don’t have Homebrew, install it first:
>
> ```bash
> /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
> ```

### 3. Clone the GitHub Repo & Checkout Mac Branch

```bash
git clone https://github.com/YOUR_USERNAME/rutt-etra-app.git
cd rutt-etra-app
git switch mac
```

### 4. Build the App

```bash
python3 build_mac_app.py
```

### 5. Run the App

```bash
open release-builds/rutt-etra-app-darwin-arm64/rutt-etra-app.app
```

---

## 🪟 Windows Instructions

### 1. Open Command Prompt

Press `Win + R`, type `cmd`, and press Enter.

### 2. Install Required Tools

```cmd
winget install --id Git.Git -e --source winget
winget install --id OpenJS.NodeJS.LTS -e --source winget
winget install --id Python.Python.3.10 -e --source winget
```

> ❗ If `winget` is not recognized, run the following in `cmd` to open Microsoft Store:
>
> ```cmd
> start ms-windows-store://pdp/?productid=9NBLGGH4NNS1
> ```
>
> Then install **App Installer** (includes winget).

### 3. Clone the GitHub Repo & Checkout Windows Branch

```cmd
git clone https://github.com/YOUR_USERNAME/rutt-etra-app.git
cd rutt-etra-app
git switch windows
```

### 4. Build the App

```cmd
python build_windows_app.py
```

### 5. Run the App

Open the generated `.exe` located in:

```
rutt-etra-app\release-builds\rutt-etra-app-win32-x64\
```
