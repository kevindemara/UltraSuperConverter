<div align="center">
  <img src="public/assets/logo-opt.png" alt="UltraSuperConvertor Logo" width="96" height="96" />
  <br />
  <img src="public/assets/wordmark.png" alt="ULTRA SUPER CONVERTOR" height="44" />
  <p><strong>Fast, Modern Local Media Converter &amp; Compressor</strong></p>
  <p>
    <code>Sharp (libvips)</code> &bull; <code>HEIC / HEIF Support</code> &bull; <code>FFmpeg 6.1 Static</code> &bull; <code>100% Local &amp; Private</code> &bull; <code>HTML Setup Wizard</code>
  </p>
</div>

---

## Overview

**UltraSuperConvertor** is a self-contained, local browser-based media compression, format conversion, resizing, and editing app for **Images (including Apple `.heic` / `.heif`), Videos, and Audio**.

Every operation executes **100% locally on your machine** using **Sharp (`libvips` 8.15)**, **`heic-convert`**, and **bundled static FFmpeg 6.1 + FFprobe** binaries—with zero external cloud uploads, zero file size limits, and zero subscriptions.

---

## 1. Easy Installation (HTML Setup & Desktop Icon Wizard — No `.exe` Required)

UltraSuperConvertor uses an **HTML Setup & Desktop Shortcut Wizard** (`setup-wizard.html` + `setup-wizard.cmd`) so you never have to deal with unsigned `.exe` installers, Windows SmartScreen blocks, or code-signing certificates.

### Option A: Launch the HTML Setup Wizard
1. Double-click **`setup-wizard.cmd`** in the project root (or open `http://localhost:3847/setup` / `setup-wizard.html` in your browser).
2. Walk through the **4-Step Interactive Browser Wizard**:
   - **Step 01 — Pre-Flight Scan**: Automatically detects your local **Node.js runtime**, **Sharp (`libvips`)** image core, **FFmpeg 6.1 + FFprobe** static binaries, and **`UltraSuperConvertor.ico`** desktop icon asset.
   - **Step 02 — Install & Verify Packages**: One-click button (`⚡ VERIFY & INSTALL PACKAGES`) runs `npm install`, verifies the static FFmpeg binary, and initializes the `uploads/` and `outputs/` workspace directories. *(Even on a brand-new Git clone before `node_modules` exists, `setup-wizard.cmd` boots a zero-dependency Node HTTP bridge via `installer/wizard-server.js` so the HTML wizard can install everything from the browser!)*
   - **Step 03 — Desktop Icon & Start Menu Shortcut**: Check **"Add UltraSuperConvertor Icon to Windows Desktop"** and **"Add to Windows Start Menu"** to generate native Windows `.lnk` shortcuts stamped with the custom multi-resolution `UltraSuperConvertor.ico` emblem.
   - **Step 04 — Ready to Launch**: Click **`🚀 OPEN ULTRASUPERCONVERTOR STUDIO`** to jump straight into the workspace.

> **Node.js LTS Included in Setup**: If Node.js is not installed on your PC yet, Step 1 of `setup-wizard.html` provides a 1-click download for the official signed [Node.js LTS Windows `.msi` Installer](https://nodejs.org/), and running `setup-wizard.cmd` will automatically install Node.js LTS via `winget` or the official `.msi` package. All media engines (`sharp`, `ffmpeg-static`, `ffprobe-static`) are bundled automatically via NPM—no manual `PATH` or codec setup required.

---

## 2. Starting & Stopping the Application

### Starting UltraSuperConvertor
You can launch the application in any of three ways:
1. **Desktop Icon**: Double-click the **UltraSuperConvertor** icon on your Windows Desktop or Start Menu.
2. **Batch Launcher**: Double-click **`start.cmd`** in the root folder.
   - Checks if `node_modules` is present (and auto-installs if missing).
   - Starts `node server.js` minimized in the background and records its PID in `.server.pid`.
   - Automatically opens `http://localhost:3847` in your default browser.
3. **CLI**: Run `npm start` (or `node server.js`) from a terminal.

### Stopping UltraSuperConvertor
When you are done converting files, you can shut down the background server immediately in either of two ways:
1. **In-App GUI Button**: Click the red **`STOP INSTANCE`** power button in the top-right header of the web interface and confirm shutdown.
2. **Stop Script**: Double-click **`stop.cmd`** in the project directory, which gracefully calls `POST /api/shutdown`, terminates any process listening on port `3847`, and cleans up `.server.pid`.

---

## 3. Clean, Modern Workspace

The interface is organized into an intuitive **2-Column Layout** over a subtle animated wave backdrop:

| Section | Module | Responsibilities |
| :--- | :--- | :--- |
| **Left Sidebar (Top)** | **`1. Choose a Preset`** | One-click presets mapped in a clean 2-column grid (including **Optimize for Web**, **HEIC / Photo to JPG**, **Social & Creators**, **Discord & Chat**, **Video to GIF**, and more). |
| **Left Sidebar (Bottom)** | **`Advanced Settings` *(Collapsed by Default)*** | Collapsible format, quality, CRF, target file size, resize, filter, and audio settings. Collapsed by default to keep the interface clean and uncluttered; click **Customize ▾** anytime to fine-tune. |
| **Right Stage** | **`2. Your Files` (Dropzone & Queue)** | Drag-and-drop file card (`Select Files` / `Load Sample Files`), **Convert All Files / Download All (ZIP)** bar, and a real-time conversion queue. |

### Built-In Smart Presets
- **Optimize for Web** *(Recommended)*: Converts images to high-efficiency `WebP` (Q80, 1920px max width, stripped metadata) and videos to `MP4` (H.264, CRF 25, 1080p, `+faststart` web streaming).
- **Ultra Compression**: Maximum byte reduction using `AVIF` (Q55) for images and `H.264` (CRF 31, 720p) for video.
- **Social / Discord (<10MB)**: Automatically targets **9 MB** maximum file size for video uploads, calculating the exact video/audio bitrate needed based on clip duration.
- **4K / Lossless Studio**: Archival quality (`PNG` Q100 lossless / `MP4` CRF 17 original resolution, metadata preserved).
- **Social 1080×1080 Square**: Smart center-crop `1080×1080` (`cover`) for social feeds.
- **Thumbnail Matrix (400px)**: Rapid `400×400` `WebP` thumbnail generation with post-resize optical sharpening.
- **Video → Animated GIF**: High-color 2-pass palettegen/Bayer-dithered animated GIF generator (`15 fps`, `480p`).
- **Extract Audio (MP3)**: Strips video tracks and extracts normalized `192 kbps` `MP3` audio.
- **App Icon / Favicon (256px)**: Generates crisp `256×256` transparent icons (`ICO` / `PNG`).
- **Custom Lab Mode**: Full manual control over every encoder parameter.

---

## 4. Interactive Visual Studios

Each item card in the Batch Queue includes interactive studio buttons:

1. **✂ CROP & WATERMARK STUDIO** *(Image Cards)*:
   - Opens an interactive optical canvas over your actual uploaded image.
   - Drag the **8 resize handles** or move the **Rule-of-Thirds crop box** (with aspect ratio locks: `Freeform`, `1:1`, `16:9`, `4:3`, `9:16`) while inspecting live pixel coordinates (`X`, `Y`, `W`, `H`).
   - Toggle the **Draggable Text Watermark Pill** (`© ULTRA STUDIO`, custom size & color) and drag it anywhere on the frame.
   - Apply to the single image or click **`APPLY TO ALL IMAGES`** to batch-apply the exact crop/watermark geometry across your entire queue.
2. **✂ TIMELINE TRIMMER** *(Video Cards)*:
   - Automatically extracts a **6-frame visual filmstrip** from your video via FFmpeg.
   - Drag the green **`IN`** handle and amber **`OUT`** handle to set frame-accurate trim points (`startTime` / `endTime`) with live HTML5 video scrubbing and loop preview.
3. **◫ COMPARE (BEFORE / AFTER INSPECTOR)** *(Completed Cards)*:
   - **Image Curtain Mode**: Drag the interactive 50/50 split curtain across the original and compressed images to inspect pixel quality vs. file size savings.
   - **Synchronized Video Mode**: Plays the original input video and transcoded output video side-by-side with synchronized play/pause/scrub controls.

---

## 5. Supported Formats

| Category | Supported Input Formats | Supported Output Formats |
| :--- | :--- | :--- |
| **Images** | `HEIC`, `HEIF`, `PNG`, `JPG/JPEG`, `WebP`, `AVIF`, `GIF`, `TIFF`, `SVG`, `ICO`, `BMP` | `Auto (WebP)`, `WebP`, `AVIF`, `JPG (MozJPEG)`, `PNG`, `HEIC / HEIF`, `TIFF`, `GIF`, `ICO` |
| **Video** | `MP4`, `WebM`, `MOV`, `MKV`, `AVI`, `WMV`, `FLV`, `M4V` | `MP4 (H.264 / H.265)`, `WebM (VP9)`, `MOV`, `MKV`, `AVI`, `Animated GIF`, `Animated WebP` |
| **Audio** | `MP3`, `WAV`, `FLAC`, `AAC`, `OGG`, `OPUS`, `M4A` *(plus audio extraction from any video)* | `MP3`, `WAV (PCM 16-bit)`, `FLAC`, `AAC (M4A)`, `OGG (Vorbis)`, `OPUS` |

---

## 6. Project Structure & Architecture

```text
UltraSuperConvertor/
├── server.js                  # Express + Sharp + FFmpeg/FFprobe processing engine & REST/SSE API
├── setup-wizard.html          # 4-Step HTML Setup, Dependency & Desktop Icon Wizard UI
├── setup-wizard.cmd           # Launches the HTML Setup Wizard in the default browser
├── start.cmd                  # Starts the background server and opens http://localhost:3847
├── stop.cmd                   # Gracefully stops the running server instance and frees port 3847
├── UltraSuperConvertor.ico    # Multi-resolution (16, 32, 48, 64, 256px) Windows Desktop Icon
├── package.json               # Dependencies (express, sharp, ffmpeg-static, ffprobe-static, archiver, multer)
├── installer/
│   └── wizard-server.js       # Zero-dependency Node HTTP bootstrapper for fresh clones
├── public/
│   ├── index.html             # 3-column Studio GUI + Crop/Trim/Compare/Output Folder modals
│   ├── styles.css             # Studio stylesheet & animated wave backdrop
│   ├── app.js                 # Frontend state machine, SSE client, Crop/Watermark & Video Trimmer logic
│   └── assets/                # Brand aperture icon, horizontal wordmark, and hero artwork
├── uploads/                   # Temporary workspace for ingested files & generated thumbnails
└── outputs/                   # Processed output media files
```

### Key API Endpoints (`server.js`)
- `GET /api/state` — Returns engine versions (`sharp`, `libvips`, `ffmpeg`), PID, uptime, and queue state.
- `GET /api/events` — Server-Sent Events (SSE) stream for real-time per-file encoding progress (`job-started`, `job-progress`, `job-completed`, `system-shutdown`).
- `POST /api/upload` — Multipart batch file ingestion with automatic `sharp` metadata / `ffprobe` stream inspection and thumbnail extraction.
- `POST /api/generate-demo` — Synthesizes 3 high-resolution test assets (`2400×1600 PNG`, `2000×2000 TIFF`, and a `1080p 30fps MP4` video with `440Hz` audio) for instant one-click testing.
- `POST /api/process` — Executes batch or single-item image/video/audio transcoding with full preset & studio overrides.
- `POST /api/items/:id/studio` — Saves interactive crop box, draggable watermark coordinates, or video trim in/out points.
- `GET /api/video-frames/:id` — Extracts a 6-frame thumbnail strip for the interactive video timeline scrubber.
- `GET /api/download-zip` — Streams all completed batch outputs as a single `.zip` archive.
- `GET /setup` & `/api/wizard/*` — Serves the HTML Setup Wizard, runs dependency verification, and generates Windows `.lnk` shortcuts.
- `POST /api/shutdown` — Broadcasts shutdown telemetry to connected browsers and terminates the Node server process cleanly.
