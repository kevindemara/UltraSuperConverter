# All-in-one expansion — 30 features

Baseline checkpoint: `checkpoint/pre-all-in-one-2026-10-24` at commit `2ce5cb7` (pushed to origin).

The new Toolbox is linked from the media studio header at `/tools.html`. Each row below is a distinct tool with its own input controls, conversion handler, downloadable output, and functional test. Bidirectional conversions count as one tool.

| # | Feature | Implementation | Verification |
| --- | --- | --- | --- |
| 1 | JSON ↔ CSV | Complete | Quoting, Unicode, nested values, formula protection |
| 2 | JSON ↔ YAML | Complete | Round-trip arrays and booleans |
| 3 | JSON ↔ XML | Complete | Attributes and escaped characters |
| 4 | CSV ↔ TSV | Complete | Tabs and table content preserved |
| 5 | JSON formatter, minifier, validator | Complete | Formatting and invalid JSON |
| 6 | Markdown → standalone HTML | Complete | Headings, emphasis, escaped title |
| 7 | HTML → readable plain text | Complete | Entity decoding and script exclusion |
| 8 | Binary file ↔ Base64 | Complete | Byte-for-byte binary round-trip and data URLs |
| 9 | URL component encode / decode | Complete | Unicode and literal plus signs |
| 10 | HTML entity encode / decode | Complete | Unicode and markup round-trip |
| 11 | UTF-8 / UTF-16 LE / Latin-1 conversion | Complete | BOM, source encoding, lossy conversion rejection |
| 12 | Multi-file SHA-256 / SHA-512 / MD5 checksums | Complete | Independent crypto digest comparison |
| 13 | Gzip compress / decompress | Complete | Binary round-trip |
| 14 | Ordered images → PDF | Complete | Real A4 PDF with correct page count |
| 15 | Merge PDF documents | Complete | Page order, sizes, and page count |
| 16 | Split / extract / reorder PDF pages | Complete | Page ranges and individual downloads |
| 17 | Rotate selected PDF pages | Complete | Selected and untouched page rotations |
| 18 | PDF metadata inspector / editor | Complete | Metadata read and edit round-trip |
| 19 | SRT ↔ WebVTT subtitle conversion | Complete | Header and timestamp round-trip |
| 20 | Subtitle timing shift | Complete | Negative offsets, zero clamping, VTT settings |
| 21 | Extract video frame at timestamp | Complete | Decoded PNG dimensions |
| 22 | Video contact sheet | Complete | Real sampled frames and grid dimensions |
| 23 | Reverse video and audio | Complete | Playable outputs with/without audio |
| 24 | Rotate / mirror video pixels | Complete | All five transforms and frame dimensions |
| 25 | Replace video soundtrack | Complete | Audio/video streams and retained duration |
| 26 | Audio waveform → PNG | Complete | Decoded image dimensions |
| 27 | Audio fade in / out | Complete | Preserved duration and reduced opening amplitude |
| 28 | Trim leading and trailing audio silence | Complete | Removed padding without cutting into sound |
| 29 | Split audio channels into mono WAVs | Complete | Separate outputs and mono channel count |
| 30 | Join audio files | Complete | Combined duration, stereo 48 kHz output |

## Shared implementation

- `public/tools-catalog.js`: shared browser/server tool definitions and validated options.
- `lib/toolbox.js`: conversion implementations, independent of HTTP.
- `lib/toolbox-routes.js`: multipart API, attachment downloads, private temporary storage, cleanup and concurrency limits.
- `public/tools.html`, `public/tools.css`, `public/tools.js`: searchable tool catalog, input ordering, examples, inline errors, previews and downloads.
- `test/toolbox.test.js`: executable functional tests for all 30 tools plus HTTP and validation tests. Run `npm test`.

## Limits and format notes

- Toolbox uploads: 100 MB per file, 20 files and 500 MB total. Text inputs: 10 MB. Two concurrent conversions; each FFmpeg command has a 3-minute timeout.
- Downloads expire after 24 hours; uploaded originals and intermediates are removed after each job. Failed jobs are removed immediately. Existing media studio limits are separate.
- PDF tools require unencrypted PDFs. They do not provide OCR, PDF-to-Word, or PDF rasterization. Image-to-PDF uses the first frame/page of animated or multipage image inputs.
- CSV-to-JSON retains table cells as strings. JSON-to-CSV protects spreadsheet formulas with a leading apostrophe; nested values become JSON strings. XML uses a `root` wrapper and `@_` attribute keys; XML DTDs are rejected.
- Markdown HTML is downloaded as an attachment and its source preview is displayed as plain text. Embedded HTML is retained in the exported document.
- Base64 decoding accepts standard padded Base64 and Base64 data URLs. Text file limits also apply to Base64 input.
- SRT/WebVTT tools convert cue timing/text and retain cue settings; WebVTT header metadata is not retained, and VTT-only STYLE/REGION/NOTE blocks are omitted when exporting SRT.
- Reverse video: at most 60 seconds, 720px longest edge and 30 fps. Audio silence trimming: at most 10 minutes. Video editing outputs MP4/H.264/AAC. Audio editing outputs PCM WAV.
- PDF/audio merge and image-to-PDF use the input order shown; use the up/down controls to reorder files. Soundtrack replacement expects video first, audio second.

## Completion record

All 30 tools are implemented. Verification covers all conversion handlers, multipart uploads, binary attachment downloads, filename isolation, invalid input, and original media studio image/video/audio conversions. Browser checks confirm search, tool selection, sample conversion, previews, downloads, and error recovery. Run `npm test` for the 40 automated checks. `npm audit` reports zero vulnerabilities with the committed dependency set.

Release checkpoint tag: `checkpoint/all-in-one-30-complete-2026-10-24`. The continuation heartbeat is only needed while work is unfinished and is disabled after this verified release is pushed.
