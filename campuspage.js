import { db } from "./js/config/firebase-config.js";
import { collection, addDoc, onSnapshot, query, orderBy, serverTimestamp, getDocs, where } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { toMin, parseBlock, normalizeDay } from "./js/utils/time-utils.js";
import { initUniversalSearch } from './search.js';
import { initUserProfile } from "./userprofile.js";
import { syncStaticRooms } from './room-sync.js';
import { initMobileNav } from "./js/ui/mobile-nav.js";
import { showToast, showConfirm } from "./js/utils/ui-utils.js";


initUniversalSearch(db);

document.addEventListener("DOMContentLoaded", () => {
  initUserProfile("#userProfile");
  initMobileNav();
  listenForRooms();
  // removed updateRoomOccupancies() initial call as it's handled by listenForRooms onSnapshot 🚀⚓

  // Automatic Background Sync
  const autoSyncRooms = async () => {
    try {
      const count = await syncStaticRooms(db);
      if (count > 0) console.log(`Auto-synced ${count} new rooms to search.`);
    } catch (err) {
      console.warn("Auto-sync failed:", err);
    }
  };

  // Run sync after a short delay to ensure DOM is ready
  setTimeout(autoSyncRooms, 2000);

  // Root Cause Fix: Strict Whitelist Cleanup 🛡️⚓🛡️
  const cleanCorruptedRooms = async () => {
    // OFFICIAL WHITE-LIST 📜⚓
    const OFFICIAL_ROOMS = [
      "Room 101", "Room 102", "Room 103", "Room 104", "Room 105",
      "Room 201", "Room 202", "Room 203", "Room 204", "Room 205", "Room 206", "Room 207", "Room 208", "Room 209", "Room 210", "Room 211",
      "Room 301", "Room 302", "Room 303", "Room 304", "Room 305", "Room 306", "Room 307", "Room 308",
      "Room 401", "Room 402", "Room 403", "Room 404", "Room 405", "Room 406",
      "Computer Laboratory 1", "Computer Laboratory 2", "Computer Laboratory 3", "Computer Laboratory 4",
      "Kitchen", "Bar", "PE Area", "Court", "MPH"
    ].map(r => r.toUpperCase().trim());

    try {
      const snap = await getDocs(collection(db, "rooms"));
      let fixCount = 0;
      let purgeCount = 0;
      const allRoomNames = [];

      for (const d of snap.docs) {
        const rawName = d.data().name || "";
        // Sanitization 🧼
        const cleanName = rawName.replace(/\s*\|?\s*\d{1,3}%\s*(?:OCCUPIED)?$/i, "").trim();
        
        // 1. Corruption Check 🛡️⚓
        // If the name is empty or just generic percentage noise, it's a ghost.
        if (!cleanName || /^\d{1,3}%$/.test(cleanName)) {
          const { deleteDoc, doc } = await import("https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js");
          await deleteDoc(doc(db, "rooms", d.id));
          purgeCount++;
          continue;
        }

        // 2. Fix corrupted names 🧼
        if (cleanName !== rawName) {
          const { updateDoc, doc } = await import("https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js");
          await updateDoc(doc(db, "rooms", d.id), { name: cleanName });
          fixCount++;
        }
        allRoomNames.push(cleanName);
      }

      console.log("SchedSync ROOM AUDIT (Official):", allRoomNames);
      if (purgeCount > 0) console.log(`SchedSync PURGE: Deleted ${purgeCount} non-official rooms (ghosts) 🗑️⚓`);
      if (fixCount > 0) console.log(`SchedSync CLEANUP: Fixed ${fixCount} official room names 🧼⚓`);

    } catch (err) { console.warn("Cleanup/Purge script failed", err); }
  };
  setTimeout(cleanCorruptedRooms, 5000);

  // Modal logic
  window.openAddRoomModal = () => {
    document.getElementById("addRoomModal").classList.remove("hidden");
    document.getElementById("addRoomModal").classList.add("flex");
  };

  window.closeAddRoomModal = () => {
    document.getElementById("addRoomModal").classList.add("hidden");
    document.getElementById("addRoomModal").classList.remove("flex");
    // Clear inputs
    document.getElementById("modalRoomName").value = "";
  };

  window.toggleFloorSelect = () => {
    const type = document.getElementById("modalRoomType").value;
    const container = document.getElementById("floorSelectContainer");
    if (type === "classroom") {
      container.classList.remove("hidden");
    } else {
      container.classList.add("hidden");
    }
  };

  document.getElementById("saveRoomBtn").addEventListener("click", async () => {
    const type = document.getElementById("modalRoomType").value;
    const floor = document.getElementById("modalFloor").value;
    let name = document.getElementById("modalRoomName").value.trim();

    if (!name) {
      showToast("Please enter a room name", "warning");
      return;
    }

    // Nuclear Sanitization 🚀⚓ (Catch "Room 2060%" even if dikit)
    name = name.replace(/\s*\|?\s*\d{1,3}%\s*(?:OCCUPIED)?$/i, "").trim();

    try {
      // ✅ Prevent Duplicates 🛡️⚓
      const existingSnap = await getDocs(collection(db, "rooms"));
      const isDuplicate = existingSnap.docs.some(doc =>
        doc.data().name.toLowerCase() === name.toLowerCase()
      );

      if (isDuplicate) {
        const errorMsg = `Room "${name}" already exists 🚫`;
        showToast(errorMsg, "error");
        return;
      }

      await addDoc(collection(db, "rooms"), {
        type,
        floor: type === "classroom" ? parseInt(floor) : null,
        name,
        createdAt: serverTimestamp()
      });
      closeAddRoomModal();
      showToast(`Room "${name}" added successfully! ✅`, "success");
    } catch (error) {
      console.error("Error adding room:", error);
      showToast("Error adding room: " + error.message, "error");
    }
  });
});

/* ───────── OCCUPANCY LOGIC 🛡️⚓ ───────── */
let cachedSchedules = null;
let isCalculating = false;

async function updateRoomOccupancies() {
  if (isCalculating) return;
  isCalculating = true;

  console.log("SchedSync: Updating room occupancies...");
  try {
    // 🛡️ OPTIMIZED: Only fetch schedules if they aren't cached 
    // or use the cache if valid. In a real-time app, we'd use onSnapshot 
    // on schedules separately.
    if (!cachedSchedules) {
      const q = query(collection(db, "schedules"), where("status", "==", "published"));
      const snap = await getDocs(q);
      cachedSchedules = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }
    
    const now = new Date();
    const currentDay = new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(now);
    const currentMins = now.getHours() * 60 + now.getMinutes();

    const groupedByDate = {}; 

    cachedSchedules.forEach(data => {
      if (data.section === "EVENTS" || data.section === "EVENT_HOST" || data.id === "DEFAULT_SECTION") return;

      let isRelevantToday = true;
      if (data.targetDate) {
        const todayStr = now.toISOString().split('T')[0];
        if (data.targetDate !== todayStr) isRelevantToday = false;
      }

      (data.classes || []).forEach(c => {
        if (!c.room || !c.timeBlock) return;
        const key = c.room.toLowerCase().replace(/room|rm|\s/g, "").trim();
        if (!groupedByDate[key]) groupedByDate[key] = { WEEKLY: 0, isOccupiedNow: false };

        const block = parseBlock(c.timeBlock);
        const duration = block.end - block.start;
        if (duration <= 0) return;

        if (!(data.targetDate || data.originalId)) {
          groupedByDate[key].WEEKLY += duration;
        }

        const dayMatches = normalizeDay(c.day) === normalizeDay(currentDay);
        if (dayMatches && isRelevantToday) {
          if (currentMins >= block.start && currentMins < block.end) {
            groupedByDate[key].isOccupiedNow = true;
          }
        }
      });
    });

    const TOTAL_WEEKLY_MINS = 4500;

    document.querySelectorAll(".room-pill").forEach(pill => {
      const labelEl = pill.querySelector(".room-pill-text-label");
      if (!labelEl) return;

      const cleanLabel = labelEl.textContent.replace(/\s*\|?\s*\d{1,3}%\s*(?:OCCUPIED)?$/i, "").trim();
      const roomNameRaw = cleanLabel.toLowerCase().replace(/room|rm|\s/g, "").trim();

      const roomData = groupedByDate[roomNameRaw] || { WEEKLY: 0, isOccupiedNow: false };
      const percentage = Math.min(100, Math.round(((roomData.WEEKLY || 0) / TOTAL_WEEKLY_MINS) * 100));

      // Remove existing badges
      pill.querySelectorAll(".occupancy-badge-inline").forEach(b => b.remove());

      const badge = document.createElement("span");
      badge.className = "occupancy-badge-inline";
      
      if (roomData.isOccupiedNow) {
        badge.textContent = `${percentage}% BUSY`;
        badge.style.color = percentage > 70 ? "#dc2626" : "#ea580c";
        pill.style.borderColor = percentage > 70 ? "#dc2626" : "#ea580c";
      } else {
        badge.textContent = "VACANT";
        badge.style.color = "#059669";
        pill.style.borderColor = "#059669";
      }
      pill.appendChild(badge);
    });
  } catch (err) {
    console.error("SchedSync: Occupancy failed:", err);
  } finally {
    isCalculating = false;
  }
}

function listenForRooms() {
  const q = query(collection(db, "rooms"), orderBy("name"));

  // 🦴 SHOW SKELETONS while loading
  const dynamicIds = ["floor-1-dynamic", "floor-2-dynamic", "floor-3-dynamic", "floor-4-dynamic", "laboratories-dynamic", "kitchen-bar-dynamic", "event-spaces-dynamic"];
  dynamicIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '<div class="skeleton-text skeleton" style="width: 100px; height: 40px; border-radius: 50px;"></div>';
  });

  onSnapshot(q, (snapshot) => {
    // Clear dynamic containers
    const dynamicIds = ["floor-1-dynamic", "floor-2-dynamic", "floor-3-dynamic", "floor-4-dynamic", "laboratories-dynamic", "kitchen-bar-dynamic", "event-spaces-dynamic"];
    dynamicIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = "";
    });

    snapshot.forEach((doc) => {
      const room = doc.data();
      const pill = createRoomPill(room.name, doc.id);
      pill.classList.add("room-pill-dynamic");

      const containerId = room.type === "classroom" ? `floor-${room.floor}-dynamic` :
                        (room.name.toLowerCase().includes("kitchen") || room.name.toLowerCase().includes("bar")) ? "kitchen-bar-dynamic" :
                        room.type === "laboratory" ? "laboratories-dynamic" : "event-spaces-dynamic";
      
      const container = document.getElementById(containerId);
      if (container) container.appendChild(pill);
    });

    // Re-bind listeners
    document.querySelectorAll(".room-pill").forEach(pill => {
      pill.style.cursor = "pointer";
      pill.onclick = (e) => {
        if (e.target.closest('.delete-room-btn')) return;
        const labelEl = pill.querySelector(".room-pill-text-label");
        const roomNameRaw = labelEl ? labelEl.textContent.trim() : pill.firstChild.textContent.trim();
        window.location.href = `roomprofile.html?room=${encodeURIComponent(roomNameRaw)}`;
      };
    });

    // 🛡️ TRIGGER OCCUPANCY: Use cached schedules if available 
    updateRoomOccupancies();
  });
}

function createRoomPill(name, docId) {
  const div = document.createElement("div");
  div.className = "room-pill transition-all active:scale-95 group relative";
  div.style.cursor = "pointer";

  // Icon based on name 🦈⚓
  const roomNameClean = name.toLowerCase();
  let icon = "🏫";
  if (roomNameClean.includes("lab")) icon = "💻";
  if (roomNameClean.includes("kitchen") || roomNameClean.includes("bar")) icon = "🍳";
  if (roomNameClean.includes("mph") || roomNameClean.includes("pe")) icon = "🏀";
  if (roomNameClean.includes("clinic")) icon = "🏥";

  div.innerHTML = `<div style="font-size: 1.5rem; margin-bottom: 2px;">${icon}</div>`;

  // Wrap name in span 🦈⚓🛡️
  const span = document.createElement("span");
  span.className = "room-pill-text-label";
  span.textContent = name.replace(/\s*\|?\s*\d{1,3}%\s*(?:OCCUPIED)?$/i, "").trim();
  div.appendChild(span);


  // ADMIN DELETE BUTTON 🗑️⚓🛡️
  const isAdmin = localStorage.getItem('userRole') === 'admin';
  if (isAdmin && docId) {
    const delBtn = document.createElement("button");
    delBtn.className = "delete-room-btn absolute top-3 right-3 w-7 h-7 bg-red-500 text-white rounded-full flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-all border-2 border-black shadow-[2px_2px_0px_black] hover:scale-110 active:scale-90 z-30";
    delBtn.innerHTML = "✕";



    delBtn.title = "Delete Room";
    delBtn.onclick = async (e) => {
      e.stopPropagation();
      const confirmed = await window.showConfirm("Delete Room?", `Are you sure you want to delete "${name}"? 🗑️⚠️`);
      if (confirmed) {
        try {
          const { deleteDoc, doc } = await import("https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js");
          await deleteDoc(doc(db, "rooms", docId));
          showToast(`Room "${name}" deleted! 🗑️✨`, "success");
        } catch (err) {
          console.error("Delete room failed:", err);
          showToast("Failed to delete room.", "error");
        }
      }
    };
    div.appendChild(delBtn);
  }

  return div;
}
