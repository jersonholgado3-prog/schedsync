import { db, auth } from "./js/config/firebase-config.js";
import {
  collection,
  getDocs,
  getDoc,
  doc,
  updateDoc,
  query,
  where,
  addDoc,
  onSnapshot,
  deleteDoc,
  serverTimestamp,
  arrayUnion
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { toMin, toTime, to12, parseBlock, overlaps, cleanSection, normalizeDay, normalizeTimeBlock } from "./js/utils/time-utils.js";
import { showToast, showConfirm, showPrompt } from "./js/utils/ui-utils.js";
import { initUserProfile } from "./userprofile.js";
import { initMobileNav } from "./js/ui/mobile-nav.js";
import { initUniversalSearch } from "./search.js";
import { SUBJECT_DATA, getStrandFromSection } from "./subject-data.js";
import { logAction } from "./js/utils/audit-logger.js";

// 🔄 Undo/Redo History ⚓
let undoStack = [];
let redoStack = [];
const MAX_HISTORY = 50;

function pushToHistory() {
  // Deep copy of all classes in all schedules 🦾
  const snapshot = schedules.map(s => ({
    id: s.id,
    classes: JSON.parse(JSON.stringify(s.classes || []))
  }));
  undoStack.push(snapshot);
  if (undoStack.length > MAX_HISTORY) undoStack.shift();
  // Clear redo stack on new action 🧹
  redoStack = [];
}


let currentUser = null;
let currentUserRole = null;
let comments = []; // Global store
let isSaving = false; // 🔒 Prevents double-clicks/duplicate saves



// Initialize user profile and set current user
document.addEventListener("DOMContentLoaded", () => {
  try {
    initUserProfile("#userProfile");
    initUniversalSearch(db);
    initMobileNav();
  } catch (e) {
    console.error("SchedSync Initialization Error:", e);
  }

  // Init Custom Dropdowns
  setupCustomDropdown('subject', 'subject-dropdown', getSubjectOptions);
  setupCustomDropdown('teacher', 'teacher-dropdown', getTeacherOptions);
  setupCustomDropdown('room', 'room-dropdown', getRoomOptions);

  onAuthStateChanged(auth, async (user) => {
    panel.classList.remove("open"); // Ensure closed on fresh load 🛡️
    if (user) {
      currentUser = user;

      // Expose functions to window
      window.saveClass = saveClass;
      window.handleColorSelect = handleColorSelect;
      window.handleColorPicker = handleColorPicker;
      window.markAsVacant = markAsVacant;
      window.deleteClass = deleteClass;
      window.closePanel = closePanel;
      window.switchToComments = switchToComments;
      window.requestEditPermission = requestEditPermission;
      window.save = saveClass; // For Ctrl+S shortcut

      try {
        const udoc = await getDoc(doc(db, "users", user.uid));
        if (udoc.exists()) {
          const userData = udoc.data();
          currentUserRole = userData.role;
          const hasPermission = userData.editPermission === true;


          // Update localStorage for sync with role-restriction
          localStorage.setItem('userRole', currentUserRole || 'student');
          localStorage.setItem('editPermission', String(hasPermission));

          // Hide Request Permission Button for Admins and those with permission, Show ONLY for Teachers needing access 🛡️
          const requestBtn = document.getElementById('requestPermissionBtnHeader');
          if (requestBtn) {
            if (currentUserRole === 'teacher' && !hasPermission) {
              requestBtn.style.setProperty('display', 'flex', 'important');
            } else {
              requestBtn.style.setProperty('display', 'none', 'important');
            }
          }

          // Show Download button for everyone in Edit Page by default (Logic can be refined later if needed)
          const downloadBtn = document.querySelector('.download-all-header-btn:not(#requestPermissionBtnHeader)');
          if (downloadBtn) {
            downloadBtn.style.setProperty('display', 'flex', 'important');
          }
        }
      } catch (e) {
        console.error("Error fetching user role:", e);
      }

      load(); // Load schedules for the current user
      listenForDynamicRooms(); // Fetch rooms from Firestore

      // --- Session Tracking ---
      const urlParams = new URLSearchParams(window.location.search);
      const sId = urlParams.get('id');
      const sName = urlParams.get('name');
      if (sId) {
        localStorage.setItem('activeEditSession', `id=${sId}`);
      } else if (sName) {
        localStorage.setItem('activeEditSession', `name=${encodeURIComponent(sName)}`);
      }

      // --- Navigation Interceptor for Autosave ---
      document.querySelectorAll('.sidebar-link').forEach(link => {
        link.addEventListener('click', async (e) => {
          if (panel && panel.classList.contains('open')) {
            e.preventDefault();
            const targetUrl = link.href;
            showToast("Autosaving changes...", "info");

            try {
              await saveClass();
              window.location.href = targetUrl;
            } catch (err) {
              console.error("Autosave failed", err);
              // Still navigate if it fails to avoid trapping user
              window.location.href = targetUrl;
            }
          }
        });
      });

      // --- MOBILE ORIENTATION GUARD 📱🔄 ---
      const handleOrientation = () => {
        const isPortrait = window.innerHeight > window.innerWidth;
        const isMobile = window.innerWidth <= 768;
        
        let guard = document.getElementById('orientation-guard');
        if (!guard) {
          guard = document.createElement('div');
          guard.id = 'orientation-guard';
          guard.innerHTML = `
            <div class="guard-content">
              <div class="rotate-icon">🔄</div>
              <h2>Switch to Landscape</h2>
              <p>For the best schedule editing experience, please rotate your device. 📱✨</p>
            </div>
          `;
          document.body.appendChild(guard);
        }

        if (isMobile && isPortrait) {
          guard.classList.add('visible');
        } else {
          guard.classList.remove('visible');
        }
      };

      window.addEventListener('resize', handleOrientation);
      window.addEventListener('orientationchange', handleOrientation);
      handleOrientation();

      // --- Presence & Tracking ---
      if (typeof initPresence === 'function') initPresence();
      if (typeof listenForComments === 'function') listenForComments();

      // --- Keyboard Shortcuts (Ctrl+C, Ctrl+V, Ctrl+S) 🎹🦈 ---
      document.addEventListener('keydown', async (e) => {
        // Only run if not in an input/textarea
        if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;

        const isCtrl = e.ctrlKey || e.metaKey;
        const key = e.key.toLowerCase();

        // --- COPY (Ctrl+C) ---
        if (isCtrl && key === 'c') {
          const activeCell = document.querySelector('td.active-cell');
          if (!activeCell) return;

          const sid = activeCell.dataset.schedId;
          const day = activeCell.dataset.day;
          const block = activeCell.dataset.block;

          const sched = schedules.find(s => s.id === sid);
          // 🛡️ INTELLIGENT SEARCH: Find the class that contains this block ⚓
          const classItem = (sched?.classes || []).find(c => {
            if (c.day !== day) return false;
            if (c.timeBlock === block) return true;
            
            // If it spans multiple, check if it overlaps this specific 30-min slot
            const cParsed = parseBlock(c.timeBlock);
            const bParsed = parseBlock(block);
            return overlaps(cParsed, bParsed);
          });

          if (classItem) {
            clipboardCellData = JSON.parse(JSON.stringify(classItem));
            showToast(`Copied: ${classItem.subject} (${classItem.timeBlock}) 📋`, "success");
          }
        }

        // --- PASTE (Ctrl+V) ---
        if (isCtrl && key === 'v') {
          if (!clipboardCellData) {
            showToast("Nothing to paste! Copy a class first 📋", "info");
            return;
          }

          const targetCell = document.querySelector('td.active-cell');
          if (!targetCell) return;

          const sid = targetCell.dataset.schedId;
          const targetDay = targetCell.dataset.day;
          const targetBlock = targetCell.dataset.block;

          if (!sid || !targetDay || !targetBlock) return;

          // 🛡️ STRICT COLLISION PREVENTION 🦈
          if (targetCell.classList.contains('occupied')) {
            showToast("This slot is already occupied! 🛡️ Move the original first.", "warning");
            return;
          }

          const confirmMsg = `Paste "${clipboardCellData.subject}" into this slot? 📥`;

          const confirmed = await showConfirm(confirmMsg);

          if (!confirmed) return;

          pushToHistory(); // Capture state before paste ⚓

          const sched = schedules.find(s => s.id === sid);
          if (!sched) return;

          // Remove EXISTING in that slot (including VACANT placeholders) to avoid duplicates 🦾⚓
          const normTargetDay = normalizeDay(targetDay);
          const normTargetBlock = normalizeTimeBlock(targetBlock);
          let updated = (sched.classes || []).filter(c => !(normalizeDay(c.day) === normTargetDay && normalizeTimeBlock(c.timeBlock) === normTargetBlock));

          // Paste new data
          const newData = {
            ...clipboardCellData,
            day: targetDay,
            timeBlock: targetBlock
          };

          // 🛡️ CONFLICT DETECTION ON PASTE ⚓
          showToast("Checking for conflicts... ⚖️", "info");
          const conflicts = await checkConflicts(newData, sid);
          if (conflicts.hasConflict) {
              showConflictRecommendations(newData);

              let msg = "<div style='text-align: center; color: #ef4444; font-weight: 800; font-size: 1.1rem; margin-bottom: 10px;'>PASTE CONFLICT! ⚠️</div>";
              if (conflicts.room) msg += `<div style='margin-bottom: 8px;'>${conflicts.room}</div>`;
              if (conflicts.teacher) msg += `<div style='margin-bottom: 8px;'>${conflicts.teacher}</div>`;
              if (conflicts.blueprint) msg += `<div style='margin-bottom: 8px;'>${conflicts.blueprint}</div>`;
              msg += "<div style='margin-top: 15px; font-size: 0.85rem; border-top: 1px solid #ddd; pt: 10px;'>Force paste anyway?</div>";

              const proceed = await showConfirm("⚠️ ATTENTION", msg);
              if (!proceed) {
                  // Re-render to clear any visual changes if necessary
                  return;
              }
          }

          updated.push(newData);
          sched.classes = updated;

          renderTable();

          try {
            await updateDoc(doc(db, "schedules", sid), { classes: updated });
            showToast("Class pasted successfully! 🛡️⚡", "success");
          } catch (err) {
            console.error("Paste failed", err);
            showToast("Paste failed!", "error");
          }
        }

        // --- UNDO (Ctrl+Z) ---
        if (isCtrl && key === 'z') {
          e.preventDefault();
          if (undoStack.length === 0) {
            showToast("Nothing to undo 🔄", "info");
            return;
          }

          // Save current state for redo
          const currentState = schedules.map(s => ({
            id: s.id,
            classes: JSON.parse(JSON.stringify(s.classes || []))
          }));
          redoStack.push(currentState);

          // Restore last state
          const lastState = undoStack.pop();
          applyHistoryState(lastState, "Undo successful! 🔄");
        }

        // --- REDO (Ctrl+Y) ---
        if (isCtrl && key === 'y') {
          e.preventDefault();
          if (redoStack.length === 0) {
            showToast("Nothing to redo 🔄", "info");
            return;
          }

          // Save current state for undo
          const currentState = schedules.map(s => ({
            id: s.id,
            classes: JSON.parse(JSON.stringify(s.classes || []))
          }));
          undoStack.push(currentState);

          // Restore redo state
          const nextState = redoStack.pop();
          applyHistoryState(nextState, "Redo successful! 🔄");
        }
      });
    }
  });
});

async function applyHistoryState(state, message) {
  for (const sState of state) {
    const s = schedules.find(sched => sched.id === sState.id);
    if (s) {
      s.classes = sState.classes;
      try {
        await updateDoc(doc(db, "schedules", s.id), { classes: s.classes });
      } catch (err) {
        console.error("History sync failed", err);
      }
    }
  }
  renderTable();
  showToast(message, "success");
}

/* ───────── FIREBASE ───────── */

let cachedPublishedSchedules = null;
let lastPublishedSchedulesFetch = 0;

async function getPublishedSchedules() {
  const now = Date.now();
  if (cachedPublishedSchedules && now - lastPublishedSchedulesFetch < 5000) {
    return cachedPublishedSchedules;
  }
  const snap = await getDocs(query(collection(db, "schedules"), where("status", "==", "published")));
  cachedPublishedSchedules = snap;
  lastPublishedSchedulesFetch = now;
  return snap;
}

async function updateRoomSelectionOccupancies() {

  try {
    const snap = await getPublishedSchedules();
    const roomMinutes = {};

    snap.forEach(doc => {
      const sched = doc.data();
      
      // 🛡️ Skip specialized schedules and overrides ⚓
      if (sched.section === "EVENTS" || sched.section === "EVENT_HOST" || doc.id === "DEFAULT_SECTION") return;
      if (sched.targetDate || sched.originalId) return;

      (sched.classes || []).forEach(c => {
        // 🧪 Filter out Vacant spots and invalid data from occupancy 🧼⚓
        const subj = (c.subject || "").trim().toUpperCase();
        if (!c.room || !c.timeBlock || !subj || subj === "VACANT" || subj === "MARKED_VACANT") return;

        const block = parseBlock(c.timeBlock);
        const duration = block.end - block.start;
        if (duration <= 0) return;

        // Nuclear Sanitization ⚓
        const cleanRoom = c.room.replace(/\s*\|?\s*\d{1,3}%\s*(?:OCCUPIED)?$/i, "").trim();
        const key = cleanRoom.toLowerCase().replace(/room|rm|\s/g, "").trim();
        roomMinutes[key] = (roomMinutes[key] || 0) + duration;
      });
    });

    const TOTAL_WEEKLY_MINS = 4500;
    roomOccupancies = {}; // Clear previous

    allRooms.forEach(room => {
      const roomName = room.name;
      // 🔑 SYNCED KEY NORMALIZATION ⚓
      const key = roomName.toLowerCase().replace(/room|rm|\s/g, "").trim();
      const minutes = roomMinutes[key] || 0;
      const percentage = Math.min(100, Math.round((minutes / TOTAL_WEEKLY_MINS) * 100));
      roomOccupancies[roomName] = percentage;
    });


  } catch (err) {
    console.error("SCHEDSYNC DEBUG: Room occupancy update failed:", err);
  }
}

async function listenForDynamicRooms() {
  const { onSnapshot, collection, query, orderBy } = await import("https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js");
  const q = query(collection(db, "rooms"), orderBy("name"));

  onSnapshot(q, async (snapshot) => {
    const roomSelect = document.getElementById("room");
    if (!roomSelect) return;

    allRooms = []; // Reset room list

    // Remove previously added dynamic options to avoid duplicates on update
    roomSelect.querySelectorAll(".dynamic-room-option").forEach(opt => opt.remove());

    snapshot.forEach((docSnap) => {
      const room = docSnap.data();
      const rawName = room.name || "";
      // Nuclear Sanitization (Catch "Room 2060%" even if dikit)
      const cleanName = rawName.replace(/\s*\|?\s*\d{1,3}%\s*(?:OCCUPIED)?$/i, "").trim();

      allRooms.push({
        name: cleanName,
        type: room.type || 'classroom',
        floor: parseInt(room.floor) || 1
      });
    });

    // Custom Numeric Sort
    allRooms.sort((a, b) => {
      const nameA = a.name.toUpperCase();
      const nameB = b.name.toUpperCase();

      const isRoomA = nameA.startsWith("ROOM");
      const isRoomB = nameB.startsWith("ROOM");

      if (isRoomA && isRoomB) {
        const numA = parseInt(nameA.replace(/\D/g, "")) || 0;
        const numB = parseInt(nameB.replace(/\D/g, "")) || 0;
        return numA - numB;
      }

      if (isRoomA && !isRoomB) return -1;
      if (!isRoomA && isRoomB) return 1;

      return nameA.localeCompare(nameB);
    });

    // Update with occupancies
    await updateRoomSelectionOccupancies();
  });
}

/* ───────── ELEMENTS ───────── */
const tbody = document.getElementById("tbody");
const panel = document.getElementById("panel");
const colgroup = document.querySelector("colgroup");
const theadTr = document.querySelector("thead tr");

if (!tbody || !colgroup || !theadTr) {
  console.error("SchedSync: One or more table elements (tbody, colgroup, theadTr) not found!", { tbody, colgroup, theadTr });
} else {
  console.log("SchedSync: Table elements located successfully.");
}

/* ───────── DRAG AND DROP LOGIC ───────── */
let draggedSource = null;

function handleDragStart(e) {
  const td = e.target.closest('td');
  if (!td || td.classList.contains('vacant-empty') || !td.classList.contains('occupied')) {
    e.preventDefault();
    return;
  }

  draggedSource = {
    schedId: td.dataset.schedId,
    day: td.dataset.day,
    block: td.dataset.block,
    content: td.innerHTML
  };

  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', JSON.stringify(draggedSource));

  requestAnimationFrame(() => {
    td.classList.add('dragging-source');
    // Add visual feedback to the body
    document.body.classList.add('is-dragging');
  });
}

function handleDragOver(e) {
  e.preventDefault(); // Required for drop
  const target = e.target.closest('td, #deleteBtn');
  if (!target) return;

  if (target.id === 'deleteBtn') {
    target.classList.add('drag-over-delete');
    return;
  }

  const td = target.closest('td');
  if (td) {
    if (!td.classList.contains('occupied')) {
      td.classList.add('drag-over-target');
    }
  }
}

function handleDragEnd(e) {
  document.querySelectorAll('.dragging-source, .drag-over-target, .drag-over-delete').forEach(el => {
    el.classList.remove('dragging-source', 'drag-over-target', 'drag-over-delete');
  });
  document.body.classList.remove('is-dragging');
  draggedSource = null;
}

function handleDragLeave(e) {
  const target = e.target.closest('td, #deleteBtn');
  if (target) {
    target.classList.remove('drag-over-target', 'drag-over-delete');
  }
}

async function handleDrop(e) {
  e.preventDefault();
  const target = e.target.closest('td, #deleteBtn');
  if (!target || !draggedSource) return;

  // Cleanup styles
  document.body.classList.remove('is-dragging');
  target.classList.remove('drag-over-target', 'drag-over-delete');

  // 🗑️ DRAG TO DELETE
  if (target.id === 'deleteBtn') {
    selected = { id: draggedSource.schedId, day: draggedSource.day, block: draggedSource.block };
    deleteClass(target);
    return;
  }

  const targetTd = target.closest('td');
  if (!targetTd || targetTd.classList.contains('occupied')) {
    showToast("Invalid drop zone! 🛡️", "warning");
    return;
  }

  // Move Logic
  const sourceData = { ...draggedSource };
  const targetSchedId = targetTd.dataset.schedId;
  const targetDay = targetTd.dataset.day;
  const targetStart = parseInt(targetTd.dataset.start);

  pushToHistory();

  const sched = schedules.find(s => s.id === sourceData.schedId);
  const targetSched = schedules.find(s => s.id === targetSchedId);

  if (!sched || !targetSched) return;

  const classIndex = (sched.classes || []).findIndex(
    c => c.day === sourceData.day && c.timeBlock === sourceData.block
  );

  if (classIndex === -1) return;

  // Clone class data
  const classData = { ...sched.classes[classIndex] };
  const sourceParts = parseBlock(sourceData.block);
  const duration = sourceParts.end - sourceParts.start;

  const newStart = isNaN(targetStart) ? sourceParts.start : targetStart;
  let newEnd = newStart + duration;

  if (newEnd > 1080) {
    showToast("Class too long for this slot! 🦈", "error");
    return;
  }

  // Update class data
  classData.day = targetDay;
  classData.timeBlock = `${toTime(newStart)}-${toTime(newEnd)}`;

  // Remove from source
  sched.classes.splice(classIndex, 1);

  // Remove existing content at target if it's VACANT
  targetSched.classes = (targetSched.classes || []).filter(
      c => !(c.day === targetDay && parseBlock(c.timeBlock).start === newStart)
  );

  // Add to target
  targetSched.classes.push(classData);

  renderTable();

  try {
    await updateDoc(doc(db, "schedules", sched.id), { classes: sched.classes });
    if (sched.id !== targetSched.id) {
      await updateDoc(doc(db, "schedules", targetSched.id), { classes: targetSched.classes });
    }
    showToast("Class moved smoothly! 🌊", "success");
  } catch (err) {
    console.error(err);
    load(); // Fallback
  }
}

/* ───────── STATE ───────── */
let schedules = [];
let teachers = []; // Store fetched teachers
let allRooms = []; // Store all available rooms
let roomOccupancies = {}; // Store occupancy percentages
let selected = {};
let isLoaded = false;
let DAYS = [];
let copiedDayClasses = null; // Store copied classes for a day
let copiedDayName = ""; // Store name of the copied day
let clipboardCellData = null; // Store single class data for Ctrl+C/V 📋🦈

/* ───────── CLEAN SECTION ───────── */


/* ───────── ROOM CONFLICT CHECK ───────── */
async function hasRoomConflict(n, excludeId) {
  // Guard: If the new block is vacant or has no room, skip check
  if (n.room === "NA" || !n.room || n.subject === "VACANT" || n.subject === "MARKED_VACANT") return null;

  // 1. Check Local Schedules Array (Current Session Drafts)
  for (const s of schedules) {
    if (s.id === excludeId) continue; // Skip ENTIRE current schedule

    const dataClasses = s.classes || [];
    for (const c of dataClasses) {
      // Guard: Ignore existing vacant spots or classes without rooms
      if (c.subject === "VACANT" || c.subject === "MARKED_VACANT" || c.room === "NA" || !c.room) continue;

      if (c.day === n.day && c.room === n.room) {
        const cBlock = parseBlock(c.timeBlock);
        const nBlock = parseBlock(n.timeBlock);
        if (overlaps(cBlock, nBlock)) {
          highlightConflict(s.id, c.day, c.timeBlock);
          return {
            msg: `<b>ROOM CONFLICT!</b><br>Occupied by ${s.section}`,
            schedId: s.id,
            day: c.day,
            block: c.timeBlock
          };
        }
      }
    }
  }

  // 2. Check Firebase (Published Schedules)
  const snap = await getPublishedSchedules();

  for (const d of snap.docs) {
    if (d.id === excludeId) continue;
    // Also skip if it's already in our local 'schedules' list (to avoid double reporting)
    if (schedules.some(s => s.id === d.id)) continue;

    const data = d.data();
    const existing = data.classes || [];

    for (const c of existing) {
      if (c.day !== n.day) continue;
      if (c.room !== n.room) continue;
      // Guard: Ignore existing vacant/NA
      if (c.subject === "VACANT" || c.subject === "MARKED_VACANT" || c.room === "NA" || !c.room) continue;

      const cBlock = parseBlock(c.timeBlock);
      const nBlock = parseBlock(n.timeBlock);

      if (overlaps(cBlock, nBlock)) {
        highlightConflict(d.id, c.day, c.timeBlock);
        return {
          msg: `<b>ROOM CONFLICT!</b><br>Taken by ${data.section}`,
          schedId: d.id,
          day: c.day,
          block: c.timeBlock
        };
      }
    }
  }
  return null;
}

/* ───────── TEACHER CONFLICT CHECK ───────── */
async function hasTeacherConflict(n, excludeId) {
  // Guard: If teacher is NA or subject is vacant, no conflict
  if (n.teacher === "NA" || !n.teacher || n.subject === "VACANT" || n.subject === "MARKED_VACANT") return null;

  // 1. Check Local Schedules Array
  for (const s of schedules) {
    if (s.id === excludeId) continue; // Skip ENTIRE current schedule

    const dataClasses = s.classes || [];
    for (const c of dataClasses) {
      // Guard: Ignore existing vacant/NA
      if (c.subject === "VACANT" || c.subject === "MARKED_VACANT" || c.teacher === "NA" || !c.teacher) continue;

      if (c.day === n.day && c.teacher === n.teacher) {
        const cBlock = parseBlock(c.timeBlock);
        const nBlock = parseBlock(n.timeBlock);
        if (overlaps(cBlock, nBlock)) {
          highlightConflict(s.id, c.day, c.timeBlock);
          return {
            msg: `<b>TEACHER CONFLICT!</b><br>Busy with ${s.section}`,
            schedId: s.id,
            day: c.day,
            block: c.timeBlock
          };
        }
      }
    }
  }

  // 2. Check Firebase
  const snap = await getPublishedSchedules();

  for (const d of snap.docs) {
    if (d.id === excludeId) continue;
    if (schedules.some(s => s.id === d.id)) continue;

    const data = d.data();
    const existing = data.classes || [];

    for (const c of existing) {
      if (c.day !== n.day) continue;
      if (c.teacher !== n.teacher) continue;
      // Guard: Ignore existing vacant/NA
      if (c.subject === "VACANT" || c.subject === "MARKED_VACANT" || c.teacher === "NA" || !c.teacher) continue;

      const cBlock = parseBlock(c.timeBlock);
      const nBlock = parseBlock(n.timeBlock);

      if (overlaps(cBlock, nBlock)) {
        highlightConflict(d.id, c.day, c.timeBlock);
        return {
          msg: `<b>TEACHER CONFLICT!</b><br>Busy with ${data.section}`,
          schedId: d.id,
          day: c.day,
          block: c.timeBlock
        };
      }
    }
  }
  return null;
}

function highlightConflict(id, day, block) {
  const cell = document.querySelector(
    `td[data-sched-id="${id}"][data-day="${day}"][data-block="${block}"]`
  );
  if (cell) {
    cell.classList.add('conflict-shake');
    cell.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // Pointer Finger Indicator
    const pointer = document.createElement('div');
    pointer.className = 'conflict-pointer';
    pointer.textContent = '☝️';
    document.body.appendChild(pointer);

    const syncPointer = () => {
      const r = cell.getBoundingClientRect();
      pointer.style.left = `${r.left + r.width / 2 - 20}px`;
      pointer.style.top = `${r.bottom + 10}px`; // Show it below the cell pointing up
    };

    // Keep syncing while scrolling/animating
    const syncInterval = setInterval(syncPointer, 16);
    syncPointer();

    setTimeout(() => {
      cell.classList.remove('conflict-shake');
      clearInterval(syncInterval);
      pointer.animate([
        { opacity: 1, transform: 'translateY(0) scale(1.4)' },
        { opacity: 0, transform: 'translateY(-50px) scale(0.1)' }
      ], { duration: 500, easing: 'ease-in' }).onfinish = () => pointer.remove();
    }, 3500);
  }
}

/* ───────── BLUEPRINT CONFLICT CHECK ───────── */
async function hasBlueprintConflict(newBlock, excludeId) {
  const room = newBlock.room;
  // Guard: Skip if vacant or no room
  if (!room || room === "NA" || newBlock.subject === "VACANT" || newBlock.subject === "MARKED_VACANT") return null;

  // Find all published schedules that have classes in this room
  const snap = await getPublishedSchedules();
  const roomSchedules = snap.docs.filter(d => {
    const classes = d.data().classes || [];
    return classes.some(c => c.room === room && c.subject !== "VACANT" && c.subject !== "MARKED_VACANT");
  });

  if (roomSchedules.length === 0) return null; // No blueprint yet

  // Find the blueprint: the schedule with the earliest createdAt for this room
  const blueprintDoc = roomSchedules.reduce((earliest, current) => {
    const earliestTime = earliest.data().createdAt || 0;
    const currentTime = current.data().createdAt || 0;
    return currentTime < earliestTime ? current : earliest;
  });

  // If the blueprint is the schedule we are editing, it's NOT a conflict
  if (blueprintDoc.id === excludeId) return null;

  const blueprintClasses = blueprintDoc.data().classes || [];

  // Check if newBlock overlaps with any ACTUAL class in the blueprint on the same day
  const newParsed = parseBlock(newBlock.timeBlock);
  for (const bc of blueprintClasses) {
    if (bc.day === newBlock.day && bc.subject !== "VACANT" && bc.subject !== "MARKED_VACANT") {
      const bcParsed = parseBlock(bc.timeBlock);
      if (overlaps(newParsed, bcParsed)) {
        return `<b>SECTION BUSY!</b><br>Slot taken by ${bc.subject}`;
      }
    }
  }

  return null;
}

/* ───────── LOAD TABLE ───────── */
// 🔄 Dynamic Curriculum Data 🎓
let dynamicSubjects = [];
let dynamicSubjects_raw = []; // 📦 Stores full course docs (with terms) for hierarchical dropdowns

/* ───────── LOAD TABLE ───────── */
async function load() {
  if (isLoaded || !currentUser) return;
  isLoaded = true;
  try {
    // --- Load Dynamic Curriculum ---
    const courseQ = query(collection(db, "courses"));
    const courseSnap = await getDocs(courseQ);

    dynamicSubjects = [];
    dynamicSubjects_raw = [];
    courseSnap.forEach(d => {
      const data = d.data();
      dynamicSubjects_raw.push({ id: d.id, ...data });
      if (data.terms) {
        Object.values(data.terms).forEach(subjects => {
          subjects.forEach(name => {
            // Flatten into the expected format
            dynamicSubjects.push({
              id: `course_${d.id}_${name}`,
              name: name,
              category: data.name // Using course name as category
            });
          });
        });
      }
    });
    // Fallback if no courses found, check legacy
    if (dynamicSubjects.length === 0) {
        const curQ = query(collection(db, "curriculums"));
        const curSnap = await getDocs(curQ);
        dynamicSubjects = curSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    }
    
    console.log(`SchedSync: Loaded ${dynamicSubjects.length} dynamic subjects from courses.`);

    schedules = [];
    const urlParams = new URLSearchParams(window.location.search);
    const targetId = urlParams.get("id");

    if (targetId) {

      try {
        const d = await getDoc(doc(db, "schedules", targetId));
        if (d.exists()) {
          const data = d.data();

          // Handle Conflict Resolution Redirect
          const conflictResolve = urlParams.get('conflictResolve') === 'true';
          const targetDate = urlParams.get('date');

          if (conflictResolve && targetDate) {
            console.log("SchedSync DEBUG: Conflict Resolution Mode Active for date:", targetDate);
            // We are creating a DRAFT override of this schedule
            const overrideData = JSON.parse(JSON.stringify(data));
            overrideData.targetDate = targetDate;
            overrideData.originalId = targetId; // Reference back
            overrideData.status = 'draft';
            overrideData.scheduleName = `${data.scheduleName || 'Schedule'} (Override ${targetDate})`;

            // --- INTELLIGENT REASSIGNMENT ---
            const cRoom = urlParams.get('room');
            const cBlock = urlParams.get('timeBlock');
            const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
            const dayName = days[new Date(targetDate).getDay()];

            const conflictClass = (overrideData.classes || []).find(c =>
              c.day === dayName &&
              c.timeBlock === cBlock &&
              c.room.toLowerCase().trim() === cRoom.toLowerCase().trim()
            );

            if (conflictClass) {
              console.log("SchedSync DEBUG: Found conflict class, finding new room...");
              // Temporarily push to global schedules so findAvailableRooms can see it
              schedules = [{ id: "TEMP_SYNC", ...overrideData }];

              const suggestions = await findAvailableRooms(dayName, cBlock, "TEMP_SYNC", conflictClass.subject);
              if (suggestions.length > 0) {
                const newRoom = suggestions[0];
                const oldRoom = conflictClass.room;
                conflictClass.room = newRoom;
                conflictClass.color = "#7c3aed"; // Violet to indicate moved
                console.log(`SchedSync DEBUG: Moved [${conflictClass.subject}] from ${oldRoom} to ${newRoom}`);

                setTimeout(() => {
                  showToast(`AUTOMATED: Moved Class to ${newRoom}`, "success");
                }, 2000);
              } else {
                // Fallback: Just mark as Vacant if no rooms found
                conflictClass.subject = "MARKED_VACANT";
                conflictClass.teacher = "NA";
                setTimeout(() => {
                  showToast("No rooms available, class marked as VACANT", "warning");
                }, 2000);
              }
            }

            // Reset schedules to the single temp one
            schedules = [{ id: `TEMP_${Date.now()}`, ...overrideData }];

            // Auto-open the panel for the conflict
            setTimeout(() => {
              if (window.openPanel) {
                window.openPanel(schedules[0].id, dayName, cBlock);
                showToast("Review the moved class location", "info");
              }
            }, 2500);
          } else if (data.section !== "EVENTS" && data.section !== "EVENT_HOST" && targetId !== "DEFAULT_SECTION") {
            schedules.push({ id: d.id, ...data });

            // Visibility Logic for Others' Drafts 🛡️
            if (currentUserRole === 'teacher' && data.status === 'draft' && data.userId !== currentUser.uid) {
              console.log("Others' Draft Detected - Enabling View-Only Comment Mode 👁️💬");
              if (window.enableTeacherReadOnlyMode) window.enableTeacherReadOnlyMode();
            }
          } else {
            showToast("This is an event schedule and won't be displayed here.", "info");
          }
        }
      } catch (e) {
        console.error("Error loading specific schedule:", e);
      }
    } else {
      // Query schedules
      let q;
      const urlParams = new URLSearchParams(window.location.search);
      const filterName = urlParams.get("name");

      if (currentUserRole === 'admin') {
        // Admin: See everything, but filter by name if present to avoid showing ALL sections/college
        if (filterName) {
            q = query(collection(db, "schedules"), where("scheduleName", "==", filterName));
        } else {
            q = collection(db, "schedules");
        }
      } else {
        // Teacher: See own only, and filter by name if present
        if (filterName) {
            q = query(collection(db, "schedules"), where("userId", "==", currentUser.uid), where("scheduleName", "==", filterName));
        } else {
            q = query(collection(db, "schedules"), where("userId", "==", currentUser.uid));
        }
      }

      const snap = await getDocs(q);
      snap.forEach(d => {
        const data = d.data();
        // Filter out events
        if (data.section !== "EVENTS" && data.section !== "EVENT_HOST" && d.id !== "DEFAULT_SECTION") {
          schedules.push({ id: d.id, ...data });
        }
      });
    }

    fetchTeachers(); // Fetch teachers in background
    console.log(`SchedSync: Data loaded, schedules count: ${schedules.length}. Triggering renderTable...`);
    renderTable();
  } catch (e) {
    console.error("SchedSync: Failed to load schedules:", e);
    showToast("Failed to load schedule data. Please refresh.", "error");
    isLoaded = false; // Allow retry on next trigger
  }
}

async function fetchTeachers() {
  try {
    const q = query(collection(db, "users"), where("role", "==", "teacher"));
    const snap = await getDocs(q);
    teachers = [];
    snap.forEach(d => {
      const t = d.data();
      teachers.push({
        name: t.username || t.displayName || t.fullName || (t.lastName ? `Teacher ${t.lastName}` : "Unknown Teacher"),
        forte: t.forte || "GENERAL",
        subjects: t.subjects || [],
        avatar: t.photoURL || "" // Fetching the avatar
      });
    });

  } catch (e) {
    console.error("Error loading teachers:", e);
  }
}

// ------------------------------------------
// CUSTOM DROPDOWN LOGIC
// ------------------------------------------
function setupCustomDropdown(inputId, dropdownId, getOptions) {
  const input = document.getElementById(inputId);
  const dropdown = document.getElementById(dropdownId);
  if (!input || !dropdown) return;

  let skipNextInput = false; // Flag to prevent re-opening on selection 🛡️

  const closeDropdown = () => {
    dropdown.classList.remove('open');
    dropdown.innerHTML = '';
  };

  const renderOptions = (items) => {
    dropdown.innerHTML = '';
    if (items.length === 0) {
      closeDropdown();
      return;
    }

    items.forEach(item => {
      const div = document.createElement('div');
      const isObject = typeof item === 'object' && item.name;
      const itemName = isObject ? item.name : item;

      if (isObject) {
        if (item.isHeader) {
          div.className = 'dropdown-header';
          div.textContent = item.name;
          dropdown.appendChild(div);
          return; // Skip appending normal item logic
        }

        div.className = 'dropdown-item-rich';
        if (item.type === 'teacher') {
          const avatarSrc = item.avatar || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(item.name) + '&background=0ea5e9&color=fff';
          div.innerHTML = `
              <img src="${avatarSrc}" class="avatar-mini">
              <div class="item-meta">
                <span class="item-name">${item.name}</span>
                <span class="item-sub">${item.forte || 'Teacher'}</span>
              </div>
            `;
        } else if (item.type === 'room' || (typeof item.occupancy !== 'undefined')) {
          const occ = item.occupancy || 0;
          const occColor = occ > 70 ? '#ef4444' : occ > 30 ? '#f97316' : '#10b981';
          const textColor = (occ > 30 && occ <= 70) ? '#000' : '#fff';
          div.innerHTML = `
              <div class="avatar-mini" style="background: ${occColor}; display:flex; align-items:center; justify-content:center; color:${textColor}; font-size:12px; font-weight:900; min-width:42px; height:42px; border: 2px solid ${occColor}; box-shadow: 0 0 10px ${occColor}66;">
                ${occ}%
              </div>
              <div class="item-meta">
                <span class="item-name">${item.name}</span>
                <span class="item-sub">${item.roomType || 'Room'}</span>
              </div>
            `;
        } else {
          div.innerHTML = `
              <div class="avatar-mini" style="display:flex; align-items:center; justify-content:center; background: #3b82f6; color:white; font-weight:700;">
                ${item.name.charAt(0)}
              </div>
              <div class="item-meta">
                <span class="item-name">${item.name}</span>
                <span class="item-sub">${item.forte || 'Selection'}</span>
              </div>
            `;
        }
      } else {
        div.className = 'dropdown-item';
        div.textContent = item;
      }

      div.onmousedown = (e) => {
        e.preventDefault();
        skipNextInput = true; // Set flag before updating value 🚩
        input.value = itemName;
        closeDropdown();
        input.dispatchEvent(new Event('input'));
        input.dispatchEvent(new Event('change'));
      };

      dropdown.appendChild(div);
    });

    dropdown.classList.add('open');
  };

  input.addEventListener('input', () => {
    if (skipNextInput) {
      skipNextInput = false; // Reset and ignore this event ⚓
      return;
    }
    const options = getOptions(input.value.toLowerCase());
    renderOptions(options);
  });

  input.addEventListener('focus', () => {
    const options = getOptions(input.value.toLowerCase());
    renderOptions(options);
  });

  input.addEventListener('click', () => {
    if (!dropdown.classList.contains('open')) {
      const options = getOptions(input.value.toLowerCase());
      renderOptions(options);
    }
  });

  input.addEventListener('blur', () => {
    setTimeout(closeDropdown, 200);
  });
}

function getSubjectOptions(query) {
  if (!selected || !selected.id) return [];
  const sched = schedules.find(s => s.id === selected.id);
  const schedSection = (sched ? (sched.section || "") : "").toUpperCase();
  const strand = getStrandFromSection(schedSection);

  // --- 1. Identify Year Level 🎯 ---
  let levelMatch = schedSection.match(/[A-Z]+(\d{1,2})/);
  let sectionLevel = levelMatch ? levelMatch[1] : "";

  function matchesLevel(termName) {
      if (!sectionLevel) return true;
      const t = termName.toUpperCase();
      if (sectionLevel === "11") return t.includes("G11") || t.includes("GRADE 11");
      if (sectionLevel === "12") return t.includes("G12") || t.includes("GRADE 12");
      if (sectionLevel === "1") return t.includes("FIRST YEAR") || t.includes("1ST YEAR");
      if (sectionLevel === "2") return t.includes("SECOND YEAR") || t.includes("2ND YEAR");
      if (sectionLevel === "3") return t.includes("THIRD YEAR") || t.includes("3RD YEAR");
      if (sectionLevel === "4") return t.includes("FOURTH YEAR") || t.includes("4TH YEAR");
      return true;
  }

  let options = [];

  // 1. COLLECT ALL SUBJECTS BY TERM 🚀
  if (dynamicSubjects.length > 0) {
      // We search through ALL courses but focus on the ones that match our Level
      // and either our Strand OR are "CORE"/"APPLIED" (which usually have their own course docs or are inside strands)
      
      const shsStrands = ["ICT", "ABM", "STEM", "HUMSS", "GAS", "HE"];
      const isSHS = sectionLevel === "11" || sectionLevel === "12";

      // Filter courses to only include the relevant one + Core/Applied
      const relevantCourses = dynamicSubjects_raw.filter(c => {
          const cName = c.name.toUpperCase();
          const strandName = strand ? strand.toUpperCase() : "";
          
          // Match main strand
          if (cName === strandName || (strandName === "ICT" && (cName.includes("ICT") || cName.includes("ITM")))) return true;
          
          // Match Core/Applied
          if (cName === "CORE" || cName === "APPLIED") return true;

          return false;
      });

      // Grouping by "Simplified Term Name" (e.g., "FIRST TERM", "SECOND TERM")
      // to merge subjects from different courses (Strand + Core) into the same term header
      const termGroups = {};

      relevantCourses.forEach(c => {
          if (c.terms) {
              Object.keys(c.terms).forEach(originalTermName => {
                  if (matchesLevel(originalTermName)) {
                      // Simplify "ICT G11 FIRST TERM" -> "FIRST TERM"
                      let simpleTerm = originalTermName.toUpperCase();
                      if (simpleTerm.includes("FIRST TERM") || simpleTerm.includes("TERM 1") || simpleTerm.includes("1ST TERM")) simpleTerm = "FIRST TERM";
                      else if (simpleTerm.includes("SECOND TERM") || simpleTerm.includes("TERM 2") || simpleTerm.includes("2ND TERM")) simpleTerm = "SECOND TERM";
                      else if (simpleTerm.includes("THIRD TERM") || simpleTerm.includes("TERM 3") || simpleTerm.includes("3RD TERM")) simpleTerm = "THIRD TERM";
                      
                      if (!termGroups[simpleTerm]) termGroups[simpleTerm] = new Set();
                      c.terms[originalTermName].forEach(s => termGroups[simpleTerm].add(s));
                  }
              });
          }
      });

      // Add to options with clean headers
      const sortedTerms = Object.keys(termGroups).sort((a, b) => {
          const order = { "FIRST TERM": 1, "SECOND TERM": 2, "THIRD TERM": 3 };
          return (order[a] || 99) - (order[b] || 99);
      });

      sortedTerms.forEach(termLabel => {
          options.push({ name: termLabel, isHeader: true });
          options.push(...Array.from(termGroups[termLabel]));
      });
  }

  // Fallback to static if still empty
  if (options.length === 0) {
      if (strand && SUBJECT_DATA[strand]) {
          options.push({ name: "MAJOR SUBJECTS", isHeader: true });
          options.push(...SUBJECT_DATA[strand]);
      }
      options.push({ name: "CORE & APPLIED", isHeader: true });
      options.push(...[...new Set([...SUBJECT_DATA.CORE, ...SUBJECT_DATA.APPLIED])]);
  }

  if (query) {
    const lowerQuery = query.toLowerCase();
    const filtered = [];
    
    options.forEach(item => {
      if (typeof item === 'object' && item.isHeader) {
        filtered.push(item);
      } else {
        const str = typeof item === 'object' ? item.name : item;
        if (str.toLowerCase().includes(lowerQuery)) {
          filtered.push(item);
        }
      }
    });

    return filtered.filter((item, index, arr) => {
      if (typeof item === 'object' && item.isHeader) {
        if (index === arr.length - 1) return false;
        if (typeof arr[index + 1] === 'object' && arr[index + 1].isHeader) return false;
      }
      return true;
    });
  }
  return options;
}

function getTeacherOptions(query) {
  const subjectName = (document.getElementById('subject').value || "").trim().toUpperCase();

  // 1. Identify Subject Category (Forte) dynamically
  let foundCategory = null;
  const dynamicSub = dynamicSubjects.find(s => s.name.toUpperCase() === subjectName);
  if (dynamicSub) {
    foundCategory = dynamicSub.category;
  } else {
      // Fallback to static check
      for (const [key, subjects] of Object.entries(SUBJECT_DATA)) {
        if (subjects.map(s => s.toUpperCase()).includes(subjectName)) {
          foundCategory = key;
          break;
        }
      }
  }

  // 2. Filter Teachers
  const relevantTeachers = teachers.filter(t => {
    // A. Direct Subject Match
    if (t.subjects && t.subjects.map(s => s.toUpperCase()).includes(subjectName)) return true;

    // B. Forte/Category Match
    const normalizedCat = (foundCategory === 'CORE' || foundCategory === 'APPLIED') ? 'GENERAL' : foundCategory;
    const teacherFortes = Array.isArray(t.forte) ? t.forte : [t.forte || "GENERAL"];
    
    const hasForteMatch = teacherFortes.some(f => {
        const normF = (f === 'CORE' || f === 'APPLIED') ? 'GENERAL' : f;
        return normalizedCat && normF === normalizedCat;
    });

    if (hasForteMatch) return true;

    // C. If no subject selected, return all
    if (!subjectName) return true;

    return false;
  });

  // 3. Return rich objects
  const results = relevantTeachers.map(t => ({
    name: t.name,
    avatar: t.avatar,
    forte: t.forte,
    type: 'teacher'
  }));

  // Deduplicate by name
  const seen = new Set();
  const distinct = results.filter(t => {
    const isDuplicate = seen.has(t.name);
    seen.add(t.name);
    return !isDuplicate;
  }).sort((a, b) => a.name.localeCompare(b.name));

  // 3. Deduction Logic
  // If the query IS an exact teacher name, returning ONLY that teacher feels like suggestions are "gone"
  // So if there's an exact match and query is length > 3, we still show other relevant teachers
  if (query) {
    const filtered = distinct.filter(n => n.name.toLowerCase().includes(query));
    // If it's a very specific exact match, let's also keep others available
    if (filtered.length === 1 && filtered[0].name.toLowerCase() === query) {
      return distinct; // Show all relevant ones if exact match (so user can pick someone else)
    }
    return filtered;
  }
  return distinct;
}

function getRoomOptions(query) {
  const options = allRooms.map(room => {
    const nameUpper = room.name.toUpperCase();
    let roomTypeLabel = 'Lecture Room';

    if (room.type === 'laboratory' || /LAB|MAC|CISCO|PROGRAMMING/i.test(nameUpper)) {
      roomTypeLabel = 'Laboratory';
      if (/COM|MAC|PROGRAMMING/i.test(nameUpper)) roomTypeLabel = 'Computer Laboratory';
    } else if (/BARA|BAR|KITCHEN|CUISINE|HOSPI|RESTAURANT/i.test(nameUpper)) {
      roomTypeLabel = 'Hospitality Lab';
    } else if (/COURT|MPH|GYM|PE|QUAD/i.test(nameUpper)) {
      roomTypeLabel = 'Sports & Events Facility';
    } else if (/AVR|AUDIO|VISUAL/i.test(nameUpper)) {
      roomTypeLabel = 'Audio-Visual Room';
    } else if (/CLINIC/i.test(nameUpper)) {
      roomTypeLabel = 'Clinic';
    } else if (/OFFICE|FACULTY/i.test(nameUpper)) {
      roomTypeLabel = 'Faculty / Office';
    }

    return {
      name: room.name,
      type: 'room',
      occupancy: roomOccupancies[room.name] || roomOccupancies[room.name.trim()] || 0,
      roomType: roomTypeLabel,
      floor: room.floor
    };
  });

  // SORTING LOGIC: Lecture Rooms FIRST (by floor/name), everything else at the DULO.
  options.sort((a, b) => {
    const aIsSpecialized = a.roomType !== 'Lecture Room';
    const bIsSpecialized = b.roomType !== 'Lecture Room';

    // 1. Non-specialized (Lecture Rooms) come first
    if (aIsSpecialized !== bIsSpecialized) return aIsSpecialized ? 1 : -1;

    // 2. Sort by floor
    if (a.floor !== b.floor) return a.floor - b.floor;

    // 3. Numeric name sorting (e.g., 101 before 102)
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
  });

  if (query) {
    return options.filter(r => r.name.toLowerCase().includes(query));
  }
  return options;
}


function renderTable() {
  if (!tbody || !colgroup || !theadTr) {
    console.warn("SchedSync: renderTable aborted - table elements missing.");
    return;
  }
  console.log("SchedSync: renderTable started...");
  tbody.innerHTML = "";

  /* 🔑 Standardized Days 🦾⚓ */
  DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  /* HEADERS */
  colgroup.innerHTML = `<col class="sticky-col-1"><col class="sticky-col-2">`;
  theadTr.innerHTML = `<th class="sticky-col-1">SCHEDULE</th><th class="sticky-col-2">TIME</th>`;
  DAYS.forEach(d => {
    colgroup.insertAdjacentHTML("beforeend", `<col class="day">`);
    theadTr.insertAdjacentHTML("beforeend", `<th>${d.slice(0, 3).toUpperCase()}</th>`);
  });

  schedules.sort((a, b) =>
    cleanSection(a.section).localeCompare(cleanSection(b.section))
  );

  /* 🔑 DYNAMIC MATRIX SYSTEM */
  // 1. Collect all time points from existing classes OR standard defaults
  const timePoints = new Set();

  // A. Add Standard Defaults (7:30 start, 1.5h intervals until 8:00 PM)
  // 7:30 = 450
  // 9:00 = 540
  // ...
  const START_MIN = 450;
  const END_MIN = 1080; // 6:00 PM 🦈
  const INTERVAL = 90;

  for (let m = START_MIN; m <= END_MIN; m += INTERVAL) {
    timePoints.add(m);
  }

  // B. Add From Classes (Start and End times)
  schedules.forEach(s => {
    (s.classes || []).forEach(c => {
      // Logic Only pull points from ACTUAL classes or marked vacant spots within valid bounds.
      // 420 mins = 7:00 AM. Ignore anything earlier as "noise" unless valid
      const block = parseBlock(c.timeBlock);
      if (block.start >= 420 && block.start < 1260) timePoints.add(block.start);
      if (block.end > 420 && block.end <= 1260) timePoints.add(block.end);
    });
  });

  // C. Sort and Create Intervals
  const sortedPoints = Array.from(timePoints).sort((a, b) => a - b);
  const matrixIntervals = [];

  for (let i = 0; i < sortedPoints.length - 1; i++) {
    const start = sortedPoints[i];
    const end = sortedPoints[i + 1];
    if (start >= END_MIN) break; // Don't go beyond strict end if possible
    matrixIntervals.push({
      start: start,
      end: end,
      label: `${to12(toTime(start))} - ${to12(toTime(end))}`
    });
  }

  console.log(`SchedSync: matrixIntervals count: ${matrixIntervals.length}, schedules count: ${schedules.length}`);

  if (schedules.length === 0) {
    if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding: 40px; font-weight:800; color:#ef4444; background:rgba(239,68,68,0.05);">No schedules found. If this is unexpected, please refresh the page.</td></tr>';
    return;
  }

  schedules.forEach(s => {
    // SECTION HEADER ROW
    const headerRow = `
      <tr class="section-row">
        <td colspan="${DAYS.length + 2}" class="section-name" style="background: #ccfbf1 !important; padding: 0.45rem 1rem !important; border: 1px solid #000 !important; border-bottom: none !important;">
          <div style="display: flex; justify-content: space-between; align-items: center; position: sticky; left: 1rem; width: fit-content; max-width: calc(100vw - 300px);">
            <span style="font-weight: 700; font-size: 1.15rem; color: #000; text-transform: uppercase; letter-spacing: 0.5px; white-space: nowrap;">SECTION: GRADE 12 ${cleanSection(s.section)}</span>
            <div style="display: flex; gap: 0.8rem; margin-left: 2rem;">
              <button class="day-action" onclick="window.downloadSchedule('${s.id}')" title="Download This Section" style="background: #22c55e; color: white; border: 3px solid black; padding: 0.4rem 1.2rem; border-radius: 50px; cursor: pointer; box-shadow: 4px 4px 0px black; font-size: 0.85rem; font-weight: 700; display: flex; align-items: center; gap: 0.5rem; transition: all 0.2s;">
                <span style="font-size: 1rem;">📄</span> DOWNLOAD
              </button>
              <button class="day-action delete-target" onclick="window.clearSection('${s.id}')" title="Clear Entire Section" style="background: #ef4444; color: white; border: 3px solid black; padding: 0.4rem 1.2rem; border-radius: 50px; cursor: pointer; box-shadow: 4px 4px 0px black; font-size: 0.85rem; font-weight: 700; display: flex; align-items: center; gap: 0.5rem; transition: all 0.2s;">
                <span style="font-size: 1rem;">🗑️</span> CLEAR SECTION
              </button>
            </div>
          </div>
        </td>
      </tr>
    `;
    tbody.insertAdjacentHTML("beforeend", headerRow);

    // TOOLBAR ROW
    let toolbarHtml = `
      <tr class="toolbar-row" style="background: #a5f3fc;">
        <td colspan="2" style="position: sticky; left: 0; z-index: 90; background: #a5f3fc; text-align: center; font-size: 0.75rem; font-weight: 800; color: #000; border-right: 1px solid #000; border-bottom: 1px solid #000; vertical-align: middle; text-transform: uppercase; letter-spacing: 1px;">ACTIONS</td>
    `;
    DAYS.forEach(d => {
      const isPasteReady = copiedDayClasses && copiedDayClasses.length > 0;
      toolbarHtml += `
        <td style="border-bottom: 1px solid #000; border-right: 1px solid #000; text-align: center; vertical-align: middle; padding: 0.4rem;">
          <div class="day-actions" style="display: flex; justify-content: center; gap: 1rem;">
            <span class="day-action" onclick="window.copyDayInSection('${s.id}', '${d}')" title="Copy ${d} in ${s.section}" style="cursor: pointer; font-size: 1.4rem; transition: transform 0.2s;" onmouseover="this.style.transform='scale(1.2) rotate(5deg)'" onmouseout="this.style.transform='scale(1)'">📋</span>
            <span class="day-action paste ${isPasteReady ? 'ready' : ''}" onclick="window.pasteDayToSection('${s.id}', '${d}')" title="Paste to ${d} in ${s.section}" style="cursor: pointer; font-size: 1.4rem; transition: transform 0.2s;" onmouseover="this.style.transform='scale(1.2) rotate(-5deg)'" onmouseout="this.style.transform='scale(1)'">📥</span>
            <span class="day-action delete-target" onclick="window.clearDayInSection('${s.id}', '${d}')" title="Clear ${d} in ${s.section}" style="cursor: pointer; font-size: 1.4rem; transition: transform 0.2s;" onmouseover="this.style.transform='scale(1.2) rotate(5deg)'" onmouseout="this.style.transform='scale(1)'">🗑️</span>
          </div>
        </td>
      `;
    });
    toolbarHtml += `</tr>`;
    tbody.insertAdjacentHTML("beforeend", toolbarHtml);

    // RENDER ROWS (Using Matrix Intervals)
    matrixIntervals.forEach((interval, i) => {
      const tr = document.createElement("tr");

      if (i === 0) {
        tr.innerHTML = `
          <td rowspan="${matrixIntervals.length}" class="sticky-col-1">
            <div style="display: flex; align-items: center; gap: 4px; margin-bottom: 4px;">
              ${s.scheduleType === 'exam'
            ? '<span style="background: #fef3c7; color: #92400e; border: 1.5px solid #92400e; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 900; letter-spacing: 0.5px; text-transform: uppercase;">⚠️ EXAM</span>'
            : '<span style="background: #dcfce7; color: #166534; border: 1.5px solid #166534; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 900; letter-spacing: 0.5px; text-transform: uppercase;">REGULAR</span>'
          }
            </div>
            <strong style="font-weight: 700;">${s.scheduleName || "Untitled Schedule"}</strong><br>
            <span style="font-size:13px;opacity:.7">
              ${cleanSection(s.section)}
            </span>
          </td>
          <td class="time-cell sticky-col-2">${interval.label}</td>
        `;
      } else {
        tr.innerHTML = `<td class="time-cell sticky-col-2">${interval.label}</td>`;
      }

      DAYS.forEach(day => {
        const activeDays = (s.selectedDays || []).map(d => normalizeDay(d));
        const isSelectedDay = activeDays.includes(normalizeDay(day));

        // 🧪 Logic:
        // 1. Is there a class STARTING exactly at interval.start? -> Render it with rowspan.
        // 2. Is there a class currently SPANNING this interval (started earlier)? -> Skip render.
        // 3. Else -> Render empty cell.

        const c = (s.classes || []).find(classItem => {
          const block = parseBlock(classItem.timeBlock);
          return normalizeDay(classItem.day) === normalizeDay(day) && block.start === interval.start;
        });

        const isOccupiedByPrevious = (s.classes || []).some(classItem => {
          const block = parseBlock(classItem.timeBlock);
          return normalizeDay(classItem.day) === normalizeDay(day) && block.start < interval.start && block.end > interval.start;
        });

        if (isOccupiedByPrevious) {
          // Merged visually
          return;
        }

        const td = document.createElement("td");
        td.dataset.schedId = s.id;
        td.dataset.day = day;
        td.dataset.start = interval.start;
        td.dataset.block = `${toTime(interval.start)}-${toTime(interval.end)}`; // Default to this interval

        let clickBlock = td.dataset.block;

        if (c) {
          const block = parseBlock(c.timeBlock);

          // Calculate RowSpan based on how many MATRIX intervals this class covers
          let spanCount = 0;
          const currentIdx = matrixIntervals.findIndex(m => m.start === interval.start);

          if (currentIdx !== -1) {
            for (let k = currentIdx; k < matrixIntervals.length; k++) {
              const m = matrixIntervals[k];
              // 🔑 Resilient RowSpan Calculation ⚓
              // If the interval starts before the class ends, it must be covered by the rowspan.
              // This MUST match the isOccupiedByPrevious logic exactly to prevent shifting.
              if (m.start < block.end) {
                spanCount++;
              } else {
                break;
              }
            }
          }
          const isVacant = c.subject === "VACANT" || c.subject === "MARKED_VACANT";
          // Allow rowSpan for all vacant blocks 🦈
          if (spanCount > 1) td.rowSpan = spanCount;

          clickBlock = c.timeBlock;

          // Legacy "VACANT" check: Treat as empty
          if (c.subject && c.subject !== "VACANT" && c.subject !== "MARKED_VACANT") {
            td.innerHTML = `
              <div style="display: flex; flex-direction: column; gap: 0.2rem;">
                <strong style="font-size: 1.05rem; font-weight: 800; line-height: 1.2; color: #1e293b; text-transform: uppercase;">${c.subject}</strong>
                <span style="font-size: 0.85rem; font-weight: 600; color: #334155; opacity: 0.95;">${c.teacher}</span>
                <span style="font-size: 0.85rem; font-weight: 800; color: #1e293b;">${(c.room || "").replace(/\s*\|?\s*\d{1,3}%\s*(?:OCCUPIED)?$/i, "").trim()}</span>
              </div>
            `;
            td.classList.add("occupied");
            td.style.padding = "0.6rem 0.4rem";

            // Apply Custom Color
            if (c.color && c.color !== '#bfdbfe') {
              td.style.setProperty('background-color', c.color, 'important');
              td.style.setProperty('color', '#000000', 'important');
              td.style.setProperty('border-right', '1px solid #000', 'important'); td.style.setProperty('border-bottom', '1px solid #000', 'important');
              td.style.setProperty('border-radius', '0', 'important');
            }

            if (currentUserRole !== 'student') td.setAttribute('draggable', 'true');
          } else if (c.subject === "MARKED_VACANT") {
            td.innerHTML = `<strong style="font-size: 0.85rem; font-weight: 800; color: #1e40af; letter-spacing: 0.75px;">VACANT</strong>`;
            td.classList.add("vacant-marked");
            td.style.padding = "0.45rem";

            // Apply Custom Color 🎨
            if (c.color && c.color !== '#bfdbfe') {
              td.style.setProperty('background-color', c.color, 'important');
              td.style.setProperty('color', '#000000', 'important');
              td.style.setProperty('border-right', '1px solid #000', 'important'); td.style.setProperty('border-bottom', '1px solid #000', 'important');
              td.style.setProperty('border-radius', '0', 'important');
            }

            if (currentUserRole !== 'student') td.setAttribute('draggable', 'true');
          }

          td.dataset.block = c.timeBlock;
        } else {
          td.classList.add("vacant-empty");
          // If the day is NOT in the selected set, add a visual hint 🦈
          if (!isSelectedDay) {
            td.classList.add("inactive-day-hint");
          }
        }

        td.onclick = async () => {
          // 1. Resilient Role Detection 🛡️
          const rawRole = currentUserRole || localStorage.getItem('userRole');
          const role = (rawRole || "").toLowerCase();
          const hasEditPermission = localStorage.getItem('editPermission') === 'true';

          // If teacher without permission, only show comment panel 🛡️
          if (role === 'teacher' && !hasEditPermission) {
            window.openCommentPanel(s.id, day, clickBlock, 'force');
            return;
          }

          // For everyone else
          openPanel(s.id, day, clickBlock);
        };

        // --- Comment Bubbles ---
        if (typeof comments !== 'undefined' && Array.isArray(comments)) {
          // Visibility Rules 🦈
          const isAdmin = (currentUserRole || "").toLowerCase() === 'admin';
          const isOwner = s.userId === currentUser?.uid;

          // Check if current user is a participant
          const normBlock = normalizeTimeBlock(clickBlock);

          const allCellComments = comments.filter(com =>
            com.schedId === s.id &&
            normalizeDay(com.day) === normalizeDay(day) &&
            normalizeTimeBlock(com.block) === normBlock
          );
          const isParticipant = allCellComments.some(com => com.userId === currentUser?.uid);

          // Authorized if Admin, Owner, or Participant ⚓
          const cellComments = (isAdmin || isOwner || isParticipant) ? allCellComments : [];

          // Only show count for UNSEEN comments on NON-VACANT cells 👁️🧹
          const unseenComments = cellComments.filter(com => !(com.seenBy || []).includes(currentUser?.uid));
          const isActuallyVacant = td.classList.contains("vacant-empty") || td.classList.contains("vacant-marked");

          if (unseenComments.length > 0 && !isActuallyVacant) {
            const badge = document.createElement('div');
            badge.className = 'comment-indicator';
            badge.textContent = unseenComments.length;
            badge.style.zIndex = '100';
            badge.style.top = '2px'; // Move inside 🏠
            badge.style.right = '2px';
            badge.setAttribute('draggable', 'false');

            badge.onclick = (e) => {
              e.preventDefault();
              e.stopPropagation();
              window.openCommentPanel(s.id, day, clickBlock, true); // Pass true ✅
            };

            badge.title = cellComments.map(c => `${c.username}: ${c.text}`).join('\n');
            td.appendChild(badge);
          }
        }

        tr.appendChild(td);
      });

      tbody.appendChild(tr);
    });
  });

  if (!tbody.dataset.dragListenersAttached) {
    tbody.addEventListener('dragstart', handleDragStart);
    tbody.addEventListener('dragover', handleDragOver);
    tbody.addEventListener('dragleave', handleDragLeave);
    tbody.addEventListener('drop', handleDrop);
    tbody.addEventListener('dragend', handleDragEnd);
    tbody.dataset.dragListenersAttached = "true";
  }
}

// ───────── PANEL ───────── */
function openPanel(id, day, block) {
  // Guard! Permissions Check
  const hasPermission = localStorage.getItem('editPermission') === 'true';
  if (currentUserRole === 'teacher' && !hasPermission) {
    showToast("You don't have edit permission. Click to leave a comment instead!", "info");
    return;
  }

  // Toggle active class on cells
  const allCells = document.querySelectorAll('td');
  allCells.forEach(td => td.classList.remove('active-cell'));

  // Find the clicked cell cleanly using data attributes 🎯
  const targetCell = Array.from(document.querySelectorAll('td')).find(td =>
    td.dataset.schedId === id &&
    normalizeDay(td.dataset.day) === normalizeDay(day) &&
    normalizeTimeBlock(td.dataset.block) === normalizeTimeBlock(block)
  );

  if (targetCell) {
    targetCell.classList.add('active-cell');
  }

  selected = { id, day, block };

  // Set dataset for comment switching 🔄
  panel.dataset.schedId = id;
  panel.dataset.day = day;
  panel.dataset.block = block;

  // Use class for SMOOTH DRAWING 🚀🦈
  panel.classList.add("open");

  // Force center on mobile/landscape to fix "Lower Right" bug ⚓🛡️
  if (window.innerWidth <= 768 || (window.innerWidth <= 950 && window.innerHeight < window.innerWidth)) {
    panel.style.left = '50%';
    panel.style.top = '45%'; 
    panel.style.transform = 'translate(-50%, -45%) scale(1)';
  }
  
  // Hide recommendations by default when opening 🛡️⚓
  const suggArea = document.getElementById('conflictSuggestionsArea');
  if (suggArea) suggArea.style.display = 'none';

  const sched = schedules.find(s => s.id === id);
  const c = (sched.classes || []).find(
    x => x.day === day && x.timeBlock === block
  );

  let subj = c?.subject || "";
  if (subj === "MARKED_VACANT" || subj === "VACANT") subj = "";
  document.getElementById("subject").value = subj;

  let tch = c?.teacher || "";
  if (tch === "NA") tch = "";
  document.getElementById("teacher").value = tch;
  document.getElementById("room").value = c?.room || "";

  const [startTime, endTime] = block.split("-");

  // Convert 24-hour time to 12-hour format and extract AM/PM
  const startHour = parseInt(startTime.split(":")[0]);
  const endHour = parseInt(endTime.split(":")[0]);

  const startAMPM = startHour >= 12 ? "PM" : "AM";
  const endAMPM = endHour >= 12 ? "PM" : "AM";

  const start12 = startHour > 12 ? startHour - 12 : (startHour === 0 ? 12 : startHour);
  const end12 = endHour > 12 ? endHour - 12 : (endHour === 0 ? 12 : endHour);

  document.getElementById("start").value = `${String(start12).padStart(2, "0")}:${startTime.split(":")[1]}`;
  document.getElementById("startAMPM").value = startAMPM;
  document.getElementById("end").value = `${String(end12).padStart(2, "0")}:${endTime.split(":")[1]}`;
  document.getElementById("endAMPM").value = endAMPM;

  // Color Handling
  const savedColor = c?.color || "";
  const colorSelect = document.getElementById("colorSelect");
  const colorPicker = document.getElementById("colorPicker");

  // Check if saved color matches a preset
  const presetOptions = Array.from(colorSelect.options).map(o => o.value);
  if (presetOptions.includes(savedColor) || savedColor === "") {
    colorSelect.value = savedColor;
    colorPicker.style.display = "none";
  } else {
    colorSelect.value = "custom";
    colorPicker.style.display = "block";
    colorPicker.value = savedColor;
  }

  // Handle Student Read-Only Mode
  if (currentUserRole === "student") {
    document.querySelector(".panel h2").textContent = "Class Details";
    document.getElementById("subject").disabled = true;
    document.getElementById("teacher").disabled = true;
    document.getElementById("room").disabled = true;
    document.getElementById("start").disabled = true;
    document.getElementById("end").disabled = true;
    document.getElementById("startAMPM").disabled = true;
    document.getElementById("endAMPM").disabled = true;

    // Hide edit/delete buttons
    document.querySelector(".save").style.display = "none";
    document.querySelector(".vacant-btn").style.display = "none";
    document.querySelector(".cancel").textContent = "Close";
    document.getElementById("deleteBtn").style.display = "none";
  } else {
    // Reset for teachers
    document.querySelector(".panel h2").textContent = "Edit Class";
    document.getElementById("subject").disabled = false;
    document.getElementById("teacher").disabled = false;
    document.getElementById("room").disabled = false;
    document.getElementById("start").disabled = false;
    document.getElementById("end").disabled = false;
    document.getElementById("startAMPM").disabled = false;
    document.getElementById("endAMPM").disabled = false;

    document.querySelector(".save").style.display = "inline-block";
    document.querySelector(".vacant-btn").style.display = "inline-block";
    document.querySelector(".cancel").textContent = "Cancel";

    // Show Delete Button if editing an existing class (Including Vacant)
    const currentSubject = document.getElementById("subject").value;
    const isVacant = c && (c.subject === "VACANT" || c.subject === "MARKED_VACANT");

    if (c && (currentSubject || isVacant)) {
      document.getElementById("deleteBtn").style.display = "inline-block";
    } else {
      document.getElementById("deleteBtn").style.display = "none";
    }
  }

  // --- TERMINOLOGY UPDATE (Teacher -> Proctor for Exam Scheds) ⚓ ---
  const teacherInput = document.getElementById("teacher");
  const teacherLabel = teacherInput?.parentElement?.previousElementSibling;

  if (sched.scheduleType === 'exam') {
    if (teacherLabel) teacherLabel.textContent = "Proctor";
    if (teacherInput) teacherInput.placeholder = "Search proctor...";
  } else {
    if (teacherLabel) teacherLabel.textContent = "Teacher";
    if (teacherInput) teacherInput.placeholder = "Search teacher...";
  }
}

function handleColorSelect() {
  const select = document.getElementById("colorSelect");
  const picker = document.getElementById("colorPicker");
  if (select.value === "custom") {
    picker.style.display = "block";
  } else {
    picker.style.display = "none";
  }
}
window.handleColorSelect = handleColorSelect;

function handleColorPicker() {
  // Placeholder 🎨
}
window.handleColorPicker = handleColorPicker;

/* ───────── SUGGESTION LOGIC ───────── */
async function findAvailableRooms(day, timeBlock, excludeSchedId, subjectName) {
  const unavailableRooms = new Set();
  const targetBlock = parseBlock(timeBlock);

  // 1. Check Local Schedules
  schedules.forEach(s => {
    (s.classes || []).forEach(c => {
      if (normalizeDay(c.day) === normalizeDay(day) && c.room && c.room !== "NA" && c.subject !== "VACANT" && c.subject !== "MARKED_VACANT") {
        if (s.id === excludeSchedId && normalizeDay(c.day) === normalizeDay(selected.day) && normalizeTimeBlock(c.timeBlock) === normalizeTimeBlock(selected.block)) return;

        if (overlaps(parseBlock(c.timeBlock), targetBlock)) {
          unavailableRooms.add(c.room.trim().toUpperCase());
        }
      }
    });
  });

  // 2. Check Firebase Published Schedules
  const snap = await getDocs(
    query(collection(db, "schedules"), where("status", "==", "published"))
  );

  snap.forEach(d => {
    if (d.id === excludeSchedId) return;
    if (schedules.some(s => s.id === d.id)) return;

    const data = d.data();
    (data.classes || []).forEach(c => {
      if (c.day === day && c.room && c.room !== "NA" && c.subject !== "VACANT" && c.subject !== "MARKED_VACANT") {
        if (overlaps(parseBlock(c.timeBlock), targetBlock)) {
          unavailableRooms.add(c.room.trim().toUpperCase());
        }
      }
    });
  });

  // 3. Filter allRooms based on Subject Category (Dynamic)
  let isICT = false;
  const upperSubj = (subjectName || "").toUpperCase();
  const dynamicSub = dynamicSubjects.find(s => s.name.toUpperCase() === upperSubj);
  const cat = dynamicSub ? dynamicSub.category : "";

  if (cat === "ICT" || cat === "BSCS" || cat === "BSIT" || cat === "MAWD") {
    isICT = true;
  } else if (/programming|computer|system|tech|web|animation|multimedia|design|app/i.test(upperSubj)) {
    isICT = true;
  }

  // 4. Final Filter
  const available = allRooms.filter(r => {
    const roomName = (typeof r === 'object' ? r.name : r).trim();
    const roomUpper = roomName.toUpperCase();
    if (unavailableRooms.has(roomUpper)) return false;

    // Filter Specialized Labs
    if (!isICT && /COMLAB|LAB|MAC|CISCO/i.test(roomUpper)) return false;

    return true;
  });

  return available.map(r => typeof r === 'object' ? r.name : r);
}

async function findAvailableTeachers(day, timeBlock, excludeSchedId, subjectName) {
  const unavailableTeachers = new Set();
  const targetBlock = parseBlock(timeBlock);

  // 1. Check Local Schedules
  schedules.forEach(s => {
    (s.classes || []).forEach(c => {
      if (c.day === day && c.teacher && c.teacher !== "NA" && c.subject !== "VACANT" && c.subject !== "MARKED_VACANT") {
        if (s.id === excludeSchedId && c.day === selected.day && c.timeBlock === selected.block) return;

        if (overlaps(parseBlock(c.timeBlock), targetBlock)) {
          unavailableTeachers.add(c.teacher.trim().toUpperCase());
        }
      }
    });
  });

  // 2. Check Firebase Published
  const snap = await getDocs(
    query(collection(db, "schedules"), where("status", "==", "published"))
  );

  snap.forEach(d => {
    if (d.id === excludeSchedId) return;
    if (schedules.some(s => s.id === d.id)) return;

    const data = d.data();
    (data.classes || []).forEach(c => {
      if (c.day === day && c.teacher && c.teacher !== "NA" && c.subject !== "VACANT" && c.subject !== "MARKED_VACANT") {
        if (overlaps(parseBlock(c.timeBlock), targetBlock)) {
          unavailableTeachers.add(c.teacher.trim().toUpperCase());
        }
      }
    });
  });

  // 3. Identify Subject Category (Dynamic)
  const upperSubj = (subjectName || "").toUpperCase();
  const dynamicSub = dynamicSubjects.find(s => s.name.toUpperCase() === upperSubj);
  let foundCategory = dynamicSub ? dynamicSub.category : null;

  if (!foundCategory) {
      for (const [key, subjects] of Object.entries(SUBJECT_DATA)) {
        if (subjects.map(s => s.toUpperCase()).includes(upperSubj)) {
          foundCategory = key;
          break;
        }
      }
  }

  // 4. Filter Available Teachers
  let filtered = teachers.filter(t => {
    if (unavailableTeachers.has(t.name.trim().toUpperCase())) return false;
    if (!subjectName) return true;

    // A. Direct Subject Match
    if (t.subjects && t.subjects.map(s => s.toUpperCase()).includes(upperSubj)) return true;

    // B. Category Match
    const normalizedCat = (foundCategory === 'CORE' || foundCategory === 'APPLIED') ? 'GENERAL' : foundCategory;
    const teacherFortes = Array.isArray(t.forte) ? t.forte : [t.forte || "GENERAL"];
    
    const hasForteMatch = teacherFortes.some(f => {
        const normF = (f === 'CORE' || f === 'APPLIED') ? 'GENERAL' : f;
        return normalizedCat && normF === normalizedCat;
    });

    return hasForteMatch;
  });

  // 🧪 FALLBACK: If no specialists found, suggest any free teacher 🦾
  if (filtered.length === 0 && subjectName) {
    filtered = teachers.filter(t => !unavailableTeachers.has(t.name.trim().toUpperCase())).slice(0, 3);
  }

  return filtered.map(t => t.name).slice(0, 5);
}

async function checkConflicts(newBlock, excludeId) {
  const results = {
    hasConflict: false,
    room: null,
    teacher: null,
    blueprint: null
  };

  // 1. Room Conflict
  const roomConflict = await hasRoomConflict(newBlock, excludeId);
  if (roomConflict) {
    results.hasConflict = true;
    results.room = roomConflict.msg;
  }

  // 2. Teacher Conflict
  const teacherConflict = await hasTeacherConflict(newBlock, excludeId);
  if (teacherConflict) {
    results.hasConflict = true;
    results.teacher = teacherConflict.msg;
  }

  // 3. Blueprint (Section) Conflict
  const blueprintConflict = await hasBlueprintConflict(newBlock, excludeId);
  if (blueprintConflict) {
    results.hasConflict = true;
    results.blueprint = blueprintConflict;
  }

  return results;
}

/* ───────── SAVE ───────── */
async function saveClass() {
  if (isSaving) {
    showToast("Save in progress, please wait... ⏳", "info");
    return;
  }

  const saveBtn = document.querySelector('button[onclick="saveClass()"]');
  const originalBtnText = saveBtn ? saveBtn.innerHTML : "";

  try {
    isSaving = true;
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.innerHTML = "Saving...";
    }

    pushToHistory(); // Capture state before modification ⚓
    if (currentUserRole === 'teacher' && localStorage.getItem('editPermission') !== 'true') {
      if (window.requestEditPermission) window.requestEditPermission();
      else alert("Please request permission to edit!");
      return;
    }
    const ref = doc(db, "schedules", selected.id);
    const sched = schedules.find(s => s.id === selected.id);

    // --- CAPTURE ORIGINAL STATE 📸 ---
    const originalBlock = (sched.classes || []).find(cl => cl.day === selected.day && cl.timeBlock === selected.block);

    /* ───────── VALIDATE TIME ───────── */
    const startRaw = document.getElementById("start").value;
    const startAMPM = document.getElementById("startAMPM").value;
    const endRaw = document.getElementById("end").value;
    const endAMPM = document.getElementById("endAMPM").value;

    const startMin = toMin(`${startRaw} ${startAMPM}`);
    const endMin = toMin(`${endRaw} ${endAMPM}`);
    const newParsed = { start: startMin, end: endMin };

    // Extend bounds slightly (e.g., 8:30 PM = 1230) to allow more flexibility
    if (endMin > 1230 || endMin <= startMin) {
      showToast("Class must end by 8:30 PM and after the start time 🦈🕔", "error");
      return;
    }

    let allClasses = sched.classes || [];
    let updated = allClasses.filter(
      c => !(c.day === selected.day && c.timeBlock === selected.block)
    );

    const overlappingBlocks = [];
    const nonOverlappingBlocks = [];

    updated.forEach(c => {
      if (c.day === selected.day) {
        const cParsed = parseBlock(c.timeBlock);
        if (overlaps(newParsed, cParsed)) overlappingBlocks.push(c);
        else nonOverlappingBlocks.push(c);
      }
    });

    const otherDayBlocks = updated.filter(c => c.day !== selected.day);

    let mergedSubject = (document.getElementById("subject").value || "").trim().toUpperCase();
    let mergedTeacher = (document.getElementById("teacher").value || "").trim().toUpperCase() || "NA";
    let mergedRoom = (document.getElementById("room").value || "").trim() || "NA";
    let mergedColor = document.getElementById("colorSelect").value === "custom"
      ? document.getElementById("colorPicker").value
      : document.getElementById("colorSelect").value;

    if (!mergedSubject && originalBlock && originalBlock.subject === "MARKED_VACANT") {
      mergedSubject = "MARKED_VACANT";
    }

    // IF SUBJECT IS STILL EMPTY -> WE CLEAR THE SLOT 👻
    if (!mergedSubject) {
      sched.classes = updated;
      closePanel();
      renderTable();

      await updateDoc(ref, { classes: updated });
      showToast("Slot cleared!", "success");
      return;
    }

    let minStart = newParsed.start;
    let maxEnd = newParsed.end;

    if (overlappingBlocks.length > 0) {
      overlappingBlocks.forEach(c => {
        const cParsed = parseBlock(c.timeBlock);
        minStart = Math.min(minStart, cParsed.start);
        maxEnd = Math.max(maxEnd, cParsed.end);

        if (!mergedSubject || mergedSubject === "VACANT" || mergedSubject === "MARKED_VACANT") {
          if (c.subject && c.subject !== "VACANT" && c.subject !== "MARKED_VACANT") {
            mergedSubject = c.subject;
            mergedTeacher = c.teacher;
            mergedRoom = c.room;
            if (c.color) mergedColor = c.color;
          }
        }
      });
    }

    const mergedBlock = {
      day: selected.day,
      timeBlock: `${toTime(startMin)}-${toTime(endMin)}`,
      subject: mergedSubject,
      teacher: mergedTeacher,
      room: mergedRoom,
      color: mergedColor
    };

    updated = [...nonOverlappingBlocks, ...otherDayBlocks, mergedBlock];

    if (mergedSubject !== "VACANT" && mergedSubject !== "MARKED_VACANT") {
      showToast("Checking for conflicts... ⚖️", "info");
      const conflicts = await checkConflicts(mergedBlock, selected.id);
      if (conflicts.hasConflict) {
        showConflictRecommendations(mergedBlock);

        let msg = "<div style='text-align: center; color: #ef4444; font-weight: 800; font-size: 1.1rem; margin-bottom: 10px;'>CONFLICT DETECTED! ⚠️</div>";
        if (conflicts.room) msg += `<div style='margin-bottom: 8px;'>${conflicts.room}</div>`;
        if (conflicts.teacher) msg += `<div style='margin-bottom: 8px;'>${conflicts.teacher}</div>`;
        if (conflicts.blueprint) msg += `<div style='margin-bottom: 8px;'>${conflicts.blueprint}</div>`;
        msg += "<div style='margin-top: 15px; font-size: 0.85rem; border-top: 1px solid #ddd; pt: 10px;'>Force save anyway?</div>";

        const proceed = await showConfirm("⚠️ ATTENTION", msg);

        if (!proceed) return;
      }
    }

    // Animation
    const panelEl = document.getElementById("panel");
    const subjectEl = document.getElementById("subject");
    const targetCell = document.querySelector(
      `td[data-sched-id="${selected.id}"][data-day="${selected.day}"][data-block="${selected.block}"]`
    );

    if (panelEl && targetCell) {
      const flyer = document.createElement("div");
      flyer.classList.add("flying-element");
      flyer.textContent = subjectEl.value || "Saved";
      document.body.appendChild(flyer);

      const startRect = panelEl.getBoundingClientRect();
      const endRect = targetCell.getBoundingClientRect();

      const startX = startRect.left + startRect.width / 2 - flyer.offsetWidth / 2;
      const startY = startRect.top + startRect.height / 2 - flyer.offsetHeight / 2;
      flyer.style.left = `${startX}px`;
      flyer.style.top = `${startY}px`;

      const endX = endRect.left + endRect.width / 2 - flyer.offsetWidth / 2;
      const endY = endRect.top + endRect.height / 2 - flyer.offsetHeight / 2;

      const animation = flyer.animate([
        { transform: 'translate(0, 0) scale(1)', opacity: 1, offset: 0 },
        { transform: `translate(${endX - startX}px, ${endY - startY}px) scale(0.4)`, opacity: 1, offset: 0.6 },
        { transform: `translate(${endX - startX}px, ${endY - startY}px) scale(1.6)`, opacity: 1, offset: 0.75 },
        { transform: `translate(${endX - startX}px, ${endY - startY}px) scale(0.9)`, opacity: 0.8, offset: 0.9 },
        { transform: `translate(${endX - startX}px, ${endY - startY}px) scale(0.1)`, opacity: 0, offset: 1 }
      ], { duration: 650, easing: 'ease-out' });

      await animation.finished;
      flyer.remove();
    }

    sched.classes = updated;
    closePanel();
    renderTable();

    if (typeof updateRoomSelectionOccupancies === 'function') {
      updateRoomSelectionOccupancies();
    }

    // --- LOG HISTORY 📜🕰️ ---
    const historyEntry = {
      user: currentUser.displayName || currentUser.email || "Anonymous",
      userId: currentUser.uid,
      action: `${originalBlock ? 'Edited' : 'Added'} ${mergedBlock.day} ${mergedBlock.timeBlock} (${mergedBlock.subject})`,
      timestamp: Date.now()
    };

    const detailLog = [];
    if (originalBlock) {
      if ((originalBlock.subject || "").toUpperCase() !== (mergedBlock.subject || "").toUpperCase()) detailLog.push(`Subject: ${originalBlock.subject || 'Empty'} ➔ ${mergedBlock.subject}`);
      if ((originalBlock.teacher || "").toUpperCase() !== (mergedBlock.teacher || "").toUpperCase()) detailLog.push(`Teacher: ${originalBlock.teacher || 'NA'} ➔ ${mergedBlock.teacher}`);
      if (originalBlock.room !== mergedBlock.room) detailLog.push(`Room: ${originalBlock.room || 'NA'} ➔ ${mergedBlock.room}`);

      const oldColor = (originalBlock.color || "").toLowerCase();
      const newColor = (mergedBlock.color || "").toLowerCase();
      if (oldColor !== newColor) detailLog.push(`Color updated`);

      const oldTime = originalBlock.timeBlock;
      const newTime = mergedBlock.timeBlock;
      if (oldTime !== newTime) detailLog.push(`Time: ${oldTime} ➔ ${newTime}`);
    } else {
      detailLog.push(`New Schedule Added:`);
      detailLog.push(`Subject: ${mergedBlock.subject}`);
      detailLog.push(`Teacher: ${mergedBlock.teacher}`);
      detailLog.push(`Room: ${mergedBlock.room}`);
    }

    if (detailLog.length > 0) {
      historyEntry.details = detailLog.join(' | ');
    }

    await updateDoc(ref, {
      classes: updated,
      history: arrayUnion(historyEntry)
    });
    showToast("Schedule updated!", "success");

    const suggArea = document.getElementById('conflictSuggestionsArea');
    if (suggArea) suggArea.style.display = 'none';

    localStorage.removeItem('activeEditSession');
    document.querySelectorAll('.back-to-edit-btn').forEach(btn => btn.style.display = 'none');

    // --- AUDIT LOG 📜 ---
    const actionType = originalBlock ? "UPDATE_CLASS" : "ADD_CLASS";
    const detailMsg = `${actionType === 'ADD_CLASS' ? 'Added' : 'Updated'} class: ${mergedSubject} for ${selected.day} at ${selected.block}`;
    logAction(actionType, detailMsg, {
      scheduleId: selected.id,
      day: selected.day,
      timeBlock: selected.block,
      subject: mergedSubject,
      teacher: mergedTeacher,
      room: mergedRoom
    });

  } catch (err) {
    console.error("Save failed", err);
    showToast("Save failed, reloading...", "error");
    isLoaded = false;
    load();
  } finally {
    isSaving = false;
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.innerHTML = originalBtnText;
    }
  }
}

async function findAvailableSlots(teacher, room, excludeSchedId) {
  const DAYS_LIST = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const standardSlots = [
    "07:30 AM-09:00 AM",
    "09:00 AM-10:30 AM",
    "10:30 AM-12:00 PM",
    "01:00 PM-02:30 PM",
    "02:30 PM-04:00 PM",
    "04:00 PM-05:30 PM"
  ];

  const results = [];
  const sched = schedules.find(s => s.id === excludeSchedId);
  if (!sched) return [];

  // Use a faster check for bulk scanning
  const publishedSnap = await getPublishedSchedules();
  const publishedDocs = publishedSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  for (const day of DAYS_LIST) {
    for (const slot of standardSlots) {
      // Don't suggest the current slot if it's the one we are editing
      if (day === selected.day && slot === selected.block) continue;

      const testBlock = {
        day: day,
        timeBlock: slot,
        teacher: teacher,
        room: room,
        subject: "AVAILABILITY_CHECK"
      };

      const hasRoom = await hasRoomConflict(testBlock, excludeSchedId);
      if (hasRoom) continue;

      const hasTeacher = await hasTeacherConflict(testBlock, excludeSchedId);
      if (hasTeacher) continue;

      const hasSection = await hasBlueprintConflict(testBlock, excludeSchedId);
      if (hasSection) continue;

      results.push({ day, slot });
      if (results.length >= 6) return results;
    }
  }
  return results;
}

async function showConflictRecommendations(block) {
  const roomSugg = document.getElementById('roomSuggestions');
  const teacherSugg = document.getElementById('teacherSuggestions');
  const timeSugg = document.getElementById('timeSuggestions');
  const suggArea = document.getElementById('conflictSuggestionsArea');
  if (!roomSugg || !teacherSugg || !suggArea) return;

  roomSugg.innerHTML = '<div style="font-size: 0.75rem; color: #94a3b8;">Finding rooms...</div>';
  teacherSugg.innerHTML = '<div style="font-size: 0.75rem; color: #94a3b8;">Finding teachers...</div>';
  if (timeSugg) timeSugg.innerHTML = '<div style="font-size: 0.75rem; color: #94a3b8;">Scanning for free slots...</div>';
  suggArea.style.display = 'block';

  try {
    const recommendedRooms = await findAvailableRooms(block.day, block.timeBlock, selected.id, block.subject);
    const recommendedTeachers = await findAvailableTeachers(block.day, block.timeBlock, selected.id, block.subject);
    const recommendedTimes = await findAvailableSlots(block.teacher, block.room, selected.id);

    roomSugg.innerHTML = "";
    if (recommendedRooms.length > 0) {
      recommendedRooms.slice(0, 4).forEach(room => {
        const pill = document.createElement('div');
        pill.className = 'suggestion-pill';
        pill.innerHTML = `<span>📍</span> ${room}`;
        pill.onclick = () => {
          document.getElementById('room').value = room;
          showToast(`Applying Room: ${room}...`, "info");
          if (window.saveClass) window.saveClass();
        };
        roomSugg.appendChild(pill);
      });
    } else {
      roomSugg.innerHTML = '<div style="font-size: 0.75rem; color: #2563eb; font-weight: 700;">No vacant rooms found 🕸️</div>';
    }


    teacherSugg.innerHTML = "";
    if (recommendedTeachers.length > 0) {
      recommendedTeachers.forEach(t => {
        const pill = document.createElement('div');
        pill.className = 'suggestion-pill';
        pill.innerHTML = `<span>👤</span> ${t}`;
        pill.onclick = () => {
          document.getElementById('teacher').value = t;
          showToast(`Assigning Teacher: ${t}...`, "info");
          if (window.saveClass) window.saveClass();
        };
        teacherSugg.appendChild(pill);
      });
    } else {
      teacherSugg.innerHTML = '<div style="font-size: 0.75rem; color: #2563eb; font-weight: 700;">No available specialists found 🕸️</div>';
    }

    if (timeSugg) {
      timeSugg.innerHTML = "";
      if (recommendedTimes.length > 0) {
        recommendedTimes.forEach(res => {
          const pill = document.createElement('div');
          pill.className = 'suggestion-pill';
          pill.style.background = "#dcfce7"; // Light green for time suggestions
          pill.style.borderColor = "#22c55e";
          pill.innerHTML = `<span>📅</span> ${res.day.slice(0, 3)} ${res.slot.split('-')[0]}`;
          pill.onclick = () => {
            const [start, end] = res.slot.split('-');
            const [sTime, sAMPM] = start.trim().split(' ');
            const [eTime, eAMPM] = end.trim().split(' ');

            document.getElementById('start').value = sTime;
            document.getElementById('startAMPM').value = sAMPM;
            document.getElementById('end').value = eTime;
            document.getElementById('endAMPM').value = eAMPM;

            // Update selected block so save works correctly
            selected.day = res.day;
            // Note: block.timeBlock will be updated by saveClass from inputs

            showToast(`Moving to ${res.day} ${res.slot}...`, "info");
            if (window.saveClass) window.saveClass();
          };
          timeSugg.appendChild(pill);
        });
      } else {
        timeSugg.innerHTML = '<div style="font-size: 0.75rem; color: #2563eb; font-weight: 700;">No free slots found for this pairing 🕸️</div>';
      }
    }

  } catch (err) {
    console.error("Recommendations failed", err);
  }
}

function closePanel() {
  const panel = document.getElementById("panel");
  if (panel) panel.classList.remove("open");
  const overlay = document.getElementById('panelOverlay');
  if (overlay) overlay.style.display = "none";
  document.querySelectorAll('td').forEach(td => td.classList.remove('active-cell'));

  const suggArea = document.getElementById('conflictSuggestionsArea');
  if (suggArea) suggArea.style.display = 'none';
}

function markAsVacant() {
  if (currentUserRole === 'teacher' && localStorage.getItem('editPermission') !== 'true') {
    if (window.requestEditPermission) window.requestEditPermission();
    else showToast("Please request permission to edit!", "info");
    return;
  }
  document.getElementById("subject").value = "MARKED_VACANT";
  document.getElementById("teacher").value = "NA";
  document.getElementById("room").value = "";
  saveClass();
}

function deleteClass(targetEl = null) {
  if (currentUserRole === 'teacher' && localStorage.getItem('editPermission') !== 'true') {
    if (window.requestEditPermission) window.requestEditPermission();
    else showToast("Please request permission to edit!", "info");
    return;
  }

  const sched = schedules.find(s => s.id === selected.id);
  if (!sched) return;

  const currentClass = (sched.classes || []).find(x => x.day === selected.day && x.timeBlock === selected.block);
  const subjectName = currentClass?.subject || "VACANT";

  const performDelete = () => {
    pushToHistory(); // Capture state before modification ⚓
    
    const updatedClasses = (sched.classes || []).filter(
      c => !(c.day === selected.day && c.timeBlock === selected.block)
    );

    const cells = document.querySelectorAll(
      `td[data-sched-id="${selected.id}"][data-day="${selected.day}"][data-block="${selected.block}"]`
    );

    const deleteBtn = document.getElementById("deleteBtn");
    const actualTarget = targetEl || (deleteBtn && deleteBtn.offsetParent !== null ? deleteBtn : null);

    if (cells.length > 0 && actualTarget) {
      const originalText = actualTarget.textContent;
      const isHeaderTrash = actualTarget.classList.contains('day-action');

      if (isHeaderTrash) {
        actualTarget.style.transition = "transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275)";
        actualTarget.style.transform = "scale(1.5) rotate(-20deg)";
      } else {
        actualTarget.textContent = "🗑️";
        actualTarget.style.transform = "scale(1.2)";
        actualTarget.style.transition = "transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275)";
      }

      const flyer = document.createElement("div");
      flyer.className = "trash-flying-element";
      flyer.textContent = subjectName || "Deleting...";

      flyer.style.background = "#ef4444";
      flyer.style.color = "white";
      flyer.style.boxShadow = "0 8px 25px rgba(239, 68, 68, 0.6)";
      flyer.style.fontWeight = "900";
      flyer.style.border = "2px solid rgba(255,255,255,0.3)";
      flyer.style.fontSize = "16px";
      flyer.style.letterSpacing = "1px";
      flyer.style.textTransform = "uppercase";

      document.body.appendChild(flyer);

      const startRect = cells[0].getBoundingClientRect();
      const endRect = actualTarget.getBoundingClientRect();

      const startX = startRect.left + startRect.width / 2 - flyer.offsetWidth / 2;
      const startY = startRect.top + startRect.height / 2 - flyer.offsetHeight / 2;
      flyer.style.left = `${startX}px`;
      flyer.style.top = `${startY}px`;

      const endX = endRect.left + endRect.width / 2 - flyer.offsetWidth / 2;
      const endY = endRect.top + endRect.height / 2 - flyer.offsetHeight / 2;

      const shatterCell = cells[0];
      shatterCell.classList.add('shattering');

      const rect = shatterCell.getBoundingClientRect();
      const shardCount = 8;
      for (let i = 0; i < shardCount; i++) {
        const shard = document.createElement('div');
        shard.className = 'glass-shard';
        const size = Math.random() * 30 + 10;
        shard.style.width = `${size}px`;
        shard.style.height = `${size}px`;
        shard.style.left = `${rect.left + Math.random() * rect.width}px`;
        shard.style.top = `${rect.top + Math.random() * rect.height}px`;

        const dx = (Math.random() - 0.5) * 200;
        const dy = (Math.random() - 0.5) * 200;
        const rot = (Math.random() - 0.5) * 720;

        shard.style.setProperty('--dx', `${dx}px`);
        shard.style.setProperty('--dy', `${dy}px`);
        shard.style.setProperty('--rot', `${rot}deg`);
        shard.style.clipPath = `polygon(${Math.random() * 100}% ${Math.random() * 100}%, ${Math.random() * 100}% ${Math.random() * 100}%, ${Math.random() * 100}% ${Math.random() * 100}%)`;

        document.body.appendChild(shard);
        setTimeout(() => shard.remove(), 700);
      }

      const dxFinal = endX - startX;
      const dyFinal = endY - startY;
      const angle = Math.atan2(dyFinal, dxFinal) * (180 / Math.PI);

      flyer.animate([
        { transform: `translate(0, 0) scale(1) rotate(0deg)`, opacity: 1 },
        { transform: `translate(${dxFinal * 0.4}px, ${dyFinal * 0.4}px) scaleX(1.4) scaleY(0.7) rotate(${angle}deg)`, opacity: 1, offset: 0.4 },
        { transform: `translate(${dxFinal}px, ${dyFinal}px) scale(0) rotate(${angle + 720}deg)`, opacity: 0 }
      ], {
        duration: 500,
        easing: 'cubic-bezier(0.4, 0, 0.2, 1)'
      }).onfinish = () => {
        flyer.remove();
        const shock = document.createElement("div");
        shock.className = "shockwave-sharp";
        shock.style.left = `${endRect.left + endRect.width / 2}px`;
        shock.style.top = `${endRect.top + endRect.height / 2}px`;
        shock.style.width = "20px";
        shock.style.height = "20px";
        document.body.appendChild(shock);
        setTimeout(() => shock.remove(), 400);

        const flash = document.createElement("div");
        flash.className = "impact-flash";
        flash.style.left = shock.style.left;
        flash.style.top = shock.style.top;
        flash.style.width = "40px";
        flash.style.height = "40px";
        document.body.appendChild(flash);
        setTimeout(() => flash.remove(), 200);

        actualTarget.animate([
          { transform: 'scale(1)' },
          { transform: 'scale(1.4) rotate(-10deg)', filter: 'brightness(1.5)' },
          { transform: 'scale(1.4) rotate(10deg)' },
          { transform: 'scale(1)' }
        ], { duration: 250, easing: 'ease-out' });

        setTimeout(() => {
          actualTarget.style.transform = "";
          if (!isHeaderTrash) actualTarget.textContent = originalText;
        }, 300);

        setTimeout(() => {
          sched.classes = updatedClasses;
          closePanel();
          renderTable();
          if (typeof updateRoomSelectionOccupancies === 'function') {
            updateRoomSelectionOccupancies();
          }

          const historyEntry = {
            user: currentUser.displayName || currentUser.email || "Anonymous",
            userId: currentUser.uid,
            action: `Deleted class from ${selected.day} ${selected.block}`,
            timestamp: Date.now()
          };

          updateDoc(doc(db, "schedules", selected.id), {
            classes: updatedClasses,
            history: arrayUnion(historyEntry)
          }).then(() => {
            showToast("Class deleted!", "success");
            logAction("DELETE_CLASS", `Deleted class: ${subjectName} from ${selected.day} ${selected.block}`, {
              scheduleId: selected.id,
              day: selected.day,
              timeBlock: selected.block,
              subject: subjectName
            });
          }).catch(err => {
            console.error("Delete failed", err);
            showToast("Delete failed!", "error");
          });
        }, 100);
      };
    } else {
      sched.classes = updatedClasses;
      closePanel();
      renderTable();

      const historyEntry = {
        user: currentUser.displayName || currentUser.email || "Anonymous",
        userId: currentUser.uid,
        action: `Deleted class from ${selected.day} ${selected.block}`,
        timestamp: Date.now()
      };

      updateDoc(doc(db, "schedules", selected.id), {
        classes: updatedClasses,
        history: arrayUnion(historyEntry)
      }).then(() => {
        showToast("Class deleted!", "success");
        logAction("DELETE_CLASS", `Deleted class: ${subjectName} from ${selected.day} ${selected.block}`, {
          scheduleId: selected.id,
          day: selected.day,
          timeBlock: selected.block,
          subject: subjectName
        });
      }).catch(err => {
        console.error("Delete failed", err);
        showToast("Delete failed!", "error");
      });
    }
  };

  showConfirm("CONFIRM DELETE", `Delete this class (${subjectName}) from ${selected.day} at ${selected.block}?`).then(ok => {
    if (ok) performDelete();
  });
}


async function save() {
  if (currentUserRole === 'teacher' && localStorage.getItem('editPermission') !== 'true') {
    if (window.requestEditPermission) window.requestEditPermission();
    return;
  }
  if (!currentUser) {
    showToast("No user logged in", "error");
    return;
  }

  const confirmed = await showConfirm("PUBLISH CHANGES", "Are you sure you want to publish all changes to the official schedule? This will notify all users. 🚀");
  if (!confirmed) return;

  for (const s of schedules) {
    const isOverride = !!s.targetDate;
    const savePayload = {
      status: "published",
      updated: new Date().toDateString(),
      author: currentUser.displayName || currentUser.email,
      userId: currentUser.uid,
      targetDate: s.targetDate || null,
      classes: s.classes || []
    };

    if (isOverride && s.id === "TEMP_SYNC") {
      savePayload.scheduleName = s.scheduleName || "Temporary Override";
      savePayload.originalId = s.originalId || null;
      savePayload.section = s.section || "General";
      await addDoc(collection(db, "schedules"), savePayload);
    } else {
      await updateDoc(doc(db, "schedules", s.id), savePayload);
    }
  }

  // Notify 🦈
  if (schedules.length > 0) {
    const schedName = schedules[0].scheduleName || "New Schedule";
    await addDoc(collection(db, "notifications"), {
      title: "NEW SCHEDULE",
      message: `Success! The schedule for "${schedName}" is now officially published.`,
      sender: currentUser.displayName || currentUser.email || "System",
      createdAt: serverTimestamp(),
      isAnnouncement: true, 
    });

    logAction("PUBLISH_SCHEDULE", `Published schedule: ${schedName}`, {
      scheduleId: schedules[0].id,
      section: schedules[0].section
    });
  }

  localStorage.removeItem('activeEditSession');
  document.querySelectorAll('.back-to-edit-btn').forEach(btn => btn.style.display = 'none');
  window.location.href = 'myschedule.html';
}

function downloadSchedule(id, format = null, isBatch = false) {
  if (!format) {
    showDownloadFormatSelector((f) => downloadSchedule(id, f, false));
    return;
  }
  const sched = schedules.find(s => s.id === id);
  if (!sched) {
    showToast("Schedule not found.", "error");
    return;
  }

  if (format === 'pdf' && !window.html2pdf) {
    const script = document.createElement('script');
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js";
    script.onload = () => downloadSchedule(id, 'pdf', isBatch);
    document.head.appendChild(script);
    return;
  }
  if (format === 'image' && !window.html2canvas) {
    const script = document.createElement('script');
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
    script.onload = () => downloadSchedule(id, 'image', isBatch);
    document.head.appendChild(script);
    return;
  }
  if (format === 'excel' && !window.XLSX) {
    const script = document.createElement('script');
    script.src = "https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/dist/xlsx.bundle.js";
    script.onload = () => downloadSchedule(id, 'excel', isBatch);
    document.head.appendChild(script);
    return;
  }

  const overlay = document.createElement('div');
  overlay.id = "export-modal";
  overlay.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background: #005BAB; z-index: 2000000; display: flex; flex-direction: column;
      align-items: center; justify-content: flex-start; color: white;
      font-family: 'Segoe UI', system-ui, sans-serif; overflow-y: auto; padding: 40px 20px;
    `;

  overlay.innerHTML = `
      <div id="loader-status" style="text-align:center; margin-bottom: 30px;">
        <div style="font-size: 50px; margin-bottom: 20px; animation: maangas-pulse 1s infinite alternate;">${format === 'pdf' ? '📑' : '🖼️'}</div>
        <div style="font-size: 28px; font-weight: 800; margin-bottom: 10px; letter-spacing: 2px;">PREPARING ${format.toUpperCase()} EXPORT</div>
        <div style="font-size: 16px; opacity: 0.9;">Generating official document for <b>${sched.section || "Schedule"}</b>...</div>
        <div style="width: 300px; height: 6px; background: rgba(255,255,255,0.1); border-radius: 10px; overflow: hidden; border: 1px solid rgba(255,255,255,0.2); margin: 25px auto 0;">
          <div style="width: 100%; height: 100%; background: #FFD200; transform: translateX(-100%); animation: sti-progress 2s infinite ease-in-out;"></div>
        </div>
      </div>
      <div id="paper-container" style="background: white; color: #111; width: 1123px; padding: 50px; border-radius: 4px; box-shadow: 0 20px 50px rgba(0,0,0,0.4); transform: scale(0.65); transform-origin: top center; opacity: 1;">
      </div>
      <style>
        @keyframes sti-progress { 0% { transform: translateX(-100%); } 50% { transform: translateX(0); } 100% { transform: translateX(100%); } }
        @keyframes maangas-pulse { from { transform: scale(1); filter: drop-shadow(0 0 5px #FFD200); } to { transform: scale(1.1); filter: drop-shadow(0 0 15px #FFD200); } }
      </style>
    `;
  document.body.appendChild(overlay);

  const paper = overlay.querySelector('#paper-container');
  const bgColor = "#ffffff";
  const textColor = "#000000";
  const borderColor = "#005BAB";
  const gridColor = "#e2e8f0";
  const headerBg = "#f8fafc";
  const subTextColor = "#64748b";

  paper.style.backgroundColor = bgColor;
  paper.style.color = textColor;
  paper.style.fontFamily = "'Inter', 'Segoe UI', sans-serif";

  const daySet = new Set();
  (sched.selectedDays || []).forEach(d => { if (d) daySet.add(d); });
  (sched.classes || []).forEach(c => { if (c && c.day) daySet.add(c.day); });
  let localDays = Array.from(daySet);
  if (localDays.length === 0) localDays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
  const ORDER = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  localDays.sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));

  const timePoints = new Set();
  const START_MIN_EXPORT = 450;
  const END_MIN_EXPORT = 1080;
  const INTERVAL_EXPORT = 90;

  for (let m = START_MIN_EXPORT; m <= END_MIN_EXPORT; m += INTERVAL_EXPORT) timePoints.add(m);
  (sched.classes || []).forEach(c => {
    const block = parseBlock(c.timeBlock);
    timePoints.add(block.start);
    timePoints.add(block.end);
  });
  const sortedPoints = Array.from(timePoints).sort((a, b) => a - b);
  const matrixIntervals = [];
  for (let i = 0; i < sortedPoints.length - 1; i++) {
    const start = sortedPoints[i];
    const end = sortedPoints[i + 1];
    if (start >= END_MIN_EXPORT) break;
    matrixIntervals.push({
      start: start,
      end: end,
      label: `${to12(toTime(start))} - ${to12(toTime(end))}`
    });
  }

  const tableHeaderHtml = `
    <thead>
      <tr style="background: ${headerBg};">
        <th style="border: 1.5px solid ${gridColor}; border-bottom: 3px solid ${borderColor}; padding: 15px; color: ${borderColor}; font-weight: 950; text-transform: uppercase; font-size: 14px;">TIME BLOCK</th>
        ${localDays.map(d => `<th style="border: 1.5px solid ${gridColor}; border-bottom: 3px solid ${borderColor}; padding: 15px; color: ${borderColor}; font-weight: 950; text-transform: uppercase; font-size: 14px;">${d.toUpperCase()}</th>`).join('')}
      </tr>
    </thead>
  `;

  const headerHtml = `
      <div style="text-align: center; margin-bottom: 40px; border-bottom: 6px solid ${borderColor}; padding-bottom: 30px; position: relative;">
        <div style="position: absolute; top: 0; left: 0; font-size: 11px; color: ${subTextColor}; font-weight: 800; text-transform: uppercase; letter-spacing: 1px;">Official Academic Record</div>
        <div style="font-size: 14px; color: ${borderColor}; font-weight: 700; margin-bottom: 5px; letter-spacing: 2px;">STI COLLEGE SANTA MARIA</div>
        <h1 style="margin: 5px 0 10px; font-size: 42px; color: #0f172a; text-transform: uppercase; letter-spacing: 3px; font-weight: 950; line-height: 1;">CLASS SCHEDULE</h1>
        <div style="display: flex; justify-content: center; gap: 15px; align-items: center; margin-top: 15px;">
          <span style="font-size: 18px; color: #000; font-weight: 900; background: #FFD200; padding: 6px 30px; border-radius: 4px; box-shadow: 4px 4px 0 rgba(0,91,171,0.2);">SECTION: ${sched.section || "N/A"}</span>
          <span style="font-size: 14px; color: #64748b; font-weight: 700; border: 1px solid #e2e8f0; padding: 4px 15px; border-radius: 4px;">AY 2025-2026</span>
        </div>
      </div>
    `;

  let tableContent = "";
  matrixIntervals.forEach((interval, i) => {
    let rowHtml = `<tr style="min-height: 80px;">`;
    rowHtml += `<td style="background: ${headerBg}; color: ${borderColor}; font-weight: 950; font-size: 14px; text-align: center; border: 1.5px solid ${gridColor}; padding: 15px; min-width: 140px;">${interval.label}</td>`;

    localDays.forEach(day => {
      const c = (sched.classes || []).find(classItem => {
        const block = parseBlock(classItem.timeBlock);
        return classItem.day === day && block.start === interval.start;
      });

      const isOccupiedByPrevious = (sched.classes || []).some(classItem => {
        const block = parseBlock(classItem.timeBlock);
        return classItem.day === day && block.start < interval.start && block.end > interval.start;
      });

      if (isOccupiedByPrevious) return;

      let style = `text-align: center; vertical-align: middle; min-width: 150px; font-weight: 700; padding: 10px; position: relative;`;
      let content = "";
      let rowspanAttr = "";

      if (c) {
        const block = parseBlock(c.timeBlock);
        let spanCount = 0;
        const currentIdx = matrixIntervals.findIndex(m => m.start === interval.start);
        if (currentIdx !== -1) {
          for (let k = currentIdx; k < matrixIntervals.length; k++) {
            const m = matrixIntervals[k];
            if (m.start >= block.start && m.end <= block.end) spanCount++;
            else break;
          }
        }
        if (spanCount > 1) rowspanAttr = `rowspan="${spanCount}"`;

        if (c.subject === "MARKED_VACANT") {
          const isDefault = !c.color || c.color === '#bfdbfe' || c.color === '#93c5fd';
          const bgColorCell = isDefault ? "#93c5fd" : c.color;
          const textColorCell = isDefault ? "#1e3a8a" : "#000000";
          style += `background: ${bgColorCell} !important; color: ${textColorCell} !important; border-bottom: 1.5px solid #94a3b8 !important; border-right: 1.5px solid #94a3b8 !important; box-shadow: inset 6px 0 0 rgba(0,0,0,0.2) !important; border-radius: 0 !important;`;
          content = `<div style="font-size: 10px; letter-spacing: 1.5px; font-weight: 700;">VACANT</div>`;
        } else if (c.subject && c.subject !== "VACANT") {
          const isDefaultBlue = !c.color || c.color === '#bfdbfe' || c.color === '#93c5fd';
          const bgColorCell = isDefaultBlue ? "#93c5fd" : c.color;
          const textColorCell = isDefaultBlue ? "#1e3a8a" : "#000000";
          style += `background: ${bgColorCell} !important; color: ${textColorCell} !important; border-bottom: 1.5px solid #94a3b8 !important; border-right: 1.5px solid #94a3b8 !important; box-shadow: inset 6px 0 0 rgba(0,0,0,0.2) !important; border-radius: 0 !important;`;
          content = `
            <div style="font-weight: 750; font-size: 15px; line-height: 1.1; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.2px;">${c.subject}</div>
            <div style="font-size: 11px; font-weight: 600; opacity: 0.8; margin-bottom: 4px;">${c.teacher}</div>
            <div style="background: rgba(0,0,0,0.05); display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 750; letter-spacing: 0.3px;">
              Room ${c.room}
            </div>
          `;
        }
      } else {
        style += `background: #ffffff; border-right: 1.5px solid #94a3b8; border-bottom: 1.5px solid #94a3b8;`;
        content = "";
      }
      rowHtml += `<td ${rowspanAttr} style="${style}">${content}</td>`;
    });
    rowHtml += `</tr>`;
    tableContent += rowHtml;
  });

  paper.innerHTML = `
      <div style="position: absolute; top:0; left:0; right:0; bottom:0; opacity: 0.05; pointer-events:none; background-image: radial-gradient(${borderColor} 2px, transparent 2px); background-size: 30px 30px;"></div>
      ${headerHtml}
      <table style="width: 100%; border-collapse: collapse; border: 2.5px solid ${borderColor};">
        ${tableHeaderHtml}
        <tbody>
          ${tableContent}
        </tbody>
      </table>
      <div style="margin-top: 40px; border-top: 2px solid ${gridColor}; padding-top: 20px; display: flex; justify-content: space-between; font-size: 12px; color: ${subTextColor}; font-weight: 800;">
        <div>STI SCHEDSYNC • OFFICIAL ACADEMIC EXPORT</div>
        <div style="text-align: right;">DOCUMENT ID: <span style="color: #005BAB; font-family: monospace;">${sched.id.toUpperCase().substring(0, 12)}...</span></div>
      </div>
    `;

  setTimeout(async () => {
    overlay.querySelector('#loader-status').innerHTML = `
        <div style="font-size: 50px; margin-bottom: 20px;">✅</div>
        <div style="font-size: 28px; font-weight: 800; margin-bottom: 10px; letter-spacing: 2px; color: #fbbf24;">CAPTURE READY</div>
        <div style="font-size: 16px; opacity: 0.9;">Exporting minimalistic ${format.toUpperCase()}...</div>
      `;

    try {
      if (format === 'pdf') {
        const opt = {
          margin: 10, filename: `${sched.section || 'Schedule'}_Export.pdf`,
          image: { type: 'jpeg', quality: 1.0 },
          html2canvas: { scale: 2, useCORS: true, logging: false },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' }
        };
        await html2pdf().set(opt).from(paper).save();
      } else if (format === 'image') {
        const canvas = await html2canvas(paper, { scale: 2, useCORS: true });
        const link = document.createElement('a');
        link.download = `${sched.section || 'Schedule'}_Export.png`;
        link.href = canvas.toDataURL("image/png");
        link.click();
      } else if (format === 'excel') {
        const wb = XLSX.utils.book_new();
        const wsData = [
          ["STI COLLEGE SANTA MARIA"],
          ["OFFICIAL CLASS SCHEDULE"],
          [`SECTION: ${sched.section || "N/A"}`],
          ["ACADEMIC YEAR 2025-2026"],
          [],
          ["TIME BLOCK", ...localDays]
        ];

        matrixIntervals.forEach(interval => {
          const row = [interval.label];
          localDays.forEach(day => {
            const classItem = (sched.classes || []).find(c => {
              const dayMatch = normalizeDay(c.day) === normalizeDay(day);
              if (!dayMatch) return false;
              const block = parseBlock(c.timeBlock);
              return block && block.start < interval.end && block.end > interval.start;
            });
            if (classItem && classItem.subject !== "VACANT" && classItem.subject !== "MARKED_VACANT") {
              row.push(`${classItem.subject}\n${classItem.teacher}\nRoom ${classItem.room}`);
            } else {
              row.push("");
            }
          });
          wsData.push(row);
        });

        const ws = XLSX.utils.aoa_to_sheet(wsData);
        XLSX.utils.book_append_sheet(wb, ws, "Schedule");
        XLSX.writeFile(wb, `${sched.section || 'Schedule'}_Export.xlsx`);
      }

      overlay.remove();
      showToast(`Schedule saved!`, "success");
    } catch (err) {
      console.error("Export Error:", err);
      overlay.remove();
      showToast("Download failed", "error");
    }
  }, 1200);
}

function downloadAll() {
  if (schedules.length === 0) {
    showToast("No schedules to download.", "info");
    return;
  }
  showDownloadFormatSelector((format) => {
    schedules.forEach((s, index) => {
      setTimeout(() => {
        downloadSchedule(s.id, format, true);
      }, index * 600);
    });
  });
}

function showDownloadFormatSelector(callback) {
  const overlay = document.createElement('div');
  overlay.className = "maangas-export-overlay";
  overlay.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(15, 23, 42, 0.8); backdrop-filter: blur(12px);
    display: flex; justify-content: center; align-items: center;
    z-index: 2000001; opacity: 0; transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
  `;

  overlay.innerHTML = `
    <div class="export-card-container" style="background: white; border: 5px solid black; padding: 45px; border-radius: 32px; box-shadow: 15px 15px 0px #000; text-align: center; max-width: 750px; width: 95%; transform: scale(0.9); transition: all 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275); position: relative;">
      <button class="close-modal-btn" style="position: absolute; top: 20px; right: 20px; background: #f1f5f9; border: 3px solid black; width: 40px; height: 40px; border-radius: 12px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: 900; transition: all 0.2s; box-shadow: 3px 3px 0px black;">×</button>
      <div style="margin-bottom: 35px;">
        <h2 style="color: #005BAB; font-size: 32px; font-weight: 950; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 2px;">Export Schedule</h2>
        <p style="font-size: 16px; color: #64748b; font-weight: 700;">Select your export format below.</p>
      </div>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 25px;">
        <div class="format-option pdf-btn" style="background: #fef2f2; border: 4px solid black; padding: 30px 20px; border-radius: 20px; cursor: pointer; transition: all 0.3s; box-shadow: 6px 6px 0px black; position: relative; overflow: hidden;">
          <div style="font-size: 45px; margin-bottom: 15px;">📑</div>
          <div style="font-weight: 900; color: #991b1b; font-size: 14px; text-transform: uppercase;">PDF Document</div>
        </div>
        <div class="format-option img-btn" style="background: #eff6ff; border: 4px solid black; padding: 30px 20px; border-radius: 20px; cursor: pointer; transition: all 0.3s; box-shadow: 6px 6px 0px black; position: relative; overflow: hidden;">
          <div style="font-size: 45px; margin-bottom: 15px;">🖼️</div>
          <div style="font-weight: 900; color: #1e40af; font-size: 14px; text-transform: uppercase;">Image (PNG)</div>
        </div>
        <div class="format-option xls-btn" style="background: #f0fdf4; border: 4px solid black; padding: 30px 20px; border-radius: 20px; cursor: pointer; transition: all 0.3s; box-shadow: 6px 6px 0px black; position: relative; overflow: hidden;">
          <div style="font-size: 45px; margin-bottom: 15px;">📊</div>
          <div style="font-weight: 900; color: #166534; font-size: 14px; text-transform: uppercase;">Excel Spreadsheet</div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  requestAnimationFrame(() => {
    overlay.style.opacity = "1";
    overlay.querySelector('.export-card-container').style.transform = "scale(1)";
  });

  const close = () => {
    overlay.style.opacity = "0";
    overlay.querySelector('.export-card-container').style.transform = "scale(0.9)";
    setTimeout(() => overlay.remove(), 400);
  };

  overlay.querySelector('.pdf-btn').onclick = () => { close(); setTimeout(() => callback('pdf'), 450); };
  overlay.querySelector('.img-btn').onclick = () => { close(); setTimeout(() => callback('image'), 450); };
  overlay.querySelector('.xls-btn').onclick = () => { close(); setTimeout(() => callback('excel'), 450); };
  overlay.querySelector('.close-modal-btn').onclick = close;
  overlay.onclick = (e) => { if (e.target === overlay) close(); };
}

function copyDayInSection(schedId, day) {
  if (currentUserRole === 'teacher' && localStorage.getItem('editPermission') !== 'true') {
    if (window.requestEditPermission) window.requestEditPermission();
    return;
  }

  const sched = schedules.find(s => s.id === schedId);
  if (!sched) return;
  const dayClasses = (sched.classes || []).filter(c => c.day === day);

  if (dayClasses.length === 0) {
    showToast(`No classes to copy in ${sched.section} ${day}`, "info");
    return;
  }

  copiedDayClasses = JSON.parse(JSON.stringify(dayClasses));
  copiedDayName = day;
  showToast(`📋 Copied ${dayClasses.length} classes!`, "success");
}

async function pasteDayToSection(schedId, targetDay) {
  if (currentUserRole === 'teacher' && localStorage.getItem('editPermission') !== 'true') {
    if (window.requestEditPermission) window.requestEditPermission();
    return;
  }

  if (!copiedDayClasses || copiedDayClasses.length === 0) {
    showToast("Nothing to paste!", "info");
    return;
  }

  const sched = schedules.find(s => s.id === schedId);
  if (!sched) return;

  showConfirm(`Paste classes into ${sched.section} ${targetDay}?`, async () => {
    pushToHistory(); 

    const newClasses = copiedDayClasses.map(c => ({
      ...c,
      day: targetDay
    })).filter(nc => {
      const bp = parseBlock(nc.timeBlock);
      return bp.end <= 1080;
    });

    let updated = [...(sched.classes || [])];
    for (const nc of newClasses) {
      const ncBlock = parseBlock(nc.timeBlock);
      updated = updated.filter(c => !(c.day === targetDay && overlaps(parseBlock(c.timeBlock), ncBlock)));
      updated.push(nc);
    }

    sched.classes = updated;
    renderTable();

    try {
      const ref = doc(db, "schedules", sched.id);
      await updateDoc(ref, { classes: updated });
      showToast(`📥 Pasted classes to ${sched.section} ${targetDay}!`, "success");
    } catch (err) {
      console.error("Paste failed", err);
      showToast("Paste failed!", "error");
    }
  });
}

async function clearDayInSection(schedId, day) {
  if (currentUserRole === 'teacher' && localStorage.getItem('editPermission') !== 'true') {
    if (window.requestEditPermission) window.requestEditPermission();
    return;
  }

  const sched = schedules.find(s => s.id === schedId);
  if (!sched) return;

  showConfirm(`Clear all classes for ${day} in ${sched.section}?`, async () => {
    pushToHistory(); 
    const updated = (sched.classes || []).filter(c => c.day !== day);
    sched.classes = updated;
    renderTable();
    if (typeof updateRoomSelectionOccupancies === 'function') {
      updateRoomSelectionOccupancies();
    }

    try {
      const ref = doc(db, "schedules", sched.id);
      await updateDoc(ref, { classes: updated });
      showToast(`🗑️ Cleared ${day} in ${sched.section}`, "success");
    } catch (err) {
      console.error("Clear failed", err);
      showToast("Clear failed!", "error");
    }
  });
}

async function clearSection(schedId) {
  if (currentUserRole === 'teacher' && localStorage.getItem('editPermission') !== 'true') {
    if (window.requestEditPermission) window.requestEditPermission();
    return;
  }

  const sched = schedules.find(s => s.id === schedId);
  if (!sched) return;

  const confirmed = await showConfirm("WIPE SECTION", `WIPE EVERYTHING in ${sched.section}? This cannot be undone! 🛡️⚡`);
  if (confirmed) {
    pushToHistory(); 
    sched.classes = [];
    renderTable();
    if (typeof updateRoomSelectionOccupancies === 'function') {
      updateRoomSelectionOccupancies();
    }
    try {
      const ref = doc(db, "schedules", sched.id);
      await updateDoc(ref, { classes: [] });
      showToast(`🔥 Wiped ${sched.section} grid!`, "success");
      logAction("CLEAR_SECTION", `Wiped entire grid for section: ${sched.section}`, {
        scheduleId: sched.id,
        section: sched.section
      });
    } catch (err) {
      console.error("Wipe failed", err);
      showToast("Wipe failed!", "error");
    }
  }
}

window.copyDayInSection = copyDayInSection;
window.pasteDayToSection = pasteDayToSection;
window.clearDayInSection = clearDayInSection;
window.clearSection = clearSection;
window.downloadAll = downloadAll;
window.downloadSchedule = downloadSchedule;
window.closePanel = closePanel;
window.openPanel = openPanel; 
window.markAsVacant = markAsVacant;
window.deleteClass = deleteClass;
window.listenForComments = listenForComments; 
window.saveClass = saveClass;
window.save = save;

window.updateAtmosphere = function updateAtmosphere() {
  const now = new Date();
  const hour = now.getHours();
  const body = document.body;
  body.classList.remove('atm-golden', 'atm-night');
  if ((hour >= 19 || hour < 6) && document.documentElement.classList.contains('dark')) {
    body.classList.add('atm-night');
  }
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const currentDay = dayNames[now.getDay()];
  const currentTotalMin = now.getHours() * 60 + now.getMinutes();
  document.querySelectorAll('.current-pulse').forEach(el => el.classList.remove('current-pulse'));
  const cells = document.querySelectorAll(`td[data-day="${currentDay}"]`);
  cells.forEach(td => {
    const block = td.dataset.block;
    if (!block) return;
    const [startS, endS] = block.split("-");
    const startMin = toMin(startS);
    const endMin = toMin(endS);
    if (currentTotalMin >= startMin && currentTotalMin < endMin) {
      td.classList.add('current-pulse');
    }
  });
};

setInterval(updateAtmosphere, 60000);
document.addEventListener('DOMContentLoaded', () => { setTimeout(updateAtmosphere, 2000); });

window.handleColorSelect = function () {
  const select = document.getElementById("colorSelect");
  const picker = document.getElementById("colorPicker");
  if (select && select.value === "custom") {
    if (picker) {
      picker.style.display = "block";
      picker.click();
    }
  } else if (picker) {
    picker.style.display = "none";
  }
};
window.handleColorPicker = function () { };


/* ───────── PRESENCE TRACKING 🦈 ───────── */
let presenceUnsub = null;
let presenceDocRef = null;
let commentUnsub = null; // Unsubscriber for comments 🔇

async function initPresence() {
  const urlParams = new URLSearchParams(window.location.search);
  const schedId = urlParams.get("id") || "global"; 

  presenceDocRef = doc(db, "presence", `${schedId}_${currentUser.uid}`);

  const updateStatus = async () => {
    try {
      await updateDoc(presenceDocRef, {
        lastSeen: serverTimestamp()
      }).catch(async (e) => {
        await addDoc(collection(db, "presence"), {
          id: `${schedId}_${currentUser.uid}`,
          schedId: schedId,
          userId: currentUser.uid,
          username: currentUser.displayName || "Unknown",
          photoURL: currentUser.photoURL || "images/default_shark.jpg",
          lastSeen: serverTimestamp()
        });
      });
    } catch (e) { console.error("Presence error:", e); }
  };

  updateStatus();
  setInterval(updateStatus, 30000); 

  const q = query(collection(db, "presence"), where("schedId", "==", schedId));
  presenceUnsub = onSnapshot(q, (snap) => {
    const indicator = document.getElementById('presence-indicator');
    if (!indicator) return;
    indicator.innerHTML = '';
    const now = Date.now();
    snap.forEach(d => {
      const data = d.data();
      const lastSeen = data.lastSeen?.toMillis ? data.lastSeen.toMillis() : 0;
      if (now - lastSeen < 120000 && data.userId !== currentUser.uid) {
        const img = document.createElement('img');
        img.src = data.photoURL || "images/default_shark.jpg";
        img.className = 'presence-avatar';
        img.title = `${data.username} is viewing... (Seen)`;
        indicator.appendChild(img);
      }
    });
  });

  window.addEventListener('beforeunload', () => {
    if (presenceDocRef) deleteDoc(presenceDocRef);
  });
}

/* ───────── COMMENTING SYSTEM 💬 ───────── */

window.openCommentPanel = async function (schedId, day, block, force = false) {
  const commentPanel = document.getElementById('commentPanel');
  const overlay = document.getElementById('panelOverlay');
  if (!commentPanel) {
    showToast("Comment panel not found in DOM", "error");
    return console.error("commentPanel not found");
  }

  if (force === 'refresh') {
    showToast("Refreshing comments...", "info");
    if (window.listenForComments) {
      window.listenForComments();
    } else if (typeof listenForComments === 'function') {
      listenForComments();
    }
  }

  let rawRole = currentUserRole || localStorage.getItem('userRole');
  let role = (rawRole || "").toLowerCase();
  let hasPermission = localStorage.getItem('editPermission') === 'true';
  const isAdmin = role === 'admin';
  const sched = (schedules || []).find(s => s.id === schedId);
  const isOwner = sched && (sched.userId === currentUser?.uid);
  const normBlock = normalizeTimeBlock(block);

  const allCellComments = (comments || []).filter(c => {
    const matchSched = c.schedId === schedId;
    const matchDay = normalizeDay(c.day) === normalizeDay(day);
    const matchBlock = normalizeTimeBlock(c.block) === normBlock;
    return matchSched && matchDay && matchBlock;
  });

  const isParticipant = allCellComments.some(c => c.userId === currentUser?.uid);
  const hasVisibility = isAdmin || isOwner || isParticipant;
  const cellComments = hasVisibility ? allCellComments : [];

  if (currentUser?.uid) {
    const unseen = cellComments.filter(c => !(c.seenBy || []).includes(currentUser.uid));
    if (unseen.length > 0) {
      const updates = unseen.map(c =>
        updateDoc(doc(db, "comments", c.docId), {
          seenBy: arrayUnion(currentUser.uid)
        })
      );
      Promise.all(updates).catch(e => console.error("Error marking seen", e));
    }
  }

  if (force !== 'force' && force !== true) {
    if ((isAdmin || isOwner || hasPermission) && cellComments.length === 0) return false;
    if (role === 'student' && cellComments.length === 0) return false;
  }

  const info = document.getElementById('commentCellInfo');
  if (info && block && block.includes("-")) {
    const parts = block.split("-");
    const sT = parts[0] || "07:30";
    const eT = parts[1] || "09:00";
    info.textContent = `${day} ${to12(sT)} - ${to12(eT)}`;
  } else if (info) {
    info.textContent = `${day} (No time specified)`;
  }

  const cls = (sched?.classes || []).find(x => x.day === day && x.timeBlock === block);
  if (document.getElementById('commentSubjInfo')) document.getElementById('commentSubjInfo').textContent = cls?.subject || "VACANT";
  if (document.getElementById('commentTchRoomInfo')) document.getElementById('commentTchRoomInfo').textContent = cls ? `${cls.teacher}, ${cls.room}` : "No assigned teacher/room";

  commentPanel.dataset.schedId = schedId;
  commentPanel.dataset.day = day;
  commentPanel.dataset.block = block;

  const list = document.getElementById('commentList');
  if (list) {
    list.innerHTML = '';
    const sorted = [...cellComments].sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
    sorted.forEach(c => {
      const entry = document.createElement('div');
      entry.className = 'comment-entry';
      const timeStr = c.createdAt ? new Date(c.createdAt.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now';
      const isPostAdmin = c.userRole === 'admin';
      entry.innerHTML = `
        <div class="comment-header">
          <span class="comment-author">${c.username}${isPostAdmin ? '<span class="comment-admin-tag">ADMIN</span>' : ''}</span>
          <span class="comment-time">${timeStr}</span>
        </div>
        <div class="comment-body">${c.text}</div>
      `;
      list.appendChild(entry);
    });
    if (cellComments.length === 0) list.innerHTML = '<div style="text-align:center; opacity:0.5; font-size:12px; padding:20px;">No comments yet</div>';
    setTimeout(() => { list.scrollTop = list.scrollHeight; }, 100);
  }

  const inputArea = document.getElementById('commentInputArea');
  const submitBtn = document.querySelector('.comment-submit');
  const inputLabel = document.getElementById('commentInputLabel');
  const backBtn = document.querySelector('.back-to-edit-btn');

  if (isAdmin || isOwner || hasPermission) {
    if (inputArea) inputArea.style.display = 'block';
    if (submitBtn) submitBtn.style.display = 'block';
    if (inputLabel) inputLabel.textContent = cellComments.length > 0 ? "Post a Reply" : "Your Comment";
    if (backBtn) backBtn.style.display = 'inline-block';
  } else if (role === 'teacher' && (allCellComments.length === 0 || isParticipant)) {
    if (inputArea) inputArea.style.display = 'block';
    if (submitBtn) submitBtn.style.display = 'block';
    if (inputLabel) inputLabel.textContent = allCellComments.length === 0 ? "Your Suggestion" : "Post a Reply";
    if (backBtn) backBtn.style.display = (isOwner || hasPermission) ? 'inline-block' : 'none';
  } else {
    if (inputArea) inputArea.style.display = 'none';
    if (submitBtn) submitBtn.style.display = 'none';
    if (backBtn) backBtn.style.display = (isOwner || hasPermission) ? 'inline-block' : 'none';
  }

  commentPanel.classList.add('open');
  if (overlay) overlay.style.display = 'block';

  if (window.innerWidth <= 768 || (window.innerWidth <= 950 && window.innerHeight < window.innerWidth)) {
    commentPanel.style.left = '50%';
    commentPanel.style.top = '45%';
    commentPanel.style.transform = 'translate(-50%, -45%) scale(1)';
  }
};

window.switchToComments = function () {
  const editPanel = document.getElementById('panel');
  if (!editPanel) return console.error("editPanel not found");
  const sid = editPanel.dataset.schedId;
  const day = editPanel.dataset.day;
  const block = editPanel.dataset.block;
  if (window.closePanel) window.closePanel();
  window.openCommentPanel(sid, day, block, 'force');
};

window.switchToEdit = function () {
  const commentPanel = document.getElementById('commentPanel');
  if (!commentPanel) return;
  const sid = commentPanel.dataset.schedId;
  const day = commentPanel.dataset.day;
  const block = commentPanel.dataset.block;
  window.closeCommentPanel();
  if (window.openPanel) window.openPanel(sid, day, block);
};

window.closeCommentPanel = function () {
  const cp = document.getElementById('commentPanel');
  const ov = document.getElementById('panelOverlay');
  if (cp) cp.classList.remove('open');
  if (ov) ov.style.display = 'none';
};

window.submitComment = async function () {
  const panel = document.getElementById('commentPanel');
  const textInput = document.getElementById('commentText');
  const text = textInput ? textInput.value.trim() : "";
  if (!text) return showToast("Please enter a comment", "warning");

  try {
    const sid = panel.dataset.schedId;
    const day = panel.dataset.day;
    const block = panel.dataset.block;

    await addDoc(collection(db, "comments"), {
      schedId: sid,
      day: day,
      block: block,
      userId: currentUser.uid,
      username: currentUser.displayName || (currentUserRole === 'admin' ? "Admin" : "Teacher"),
      userRole: currentUserRole,
      text: text,
      createdAt: serverTimestamp(),
      seenBy: [currentUser.uid] 
    });

    showToast("Comment posted!", "success");
    if (textInput) textInput.value = '';
    window.closeCommentPanel();
  } catch (e) {
    console.error("Comment error:", e);
    showToast("Failed to post comment", "error");
  }
};

function listenForComments() {
  if (commentUnsub) {
    commentUnsub();
    commentUnsub = null;
  }
  const urlParams = new URLSearchParams(window.location.search);
  const schedId = urlParams.get("id");
  let q = collection(db, "comments");
  if (schedId) q = query(collection(db, "comments"), where("schedId", "==", schedId));

  commentUnsub = onSnapshot(q, (snap) => {
    comments = [];
    snap.forEach(d => {
      comments.push({ ...d.data(), docId: d.id });
    });
    renderTable(); 
  });
}

function initDraggablePanel(panelId) {
  const panel = document.getElementById(panelId);
  if (!panel) return;
  const handle = panel.querySelector('div');
  if (!handle) return;

  handle.style.cursor = 'grab';
  handle.style.userSelect = 'none';
  handle.classList.add('drag-handle'); 

  let isDragging = false;
  let startX, startY;
  let initialX, initialY;

  const moveHandler = (e) => {
    if (!isDragging) return;
    if (e.cancelable) e.preventDefault();
    const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
    const clientY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;
    const dx = clientX - startX;
    const dy = clientY - startY;
    let newX = initialX + dx;
    let newY = initialY + dy;
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;
    newX = Math.max(40, Math.min(viewportW - 40, newX));
    newY = Math.max(40, Math.min(viewportH - 40, newY));
    panel.style.left = `${newX}px`;
    panel.style.top = `${newY}px`;
    panel.style.transform = 'translate(-50%, -50%)'; 
  };

  const startHandler = (e) => {
    const isMobileUI = window.innerWidth <= 768 || (window.innerWidth <= 950 && window.innerHeight < window.innerWidth);
    if (!isMobileUI) return;
    if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT' || e.target.closest('button')) return;
    isDragging = true;
    handle.style.cursor = 'grabbing';
    const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
    const clientY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;
    startX = clientX;
    startY = clientY;
    const rect = panel.getBoundingClientRect();
    initialX = rect.left + rect.width / 2;
    initialY = rect.top + rect.height / 2;
    panel.style.transition = 'none'; 
    panel.style.left = `${initialX}px`;
    panel.style.top = `${initialY}px`;
    panel.style.transform = 'translate(-50%, -50%)';
  };

  const endHandler = () => {
    if (!isDragging) return;
    isDragging = false;
    handle.style.cursor = 'grab';
    panel.style.transition = ''; 
  };

  handle.addEventListener('mousedown', startHandler);
  window.addEventListener('mousemove', moveHandler, { passive: false });
  window.addEventListener('mouseup', endHandler);
  handle.addEventListener('touchstart', startHandler, { passive: false });
  window.addEventListener('touchmove', moveHandler, { passive: false });
  window.addEventListener('touchend', endHandler);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initDraggablePanel('panel');
    initDraggablePanel('commentPanel');
  });
} else {
  initDraggablePanel('panel');
  initDraggablePanel('commentPanel');
}
