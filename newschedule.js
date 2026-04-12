import { initMobileNav } from "./js/ui/mobile-nav.js";
import { db, auth } from "./js/config/firebase-config.js";
import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  updateDoc,
  doc,
  deleteDoc,
  limit
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { initUserProfile } from "./userprofile.js";
import { initUniversalSearch } from "./search.js";
import { showToast, showConfirm } from "./js/utils/ui-utils.js";
import { overlaps, toMin, toTime, parseBlock } from "./js/utils/time-utils.js";

document.addEventListener('DOMContentLoaded', () => {
  initMobileNav();
  initUserProfile("#userProfile");
  initUniversalSearch(db);

  /* ───────── ELEMENTS ───────── */
  const dayItems = document.querySelectorAll(".day-item:not(.quick-select-btn)");
  const selectedDaysContainer = document.getElementById("selectedDaysContainer");
  const saveBtn = document.querySelector(".save-button");

  const scheduleNameInput = document.getElementById("scheduleNameInput");
  const startTimeInput = document.getElementById("startTimeInput");
  const endTimeInput = document.getElementById("endTimeInput");

  // Check for URL parameters
  const urlParams = new URLSearchParams(window.location.search);
  const prefilledName = urlParams.get('name');
  if (prefilledName && scheduleNameInput) {
    scheduleNameInput.value = prefilledName;
  }


  const sectionsList = document.getElementById("sectionsList");
  const addSectionTrigger = document.getElementById("addSectionTrigger");
  const sectionInputContainer = document.getElementById("sectionInputContainer");
  const newSectionInput = document.getElementById("newSectionInput");
  const selectAllBtn = document.getElementById("selectAllBtn");
  const deleteAllBtn = document.getElementById("deleteAllBtn");

  // Schedule Type Toggle
  const scheduleTypeToggle = document.getElementById("scheduleTypeToggle");
  const typeBtns = document.querySelectorAll(".type-btn");
  let selectedScheduleType = "regular";

  if (scheduleTypeToggle && typeBtns.length > 0) {
    typeBtns.forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        selectedScheduleType = btn.dataset.type;
        scheduleTypeToggle.dataset.type = selectedScheduleType;

        typeBtns.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        console.log("SchedSync DEBUG: Schedule Type changed to:", selectedScheduleType);
      });
    });
  }

  const confirmOverlay = document.getElementById("confirmOverlay");
  const confirmMessage = document.getElementById("confirmMessage");
  const confirmBtnCancel = document.getElementById("confirmBtnCancel");
  const confirmBtnYes = document.getElementById("confirmBtnYes");

  /* ───────── CLOCK PICKER ELEMENTS ───────── */
  const timePickerOverlay = document.getElementById("timePickerOverlay");
  const hourBlock = document.getElementById("hourBlock");
  const minuteBlock = document.getElementById("minuteBlock");
  const periodAM = document.getElementById("periodAM");
  const periodPM = document.getElementById("periodPM");
  const dialContainer = document.getElementById("dialContainer");
  const dialHand = document.getElementById("dialHand");
  const handIndicator = document.getElementById("handIndicator");
  const timePickerCancel = document.getElementById("timePickerCancel");
  const timePickerOK = document.getElementById("timePickerOK");

  /* ───────── CLOCK PICKER LOGIC ───────── */
  let currentTargetInput = null;
  let pickingMode = 'hour'; // 'hour' or 'minute'
  let tempHour = 7;
  let tempMinute = 0;
  let tempPeriod = 'AM';

  function initDialNumbers(mode) {
    // Clear existing numbers
    const existing = dialContainer.querySelectorAll('.dial-number');
    existing.forEach(el => el.remove());

    const numbers = mode === 'hour'
      ? [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
      : [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

    const radius = 80;
    const centerX = 105;
    const centerY = 105;

    numbers.forEach((num, i) => {
      const angle = (i * 30 - 90) * (Math.PI / 180);
      const x = centerX + radius * Math.cos(angle);
      const y = centerY + radius * Math.sin(angle);

      const el = document.createElement('div');
      el.className = 'dial-number';
      el.textContent = mode === 'minute' ? num.toString().padStart(2, '0') : num;
      el.style.left = `${x - 17}px`;
      el.style.top = `${y - 17}px`;
      el.dataset.value = num;
      dialContainer.appendChild(el);
    });

    updateClockUI();
  }

  function updateClockUI() {
    let angle = 0;
    if (pickingMode === 'hour') {
      angle = (tempHour % 12) * 30;
      handIndicator.textContent = tempHour;
    } else {
      angle = tempMinute * 6;
      handIndicator.textContent = tempMinute.toString().padStart(2, '0');
    }

    dialHand.style.transform = `rotate(${angle}deg)`;

    // Update active highlight on dial numbers
    const numbers = dialContainer.querySelectorAll('.dial-number');
    numbers.forEach(el => {
      const val = parseInt(el.dataset.value);
      if (pickingMode === 'hour') {
        el.classList.toggle('active', val === tempHour || (val === 12 && tempHour === 0));
      } else {
        const closest5 = Math.round(tempMinute / 5) * 5;
        el.classList.toggle('active', val === closest5 % 60);
      }
    });

    // Update Top Blocks
    if (document.activeElement !== hourBlock) {
      hourBlock.value = tempHour.toString().padStart(2, '0');
    }
    if (document.activeElement !== minuteBlock) {
      minuteBlock.value = tempMinute.toString().padStart(2, '0');
    }

    periodAM.classList.toggle('active', tempPeriod === 'AM');
    periodPM.classList.toggle('active', tempPeriod === 'PM');

    hourBlock.classList.toggle('active', pickingMode === 'hour');
    minuteBlock.classList.toggle('active', pickingMode === 'minute');
  }

  function handleDialInteraction(e) {
    const rect = dialContainer.getBoundingClientRect();
    const x = (e.clientX || e.touches[0].clientX) - rect.left - 105;
    const y = (e.clientY || e.touches[0].clientY) - rect.top - 105;

    let angle = Math.atan2(y, x) * (180 / Math.PI) + 90;
    if (angle < 0) angle += 360;

    if (pickingMode === 'hour') {
      let hour = Math.round(angle / 30);
      if (hour === 0) hour = 12;
      tempHour = hour;
    } else {
      let minute = Math.round(angle / 6);
      if (minute === 60) minute = 0;
      tempMinute = minute;
    }
    updateClockUI();
  }

  let isDialDragging = false;
  dialContainer.addEventListener('mousedown', (e) => { isDialDragging = true; handleDialInteraction(e); });
  window.addEventListener('mousemove', (e) => { if (isDialDragging) handleDialInteraction(e); });
  window.addEventListener('mouseup', () => {
    if (isDialDragging) {
      isDialDragging = false;
      if (pickingMode === 'hour') {
        setTimeout(() => setPickingMode('minute'), 400);
      }
    }
  });

  // Touch
  dialContainer.addEventListener('touchstart', (e) => { isDialDragging = true; handleDialInteraction(e); e.preventDefault(); });
  window.addEventListener('touchmove', (e) => { if (isDialDragging) handleDialInteraction(e); });
  window.addEventListener('touchend', () => { if (isDialDragging) { isDialDragging = false; if (pickingMode === 'hour') setTimeout(() => setPickingMode('minute'), 400); } });

  function setPickingMode(mode) {
    pickingMode = mode;
    initDialNumbers(mode);
  }

  hourBlock.addEventListener('click', () => setPickingMode('hour'));
  minuteBlock.addEventListener('click', () => setPickingMode('minute'));

  hourBlock.addEventListener('input', (e) => {
    let val = e.target.value.replace(/\D/g, '');
    if (val === '') return;
    let h = parseInt(val);
    if (h > 12) h = 12;
    if (h === 0) h = 1;
    tempHour = h;
    e.target.value = h.toString().padStart(2, '0');
    updateClockUI();
  });

  minuteBlock.addEventListener('input', (e) => {
    let val = e.target.value.replace(/\D/g, '');
    if (val === '') return;
    let m = parseInt(val);
    if (m > 59) m = 59;
    tempMinute = m;
    e.target.value = m.toString().padStart(2, '0');
    updateClockUI();
  });

  hourBlock.addEventListener('focus', () => setPickingMode('hour'));
  minuteBlock.addEventListener('focus', () => setPickingMode('minute'));

  // Ensure blocks are updated when blurred to maintain 2-digit format
  hourBlock.addEventListener('blur', () => {
    if (hourBlock.value === '') hourBlock.value = tempHour.toString().padStart(2, '0');
    updateClockUI();
  });
  minuteBlock.addEventListener('blur', () => {
    if (minuteBlock.value === '') minuteBlock.value = tempMinute.toString().padStart(2, '0');
    updateClockUI();
  });

  periodAM.addEventListener('click', () => { tempPeriod = 'AM'; updateClockUI(); });
  periodPM.addEventListener('click', () => { tempPeriod = 'PM'; updateClockUI(); });

  function showTimePicker(inputEl) {
    currentTargetInput = inputEl;
    const currentVal = inputEl.value;

    if (currentVal && currentVal.includes(':')) {
      const parts = currentVal.split(' ');
      const timeParts = parts[0].split(':');
      tempHour = parseInt(timeParts[0]);
      tempMinute = parseInt(timeParts[1]);
      tempPeriod = parts[1] || 'AM';
    } else {
      tempHour = 12;
      tempMinute = 0;
      tempPeriod = 'AM';
    }

    setPickingMode('hour');
    timePickerOverlay.classList.add('show');
  }

  timePickerCancel.addEventListener('click', () => timePickerOverlay.classList.remove('show'));
  timePickerOK.addEventListener('click', () => {
    const formattedMinute = tempMinute.toString().padStart(2, '0');
    currentTargetInput.value = `${tempHour}:${formattedMinute} ${tempPeriod}`;
    timePickerOverlay.classList.remove('show');
  });

  startTimeInput.addEventListener('click', () => showTimePicker(startTimeInput));
  endTimeInput.addEventListener('click', () => showTimePicker(endTimeInput));

  /* ───────── STATE ───────── */
  let selectedDays = new Set();
  let currentUser = null;
  let selectedSections = new Set();
  let sectionDocIds = {}; // Map section names to their document IDs

  /* ───────── TIME HELPERS ───────── */
  const toTime = m =>
    `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

  /* ───────── GET CURRENT USER ───────── */
  onAuthStateChanged(auth, (user) => {
    if (user) {
      currentUser = user;
      loadSections();
    } else {
      console.warn("No user logged in");
    }
  });

  /* ───────── DAY SELECTION ───────── */
  dayItems.forEach(day => {
    day.addEventListener("click", () => {
      const name = day.textContent.trim();
      selectedDays.has(name)
        ? (selectedDays.delete(name), day.classList.remove("selected"))
        : (selectedDays.add(name), day.classList.add("selected"));
      renderSelectedDays();

      // Reset active state of quick select buttons when manually toggling
      document.querySelectorAll('.quick-select-btn').forEach(btn => btn.classList.remove('selected'));
    });
  });

  /* ───────── QUICK SELECT BUTTONS ───────── */
  const quickSelectBtns = document.querySelectorAll('.quick-select-btn');
  quickSelectBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      // Remove 'selected' from all quick select buttons first
      quickSelectBtns.forEach(b => b.classList.remove('selected'));
      // Add 'selected' to the clicked button
      e.target.classList.add('selected');

      const val = e.target.dataset.days;

      // Clear current selection immediately
      selectedDays.clear();
      dayItems.forEach(d => {
        d.classList.remove("selected");
        // Remove any existing vacuum/animation classes if any
      });
      renderSelectedDays();

      let daysToSelect = [];
      switch (val) {
        case "mon-fri":
          daysToSelect = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
          break;
        case "mon-sat":
          daysToSelect = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
          break;
        case "mwf":
          daysToSelect = ["Monday", "Wednesday", "Friday"];
          break;
        case "tths":
          daysToSelect = ["Tuesday", "Thursday", "Saturday"];
          break;
      }

      // Animate selection one by one
      daysToSelect.forEach((dayName, index) => {
        setTimeout(() => {
          const dayEl = Array.from(dayItems).find(el => el.textContent.trim() === dayName);
          if (dayEl) {
            // Add visual "tap" effect
            dayEl.style.transform = "scale(0.9)";
            setTimeout(() => dayEl.style.transform = "scale(1)", 100);

            selectedDays.add(dayName);
            dayEl.classList.add("selected");
            renderSelectedDays();
          }
        }, index * 150); // 150ms delay between each click
      });
    });
  });

  function renderSelectedDays() {
    selectedDaysContainer.innerHTML = "";
    const dayOrder = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    const sortedDays = [...selectedDays].sort((a, b) => dayOrder.indexOf(a) - dayOrder.indexOf(b));

    sortedDays.forEach(d => {
      const chip = document.createElement("div");
      chip.className = "selected-day";
      chip.textContent = d;
      selectedDaysContainer.appendChild(chip);
    });
  }

  /* ───────── LOAD SECTIONS ───────── */
  async function loadSections() {
    if (!currentUser) return;

    try {
      const snap = await getDocs(query(
        collection(db, "sections"),
        where("userId", "==", currentUser.uid)
      ));

      sectionsList.innerHTML = "";

      snap.forEach(docSnap => {
        const name = docSnap.data().name;
        const docId = docSnap.id;
        sectionDocIds[name] = docId;

        addSectionToUI(name, docId);
      });
    } catch (error) {
      console.error("Error loading sections:", error);
      showToast("Failed to load sections", "error");
    }
  }

  function addSectionToUI(name, docId) {
    const item = document.createElement("div");
    item.className = "section-item";
    item.dataset.name = name;

    // Toggle on click of the pill itself
    item.addEventListener("click", () => toggleSection(name, item));

    const nameSpan = document.createElement("span");
    nameSpan.textContent = name;
    nameSpan.className = "section-name";

    const deleteBtn = document.createElement("button");
    deleteBtn.innerHTML = "✕";
    deleteBtn.className = "delete-btn";
    deleteBtn.title = "Delete section";
    deleteBtn.addEventListener("click", (e) => {
      e.stopPropagation(); // Prevent toggling selection when deleting
      deleteSection(name, docId, item);
    });

    item.appendChild(nameSpan);
    item.appendChild(deleteBtn);

    // Initial state check
    if (selectedSections.has(name)) {
      item.classList.add("selected");
    }

    sectionsList.appendChild(item);
  }

  /* ───────── TOGGLE SECTION SELECTION ───────── */
  function toggleSection(name, element) {
    if (selectedSections.has(name)) {
      selectedSections.delete(name);
      element.classList.remove("selected");
    } else {
      selectedSections.add(name);
      element.classList.add("selected");
    }
    updateSelectAllButtonState();
  }

  /* ───────── DELETE SECTION ───────── */
  async function deleteSection(name, docId, element) {
    const confirmed = await showConfirm(`Are you sure you want to delete the section "${name}"?`);
    if (!confirmed) return;

    try {
      await deleteDoc(doc(db, "sections", docId));

      element.remove();
      selectedSections.delete(name);
      delete sectionDocIds[name];

      updateSelectAllButtonState();
      showToast(`Section "${name}" deleted`, "success");
    } catch (error) {
      console.error("Error deleting section:", error);
      showToast("Failed to delete section", "error");
    }
  }

  /* ───────── UPDATE SELECT ALL BUTTON STATE ───────── */
  function updateSelectAllButtonState() {
    // Optional: Can change button text to "Deselect All" if all are selected
    const allItems = sectionsList.querySelectorAll(".section-item");
    if (allItems.length === 0) return;

    const allSelected = Array.from(allItems).every(i => i.classList.contains("selected"));
    selectAllBtn.textContent = allSelected ? "Unselect All" : "Select All";
  }


  /* ───────── ADD SECTION ───────── */
  async function addSection(name) {
    if (!currentUser) {
      showToast("No user logged in", "error");
      return;
    }

    const clean = name.trim().toUpperCase();
    if (!clean) return;

    const q = query(
      collection(db, "sections"),
      where("userId", "==", currentUser.uid),
      where("name", "==", clean)
    );
    const snap = await getDocs(q);
    if (!snap.empty) {
      showToast(`The section "${clean}" has already been created`, "error");
      return;
    }

    const docRef = await addDoc(collection(db, "sections"), {
      name: clean,
      userId: currentUser.uid
    });

    sectionDocIds[clean] = docRef.id;
    addSectionToUI(clean, docRef.id);
    showToast(`Section "${clean}" added`, "success");
  }

  /* ───────── BULK SELECTION ───────── */
  selectAllBtn.addEventListener("click", () => {
    const items = sectionsList.querySelectorAll(".section-item");
    if (items.length === 0) return;

    // Treat as "Toggle all" or "Force Select"
    const allSelected = Array.from(items).every(i => i.classList.contains("selected"));

    items.forEach((item, index) => {
      const name = item.dataset.name;
      // Stagger the visual change: top-to-bottom for select, bottom-to-top for deselect
      const delay = allSelected ? (items.length - 1 - index) * 100 : index * 100;

      setTimeout(() => {
        if (allSelected) {
          selectedSections.delete(name);
          item.classList.remove("selected");
        } else {
          selectedSections.add(name);
          item.classList.add("selected");
        }

        // Update button state once at the VERY end of the wave sequence
        const isLastItemInWave = allSelected ? index === 0 : index === items.length - 1;
        if (isLastItemInWave) {
          updateSelectAllButtonState();
        }
      }, delay);
    });
  });

  deleteAllBtn.addEventListener("click", async () => {
    const items = sectionsList.querySelectorAll(".section-item");
    if (items.length === 0) {
      showToast("No sections to delete", "info");
      return;
    }

    const confirmed = await showConfirm("Are you sure you want to permanently delete ALL sections? This cannot be undone.");
    if (!confirmed) return;

    const trashRect = deleteAllBtn.getBoundingClientRect();
    const trashX = trashRect.left + trashRect.width / 2;
    const trashY = trashRect.top + trashRect.height / 2;

    const itemsArr = Array.from(items);
    let processedCount = 0;
    let deletedCount = 0;

    // Use a staggered loop for the "eating" effect
    itemsArr.forEach((item, i) => {
      const name = item.dataset.name;
      const docId = sectionDocIds[name];

      if (!docId) {
        processedCount++;
        return;
      }

      // Calculate relative distance to trashcan for vacuum effect
      const itemRect = item.getBoundingClientRect();
      const itemX = itemRect.left + itemRect.width / 2;
      const itemY = itemRect.top + itemRect.height / 2;

      item.style.setProperty('--v-x', `${trashX - itemX}px`);
      item.style.setProperty('--v-y', `${trashY - itemY}px`);

      // Stagger the animation start
      setTimeout(() => {
        item.classList.add("vacuuming");

        // Wait for animation to finish (0.8s) then delete from Firestore and UI
        setTimeout(async () => {
          try {
            await deleteDoc(doc(db, "sections", docId));
            item.remove();
            selectedSections.delete(name);
            delete sectionDocIds[name];
            deletedCount++;
          } catch (error) {
            console.error(`Error deleting section ${name}:`, error);
          } finally {
            processedCount++;
            // Check if all items are processed
            if (processedCount === itemsArr.length) {
              updateSelectAllButtonState();
              if (deletedCount > 0) {
                showToast(`Successfully deleted ${deletedCount} sections permanently`, "success");
              }
            }
          }
        }, 800); // Match slower CSS animation
      }, i * 200); // 200ms stagger between each pill for a slower "swallowing" flow
    });
  });

  addSectionTrigger.addEventListener("click", () => {
    addSectionTrigger.style.display = "none";
    sectionInputContainer.style.display = "block";
    newSectionInput.focus();
  });

  newSectionInput.addEventListener("keydown", async (e) => {
    if (e.key === "Enter") {
      const name = newSectionInput.value.trim();
      if (name) {
        try {
          await addSection(name);
          newSectionInput.value = "";
          sectionInputContainer.style.display = "none";
          addSectionTrigger.style.display = "flex";
        } catch (error) {
          console.error("Error adding section:", error);
          showToast("Failed to add section", "error");
        }
      }
    } else if (e.key === "Escape") {
      newSectionInput.value = "";
      sectionInputContainer.style.display = "none";
      addSectionTrigger.style.display = "flex";
    }
  });

  newSectionInput.addEventListener("blur", () => {
    if (!newSectionInput.value.trim()) {
      sectionInputContainer.style.display = "none";
      addSectionTrigger.style.display = "flex";
    }
  });

  /* ───────── SAVE / MERGE ───────── */
  saveBtn.addEventListener("click", async () => {
    if (saveBtn.disabled) return; // Prevent double-clicks 🛡️⚓

    try {
      if (!currentUser) {
        showToast("No user logged in", "error");
        return;
      }

      const name = scheduleNameInput.value.trim();
      const start = startTimeInput.value;
      const end = endTimeInput.value;

      if (!name || !start || !end || selectedDays.size === 0 || selectedSections.size === 0) {
        showToast("Please complete all required fields", "error");
        return;
      }

      saveBtn.disabled = true;
      saveBtn.textContent = "Processing...";

      // Check for duplicate schedule name
      const schedQuery = query(
        collection(db, "schedules"),
        where("userId", "==", currentUser.uid),
        where("scheduleName", "==", name),
        where("scheduleType", "==", selectedScheduleType),
        limit(1)
      );
      const schedSnap = await getDocs(schedQuery);
      if (!schedSnap.empty) {
        showToast(`The schedule "${name}" has already been created`, "error");
        saveBtn.disabled = false;
        saveBtn.textContent = "Save Schedule";
        return;
      }

      const startMin = toMin(start);
      const endMin = toMin(end);

      // ... rest of time validation ...
      const INTERVAL = 30;
      const timeBlocks = [];
      for (let m = startMin; m + INTERVAL <= endMin; m += INTERVAL) {
        timeBlocks.push(`${toTime(m)}-${toTime(m + INTERVAL)}`);
      }

      const newClasses = [];
      selectedDays.forEach(day => {
        timeBlocks.forEach(block => {
          newClasses.push({ day, timeBlock: block, subject: "VACANT", teacher: "NA" });
        });
      });

      // 🛡️ OPTIMIZED CONFLICT DETECTION ⚖️⚓
      showToast("Checking for conflicts... ⚖️", "info");
      
      const qPublished = query(
        collection(db, "schedules"),
        where("status", "==", "published"),
        where("section", "in", Array.from(selectedSections).slice(0, 10))
      );
      
      const allSchedulesSnap = await getDocs(qPublished);
      const publishedSchedules = allSchedulesSnap.docs.map(d => d.data());

      for (const section of selectedSections) {
        for (const day of selectedDays) {
          for (const block of timeBlocks) {
            const nParsed = parseBlock(block);
            const conflict = publishedSchedules.find(s => 
              s.section === section && 
              (s.classes || []).some(c => c.day === day && overlaps(nParsed, parseBlock(c.timeBlock)))
            );

            if (conflict) {
              showToast(`CONFLICT: Section ${section} is already busy on ${day} at ${block}`, "error");
              saveBtn.disabled = false;
              saveBtn.textContent = "Save Schedule";
              return;
            }
          }
        }
      }

      // 🚀 ATOMIC SAVING ⚓
      for (const section of selectedSections) {
        const q = query(
          collection(db, "schedules"),
          where("userId", "==", currentUser.uid),
          where("section", "==", section),
          where("scheduleType", "==", selectedScheduleType),
          limit(1)
        );
        const snap = await getDocs(q);

        if (!snap.empty) {
          const docId = snap.docs[0].id;
          const existing = snap.docs[0].data().classes || [];
          await updateDoc(doc(db, "schedules", docId), {
            classes: [...existing, ...newClasses],
            scheduleName: name,
            startTime: start,
            endTime: end,
            selectedDays: [...selectedDays],
            updated: new Date().toDateString(),
            status: "draft",
            scheduleType: selectedScheduleType,
            author: currentUser.displayName || currentUser.email || "Unknown"
          });
        } else {
          await addDoc(collection(db, "schedules"), {
            userId: currentUser.uid,
            section,
            scheduleName: name,
            startTime: start,
            endTime: end,
            classes: newClasses,
            selectedDays: [...selectedDays],
            updated: new Date().toDateString(),
            status: "draft",
            scheduleType: selectedScheduleType,
            author: currentUser.displayName || currentUser.email || "Unknown",
            createdAt: Date.now()
          });
        }
      }

      showToast("Schedule saved successfully!", "success");
      setTimeout(() => {
        window.location.href = `editpage.html?name=${encodeURIComponent(name)}`;
      }, 1500);

    } catch (err) {
      console.error("Error saving schedule:", err);
      showToast("Failed to save schedule", "error");
      saveBtn.disabled = false;
      saveBtn.textContent = "Save Schedule";
    }
  });
});
