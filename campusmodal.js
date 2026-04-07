import { db } from "./js/config/firebase-config.js";
import {
  collection,
  getDocs,
  query,
  where
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { toMin, to12 } from "./js/utils/time-utils.js";

/* ───────── GET ROOM SCHEDULE FROM PUBLISHED SCHEDULES ───────── */
async function getRoomSchedule(roomName) {
  try {
    console.log("Fetching schedule for room:", roomName);

    // Query all published schedules
    const snap = await getDocs(
      query(collection(db, "schedules"), where("status", "==", "published"))
    );

    console.log("Found published schedules:", snap.docs.length);

    const entries = [];

    snap.forEach(doc => {
      const schedData = doc.data();
      const classes = schedData.classes || [];
      console.log("Schedule has", classes.length, "classes");

      // Find all classes in this schedule that are for the specified room
      classes.forEach(c => {
        console.log("Checking class:", c.subject, "Room:", c.room, "Target room:", roomName);
        if (c.room === roomName && c.subject !== "VACANT") {
          entries.push({
            day: c.day,
            time: c.timeBlock,
            subject: c.subject,
            section: (schedData.section || "UNNAMED").replace(/grade\s*12\s*/i, "").trim(),
            teacher: c.teacher
          });
        }
      });
    });

    console.log("Found entries for room:", entries.length);

    if (entries.length === 0) {
      return "No classes scheduled in this room.";
    }

    // Sort by day and time
    const ORDER = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    entries.sort((a, b) => {
      if (a.day !== b.day) {
        return ORDER.indexOf(a.day) - ORDER.indexOf(b.day);
      }
      return toMin(a.time.split("-")[0]) - toMin(b.time.split("-")[0]);
    });

    // Format the output
    return entries
      .map(e => {
        const [s, t] = e.time.split("-");
        return `${e.day} • ${to12(s)}–${to12(t)} — ${e.subject} (${e.section}, ${e.teacher})`;
      })
      .join("\n");
  } catch (error) {
    console.error("Error fetching room schedule:", error);
    return "Error loading schedule. Check console for details.";
  }
}

/* ───────── SHOW MODAL ───────── */
async function showModal(roomName) {
  const scheduleText = await getRoomSchedule(roomName);

  const modalOverlay = document.createElement("div");
  modalOverlay.className =
    "fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50";

  const modalContent = document.createElement("div");
  modalContent.className =
    "bg-white border-2 border-black rounded-[30px] p-6 max-w-md w-full mx-4 relative whitespace-pre-line";

  // Add dark mode support to modal
  if (document.body.classList.contains("dark")) {
    modalContent.style.backgroundColor = "#374151";
    modalContent.style.color = "#f3f4f6";
    modalContent.style.borderColor = "#4b5563";
  }

  const header = document.createElement("div");
  header.className = "flex justify-between items-center mb-4";

  const title = document.createElement("h2");
  title.className = "text-2xl font-bold";
  title.textContent = `Schedule for ${roomName}`;

  if (document.body.classList.contains("dark")) {
    title.style.color = "#f3f4f6";
  }

  const closeBtn = document.createElement("button");
  closeBtn.className = "text-2xl font-bold";
  closeBtn.textContent = "×";
  closeBtn.style.cursor = "pointer";
  closeBtn.style.background = "none";
  closeBtn.style.border = "none";
  if (document.body.classList.contains("dark")) {
    closeBtn.style.color = "#f3f4f6";
  }
  closeBtn.onclick = () => document.body.removeChild(modalOverlay);

  header.appendChild(title);
  header.appendChild(closeBtn);

  const body = document.createElement("div");
  body.className = "text-sm leading-relaxed";
  body.textContent = scheduleText;

  if (document.body.classList.contains("dark")) {
    body.style.color = "#d1d5db";
  }

  modalContent.appendChild(header);
  modalContent.appendChild(body);
  modalOverlay.appendChild(modalContent);

  modalOverlay.onclick = e => {
    if (e.target === modalOverlay) {
      document.body.removeChild(modalOverlay);
    }
  };

  document.body.appendChild(modalOverlay);
}

/* ───────── ATTACH CLICK HANDLERS TO ROOM PILLS ───────── */
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".room-pill").forEach(pill => {
    pill.style.cursor = "pointer";
    pill.addEventListener("click", () => {
      // Extract room number/name from text like "Room 201" -> "201"
      let roomName = pill.textContent.trim();
      // Remove "Room " prefix if present
      roomName = roomName.replace(/^Room\s+/i, "").trim();
      console.log("Clicked room:", roomName);
      showModal(roomName);
    });
  });
});