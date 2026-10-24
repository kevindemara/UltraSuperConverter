<div align="center">
  <img src="public/assets/logo-opt.png" alt="UltraSuperConverter Logo" width="96" height="96" />
  <br />
  <img src="public/assets/wordmark.png" alt="ULTRA SUPER CONVERTER" height="44" />
  <p><strong>Fast, Modern Local Media Converter &amp; Compressor</strong></p>
  <p>
    <code>Sharp (libvips)</code> &bull; <code>HEIC / HEIF Support</code> &bull; <code>FFmpeg Static</code> &bull; <code>100% Local &amp; Private</code> &bull; <code>100-Tool Toolbox</code>
  </p>
</div>

---

[GitHub repository](https://github.com/kevindemara/UltraSuperConverter)

## New in v5.1 — organized tool library

The [Toolbox](http://localhost:3847/tools.html#all) organizes all **100 tools into ten categories**, with small SVG icons, searchable cards and a compact list view. Search works across the whole library, including common terms such as “uppercase” and “compress PDF.” Use **Ctrl/Cmd+K** or **/** to jump to search; existing tool links still open directly.

Star tools from their cards or workbench to keep them in **Favorites**. **Recent** shows the latest 12 successfully used tools, newest first, with a clear-history button. Favorites, recent tool IDs, display mode and sort order persist in this browser and synchronize between tabs. Tool inputs, files, passwords and results are never included in these preferences. If browser storage is unavailable, the library still works for the current session.

Browsing the library and returning to the same tool preserves its current input and results. On small screens, personal navigation stays at the top and categories collapse into an expandable menu. Run `npm test` for all **138 checks**, including category coverage, icons, preference persistence and search behavior.

## New in v5.0 — 100 local tools

This release adds **50 everyday utilities**, bringing the Toolbox to **100 tools**, alongside the ten persistent Workspace capabilities. Open **Toolbox · 100 tools** in the header. The complete new-feature list is in [FEATURES-110.md](FEATURES-110.md).

Popular starting points:

- [Text formatter](http://localhost:3847/tools.html#text-case): ALL CAPS, lowercase, capitalization, title/sentence/toggled case.
- [Word and character counter](http://localhost:3847/tools.html#text-count): words, visible Unicode characters, code points, bytes, lines, sentences, paragraphs, and estimated reading/speaking times.
- [Text diff checker](http://localhost:3847/tools.html#text-diff): line/word/character comparisons, highlighted additions/removals, and HTML/JSON downloads.
- [MD5 / SHA hashes](http://localhost:3847/tools.html#text-hash), [AES encryption](http://localhost:3847/tools.html#aes-encrypt), and [PDF compressor](http://localhost:3847/tools.html#pdf-compress).

The new tools also cover pasted-text cleanup, line sorting/deduplication, find/replace, regex testing, slugs, naming conventions, wrapping/truncation, Unicode normalization, email/URL/IP extraction, word frequencies, byte/Morse encodings, JSON queries/diffs/flattening/JSONL, CSV filtering, SQL/code formatting, CSS/JavaScript minification, URL editing, JWT and certificate inspection, password/UUID/token generation, password digests, PDF blank-page removal/paper resizing/grayscale, QR generation/reading, color conversion/contrast, units, and timestamps.

Text workbenches show live counts, provide quick case buttons, and preserve pasted text when switching between ordinary text tools. Results can be downloaded, copied in full, or reused as input. Comparisons have multiline controls and highlighted output. Pasted text requests use JSON so browser multipart line-ending normalization cannot silently change the bytes being hashed or compared. Text diffs treat CRLF/LF as equivalent by default; that option can be disabled.

### Hashes, encryption and private inputs

- MD5/SHA digests are **one-way hashes**, not encryption. MD5 and SHA-1 are included for legacy checksums. HMAC authenticates a message with a secret key.
- AES uses password-derived keys with random salts, random 96-bit nonces, and AES-256-GCM authentication. Its JSON envelope must be retained to decrypt the original bytes; wrong passwords and modified envelopes are rejected. Encryption is limited to 32 MB per binary file; envelope uploads support 48 MB.
- Scrypt and bcrypt tools create and verify password digests. Bcrypt rejects passwords exceeding 72 UTF-8 bytes. Generated passwords and tokens use Node's cryptographic random source.
- Tools carrying passwords, HMAC keys, authentication tokens or generated secrets are excluded from saved Workspace recipes and persistent job history. Their secret fields are not written into result manifests. Results, including decrypted text or generated passwords, are kept in the local Toolbox download area for up to **24 hours**; source uploads are removed after processing. The standalone Toolbox does not write its form fields to browser storage.
- JWT decoding does not verify a signature or establish trust. Certificate inspection does not validate a trust chain. ROT13/Caesar is a puzzle encoding, not secure encryption.

### Utility limits and behavior

Pasted utility text is limited to 1 MB. Live counts pause above 100,000 characters; the full counter still accepts 1 MB. Word counts use English `Intl.Segmenter` word boundaries; character counts use grapheme clusters so a joined emoji remains one visible character. Reading/speaking times are estimates. Uploaded text utilities remove an initial UTF-8 BOM.

Diffs accept 100,000 total characters and have a bounded edit/time budget. Regex input is limited to 200,000 characters, matches are capped at 1,000, and execution takes place in a worker with a two-second deadline. Code formatting/minification accepts up to 500,000 characters; SQL formatting accepts 200,000. Code and SQL are never executed; links and decoded QR content are never visited automatically.

PDF structure compression preserves selectable text and optimizes serialization, without promising to recompress embedded images. Optional raster compression rebuilds scanned pages as JPEGs and removes selectable text, forms and interactive links. The tool returns the **original bytes when its candidate is larger**, and always reports input/output sizes and actual savings. Raster compression, grayscale and blank-page detection accept up to 40 pages with a 20-megapixel rendered-page limit. Blank-page decisions should be reviewed in the generated report before replacing the original. Paper resizing embeds page content and does not carry interactive forms or annotations into the new layout.

QR generation exports PNG/SVG, and the reader decodes clear images locally. Color conversion supports opaque sRGB colors; CMYK is approximate. Contrast output checks one WCAG color pair rather than claiming whole-page accessibility. Unit conversion uses fixed physical/IEC/decimal-storage factors, with case-sensitive storage symbols such as `B`, `b`, `MB` and `MiB`; it does not use currency rates. ISO date input requires an explicit UTC offset, and display time zones use IANA names.

The Toolbox API now accepts both multipart uploads and JSON `{ toolId, text, options }` requests at `POST /api/toolbox/run`. All private-tool routes reject foreign browser origins and non-local hostnames. Runtime remains **Node.js 22.13+**. Run `npm test` for all **130 checks** and `npm audit` for dependency validation.

Checkpoint before this expansion: `checkpoint/pre-utilities-50-2026-10-24`. Completed release: `checkpoint/utilities-50-complete-2026-10-24`.

---

## v4.0 — background workspace and 20 advanced tools

Open **Workspace** in the header or visit [`http://localhost:3847/workspace.html`](http://localhost:3847/workspace.html). This release adds **30 larger features**: ten workflow capabilities and twenty advanced tools, bringing the Toolbox to **50 tools**. The complete second-round checklist is in [FEATURES-60.md](FEATURES-60.md).

The Workspace provides:

- A persistent file library with SHA-256 fingerprints, folder imports, search, and input ordering.
- Saved recipes with up to eight ordered conversion steps, per-step filename filters, import/export, and rename/delete controls.
- A background queue with stage progress, running/queued cancellation, retry, persistent history, and restart recovery.
- Per-file batch recipes that continue past failed inputs and report partial successes.
- Output naming templates, collision handling, individual downloads, and ZIP bundles containing a conversion report and checksums.

The twenty new tools cover ZIP inspection/extraction; PDF page rendering, text extraction, watermarks, page numbering, N-up print layouts, and logo stamps; Word extraction and Markdown-to-Word; spreadsheet conversion, cleanup and workbook merging; photo proof sheets, responsive image packs and sprite atlases; video assembly with crossfades, video grids and photo slideshows; multitrack audio mixing/ducking and podcast mastering with loudness reports.

### Run a conversion flow

1. Import files or a folder into the library, or load a text tool's example.
2. Select source files in the library and arrange them in the required order.
3. Choose conversion steps. Every later step consumes files from the prior step; use a filter such as `*.json` to select particular outputs. Only the last step's outputs are retained.
4. Enable **Run separately for each file** for a batch, or leave it off for a combined operation such as merging or mixing.
5. Save the recipe if desired, then **Add to background queue**. Review progress, results and errors under **Job history**.

Closing the page leaves jobs running while the local Node server stays on. Stopping the server interrupts active jobs; they can be retried after restarting. Pending jobs resume automatically. Workspace library files and job outputs remain until you remove them. Source files outside the library are never modified.

**Runtime:** Node.js **22.13 or newer** is required by the PDF renderer. Install dependencies with `npm install`, then run `npm start`. The server binds to loopback (`127.0.0.1`); the private Workspace API rejects foreign browser origins and non-local hostnames.

**Limits:** Library: 2 GB total and 100 MB per file. A combined job accepts up to 20 source files; a per-file batch accepts up to 200, with 500 MB total input per job. Recipes support eight steps. One workspace job runs at a time, with a 20-minute overall deadline; each advanced FFmpeg operation has a 10-minute deadline. The synchronous Toolbox still supports two concurrent requests and its existing 24-hour result retention.

PDF rendering supports up to 40 selected pages at 72–200 DPI, at most 20 megapixels per page. PDF text extraction reads embedded selectable text, without OCR. DOCX extraction preserves semantic content rather than Word page layout. Spreadsheet tools handle XLSX/CSV/JSON, export cached formula results and do not recalculate formulas. Spreadsheet cleanup creates a values-only workbook; workbook merging copies values and styles, not charts or macros. ZIP entries are validated and limited to 200 MB expanded. All processing stays local; no external document or AI services are used.

**Storage:** `.workspace-data/` contains library copies, recipe/job state and job outputs, and is excluded from Git. `USC_DATA_DIR` relocates this storage together with media uploads/outputs. The browser keeps an editable recipe draft locally; saved recipes and jobs live on the server.

**Workspace API:** `GET /api/workspace/state`; multipart `POST /api/workspace/assets` with `files` and an optional JSON `paths` array; `POST/PUT/DELETE /api/workspace/recipes[/:id]`; `POST /api/workspace/jobs` with `recipe`, `assetIds`, optional `text` and `name`; `POST /api/workspace/jobs/:id/cancel` or `/retry`; and job result `/download/:name`, `/report` and `/zip` endpoints. Recipe steps use `{ toolId, options, select: "*" }`. Recipe JSON import/export is available through the interface.

**Verification:** `npm test` runs the original media regressions and all 60 feature checks, including real Word/XLSX/PDF/image/video/audio files, worker cancellation, pipeline execution, partial batches, persistence, naming and ZIP reports. `npm audit` reports zero vulnerabilities for the release dependency set.

Baseline checkpoint: `checkpoint/pre-large-expansion-2026-10-24`. Completion checkpoint: `checkpoint/large-expansion-complete-2026-10-24`.

---

## v3.0 — the original 30-tool Toolbox

Open **Toolbox · 30 tools** in the header, or visit [`http://localhost:3847/tools.html`](http://localhost:3847/tools.html). The media studio remains available for image, video, and audio format conversion and compression.

The Toolbox adds 30 tools across seven categories:

- **Data:** JSON ↔ CSV, JSON ↔ YAML, JSON ↔ XML, CSV ↔ TSV, and JSON formatting/validation.
- **Text:** Markdown → HTML, HTML → text, URL encoding, HTML entities, and text encoding conversion.
- **Files:** binary Base64 conversion, multi-file checksums, and gzip compression/decompression.
- **PDF:** images → PDF, merge, split/extract/reorder pages, rotate pages, and inspect/edit metadata.
- **Subtitles:** SRT ↔ WebVTT conversion and timing shifts.
- **Video:** extract frames, create contact sheets, reverse clips, rotate/flip pixels, and replace soundtracks.
- **Audio:** waveform images, fades, silence trimming, channel splitting, and joining recordings.

Search by tool or format, paste text or select files, arrange multi-file inputs with the arrow controls, and download the results. Examples are available for text tools. Processing happens locally.

Toolbox limits: 100 MB per input file, 20 files/500 MB per batch, 10 MB text inputs, and two simultaneous jobs. Downloads expire after 24 hours; uploaded originals are removed after processing. PDF inputs must be unencrypted. Video reverse supports clips up to 60 seconds at a maximum 720px longest edge/30 fps. Audio silence trimming supports recordings up to 10 minutes. See [the complete feature checklist and format notes](FEATURES-30.md).

**Runtime:** Node.js **20.19 or newer**; current Node.js LTS is recommended. Install dependencies with `npm install`, then run `npm start`. The updated image engine is Sharp 0.35.5/libvips 8.18.7.

**Verification:** `npm test` checks all 30 tools using generated fixtures, multipart API requests and downloads, plus original media studio regression tests. `npm audit` checks dependencies.

**Checkpoint:** `checkpoint/pre-all-in-one-2026-10-24` preserves the original v2.5 code at `2ce5cb7`.

**API:** `GET /api/toolbox/catalog` returns tool definitions. `POST /api/toolbox/run` accepts multipart fields `toolId`, optional `text`, JSON-encoded `options`, and `files`; it returns `results` with download URLs and an `expiresAt` timestamp. Results are delivered as attachments via `GET /api/toolbox/download/:job/:name`. Toolbox storage is private under `.toolbox-results/`. For an isolated local workspace, set `USC_DATA_DIR` to a separate directory before starting the server.

---

## Overview

**UltraSuperConverter** is a self-contained, local browser-based media compression, format conversion, resizing, and editing app for **Images (including Apple `.heic` / `.heif`), Videos, and Audio**.

Every operation executes **100% locally on your machine** using **Sharp (`libvips` 8.18)**, **`heic-convert`**, and **bundled static FFmpeg + FFprobe** binaries—with zero external cloud uploads and zero subscriptions. Media studio uploads support up to 2 GB per file; Toolbox limits are listed above.

---

## 1. Easy Installation (HTML Setup & Desktop Icon Wizard — No `.exe` Required)

UltraSuperConverter uses an **HTML Setup & Desktop Shortcut Wizard** (`setup-wizard.html` + `setup-wizard.cmd`) so you never have to deal with unsigned `.exe` installers, Windows SmartScreen blocks, or code-signing certificates.

### Option A: Launch the HTML Setup Wizard
1. Double-click **`setup-wizard.cmd`** in the project root (or open `http://localhost:3847/setup` / `setup-wizard.html` in your browser).
2. Walk through the **4-Step Interactive Browser Wizard**:
   - **Step 01 — Pre-Flight Scan**: Automatically detects your local **Node.js runtime**, **Sharp (`libvips`)** image core, **FFmpeg + FFprobe** static binaries, and **`UltraSuperConverter.ico`** desktop icon asset.
   - **Step 02 — Install & Verify Packages**: One-click button (`⚡ VERIFY & INSTALL PACKAGES`) runs `npm install`, verifies the static FFmpeg binary, and initializes the `uploads/` and `outputs/` workspace directories. *(Even on a brand-new Git clone before `node_modules` exists, `setup-wizard.cmd` boots a zero-dependency Node HTTP bridge via `installer/wizard-server.js` so the HTML wizard can install everything from the browser!)*
   - **Step 03 — Desktop Icon & Start Menu Shortcut**: Check **"Add UltraSuperConverter Icon to Windows Desktop"** and **"Add to Windows Start Menu"** to generate native Windows `.lnk` shortcuts stamped with the custom multi-resolution `UltraSuperConverter.ico` emblem.
   - **Step 04 — Ready to Launch**: Click **`🚀 OPEN ULTRASUPERCONVERTER STUDIO`** to jump straight into the workspace.

> **Node.js LTS Included in Setup**: If Node.js is not installed on your PC yet, Step 1 of `setup-wizard.html` provides a 1-click download for the official signed [Node.js LTS Windows `.msi` Installer](https://nodejs.org/), and running `setup-wizard.cmd` will automatically install Node.js LTS via `winget` or the official `.msi` package. All media engines (`sharp`, `ffmpeg-static`, `ffprobe-static`) are bundled automatically via NPM—no manual `PATH` or codec setup required.

---

## 2. Starting & Stopping the Application

### Starting UltraSuperConverter
You can launch the application in any of three ways:
1. **Desktop Icon**: Double-click the **UltraSuperConverter** icon on your Windows Desktop or Start Menu.
2. **Batch Launcher**: Double-click **`start.cmd`** in the root folder.
   - Checks if `node_modules` is present (and auto-installs if missing).
   - Starts `node server.js` minimized in the background and records its PID in `.server.pid`.
   - Automatically opens `http://localhost:3847` in your default browser.
3. **CLI**: Run `npm start` (or `node server.js`) from a terminal.

### Stopping UltraSuperConverter
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
UltraSuperConverter/
├── server.js                  # Express + Sharp + FFmpeg/FFprobe processing engine & REST/SSE API
├── setup-wizard.html          # 4-Step HTML Setup, Dependency & Desktop Icon Wizard UI
├── setup-wizard.cmd           # Launches the HTML Setup Wizard in the default browser
├── start.cmd                  # Starts the background server and opens http://localhost:3847
├── stop.cmd                   # Gracefully stops the running server instance and frees port 3847
├── UltraSuperConverter.ico    # Multi-resolution (16, 32, 48, 64, 256px) Windows Desktop Icon
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
