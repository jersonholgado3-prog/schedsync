// faculty-doc-import.js
// Handles PDF, XLSX, and CSV import for faculty name extraction.

const PDFJSLIB_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs";

/**
 * Formats a faculty name: FIRST MI. LAST
 */
function formatName(first, middle, last) {
  const f = (first || "").trim().toUpperCase();
  const m = (middle || "").trim().toUpperCase();
  const l = (last || "").trim().toUpperCase();
  const mi = m ? m[0] + "." : "";
  return [f, mi, l].filter(Boolean).join(" ");
}

/**
 * Finds column indices for LAST NAME, FIRST NAME, MIDDLE NAME from a header row.
 */
function findColumns(headers) {
  const norm = (s) => String(s || "").trim().toUpperCase();
  let last = -1, first = -1, middle = -1;
  headers.forEach((h, i) => {
    const n = norm(h);
    if (n.includes("LAST")) last = i;
    else if (n.includes("FIRST")) first = i;
    else if (n.includes("MIDDLE")) middle = i;
  });
  return { last, first, middle };
}

/**
 * Extracts faculty names from a 2D array of rows (first row = headers).
 */
function extractNamesFromRows(rows) {
  if (!rows || rows.length < 2) return [];
  const { last, first, middle } = findColumns(rows[0]);
  if (last === -1 || first === -1) return [];

  const names = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const l = String(row[last] || "").trim();
    const f = String(row[first] || "").trim();
    const m = middle !== -1 ? String(row[middle] || "").trim() : "";
    if (f && l) names.push(formatName(f, m, l));
  }
  return names;
}

/**
 * Parse XLSX or CSV file using SheetJS (window.XLSX).
 */
async function parseSpreadsheet(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = window.XLSX.read(e.target.result, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = window.XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
        resolve(extractNamesFromRows(rows));
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Parse PDF using pdfjs-dist. Extracts text, reconstructs table rows by
 * grouping text items on the same Y-position, then finds the header row.
 */
async function parsePDF(file) {
  const pdfjsLib = await import(PDFJSLIB_URL);
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs";

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  // Collect all text items across all pages with their Y positions
  const pageRows = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    // Group items by rounded Y coordinate
    const yMap = new Map();
    for (const item of content.items) {
      const y = Math.round(item.transform[5]);
      if (!yMap.has(y)) yMap.set(y, []);
      yMap.get(y).push(item);
    }
    // Sort each row by X, then sort rows by descending Y (top to bottom)
    const sortedYs = [...yMap.keys()].sort((a, b) => b - a);
    for (const y of sortedYs) {
      const rowItems = yMap.get(y).sort((a, b) => a.transform[4] - b.transform[4]);
      pageRows.push(rowItems.map((i) => i.str.trim()).filter(Boolean));
    }
  }

  // Find the header row containing LAST NAME / FIRST NAME
  let headerIdx = -1;
  for (let i = 0; i < pageRows.length; i++) {
    const joined = pageRows[i].join(" ").toUpperCase();
    if (joined.includes("LAST") && joined.includes("FIRST")) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) return [];

  // Build a 2D array: header row + data rows
  const headers = pageRows[headerIdx];
  const { last, first, middle } = findColumns(headers);
  if (last === -1 || first === -1) return [];

  const names = [];
  for (let i = headerIdx + 1; i < pageRows.length; i++) {
    const row = pageRows[i];
    const l = (row[last] || "").trim();
    const f = (row[first] || "").trim();
    const m = middle !== -1 ? (row[middle] || "").trim() : "";
    if (f && l) names.push(formatName(f, m, l));
  }
  return names;
}

/**
 * Main handler: reads the file, parses it, confirms, then calls importFacultyMembers.
 */
async function handleDocumentImport(file) {
  const { showToast, showConfirm } = await import("./js/utils/ui-utils.js");

  let names = [];
  try {
    showToast("Parsing document...", "info");
    const ext = file.name.split(".").pop().toLowerCase();
    if (ext === "pdf") {
      names = await parsePDF(file);
    } else if (ext === "xlsx" || ext === "csv") {
      names = await parseSpreadsheet(file);
    } else {
      showToast("Unsupported file type.", "error");
      return;
    }
  } catch (err) {
    console.error("Document parse error:", err);
    showToast("Failed to parse document.", "error");
    return;
  }

  if (names.length === 0) {
    showToast("No faculty records found. Check that the document has LAST NAME / FIRST NAME columns.", "error");
    return;
  }

  const confirmed = await showConfirm(
    `Found ${names.length} faculty member(s):\n\n${names.slice(0, 5).join("\n")}${names.length > 5 ? `\n...and ${names.length - 5} more` : ""}\n\nImport and auto-generate accounts?`,
    "Import Faculty from Document"
  );

  if (!confirmed) return;

  // importFacultyMembers is defined in facultypage.js — access via window or re-export.
  // We expose it on window from facultypage.js (see note below).
  if (typeof window.importFacultyMembers === "function") {
    await window.importFacultyMembers(names);
  } else {
    showToast("Import function not available.", "error");
  }
}

// Wire up the button once DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("uploadDocBtn");
  const input = document.getElementById("docImportInput");
  if (!btn || !input) return;

  btn.addEventListener("click", () => input.click());
  input.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) { alert('File too large. Maximum size is 5MB.'); input.value = ''; return; }
      await handleDocumentImport(file);
      input.value = ""; // reset so same file can be re-selected
    }
  });
});
