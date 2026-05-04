import { db } from "./js/config/firebase-config.js";
import { collection, addDoc, onSnapshot, query, orderBy, serverTimestamp, getDocs, where } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { toMin, parseBlock, normalizeDay } from "./js/utils/time-utils.js";
import { initUniversalSearch } from './search.js';
import { initUserProfile } from "./userprofile.js";
import { initMobileNav } from "./js/ui/mobile-nav.js";
import { showToast, showConfirm } from "./js/utils/ui-utils.js";


initUniversalSearch(db);

document.addEventListener("DOMContentLoaded", () => {
  initUserProfile("#userProfile");
  initMobileNav();
  listenForRooms();
  // removed updateRoomOccupancies() initial call as it's handled by listenForRooms onSnapshot 🚀⚓

  // Show Select button for admins only
  if (localStorage.getItem('userRole') === 'admin') {
    const btn = document.getElementById('selectModeBtn');
    if (btn) btn.classList.replace('hidden', 'flex');
  }

  // Select mode state
  let selectMode = false;
  const selectedIds = new Set();

  window.toggleSelectMode = () => {
    selectMode = !selectMode; window._selectMode = selectMode;
    const btn = document.getElementById('selectModeBtn');
    if (btn) btn.textContent = selectMode ? '✕ Cancel' : '☑️ Select';
    if (!selectMode) exitSelectMode();
    else enterSelectMode();
  };

  window.exitSelectMode = () => {
    window._selectMode = false;
    selectMode = false;
    selectedIds.clear();
    const btn = document.getElementById('selectModeBtn');
    if (btn) btn.textContent = '☑️ Select';
    document.getElementById('bulkDeleteBar').classList.add('hidden');
    document.querySelectorAll('.room-pill').forEach(pill => {
      pill.classList.remove('ring-2', 'ring-blue-500', 'ring-offset-2', 'opacity-60');
      const cb = pill.querySelector('.room-select-cb');
      if (cb) cb.remove();
    });
  };

  window.enterSelectMode = function() {
    document.querySelectorAll('.room-pill').forEach(pill => {
      if (!pill.dataset.docId) return;
      if (pill.querySelector('.room-select-cb')) return;
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'room-select-cb absolute top-2 left-2 w-4 h-4 cursor-pointer z-20';
      cb.addEventListener('change', () => {
        if (cb.checked) { selectedIds.add(pill.dataset.docId); pill.classList.add('ring-2', 'ring-blue-500', 'ring-offset-2'); }
        else { selectedIds.delete(pill.dataset.docId); pill.classList.remove('ring-2', 'ring-blue-500', 'ring-offset-2'); }
        const bar = document.getElementById('bulkDeleteBar');
        const count = document.getElementById('bulkCount');
        if (selectedIds.size > 0) { bar.classList.remove('hidden'); bar.classList.add('flex'); }
        else { bar.classList.add('hidden'); bar.classList.remove('flex'); }
        if (count) count.textContent = `${selectedIds.size} selected`;
      });
      pill.appendChild(cb);
    });
  }

  window.bulkDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    const confirmed = await window.showConfirm('Delete Rooms?', `Delete ${selectedIds.size} selected room(s)?`);
    if (!confirmed) return;
    const { deleteDoc, doc } = await import("https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js");
    for (const id of [...selectedIds]) {
      await deleteDoc(doc(db, 'rooms', id));
    }
    showToast(`Deleted ${selectedIds.size} room(s) ✅`, 'success');
    exitSelectMode();
  };

  window.selectAll = () => {
    const allSelected = document.querySelectorAll('.room-pill[data-doc-id]').length === selectedIds.size;
    document.querySelectorAll('.room-pill[data-doc-id]').forEach(pill => {
      const cb = pill.querySelector('.room-select-cb');
      if (!cb) return;
      cb.checked = !allSelected;
      cb.dispatchEvent(new Event('change'));
    });
    const btn = document.getElementById('selectAllBtn');
    if (btn) btn.textContent = allSelected ? 'Select All' : 'Deselect All';
  };





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
    // All types can have a floor
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

      const firestoreType = ['classroom'].includes(type) ? 'classroom' : ['laboratory'].includes(type) ? 'laboratory' : 'other';
      await addDoc(collection(db, "rooms"), {
        type: firestoreType,
        subtype: type,
        floor: parseInt(floor),
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

  // Bulk import from document (called by room-doc-import.js)
  window.importRoomsFromDoc = async (rooms) => {
    let added = 0, skipped = 0;
    const existingSnap = await getDocs(collection(db, "rooms"));
    const existingNames = new Set(existingSnap.docs.map(d => d.data().name.toLowerCase()));
    for (const room of rooms) {
      if (existingNames.has(room.name.toLowerCase())) { skipped++; continue; }
      const firestoreType = ['classroom'].includes(type) ? 'classroom' : ['laboratory'].includes(type) ? 'laboratory' : 'other';
      await addDoc(collection(db, "rooms"), {
        type: firestoreType,
        subtype: type,
        floor: parseInt(floor),
        name,
        createdAt: serverTimestamp()
      });
      existingNames.add(room.name.toLowerCase());
      added++;
    }
    showToast(`Imported ${added} room(s)${skipped ? `, skipped ${skipped} duplicates` : ""} ✅`, "success");
  };

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
  const dynamicIds = ["floor-1-dynamic", "floor-2-dynamic", "floor-3-dynamic", "floor-4-dynamic"];
  dynamicIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '<div class="skeleton-text skeleton" style="width: 100px; height: 40px; border-radius: 50px;"></div>';
  });

  onSnapshot(q, (snapshot) => {
    // Clear dynamic containers
  const dynamicIds = ["floor-1-dynamic", "floor-2-dynamic", "floor-3-dynamic", "floor-4-dynamic"];
    dynamicIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = "";
    });

    snapshot.forEach((doc) => {
      const room = doc.data();
      const pill = createRoomPill(room.name, doc.id, room.capacity);
      pill.classList.add("room-pill-dynamic");

      const containerId = `floor-${room.floor || 1}-dynamic`;
      
      const container = document.getElementById(containerId);
      if (container) container.appendChild(pill);
    });

    // Re-bind listeners
    document.querySelectorAll(".room-pill").forEach(pill => {
      pill.style.cursor = "pointer";
      pill.onclick = (e) => {
        if (e.target.closest('.delete-room-btn')) return;
        if (window._selectMode) {
          const cb = pill.querySelector('.room-select-cb');
          if (cb) { cb.checked = !cb.checked; cb.dispatchEvent(new Event('change')); }
          return;
        }
        const labelEl = pill.querySelector('.room-pill-text-label');
        const roomNameRaw = labelEl ? labelEl.textContent.trim() : pill.firstChild.textContent.trim();
        window.location.href = `roomprofile.html?room=${encodeURIComponent(roomNameRaw)}`;
      };
    });

    // 🛡️ TRIGGER OCCUPANCY: Use cached schedules if available 
    updateRoomOccupancies();
    updateSectionVisibility();
    if (window._selectMode && window.enterSelectMode) window.enterSelectMode();


  });
}

function createRoomPill(name, docId, capacity) {
  const div = document.createElement("div");
  div.className = "room-pill transition-all active:scale-95 group relative";
  if (docId) div.dataset.docId = docId;

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

  if (capacity) {
    const capBadge = document.createElement("span");
    capBadge.className = "room-cap-badge";
    capBadge.textContent = capacity + " seats";
    div.appendChild(capBadge);
  }



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

function updateSectionVisibility() {
  const floorPairs = [
    { card: "card-floor-12", panels: ["panel-floor-1", "panel-floor-2"], dynamics: ["floor-1-dynamic", "floor-2-dynamic"] },
    { card: "card-floor-34", panels: ["panel-floor-3", "panel-floor-4"], dynamics: ["floor-3-dynamic", "floor-4-dynamic"] },
  ];
  for (const { card, panels, dynamics } of floorPairs) {
    let cardHasContent = false;
    panels.forEach((panelId, i) => {
      const panel = document.getElementById(panelId);
      const dynamic = document.getElementById(dynamics[i]);
      if (!panel || !dynamic) return;
      const hasRooms = dynamic.children.length > 0;
      panel.style.display = hasRooms ? "" : "none";
      if (hasRooms) cardHasContent = true;
    });
    const cardEl = document.getElementById(card);
    if (cardEl) cardEl.style.display = cardHasContent ? "" : "none";
  }
}
