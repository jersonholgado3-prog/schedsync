// room-doc-import.js
// Parses XLSX/CSV/PDF/DOCX files to extract room number + capacity.
// Floor is auto-detected from the first digit of the room number.

const PDFJSLIB_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs";

/** Detect floor from first digit of room name. e.g. "201" → 2, "301B" → 3 */
function detectFloor(roomName) {
  const match = String(roomName).match(/(\d)/);
  return match ? parseInt(match[1]) : null;
}

/** Classify room type based on name */
function classifyRoom(name) {
  const n = String(name).toLowerCase();
  if (n.includes("lab") || n.includes("computer")) return "laboratory";
  if (n.includes("kitchen") || n.includes("bar") || n.includes("mph") || n.includes("pe") || n.includes("court")) return "other";
  return "classroom";
}

/** Find column indices for ROOM and CAPACITY from header row */
function findRoomColumns(headers) {
  const norm = (s) => String(s || "").trim().toUpperCase();
  let roomCol = -1, capCol = -1;
  headers.forEach((h, i) => {
    const n = norm(h);
    if (roomCol === -1 && (n.includes("ROOM") || n.includes("NO") || n.includes("NUMBER") || n.includes("NAME"))) roomCol = i;
    if (capCol === -1 && (n.includes("CAP") || n.includes("CAPACITY") || n.includes("SEATS") || n.includes("SIZE"))) capCol = i;
  });
  // Fallback: if no headers matched, assume col 0 = room, col 1 = capacity
  if (roomCol === -1) roomCol = 0;
  if (capCol === -1) capCol = 1;
  return { roomCol, capCol };
}

/** Extract rooms from 2D array rows */
function extractRoomsFromRows(rows) {
  if (!rows || rows.length < 1) return [];
  // Check if first row looks like a header (non-numeric first cell)
  const firstCell = String(rows[0][0] || "").trim();
  const hasHeader = isNaN(firstCell) && firstCell.length > 0;
  const { roomCol, capCol } = hasHeader ? findRoomColumns(rows[0]) : { roomCol: 0, capCol: 1 };
  const startRow = hasHeader ? 1 : 0;

  const rooms = [];
  for (let i = startRow; i < rows.length; i++) {
    const row = rows[i];
    const rawName = String(row[roomCol] || "").trim();
    const rawCap = String(row[capCol] || "").trim();
    if (!rawName) continue;

    const capacity = parseInt(rawCap) || null;
    const type = classifyRoom(rawName);
    const floor = type === "classroom" ? detectFloor(rawName) : null;
    // Prefix "Room" if it's a plain number
    const name = /^\d+[A-Za-z]?$/.test(rawName) ? `Room ${rawName}` : rawName;
    rooms.push({ name, capacity, type, floor });
  }
  return rooms;
}

/** Parse XLSX or CSV using SheetJS */
async function parseSpreadsheet(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = window.XLSX.read(e.target.result, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = window.XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
        resolve(extractRoomsFromRows(rows));
      } catch (err) { reject(err); }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

/** Parse PDF using pdf.js */
async function parsePDF(file) {
  const pdfjsLib = await import(PDFJSLIB_URL);
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs";

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const pageRows = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const yMap = new Map();
    for (const item of content.items) {
      const y = Math.round(item.transform[5]);
      if (!yMap.has(y)) yMap.set(y, []);
      yMap.get(y).push(item);
    }
    const sortedYs = [...yMap.keys()].sort((a, b) => b - a);
    for (const y of sortedYs) {
      const row = yMap.get(y).sort((a, b) => a.transform[4] - b.transform[4]).map(i => i.str.trim()).filter(Boolean);
      if (row.length) pageRows.push(row);
    }
  }
  return extractRoomsFromRows(pageRows);
}

/** Parse DOCX using mammoth (loaded via CDN) */
async function parseDOCX(file) {
  if (!window.mammoth) {
    await new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js";
      s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  const arrayBuffer = await file.arrayBuffer();
  const result = await window.mammoth.extractRawText({ arrayBuffer });
  // Parse lines: each line may be "201 40" or "201\t40" or "Room 201, 40"
  const lines = result.value.split(/\n/).map(l => l.trim()).filter(Boolean);
  const rows = lines.map(line => line.split(/[\t,|;]+/).map(s => s.trim()));
  return extractRoomsFromRows(rows);
}

/** Main handler */
async function handleRoomDocumentImport(file) {
  const { showToast, showConfirm } = await import("./js/utils/ui-utils.js");

  let rooms = [];
  try {
    showToast("Parsing document...", "info");
    const ext = file.name.split(".").pop().toLowerCase();
    if (ext === "xlsx" || ext === "csv") {
      rooms = await parseSpreadsheet(file);
    } else if (ext === "pdf") {
      rooms = await parsePDF(file);
    } else if (ext === "docx" || ext === "doc") {
      rooms = await parseDOCX(file);
    } else {
      showToast("Unsupported file type. Use XLSX, CSV, PDF, or DOCX.", "error");
      return;
    }
  } catch (err) {
    console.error("Room import parse error:", err);
    showToast("Failed to parse document.", "error");
    return;
  }

  if (rooms.length === 0) {
    showToast("No rooms found. Ensure the file has room number and capacity columns.", "error");
    return;
  }

  // Group preview by floor
  const byFloor = {};
  rooms.forEach(r => {
    const key = r.floor ? `Floor ${r.floor}` : r.type === "laboratory" ? "Laboratories" : "Other";
    if (!byFloor[key]) byFloor[key] = [];
    byFloor[key].push(r);
  });
  const preview = Object.entries(byFloor)
    .map(([floor, rs]) => `${floor}: ${rs.map(r => r.name + (r.capacity ? ` (${r.capacity})` : "")).join(", ")}`)
    .join("\n");

  const confirmed = await showConfirm(
    `Import ${rooms.length} room(s)?\n\n${preview}`,
    "Import Rooms from Document"
  );
  if (!confirmed) return;

  if (typeof window.importRoomsFromDoc === "function") {
    await window.importRoomsFromDoc(rooms);
  } else {
    showToast("Import function not available.", "error");
  }
}

// Wire up button
document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("roomImportDocBtn");
  const input = document.getElementById("roomDocImportInput");
  if (!btn || !input) return;

  btn.addEventListener("click", () => input.click());
  input.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      alert("File too large. Maximum size is 10MB.");
      input.value = "";
      return;
    }
    await handleRoomDocumentImport(file);
    input.value = "";
  });
});
