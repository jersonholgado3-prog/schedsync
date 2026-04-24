/**
 * SchedSync Time Utilities 🕰️⚓
 */

/**
 * Converts "HH:MM" to total minutes
 */
export const toMin = (t) => {
    if (!t) return 0;
    let timeStr = t;
    let period = null;

    // Check for "H:MM AM/PM" format 🕰️
    if (t.includes(" ")) {
        const parts = t.split(" ");
        timeStr = parts[0];
        period = parts[1];
    } else {
        // Check if AM/PM is attached (e.g., "12:00PM") ⚓
        const match = t.match(/(\d+:\d+)([AP]M)/i);
        if (match) {
            timeStr = match[1];
            period = match[2];
        }
    }

    const parts = timeStr.split(":");
    if (parts.length < 2) return 0;
    let [h, m] = parts.map(Number);

    if (period) {
        const p = period.toUpperCase();
        if ((p === "PM" || p === "P.M.") && h !== 12) h += 12;
        if ((p === "AM" || p === "A.M.") && h === 12) h = 0;
    }

    return (h || 0) * 60 + (m || 0);
};

/**
 * Converts total minutes to "HH:MM" 🕰️
 */
export const toTime = (m) =>
    `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/**
 * Converts total minutes to "H:MM AM/PM"
 */
export const to12 = (tMin) => {
    if (typeof tMin === 'string' && tMin.includes(':')) {
        // Handle "HH:MM" input too!
        const [h, m] = tMin.split(":").map(Number);
        return `${((h + 11) % 12) + 1}:${m.toString().padStart(2, '0')} ${h >= 12 ? "PM" : "AM"}`;
    }
    const h = Math.floor(tMin / 60);
    const m = tMin % 60;
    return `${((h + 11) % 12) + 1}:${m.toString().padStart(2, '0')} ${h >= 12 ? "PM" : "AM"}`;
};

/**
 * Parses a time block "start-end" into numeric start/end minutes
 */
export const parseBlock = (block) => {
    if (!block || !block.includes("-")) return { start: 0, end: 0 };
    const [s, e] = block.split("-");
    return {
        start: toMin(s),
        end: toMin(e)
    };
};

/**
 * Checks if two blocks overlap
 */
export const overlaps = (a, b) => a.start < b.end && b.start < a.end;

/**
 * Clean section name (removes "Grade 12")
 */
export const cleanSection = (s) => (s || "UNNAMED").replace(/grade\s*12/gi, "").replace(/\s+/g, " ").trim();

/**
 * Normalize day name for comparison 📅⚓
 */
export const normalizeDay = (d) => {
    const lower = (d || "").trim().toLowerCase();
    if (lower.includes("fridday")) return "friday";
    return lower;
};

/**
 * Normalize time block for comparison 🕰️⚓
 */
export const normalizeTimeBlock = (b) => (b || "").trim().replace(/\s+/g, "").replace(/^0/, "");
