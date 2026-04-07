/* =============================
   FIREBASE
   ============================= */
import { db, auth } from "./js/config/firebase-config.js";
import {
  collection,
  getDocs,
  getDoc,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  serverTimestamp,
  writeBatch
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { toMin, toTime, to12, parseBlock, normalizeDay, normalizeTimeBlock } from "./js/utils/time-utils.js";
import { initUserProfile } from "./userprofile.js";
import { initUniversalSearch } from './search.js';
import { showToast, showConfirm, showPrompt } from "./js/utils/ui-utils.js";
import { initMobileNav } from "./js/ui/mobile-nav.js";
import { logAction } from "./js/utils/audit-logger.js";

let currentUser = null;
let schedules = []; // Global scope

document.addEventListener("DOMContentLoaded", () => {
  initUserProfile("#userProfile");
  initUniversalSearch(db);
  initMobileNav();

  onAuthStateChanged(auth, (user) => {
    if (user) {
      currentUser = user;
      renderAll();
    }
  });
});

/* =============================
   USER ROLE
   ============================= */
/* =============================
   USER ROLE
   ============================= */
let currentUserRole = "student"; // Default safety

/* =============================
   ELEMENTS
   ============================= */
const examPublishedBox = document.getElementById("exam-published");
const examDraftBox = document.getElementById("exam-draft");
const publishedBox = document.getElementById("published");
const sectionTitles = document.querySelectorAll('.section-title');
const downloadedBox = document.getElementById("downloaded");
const draftBox = document.getElementById("draft");

/* =============================
   HELPERS
   ============================= */
function clearAll() {
  if (examPublishedBox) examPublishedBox.innerHTML = "";
  if (examDraftBox) examDraftBox.innerHTML = "";
  publishedBox.innerHTML = "";
  draftBox.innerHTML = "";
}

/* ───────── TIME HELPERS ───────── */

/* =============================
   RENDER
   ============================= */
async function renderAll(shouldFetch = true) {
  clearAll();

  if (!currentUser) {
    console.log("No user logged in");
    return;
  }

  try {
    // 1. Fetch Role & Permission 🛡️
    const userDoc = await getDoc(doc(db, "users", currentUser.uid));
    let hasPermission = false;
    if (userDoc.exists()) {
      const userData = userDoc.data();
      currentUserRole = userData.role || "student";
      hasPermission = userData.editPermission === true;

      console.log("Current User Info:", {
        uid: currentUser.uid,
        email: currentUser.email,
        role: currentUserRole,
        hasPermission: hasPermission
      });

      // Update cache in case role-restriction needs it
      localStorage.setItem('userRole', currentUserRole);
      localStorage.setItem('editPermission', String(hasPermission));
    }

    if (shouldFetch) {
      if (currentUserRole === 'student') {
        // STUDENT: Fetch ALL published
        const snap = await getDocs(
          query(collection(db, "schedules"), where("status", "==", "published"))
        );
        schedules = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        // Hide Draft/Downloaded UI Sections
        if (typeof downloadedBox !== 'undefined' && downloadedBox) downloadedBox.style.display = 'none';
        if (typeof draftBox !== 'undefined' && draftBox) draftBox.style.display = 'none';
        if (sectionTitles[0]) sectionTitles[0].style.display = 'none'; // Downloaded Header
        if (sectionTitles[2]) sectionTitles[2].style.display = 'none'; // Draft Header
        if (sectionTitles[1]) sectionTitles[1].textContent = "All Published Schedules";

      } else if (currentUserRole === 'admin') {
        // ADMIN: Fetch ALL schedules in the system
        const snap = await getDocs(collection(db, "schedules"));
        schedules = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        // Show All UI Sections
        sectionTitles.forEach(el => el.style.display = 'block');
        if (sectionTitles[1]) sectionTitles[1].textContent = "All Published Schedules (Admin)";
        if (sectionTitles[2]) sectionTitles[2].textContent = "All Draft Schedules (Admin)";

      } else {
        // TEACHER: Only see their own schedules or published ones 🛡️
        const snap = await getDocs(collection(db, "schedules"));
        schedules = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(s => s.status === 'published' || s.userId === currentUser.uid);

        // Show All UI Sections
        sectionTitles.forEach(el => el.style.display = 'block');
        if (sectionTitles[1]) sectionTitles[1].textContent = "Published Schedules";
        if (sectionTitles[2]) sectionTitles[2].textContent = "Draft Schedules";
      }
    } else {
      // If not fetching, we use existing 'schedules' array 🦈
      console.log("Using cached schedules for rendering");
    }

    // Filter Bad Data
    schedules = schedules.filter(s => s.id !== "DEFAULT_SECTION" && s.section !== "EVENTS" && s.section !== "EVENT_HOST");
    schedules.forEach(s => s.status = s.status || "draft");

    // Render
    if (currentUserRole === 'student') {
      renderSection("published", schedules, "exam");
      renderSection("published", schedules, "regular");
    } else {
      renderSection("published", schedules, "exam");
      renderSection("published", schedules, "regular");
      renderSection("draft", schedules, "exam");
      renderSection("draft", schedules, "regular");
    }

  } catch (error) {
    console.error("Error fetching schedules:", error);
    showToast("Failed to load schedules.", "error");
  }
}

function renderSection(status, schedules, type = null) {
  let box = status === "published" ? publishedBox : draftBox;
  if (status === "published" && type === "exam") {
    box = examPublishedBox;
  } else if (status === "draft" && type === "exam") {
    box = examDraftBox;
  }

  if (!box) return;

  // For students, we treat ALL fetched schedules as 'published' context even if data says otherwise (safety)
  // But our query already filtered by status='published' so it's fine.

  let list = schedules;
  const todayStr = new Date().toISOString().split('T')[0];

  if (currentUserRole === 'student') {
    // For Students: Show only published schedules for today
    list = schedules.filter(s => {
      if (type && s.scheduleType !== type) return false;
      if (!type && s.scheduleType === 'exam' && status === 'published') return false;

      if (s.targetDate) {
        return s.targetDate === todayStr;
      }
      return true;
    });
  } else {
    // For Teachers/Admins: Show drafts and specific statuses
    list = schedules.filter(s => {
      if (type && s.scheduleType !== type) return false;
      if (!type && s.scheduleType === 'exam' && status === 'published') return false;

      // Filter by status
      if (s.status === 'draft' && s.userId !== currentUser.uid && currentUserRole !== 'admin') return false;
      if (s.status !== status) return false;

      // --- targetDate Precedence & Auto-Cleanup ---
      if (s.targetDate) {
        if (s.targetDate < todayStr) return false; // Past date
      }

      return true;
    });
  }

  if (list.length === 0) return;

  // Group by scheduleName
  const groups = {};
  list.forEach(s => {
    const name = s.scheduleName || "Untitled Schedule";
    if (!groups[name]) groups[name] = [];
    groups[name].push(s);
  });

  const sortedNames = Object.keys(groups).sort();

  sortedNames.forEach(name => {
    const groupSchedules = groups[name];
    
    // 🛡️ UI DE-DUPLICATION (Safety for existing bad data) ⚓
    const uniqueSections = new Set();
    const filteredSchedules = groupSchedules.filter(s => {
      const key = `${s.section}`.toUpperCase().trim();
      if (uniqueSections.has(key)) {
        console.warn(`SchedSync: Duplicate section "${s.section}" hidden in group "${name}"`);
        return false;
      }
      uniqueSections.add(key);
      return true;
    });

    filteredSchedules.sort((a, b) => (a.section || "").localeCompare(b.section || ""));

    // Create Folder Container
    const folderFn = document.createElement("div");
    folderFn.className = "schedule-folder";

    const uniqueId = `folder-${status}-${name.replace(/\s+/g, '-').toLowerCase()}-${Math.random().toString(36).substr(2, 9)}`;
    const safeName = name.replace(/'/g, "\\'");

    // Determine buttons based on status & role
    let buttonsHtml = "";
    const hasPermission = localStorage.getItem('editPermission') === 'true';

    if (currentUserRole !== 'student') {
      if (currentUserRole === 'admin' || hasPermission) {
        const addSectionBtn = `<button class="action-button add-section" onclick="event.stopPropagation(); addSectionToGroup('${safeName}')">+ SECTION</button>`;

        if (status === "draft") {
          // Check if user owns at least one item in the group 🛡️
          const ownsAny = groupSchedules.some(s => s.userId === currentUser.uid);
          if (currentUserRole === 'admin' || ownsAny || hasPermission) {
            const overrideBadge = groupSchedules[0].targetDate ? `<span class="override-badge-mini" style="background:#ef4444; color:white; font-size:10px; padding:2px 6px; border-radius:4px; margin-right:8px; font-weight:900;">DATED</span>` : '';
            buttonsHtml = `
                    ${overrideBadge}
                    ${addSectionBtn}
                    <button class="action-button publish" style="padding: 4px 16px; font-size: 14px;" onclick="event.stopPropagation(); publishGroup('${safeName}')">PUBLISH</button>
                    <button class="action-button edit" style="padding: 4px 16px; font-size: 14px;" onclick="event.stopPropagation(); editGroup('${safeName}')">EDIT ALL</button>
                    <button class="action-button delete-group" style="padding: 4px 16px; font-size: 14px; background: #ef4444; color: white; border-color: black;" onclick="event.stopPropagation(); deleteGroup('${safeName}')">DELETE ALL</button>
                `;
          } else {
            buttonsHtml = `<span style="font-size: 11px; color: #64748b; font-weight: 800; text-transform: uppercase;">View Only</span>`;
          }
        } else if (status === "published") {
          buttonsHtml = `
                  ${addSectionBtn}
                  <button class="action-button unpublish" style="padding: 4px 16px; font-size: 14px;" onclick="event.stopPropagation(); unpublishGroup('${safeName}')">UNPUBLISH</button>
                  <button class="action-button edit" style="padding: 4px 16px; font-size: 14px;" onclick="event.stopPropagation(); editGroup('${safeName}')">EDIT ALL</button>
                  ${(currentUserRole === 'admin' || hasPermission || groupSchedules.some(s => s.userId === currentUser.uid)) ? `<button class="action-button delete-group" style="padding: 4px 16px; font-size: 14px; background: #ef4444; color: white; border-color: black;" onclick="event.stopPropagation(); deleteGroup('${safeName}')">DELETE ALL</button>` : ''}
              `;
        }
      } else if (currentUserRole === 'teacher') {
        // Teacher without permission 🛡️
        buttonsHtml = `<button class="action-button request-permission-btn" style="background: #1e293b; font-size: 11px; padding: 4px 12px; font-weight: 800; border-radius: 8px; border: 2px solid black; box-shadow: 2px 2px 0px black; color: white; text-transform: uppercase; cursor: pointer;" onclick="event.stopPropagation(); window.requestEditPermission()">Ask to Edit</button>`;
      }
    } else {
      // Student without permission (checked at top level essentially, but let's be safe) 🛡️
      if (hasPermission) {
        // If a student somehow got permission 🦈
        const addSectionBtn = `<button class="action-button add-section" onclick="event.stopPropagation(); addSectionToGroup('${safeName}')">+ SECTION</button>`;
        buttonsHtml = `
                    ${addSectionBtn}
                    <button class="action-button edit" style="padding: 4px 16px; font-size: 14px;" onclick="event.stopPropagation(); editGroup('${safeName}')">EDIT ALL</button>
                `;
      } else {
        buttonsHtml = `<button class="action-button request-permission-btn" style="background: #1e293b; font-size: 11px; padding: 4px 12px; font-weight: 800; border-radius: 8px; border: 2px solid black; box-shadow: 2px 2px 0px black; color: white; text-transform: uppercase; cursor: pointer;" onclick="event.stopPropagation(); window.requestEditPermission()">Ask to Edit</button>`;
      }
    }

    folderFn.innerHTML = `
      <div class="folder-header open" onclick="toggleFolder('${uniqueId}')">
        <svg class="folder-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
           <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        <div class="folder-title">${name}</div>
        <div class="folder-actions" style="display:flex; gap:10px; margin-right:15px;">
           ${buttonsHtml}
        </div>
        <div class="folder-count">${filteredSchedules.length} Sections</div>
      </div>
      <div id="${uniqueId}" class="folder-content open">
      </div>
    `;


    box.appendChild(folderFn);
    const contentBox = folderFn.querySelector(`#${uniqueId}`);

    // Render Items inside Folder
    filteredSchedules.forEach(s => {
      const infoClass =
        status === "downloaded" ? "schedule-info" :
          status === "published" ? "schedule-info-alt" :
            "schedule-info-alt2";

      const actionsClass =
        status === "downloaded" ? "schedule-actions" :
          status === "published" ? "schedule-actions-alt" :
            "schedule-actions-alt2";

      const div = document.createElement("div");
      div.className = "schedule-item";
      div.id = `sched-${s.id}`;

      // Logic for More Menu actions
      const isOwner = s.userId === currentUser.uid;
      const canEditDelete = (currentUserRole === 'admin' || isOwner || hasPermission);

      const editOption = canEditDelete ? `<div class="menu-item" onclick="editSchedule('${s.id}')">💾 Edit Section</div>` : `<div class="menu-item" onclick="editSchedule('${s.id}')">👁️ View Section</div>`;
      const deleteOption = canEditDelete ? `<div class="menu-item delete" onclick="removeSchedule('${s.id}')">🗑️ Delete Section</div>` : "";
      const downloadOption = `<div class="menu-item" onclick="downloadSchedule('${s.id}')">📄 Download Schedule</div>`;
      const historyOption = `<div class="menu-item" onclick="viewHistory('${s.id}')">🕰️ View Edit History</div>`;

      div.innerHTML = `
        <div class="${infoClass}" onclick="editSchedule('${s.id}')" style="cursor: pointer;">
          <img src="https://api.builder.io/api/v1/image/assets/TEMP/1d82e6ecb4678c55ef213160fc934ec31ddf6412" class="schedule-icon">
          <div class="schedule-details">
            <h3>${s.section || "No Section"}</h3>
             <div class="schedule-meta">
              Updated: ${s.updated || "—"}<br>
              Author: ${s.author || "—"}
            </div>
          </div>
        </div>

        <div class="${actionsClass}">
          <div class="more-menu">
            <img src="images/3dots.png" class="more-icon" onclick="event.stopPropagation(); toggleMoreMenu('menu-${s.id}')" onerror="this.src='https://api.builder.io/api/v1/image/assets/TEMP/bdd37ee11abd334877103228ec6efeb8aaa57977'">
            <div id="menu-${s.id}" class="menu-dropdown">
              ${editOption}
              ${downloadOption}
              ${historyOption}
              <div style="height: 1px; background: #e2e8f0; margin: 4px 0;"></div>
              ${deleteOption}
            </div>
          </div>
        </div>
      `;
      contentBox.appendChild(div);
    });
  });
}

function toggleMoreMenu(id) {
  const menu = document.getElementById(id);
  const isOpen = menu.classList.contains('show');
  const card = menu.closest('.schedule-item');

  // Close all other menus and reset z-index
  document.querySelectorAll('.menu-dropdown').forEach(m => m.classList.remove('show'));
  document.querySelectorAll('.schedule-item').forEach(c => c.style.zIndex = 'auto');

  if (!isOpen) {
    menu.classList.add('show');
    if (card) card.style.zIndex = '2005'; // Bring to front 🦈⚓
  }
}

// Close menus when clicking outside
document.addEventListener('click', (e) => {
  if (!e.target.closest('.more-menu')) {
    document.querySelectorAll('.menu-dropdown').forEach(m => m.classList.remove('show'));
    document.querySelectorAll('.schedule-item').forEach(c => c.style.zIndex = 'auto');
  }
});

function addSectionToGroup(scheduleName) {
  (async () => {
    const sectionName = await showPrompt(
      `Add Section to "${scheduleName}"`,
      "Enter the section name for this new schedule (e.g. ICT 201):"
    );

    if (!sectionName) return;

    const cleanName = sectionName.trim().toUpperCase();

    // Check local duplicate
    const exists = schedules.some(s => s.scheduleName === scheduleName && s.section === cleanName);
    if (exists) {
      showToast(`Section "${cleanName}" already exists in this group.`, "error");
      return;
    }

    // Find a sibling to clone settings
    const sibling = schedules.find(s => s.scheduleName === scheduleName);
    if (!sibling) {
      showToast("Group data not found", "error");
      return;
    }

      try {
        showToast(`Checking Section "${cleanName}"...`, "info");

        // 🛡️ HARD Firestore Check (Avoid Race Conditions) ⚓
        const q = query(
          collection(db, "schedules"),
          where("scheduleName", "==", scheduleName),
          where("section", "==", cleanName)
        );
        const snap = await getDocs(q);

        if (!snap.empty) {
          showToast(`Wait! "${cleanName}" was already created by someone else.`, "warning");
          renderAll(); // Refresh to show the latest
          return;
        }

        showToast(`Creating section ${cleanName}...`, "info");

      const startMin = toMin(sibling.startTime);
      const endMin = toMin(sibling.endTime);
      const interval = 90; // Strictly 90 mins
      const days = sibling.selectedDays || [];

      if (!days.length) {
        showToast("No days defined for this group", "error");
        return;
      }

      const newClasses = [];
      days.forEach(day => {
        for (let m = startMin; m + interval <= endMin; m += interval) {
          newClasses.push({
            day,
            timeBlock: `${toTime(m)}-${toTime(m + interval)}`,
            subject: "VACANT",
            teacher: "NA",
            room: "NA"
          });
        }
      });

      const docRef = await addDoc(collection(db, "schedules"), {
        userId: currentUser.uid,
        author: currentUser.displayName || currentUser.email || "Unknown",
        section: cleanName,
        scheduleName: scheduleName,
        startTime: sibling.startTime,
        endTime: sibling.endTime,
        selectedDays: days,
        classes: [], // AUTO-CLEAR 🧹✨
        status: "published", // AUTO-PUBLISH 📢
        updated: new Date().toDateString(),
        createdAt: Date.now()
      });

      // Optimistic UI Update
      schedules.push({
        id: docRef.id,
        userId: currentUser.uid,
        author: currentUser.displayName || currentUser.email || "Unknown",
        section: cleanName,
        scheduleName: scheduleName,
        startTime: sibling.startTime,
        endTime: sibling.endTime,
        selectedDays: days,
        classes: [], // AUTO-CLEAR
        status: "published", // AUTO-PUBLISH
        updated: new Date().toDateString(),
        createdAt: Date.now()
      });

      showToast(`Section "${cleanName}" added successfully!`, "success");
      renderAll(false); // Skip fetch for speed! 🚀
    } catch (err) {
      console.error("Add section failed", err);
      showToast("Failed to add section", "error");
    }
  })();
}
window.toggleMoreMenu = toggleMoreMenu;
window.addSectionToGroup = addSectionToGroup;

function toggleFolder(id) {
  const content = document.getElementById(id);
  const header = content.previousElementSibling;

  if (content.classList.contains("open")) {
    content.classList.remove("open");
    header.classList.remove("open");
  } else {
    content.classList.add("open");
    header.classList.add("open");
  }
}
window.toggleFolder = toggleFolder;

/* =============================
   ACTIONS (Firestore)
   ============================= */
/* =============================
   ACTIONS (Firestore)
   ============================= */
function publishGroup(scheduleName) {
  // Use the Promise-based standardized showConfirm
  // Signature from toast.js/realtime-notifications.js seems to vary, checking toast.js...
  // Assuming toast.js is the main one used here which likely returns a Promise.
  // Converting to the pattern: if (await showConfirm(...))

  // Wait, let's wrap it in an async IIFE to use await
  (async () => {
    if (await showConfirm(`Publish all schedules in "${scheduleName}"?`)) {
      try {
        // Fetch ALL schedules in this group
        let q;
        if (currentUserRole === 'admin') {
          q = query(collection(db, "schedules"),
            where("scheduleName", "==", scheduleName)
          );
        } else {
          q = query(collection(db, "schedules"),
            where("userId", "==", currentUser.uid),
            where("scheduleName", "==", scheduleName)
          );
        }

        const snap = await getDocs(q);

        // Filter client-side: items that are NOT already published
        const docsToUpdate = snap.docs.filter(d => d.data().status !== "published" && d.data().section !== "EVENTS");

        if (docsToUpdate.length === 0) {
          showToast("No draft schedules found in this group.", "info");
          return;
        }

        const updates = docsToUpdate.map(d => updateDoc(doc(db, "schedules", d.id), {
          status: "published",
          updated: new Date().toDateString()
        }));

        await Promise.all(updates);

        // Notify 🦈
        if (window.createNotification) {
          await window.createNotification(db, "ALL", "NEW SCHEDULE", `Success! The schedule for "${scheduleName}" is now officially published.`, currentUser.displayName || currentUser.email || "System", { isAnnouncement: true, targetPage: 'myschedule.html', linkedEventId: String(scheduleName) });
        }

        showToast("Group published successfully!", "success");
        renderAll();

        // --- AUDIT LOG 📜 ---
        logAction("PUBLISH_GROUP", `Published schedule group: ${scheduleName}`, { scheduleName });
      } catch (error) {
        console.error("Error publishing group:", error);
        showToast("Failed to publish group.", "error");
      }
    }
  })();
}

function unpublishGroup(scheduleName) {
  (async () => {
    if (await showConfirm("Unpublish Group?", `Are you sure you want to unpublish all schedules in "${scheduleName}"?`)) {
      try {
        let q;
        if (currentUserRole === 'admin') {
          q = query(collection(db, "schedules"),
            where("scheduleName", "==", scheduleName),
            where("status", "==", "published")
          );
        } else {
          q = query(collection(db, "schedules"),
            where("userId", "==", currentUser.uid),
            where("scheduleName", "==", scheduleName),
            where("status", "==", "published")
          );
        }

        const snap = await getDocs(q);

        if (snap.empty) {
          showToast("No published schedules found in this group.", "info");
          return;
        }

        const updates = snap.docs.map(d => updateDoc(doc(db, "schedules", d.id), {
          status: "draft"
        }));

        await Promise.all(updates);

        // Cleanup 🧹
        if (window.cleanupAnnouncement) {
          await window.cleanupAnnouncement(db, scheduleName);
        }

        showToast("Group unpublished successfully!", "success");
        renderAll();

        // --- AUDIT LOG 📜 ---
        logAction("UNPUBLISH_GROUP", `Unpublished schedule group: ${scheduleName}`, { scheduleName });
      } catch (error) {
        console.error("Error unpublishing group:", error);
        showToast("Failed to unpublish group.", "error");
      }
    }
  })();
}

function editGroup(scheduleName) {
  window.location.href = `editpage.html?name=${encodeURIComponent(scheduleName)}`;
}

async function publishSchedule(id) {
  try {
    await updateDoc(doc(db, "schedules", id), {
      status: "published",
      updated: new Date().toDateString()
    });

    // Notify
    const schedSnap = await getDoc(doc(db, "schedules", id));
    const schedData = schedSnap.data();
    if (window.createNotification) {
      await window.createNotification(db, "ALL", "NEW SCHEDULE", `Success! The schedule for "${schedData.scheduleName} - ${schedData.section}" is now officially published.`, currentUser.displayName || currentUser.email || "System", { isAnnouncement: true, targetPage: 'myschedule.html', linkedEventId: String(id) });
    }

    showToast("Schedule published successfully!", "success");
    renderAll();
  } catch (error) {
    console.error("Error publishing schedule:", error);
    showToast("Failed to publish schedule.", "error");
  }
}

async function unpublishSchedule(id) {
  try {
    await updateDoc(doc(db, "schedules", id), {
      status: "draft"
    });

    // Cleanup
    if (window.cleanupAnnouncement) {
      await window.cleanupAnnouncement(db, id);
    }

    showToast("Schedule unpublished.", "success");
    renderAll();
  } catch (error) {
    console.error("Error unpublishing schedule:", error);
    showToast("Failed to unpublish schedule.", "error");
  }
}

function removeSchedule(id) {
  (async () => {
    if (await showConfirm("Remove Schedule?", "Are you sure you want to remove this section? This action cannot be undone.")) {
      // 🎭 VACUUM ANIMATION
      const card = document.getElementById(`sched-${id}`);

      // Find the Remove button within this card to be the "Vacuum Target"
      // Since we are inside the click handler, we can find it relative to the card
      const removeBtn = card ? card.querySelector('.action-button.remove') : null;

      if (card && removeBtn) {
        // 1. Create a clone for flying (or just animate the card itself?)
        // Animating the card itself is easier but might affect layout shift.
        // Let's create a clone to fly, and hide the original immediately (to prevent layout shift, placeholder?)
        // Actually, for a card, "Implosion" might be better.
        // Let's do the Vacuum: Clone the card visually, put it in fixed position, then suck it into the button.

        const rect = card.getBoundingClientRect();
        const btnRect = removeBtn.getBoundingClientRect();

        // Create clone
        const clone = card.cloneNode(true);
        clone.style.position = 'fixed';
        clone.style.left = `${rect.left}px`;
        clone.style.top = `${rect.top}px`;
        clone.style.width = `${rect.width}px`;
        clone.style.height = `${rect.height}px`;
        clone.style.margin = '0';
        clone.style.zIndex = '9999';
        clone.style.pointerEvents = 'none';
        document.body.appendChild(clone);

        // Hide original (keep space? or shrink space?)
        // To look "Maangas", let's shrink the original's height to 0 simultaneously so the list collapses smoothly.
        card.style.transition = 'all 0.5s ease';
        card.style.opacity = '0';
        card.style.transform = 'scale(0.9)';

        // Animate Clone
        const targetX = btnRect.left + btnRect.width / 2;
        const targetY = btnRect.top + btnRect.height / 2;

        // Calculate translation to center of button
        // We want the center of the card to go to center of button.
        const currentCenterX = rect.left + rect.width / 2;
        const currentCenterY = rect.top + rect.height / 2;

        const moveX = targetX - currentCenterX;
        const moveY = targetY - currentCenterY;

        const animation = clone.animate([
          { transform: 'translate(0, 0) scale(1) rotate(0deg)', opacity: 1 },
          { transform: `translate(${moveX}px, ${moveY}px) scale(0.05) rotate(720deg)`, opacity: 0 }
        ], {
          duration: 600,
          easing: 'cubic-bezier(0.55, 0.055, 0.675, 0.19)' // easeInQuintish
        });

        await animation.finished;
        clone.remove();
      }

      try {
        // Hide card fully before delete to prevent jump
        if (card) card.style.display = 'none';

        // Cleanup
        if (window.cleanupAnnouncement) {
          await window.cleanupAnnouncement(db, id);
        }

        await deleteDoc(doc(db, "schedules", id));
        showToast("Schedule removed.", "success");
        renderAll();
      } catch (error) {
        console.error("Error removing schedule:", error);
        showToast("Failed to remove schedule.", "error");
        // Revert if failed
        if (card) {
          card.style.display = 'flex';
          card.style.opacity = '1';
        }
      }
    }
  })();
}

function editSchedule(id) {
  window.location.href = `editpage.html?id=${id}`;
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

  // Ensure libraries are loaded
  if (format === 'excel' && !window.XLSX) {
    const script = document.createElement('script');
    script.src = "https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/dist/xlsx.bundle.js";
    script.onload = () => downloadSchedule(id, 'excel', isBatch);
    document.head.appendChild(script);
    return;
  }

  // Maangas Flying Animation (if button exists)
  const btn = document.querySelector(`.more-icon[onclick*="${id}"]`) || document.querySelector('.publish-all-btn');
  if (btn) {
    const flyer = document.createElement('div');
    flyer.className = 'flying-download';
    flyer.textContent = format === 'excel' ? '📊' : '📄';
    flyer.style.position = 'fixed';
    flyer.style.zIndex = '10000';
    flyer.style.fontSize = '30px';
    flyer.style.pointerEvents = 'none';
    const rect = btn.getBoundingClientRect();
    if (rect) {
      flyer.style.left = `${rect.left}px`;
      flyer.style.top = `${rect.top}px`;
      document.body.appendChild(flyer);
      flyer.animate([
        { transform: 'scale(1) translate(0, 0)', opacity: 1 },
        { transform: 'scale(1.5) translate(0, -50px)', opacity: 1 },
        { transform: 'scale(0) translate(0, 200px)', opacity: 0 }
      ], { duration: 800, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' }).onfinish = () => flyer.remove();
    }
  }

  if (format === 'excel') {
    try {
      const wb = XLSX.utils.book_new();
      const wsData = [];

      // Document Headers
      wsData.push(["STI COLLEGE SANTA MARIA"]);
      wsData.push(["OFFICIAL CLASS RECORD"]);
      wsData.push([`SECTION: ${sched.section || "N/A"}`]);
      wsData.push(["ACADEMIC YEAR 2025-2026"]);
      wsData.push([]); // Spacer

      const daySet = new Set();
      (sched.selectedDays || []).forEach(d => { if (d) daySet.add(d); });
      (sched.classes || []).forEach(c => { if (c && c.day) daySet.add(c.day); });
      let localDays = Array.from(daySet);
      if (localDays.length === 0) localDays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
      const ORDER = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
      localDays.sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));

      // Grid Column Headers
      const headerRow = ["TIME BLOCK", ...localDays];
      wsData.push(headerRow);

      // Build Schedule Matrix
      const timePoints = new Set();
      const START_MIN_EXPORT = 450;
      const END_MIN_EXPORT = 1080;
      const INTERVAL_EXPORT = 90;
      for (let m = START_MIN_EXPORT; m <= END_MIN_EXPORT; m += INTERVAL_EXPORT) timePoints.add(m);
      (sched.classes || []).forEach(c => {
        const block = parseBlock(c.timeBlock);
        if (block) {
          timePoints.add(block.start);
          timePoints.add(block.end);
        }
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

      matrixIntervals.forEach(interval => {
        const row = [interval.label];
        localDays.forEach(day => {
          // Find class matching day and time interval
          const classItem = (sched.classes || []).find(c => {
            const classDays = Array.isArray(c.day) ? c.day : [c.day];
            const dayMatch = classDays.some(d => normalizeDay(d) === normalizeDay(day));
            if (!dayMatch) return false;

            const block = parseBlock(c.timeBlock);
            if (!block) return false;

            // Overlap check: block spans this interval if:
            // class start < interval end AND class end > interval start
            return block.start < interval.end && block.end > interval.start;
          });

          if (classItem && classItem.subject !== "VACANT" && classItem.subject !== "MARKED_VACANT") {
            const cleanRoom = (classItem.room || "").replace(/\s*\|?\s*\d{1,3}%\s*(?:OCCUPIED)?$/i, "").trim();
            row.push(`${classItem.subject}\n${classItem.teacher}\nRoom ${cleanRoom}`);
          } else {
            row.push("");
          }
        });
        wsData.push(row);
      });

      // 4. Footer
      wsData.push([]);
      wsData.push(["GENERATED VIA SCHEDSYNC ENGINE"]);

      const ws = XLSX.utils.aoa_to_sheet(wsData);

      // Define Merges
      ws['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: localDays.length } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: localDays.length } },
        { s: { r: 2, c: 0 }, e: { r: 2, c: localDays.length } },
        { s: { r: 3, c: 0 }, e: { r: 3, c: localDays.length } },
        { s: { r: wsData.length - 1, c: 0 }, e: { r: wsData.length - 1, c: localDays.length } }
      ];

      // Apply Styling
      const range = XLSX.utils.decode_range(ws['!ref']);
      const STI_BLUE = "005BAB";
      const STI_YELLOW = "FFD200";
      const BORDER_COLOR = "000000";

      for (let R = range.s.r; R <= range.e.r; ++R) {
        for (let C = range.s.c; C <= range.e.c; ++C) {
          const cell_ref = XLSX.utils.encode_cell({ r: R, c: C });
          if (!ws[cell_ref]) ws[cell_ref] = { t: 's', v: '' };

          ws[cell_ref].s = {
            alignment: { vertical: "center", horizontal: "center", wrapText: true },
            font: { name: "Inter", sz: 10, color: { rgb: "000000" } }
          };

          if (R === 0) ws[cell_ref].s.font = { name: "Inter", sz: 14, bold: true, color: { rgb: STI_BLUE } };
          if (R === 1) ws[cell_ref].s.font = { name: "Inter", sz: 24, bold: true, color: { rgb: "000000" } };
          if (R === 2) {
            ws[cell_ref].s.fill = { fgColor: { rgb: STI_YELLOW } };
            ws[cell_ref].s.font = { name: "Inter", sz: 12, bold: true };
          }
          if (R === 3) ws[cell_ref].s.font = { name: "Inter", sz: 10, bold: true, color: { rgb: "64748b" } };

          if (R === 5) {
            ws[cell_ref].s.fill = { fgColor: { rgb: STI_BLUE } };
            ws[cell_ref].s.font = { name: "Inter", sz: 11, bold: true, color: { rgb: "FFFFFF" } };
            ws[cell_ref].s.border = {
              top: { style: "medium", color: { rgb: BORDER_COLOR } },
              bottom: { style: "thick", color: { rgb: BORDER_COLOR } },
              left: { style: "medium", color: { rgb: BORDER_COLOR } },
              right: { style: "medium", color: { rgb: BORDER_COLOR } }
            };
          }

          if (R > 5 && C === 0 && R < wsData.length - 2) {
            ws[cell_ref].s.font.bold = true;
            ws[cell_ref].s.fill = { fgColor: { rgb: "F1F5F9" } };
            ws[cell_ref].s.border = {
              left: { style: "medium", color: { rgb: BORDER_COLOR } },
              right: { style: "medium", color: { rgb: BORDER_COLOR } },
              bottom: { style: "thin", color: { rgb: "cbd5e1" } }
            };
          }

          if (R > 5 && C > 0 && R < wsData.length - 2) {
            const interval = matrixIntervals[R - 6];
            const day = localDays[C - 1];
            const classItem = (sched.classes || []).find(c => {
              const classDays = Array.isArray(c.day) ? c.day : [c.day];
              const dayMatch = classDays.some(d => normalizeDay(d) === normalizeDay(day));
              if (!dayMatch) return false;
              const block = parseBlock(c.timeBlock);
              return block && block.start < interval.end && block.end > interval.start;
            });

            ws[cell_ref].s.border = {
              bottom: { style: "thin", color: { rgb: "cbd5e1" } },
              right: { style: "thin", color: { rgb: "cbd5e1" } }
            };

            if (classItem && classItem.subject !== "VACANT" && classItem.subject !== "MARKED_VACANT") {
              const hexColor = (classItem.color || "#BFDBFE").replace("#", "");
              ws[cell_ref].s.fill = { fgColor: { rgb: hexColor } };
              ws[cell_ref].s.font.bold = true;
              ws[cell_ref].s.font.sz = 11;
              if (C === range.e.c) {
                ws[cell_ref].s.border.right = { style: "medium", color: { rgb: BORDER_COLOR } };
              }
            }
          }

          if (R === wsData.length - 1) ws[cell_ref].s.font = { name: "Inter", sz: 9, italic: true, color: { rgb: "94a3b8" } };
        }
      }

      ws['!cols'] = [{ wch: 25 }, ...localDays.map(() => ({ wch: 40 }))];
      ws['!rows'] = wsData.map((r, i) => {
        if (i < 4) return { hpt: 40 };
        if (i === 1) return { hpt: 60 };
        if (i > 5 && i < wsData.length - 2) return { hpt: 85 };
        return { hpt: 30 };
      });

      XLSX.utils.book_append_sheet(wb, ws, "Schedule");
      XLSX.writeFile(wb, `${sched.section || 'Schedule'}_Export.xlsx`);
      showToast("Records saved", "success");
    } catch (err) {
      console.error("Export Error:", err);
      showToast("Download failed", "error");
    }
  } else {
    // FALLBACK TO CSV
    const ROWS = [];
    ROWS.push(["SCHEDULE", sched.scheduleName || "Untitled"]);
    ROWS.push(["SECTION", sched.section || "N/A"]);
    ROWS.push([]);
    ROWS.push(["DAY", "TIME", "SUBJECT", "TEACHER", "ROOM"]);

    const classes = sched.classes || [];
    classes.sort((a, b) => {
      const dayOrder = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      if (a.day !== b.day) return dayOrder.indexOf(a.day) - dayOrder.indexOf(b.day);
      return toMin(a.timeBlock.split("-")[0]) - toMin(b.timeBlock.split("-")[0]);
    });

    classes.forEach(c => {
      if (c.subject !== "VACANT" && c.subject !== "MARKED_VACANT") {
        const cleanRoom = (c.room || "").replace(/\s*\|?\s*\d{1,3}%\s*(?:OCCUPIED)?$/i, "").trim();
        ROWS.push([c.day, c.timeBlock, c.subject, c.teacher, cleanRoom]);
      }
    });

    const csvContent = "data:text/csv;charset=utf-8," + ROWS.map(r => r.map(v => `"${v}"`).join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Schedule_${sched.section || "Unknown"}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    if (!isBatch) showToast(`Downloading: ${sched.section}`, "success");
  }
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
    <div class="export-card-container" style="background: white; border: 5px solid black; padding: 45px; border-radius: 32px; box-shadow: 15px 15px 0px #000; text-align: center; max-width: 550px; width: 95%; transform: scale(0.9); transition: all 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275); position: relative;">
      
      <button class="close-modal-btn" style="position: absolute; top: 20px; right: 20px; background: #f1f5f9; border: 3px solid black; width: 40px; height: 40px; border-radius: 12px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: 900; transition: all 0.2s; box-shadow: 3px 3px 0px black;">×</button>

      <div style="margin-bottom: 35px;">
        <h2 style="color: #005BAB; font-size: 32px; font-weight: 950; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 2px;">Download Data</h2>
        <p style="font-size: 16px; color: #64748b; font-weight: 700;">Choose your export format below.</p>
      </div>

      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 25px;">
        
        <!-- EXCEL OPTION -->
        <div class="format-option xls-btn" style="background: #f0fdf4; border: 4px solid black; padding: 30px 20px; border-radius: 20px; cursor: pointer; transition: all 0.3s; box-shadow: 6px 6px 0px black; position: relative; overflow: hidden;">
          <div style="font-size: 45px; margin-bottom: 15px;">📊</div>
          <div style="font-weight: 900; color: #166534; font-size: 14px; text-transform: uppercase;">Excel Sheet</div>
          <div style="font-size: 11px; color: #22c55e; font-weight: 700; margin-top: 5px;">Styled Spreadsheet</div>
          <div class="hover-glow" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: radial-gradient(circle at center, rgba(34, 197, 94, 0.1) 0%, transparent 70%); opacity: 0; transition: opacity 0.3s;"></div>
        </div>

        <!-- CSV OPTION -->
        <div class="format-option csv-btn" style="background: #f8fafc; border: 4px solid black; padding: 30px 20px; border-radius: 20px; cursor: pointer; transition: all 0.3s; box-shadow: 6px 6px 0px black; position: relative; overflow: hidden;">
          <div style="font-size: 45px; margin-bottom: 15px;">📑</div>
          <div style="font-weight: 900; color: #334155; font-size: 14px; text-transform: uppercase;">Raw CSV</div>
          <div style="font-size: 11px; color: #64748b; font-weight: 700; margin-top: 5px;">Pure Data Export</div>
          <div class="hover-glow" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: radial-gradient(circle at center, rgba(100, 116, 139, 0.1) 0%, transparent 70%); opacity: 0; transition: opacity 0.3s;"></div>
        </div>

      </div>

      <div style="margin-top: 35px; font-size: 12px; color: #94a3b8; font-weight: 800; text-transform: uppercase; letter-spacing: 1px;">
        SchedSync Export Suite
      </div>
    </div>

    <style>
      .format-option:hover {
        transform: translate(-4px, -4px);
        box-shadow: 10px 10px 0px black;
      }
      .format-option:hover .hover-glow {
        opacity: 1;
      }
      .format-option:active {
        transform: translate(2px, 2px);
        box-shadow: 2px 2px 0px black;
      }
      .close-modal-btn:hover {
        background: #ef4444;
        color: white;
        transform: scale(1.1);
      }
    </style>
  `;

  document.body.appendChild(overlay);

  // Animate Entrance
  requestAnimationFrame(() => {
    overlay.style.opacity = "1";
    overlay.querySelector('.export-card-container').style.transform = "scale(1)";
  });

  const close = () => {
    overlay.style.opacity = "0";
    overlay.querySelector('.export-card-container').style.transform = "scale(0.9)";
    setTimeout(() => overlay.remove(), 400);
  };

  overlay.querySelector('.xls-btn').onclick = () => { close(); setTimeout(() => callback('excel'), 450); };
  overlay.querySelector('.csv-btn').onclick = () => { close(); setTimeout(() => callback('csv'), 450); };
  overlay.querySelector('.close-modal-btn').onclick = close;
  overlay.onclick = (e) => { if (e.target === overlay) close(); };
}

function downloadAll() {
  if (schedules.length === 0) {
    showToast("No schedules to download.", "info");
    return;
  }

  showDownloadFormatSelector((format) => {
    const count = schedules.length;
    showToast(`🚀 Launching ${count} ${format.toUpperCase()} downloads...`, "success");

    schedules.forEach((s, index) => {
      // Delay each download slightly to avoid browser blocking multiple downloads
      setTimeout(() => {
        downloadSchedule(s.id, format, true);
        if (index === count - 1) {
          setTimeout(() => {
            showToast("✅ All schedules downloaded!", "success");
          }, 1000);
        }
      }, index * 400);
    });
  });
}

/* =============================
   EXPOSE TO WINDOW
   ============================= */
window.downloadAll = downloadAll;
window.publishSchedule = publishSchedule;
window.unpublishSchedule = unpublishSchedule;
window.removeSchedule = removeSchedule;
window.editSchedule = editSchedule;
window.downloadSchedule = downloadSchedule;
window.publishGroup = publishGroup;
window.unpublishGroup = unpublishGroup;
window.editGroup = editGroup;
window.deleteGroup = deleteGroup;

async function deleteGroup(scheduleName) {
  if (await showConfirm("PERMANENT DELETE?", `This will REMOVE ALL sections in "${scheduleName}". This action is permanent and cannot be reversed. Proceed?`)) {
    try {
      showToast(`Deleting group "${scheduleName}"...`, "info");

      let q;
      if (currentUserRole === 'admin') {
        q = query(collection(db, "schedules"), where("scheduleName", "==", scheduleName));
      } else {
        q = query(collection(db, "schedules"), where("userId", "==", currentUser.uid), where("scheduleName", "==", scheduleName));
      }

      const snap = await getDocs(q);
      if (snap.empty) {
        showToast("No schedules found to delete.", "info");
        return;
      }

      const deletes = snap.docs.map(d => deleteDoc(doc(db, "schedules", d.id)));
      await Promise.all(deletes);

      // Cleanup associated announcements if any
      if (window.cleanupAnnouncement) {
        await window.cleanupAnnouncement(db, scheduleName);
      }

      showToast(`Group "${scheduleName}" deleted successfully!`, "success");
      renderAll();

      // --- AUDIT LOG 📜 ---
      logAction("DELETE_GROUP", `Deleted schedule group: ${scheduleName}`, { scheduleName });
    } catch (error) {
      console.error("Error deleting group:", error);
      showToast("Failed to delete group.", "error");
    }
  }
}

/* =============================
   HISTORY MODAL
   ============================= */
function showHistoryModal(section, history) {
  // Remove existing
  const old = document.getElementById('history-modal-overlay');
  if (old) old.remove();

  const overlay = document.createElement('div');
  overlay.id = 'history-modal-overlay';
  overlay.className = 'history-modal-overlay';
  overlay.style.display = 'flex';

  const isAdmin = (currentUserRole || "").toLowerCase() === 'admin';

  const historyHtml = history.length > 0
    ? history.slice().reverse().map((entry, idx) => {
      const date = new Date(entry.timestamp).toLocaleString();
      // Handle multi-line details 📜
      const detailsHtml = entry.details ? entry.details.split(' | ').map(d => `<div class="history-detail-item">• ${d}</div>`).join('') : '';

      // Management "X" for admins ❌
      const deleteBtn = isAdmin ? `<div class="history-delete-entry" title="Delete this entry" onclick="deleteHistoryEntry('${history.length - 1 - idx}', '${history[history.length - 1 - idx].timestamp}')">×</div>` : '';

      return `
        <div class="history-entry" style="position: relative;">
          ${deleteBtn}
          <div class="history-entry-top">
            <span class="history-user">${entry.user}</span>
            <span class="history-date">${date}</span>
          </div>
          <div class="history-action">${entry.action}</div>
          ${entry.details ? `<div class="history-details">${detailsHtml}</div>` : ''}
        </div>
      `;
    }).join('')
    : '<div style="padding: 60px 40px; text-align: center; color: #94a3b8; font-weight: 700; font-size: 1.1rem;">No edit history found 🕸️</div>';

  const clearBtn = (isAdmin && history.length > 0) ? `<button class="history-clear-btn" onclick="clearHistory()">CLEAR ALL</button>` : '';

  overlay.innerHTML = `
    <div class="history-modal-content">
      <div class="history-modal-header">
        <h3>📜 EDIT HISTORY: ${section}</h3>
        <span class="history-modal-close" onclick="document.getElementById('history-modal-overlay').remove()">×</span>
      </div>
      <div class="history-list" id="history-modal-list">
        ${historyHtml}
      </div>
      <div class="history-modal-footer" style="display: flex; justify-content: center;">
        ${clearBtn}
      </div>

    </div>
  `;

  document.body.appendChild(overlay);

  // Close on click outside
  overlay.onclick = (e) => {
    if (e.target === overlay) overlay.remove();
  };
  // Store current ID for helpers
  overlay.dataset.schedId = currentSchedIdForHistory;
}

let currentSchedIdForHistory = "";
async function viewHistory(schedId) {
  currentSchedIdForHistory = schedId;
  try {
    showToast("Fetching history...", "info");
    const docSnap = await getDoc(doc(db, "schedules", schedId));
    if (!docSnap.exists()) {
      showToast("Schedule not found", "error");
      return;
    }

    const data = docSnap.data();
    const history = data.history || [];
    showHistoryModal(data.section || "Schedule", history);
  } catch (err) {
    console.error("View history failed", err);
    showToast("Failed to load history", "error");
  }
}

async function clearHistory() {
  if (!currentSchedIdForHistory) return;
  if (!await showConfirm("Clear History?", "Are you sure you want to CLEAR ALL edit history for this schedule? This cannot be undone 🚽")) return;

  try {
    showToast("Clearing history...", "info");
    await updateDoc(doc(db, "schedules", currentSchedIdForHistory), {
      history: []
    });
    showToast("History cleared ✨", "success");
    document.getElementById('history-modal-overlay').remove();
  } catch (err) {
    console.error("Clear failed", err);
    showToast("Failed to clear history", "error");
  }
}

async function deleteHistoryEntry(index, timestamp) {
  if (!currentSchedIdForHistory) return;
  if (!await showConfirm("Delete Entry?", "Delete this specific history entry? 🗑️")) return;

  try {
    showToast("Removing entry...", "info");
    const docRef = doc(db, "schedules", currentSchedIdForHistory);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return;

    const history = snap.data().history || [];
    // Filter out by index and timestamp for safety 🛡️
    const updatedHistory = history.filter((entry, idx) => {
      return !(idx == index && entry.timestamp == timestamp);
    });

    await updateDoc(docRef, { history: updatedHistory });
    showToast("Entry deleted ✅", "success");

    // Refresh modal 🔄
    viewHistory(currentSchedIdForHistory);
  } catch (err) {
    console.error("Delete entry failed", err);
    showToast("Failed to delete entry", "error");
  }
}

window.viewHistory = viewHistory;
window.clearHistory = clearHistory;
window.deleteHistoryEntry = deleteHistoryEntry;

/* =============================
   START
   ============================= */
// renderAll is now managed inside onAuthStateChanged logic at the top
