// ---------- CONFIG ----------
// Adjust these to match the real portal's stated requirements.
const CONFIG = {
  allowedTypes: ["image/jpeg", "image/png", "application/pdf"],
  maxSizeBytes: 2 * 1024 * 1024, // 2MB
  minWidth: 400,
  minHeight: 400,
  blurVarianceThreshold: 60, // below this = likely blurry (tune by testing real scans)
  fieldKeywords: {
    name: ["name", "applicant", "fullname"],
    dob: ["dob", "birth", "date of birth"],
    certificate: ["certificate", "cert no", "certificate number", "roll", "id number"]
  }
};

// ---------- STATE ----------
// checks[elementId] = { ok: bool|null, message: string }
const checks = {};
let uid = 0;

// ---------- UTILITIES ----------
function nextId(el) {
  if (!el.dataset.fgId) el.dataset.fgId = "fg-" + uid++;
  return el.dataset.fgId;
}

function findLabelText(input) {
  // Try <label for=id>, then closest label ancestor, then aria-label, then placeholder, then nearby text
  if (input.id) {
    const lbl = document.querySelector(`label[for="${CSS.escape(input.id)}"]`);
    if (lbl) return lbl.textContent.trim();
  }
  const parentLabel = input.closest("label");
  if (parentLabel) return parentLabel.textContent.trim();
  if (input.getAttribute("aria-label")) return input.getAttribute("aria-label");
  if (input.placeholder) return input.placeholder;
  // look at previous sibling text
  let prev = input.previousElementSibling;
  if (prev && prev.textContent) return prev.textContent.trim();
  return "";
}

function matchesKeyword(text, keywords) {
  const t = text.toLowerCase();
  return keywords.some(k => t.includes(k));
}

function setBadge(input, status, message) {
  const id = nextId(input);
  let badge = document.querySelector(`[data-fg-badge-for="${id}"]`);
  if (!badge) {
    badge = document.createElement("div");
    badge.setAttribute("data-fg-badge-for", id);
    badge.className = "fg-badge";
    input.insertAdjacentElement("afterend", badge);
  }
  badge.className = "fg-badge " + (status === "ok" ? "fg-badge-ok" : status === "warn" ? "fg-badge-warn" : "fg-badge-checking");
  badge.textContent = message;

  checks[id] = { ok: status === "ok" ? true : status === "warn" ? false : null, message, label: findLabelText(input) || input.name || id };
  renderPanel();
}

// ---------- BLUR DETECTION (Laplacian variance on downscaled grayscale) ----------
function computeBlurVariance(imageBitmap) {
  const targetWidth = 300;
  const scale = targetWidth / imageBitmap.width;
  const w = targetWidth;
  const h = Math.max(1, Math.round(imageBitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(imageBitmap, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);

  // grayscale
  const gray = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    gray[i] = 0.299 * r + 0.587 * g + 0.114 * b;
  }

  // 3x3 Laplacian kernel convolution
  const kernel = [0, 1, 0, 1, -4, 1, 0, 1, 0];
  let sum = 0, sumSq = 0, count = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      let val = 0, k = 0;
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          val += gray[(y + ky) * w + (x + kx)] * kernel[k++];
        }
      }
      sum += val;
      sumSq += val * val;
      count++;
    }
  }
  const mean = sum / count;
  const variance = sumSq / count - mean * mean;
  return { variance, width: imageBitmap.width, height: imageBitmap.height };
}

async function inspectImageFile(file) {
  const bitmap = await createImageBitmap(file);
  const { variance, width, height } = computeBlurVariance(bitmap);
  const issues = [];

  if (variance < CONFIG.blurVarianceThreshold) {
    issues.push(`Looks blurry or low-detail (sharpness score ${variance.toFixed(0)}, want 60+). Try rescanning with better lighting/focus.`);
  }
  if (width < CONFIG.minWidth || height < CONFIG.minHeight) {
    issues.push(`Resolution is low (${width}x${height}). Aim for at least ${CONFIG.minWidth}x${CONFIG.minHeight}.`);
  }
  return issues;
}

// ---------- FORMAT / SIZE VALIDATION ----------
function validateFormatAndSize(file) {
  const issues = [];
  if (!CONFIG.allowedTypes.includes(file.type)) {
    issues.push(`File type "${file.type || "unknown"}" isn't accepted. Use JPEG, PNG, or PDF.`);
  }
  if (file.size > CONFIG.maxSizeBytes) {
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    const maxMb = (CONFIG.maxSizeBytes / (1024 * 1024)).toFixed(1);
    issues.push(`File is ${mb}MB, over the ${maxMb}MB limit. Try compressing it.`);
  }
  return issues;
}

// ---------- FILE INPUT HANDLING ----------
async function handleFileInput(input) {
  const file = input.files && input.files[0];
  if (!file) {
    setBadge(input, "checking", "No file selected yet.");
    return;
  }
  setBadge(input, "checking", "Checking file...");

  const formatIssues = validateFormatAndSize(file);
  let blurIssues = [];
  if (file.type.startsWith("image/")) {
    try {
      blurIssues = await inspectImageFile(file);
    } catch (e) {
      blurIssues = [];
    }
  }

  const allIssues = [...formatIssues, ...blurIssues];
  if (allIssues.length === 0) {
    setBadge(input, "ok", "✓ Looks good — readable and within limits.");
  } else {
    setBadge(input, "warn", "⚠ " + allIssues.join(" "));
  }
}

// ---------- TEXT INPUT HANDLING (basic sanity checks) ----------
function handleTextInput(input) {
  const label = findLabelText(input);
  const value = input.value.trim();

  if (!value) {
    setBadge(input, "checking", "Not filled in yet.");
    return;
  }

  if (matchesKeyword(label, CONFIG.fieldKeywords.dob)) {
    const looksLikeDate = /\d{1,4}[\/\-.]\d{1,2}[\/\-.]\d{1,4}/.test(value);
    if (!looksLikeDate) {
      setBadge(input, "warn", "⚠ Doesn't look like a valid date format.");
      return;
    }
  }

  if (matchesKeyword(label, CONFIG.fieldKeywords.certificate)) {
    if (value.length < 4) {
      setBadge(input, "warn", "⚠ Certificate/ID number looks too short — double check it.");
      return;
    }
  }

  setBadge(input, "ok", "✓ Filled in.");
}

// ---------- SCANNING THE PAGE ----------
function scanForm() {
  const fileInputs = document.querySelectorAll('input[type="file"]:not([data-fg-bound])');
  fileInputs.forEach(input => {
    input.dataset.fgBound = "1";
    input.addEventListener("change", () => handleFileInput(input));
    setBadge(input, "checking", "Upload a file to check it.");
  });

  const textInputs = document.querySelectorAll(
    'input[type="text"]:not([data-fg-bound]), input[type="date"]:not([data-fg-bound]), input:not([type]):not([data-fg-bound])'
  );
  textInputs.forEach(input => {
    const label = findLabelText(input);
    const relevant =
      matchesKeyword(label, CONFIG.fieldKeywords.name) ||
      matchesKeyword(label, CONFIG.fieldKeywords.dob) ||
      matchesKeyword(label, CONFIG.fieldKeywords.certificate);
    if (!relevant) return;
    input.dataset.fgBound = "1";
    input.addEventListener("input", () => handleTextInput(input));
    if (input.value.trim()) handleTextInput(input);
  });
}

// ---------- STATUS PANEL ----------
function renderPanel() {
  let panel = document.getElementById("fg-panel");
  if (!panel) {
    panel = document.createElement("div");
    panel.id = "fg-panel";
    panel.className = "fg-panel";
    document.body.appendChild(panel);
  }

  const entries = Object.values(checks);
  const total = entries.length;
  const failing = entries.filter(e => e.ok === false);
  const pending = entries.filter(e => e.ok === null);
  const ready = total > 0 && failing.length === 0 && pending.length === 0;

  const headerClass = ready ? "fg-ready" : "fg-not-ready";
  const headerText = total === 0
    ? "FormGuard — no fields detected yet"
    : ready
      ? "✓ Ready to submit"
      : `${failing.length} issue${failing.length === 1 ? "" : "s"} to fix`;

  let bodyHtml = "";
  if (total === 0) {
    bodyHtml = `<div class="fg-issue-row">Scanning this page for upload and detail fields...</div>`;
  } else {
    bodyHtml = entries
      .map(e => `<div class="fg-issue-row"><strong>${escapeHtml(e.label)}:</strong> ${escapeHtml(e.message)}</div>`)
      .join("");
  }

  panel.innerHTML = `
    <div class="fg-panel-header ${headerClass}">${headerText}</div>
    <div class="fg-panel-body">${bodyHtml}</div>
  `;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ---------- BOOTSTRAP ----------
scanForm();
renderPanel();

const observer = new MutationObserver(() => scanForm());
observer.observe(document.body, { childList: true, subtree: true });
