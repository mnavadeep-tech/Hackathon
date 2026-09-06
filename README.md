# FormGuard — Pre-Submission Error Guard (MVP)

## What this does right now
- Detects file upload inputs and relevant text inputs (name, DOB, certificate number) on any page
- Checks uploaded images for blur/low quality using a real Laplacian-variance sharpness score (no external library needed)
- Validates file format and size against configurable limits
- Runs a lightweight sanity check on DOB and certificate number fields
- Shows live inline badges + a floating "Ready to submit" panel, bottom-right

## What's stubbed for later (if you have time)
- OCR-based cross-verification of typed fields against the document text (needs Tesseract.js — see "Adding OCR" below)
- Per-portal config (currently one global CONFIG in content.js — good enough for a demo on 1-2 test portals)

## Load it in Chrome (2 minutes)
1. Go to `chrome://extensions`
2. Turn on "Developer mode" (top-right toggle)
3. Click "Load unpacked"
4. Select this `formguard-extension` folder
5. Pin the FormGuard icon from the extensions toolbar for easy access

## Test it
Since you likely can't test on a live government portal, fastest options:
- Find any public form with a file upload + text fields (e.g. a Google Form clone, a job application demo, or build a 5-minute HTML test page with `<input type="file">`, `<input type="text" placeholder="Name">`, `<input type="text" placeholder="Date of Birth">`, `<input type="text" placeholder="Certificate Number">`)
- Open that page, upload a blurry vs sharp image, and watch the badges + panel update
- Try a file over 2MB or a `.docx` — it should flag format/size instantly

## Tuning for your demo
Edit the `CONFIG` object at the top of `content.js`:
- `allowedTypes` / `maxSizeBytes` — match whatever portal you're demoing against
- `blurVarianceThreshold` — test with 2-3 real blurry vs sharp scans and adjust; 60 is a rough starting point, not a validated number

## Adding real OCR cross-verification (stretch goal, needs internet)
1. Download `tesseract.min.js` and the worker/lang files from https://github.com/naptha/tesseract.js (or use their CDN reference)
2. Add the files to this folder and list them in `manifest.json` under `web_accessible_resources`
3. In `content.js`, after `inspectImageFile`, run OCR on the canvas and fuzzy-match the extracted text against the typed name/DOB/certificate fields (e.g. using Levenshtein distance)
This is the most "wow factor" feature but also the most time-risky — only attempt it if the core flow above is solid and demoed first.

## Demo script suggestion
1. Open your test form
2. Show the panel say "no fields detected" → then "checking" as it scans
3. Upload a deliberately blurry photo → show the red warning + message
4. Replace with a sharp, correct-size scan → badge turns green
5. Type an obviously wrong DOB format → show the warning
6. Fix it → panel turns to "✓ Ready to submit"
