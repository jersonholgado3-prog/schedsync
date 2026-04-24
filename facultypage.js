import { db, auth } from "./js/config/firebase-config.js";
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  where,
  getDocs,
  addDoc,
  writeBatch,
  doc,
  deleteDoc
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, deleteUser } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { initUniversalSearch } from './search.js';
import { initUserProfile } from "./userprofile.js";
import { initMobileNav } from "./js/ui/mobile-nav.js";
import { showToast, showConfirm } from "./js/utils/ui-utils.js";
import { startImportProgress, tickImportProgress, clearImportProgress, isCancelled } from "./import-progress.js";


// Secondary App Configuration for creating users without logging out admin
const secondaryConfig = {
  apiKey: "AIzaSyBrtJocBlfkPciYO7f8-7FwREE1tSF3VXU",
  authDomain: "schedsync-e60d0.firebaseapp.com",
  projectId: "schedsync-e60d0",
  storageBucket: "schedsync-e60d0.firebasestorage.app",
  messagingSenderId: "334140247575",
  appId: "1:334140247575:web:930b0c12e024e4defc5652"
};

let allFaculty = [];
let selectedIds = new Set();

// --- DRAG & DROP LOGIC ---

function initDragAndDrop() {
  const overlay = document.getElementById('dropZoneOverlay');
  if (!overlay) return;

  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    document.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
    }, false);
  });

  document.addEventListener('dragenter', (e) => {
    overlay.classList.add('active');
  });

  overlay.addEventListener('click', () => overlay.classList.remove('active'));

  document.addEventListener('dragleave', (e) => {
    if (e.relatedTarget === null || e.clientX <= 0 || e.clientY <= 0 || e.clientX >= window.innerWidth || e.clientY >= window.innerHeight) {
      overlay.classList.remove('active');
    }
  });

  document.addEventListener('drop', async (e) => {
    overlay.classList.remove('active');
    const items = e.dataTransfer.items;
    if (!items) return;

    const facultyNames = [];

    async function traverseFileTree(item) {
      if (item.isFile) {
        const name = item.name.split('.').slice(0, -1).join('.') || item.name;
        if (name && !name.startsWith('.') && name !== 'Thumbs' && !facultyNames.includes(name)) {
          facultyNames.push(name);
        }
      } else if (item.isDirectory) {
        const dirReader = item.createReader();
        const entries = await new Promise((resolve) => {
          dirReader.readEntries((entries) => resolve(entries));
        });
        for (const entry of entries) {
          await traverseFileTree(entry);
        }
      }
    }

    const processPromises = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i].webkitGetAsEntry();
      if (item) processPromises.push(traverseFileTree(item));
    }

    await Promise.all(processPromises);

    if (facultyNames.length > 0) {
      const confirmImport = await showConfirm(
        `Found ${facultyNames.length} potential faculty members. Import them and auto-generate accounts?`,
        "Bulk Import & Account Creation"
      );
      if (confirmImport) {
        await importFacultyMembers(facultyNames);
      }
    } else {
      showToast("No valid files or folders found.", "error");
    }
  });
}

async function importFacultyMembers(items) {
  showToast(`Processing 0/${items.length}...`, "info");
  startImportProgress(items.length);
  let succeeded = 0;

  // Ensure allFaculty is populated so duplicate check works
  if (allFaculty.length === 0) await loadTeachers();

  for (let i = 0; i < items.length; i++) {
    if (isCancelled()) break;
    const item = items[i];
    let name, existingId, existingData;
    if (typeof item === 'object') {
      name = item.username || item.name;
      existingId = item.id;
      existingData = item;
    } else {
      name = item;
      existingId = null;
      existingData = null;
    }

    const sanitizedName = name.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
    const email = `${sanitizedName}@stamaria.sti.edu`;
    const lastName = name.trim().split(' ').pop().replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
    const password = `${lastName}@SCHEDSYNC`;

    // Skip if already in Firestore
    if (allFaculty.some(f => (f.email || '').toLowerCase() === email.toLowerCase())) {
      tickImportProgress();
      showToast(`Skipped (already exists): ${name}`, "info");
      continue;
    }

    let tempApp = null;
    let retries = 0;
    let processed = false;

    while (retries <= 3) {
      try {
        const tempAppName = "AuthGen-" + sanitizedName + "-" + Math.random().toString(36).substring(7);
        tempApp = initializeApp(secondaryConfig, tempAppName);
        const tempAuth = getAuth(tempApp);

        let uid = null;
        try {
          const userCredential = await createUserWithEmailAndPassword(tempAuth, email, password);
          uid = userCredential.user.uid;
        } catch (authErr) {
          if (authErr.code === 'auth/email-already-in-use') {
            const userCredential = await signInWithEmailAndPassword(tempAuth, email, password);
            uid = userCredential.user.uid;
          } else {
            throw authErr;
          }
        }

        const batch = writeBatch(db);
        const facultyData = {
          username: name,
          email: email,
          password: password,
          authUid: uid,
          role: "teacher",
          employmentStatus: (existingData && (existingData.employmentStatus || existingData.status)) || "Part-time",
          subjects: (existingData && existingData.subjects) || [],
          photoURL: (existingData && existingData.photoURL) || "",
          createdAt: (existingData && existingData.createdAt) || new Date().toISOString()
        };
        batch.set(doc(db, "users", uid), facultyData, { merge: true });
        if (existingId && existingId !== uid) batch.delete(doc(db, "users", existingId));
        await batch.commit();

        succeeded++;
        processed = true;
        if (tempApp) await deleteApp(tempApp);
        // 800ms base delay + 200ms extra every 10 records to avoid rate limits
        await new Promise(res => setTimeout(res, 800 + Math.floor(i / 10) * 200));
        break;
      } catch (err) {
        if (tempApp) await deleteApp(tempApp).catch(() => {});
        tempApp = null;
        const isQuota = err.code === 'auth/quota-exceeded' ||
          err.message?.includes('quota') || err.message?.includes('QUOTA_EXCEEDED') ||
          err.status === 429 || err.status === 503;
        if (isQuota) {
          showToast(`⚠️ Firebase quota exceeded. Import stopped at ${succeeded}/${items.length}. Try again tomorrow or upgrade your Firebase plan.`, "error");
          clearImportProgress();
          loadTeachers();
          return;
        } else if (err.code === 'auth/too-many-requests' && retries < 3) {
          const wait = 5000 * (retries + 1); // 5s, 10s, 15s
          showToast(`Rate limited. Retrying in ${wait / 1000}s...`, "info");
          await new Promise(res => setTimeout(res, wait));
          retries++;
        } else {
          console.error(`Failed for ${name}:`, err);
          processed = true; // skip and continue
          break;
        }
      }
    }
    tickImportProgress();
    showToast(`Processing ${i + 1}/${items.length}...`, "info");
  }
  showToast(`Successfully processed ${succeeded}/${items.length} faculty!`, "success");
  loadTeachers();
}

// --- SELECTION LOGIC ---

function initSelectionUI() {
  const selectionBar = document.getElementById('selectionBar');
  const genEmailsBtn = document.getElementById('genEmailsBtn');
  const multiDeleteBtn = document.getElementById('multiDeleteBtn');
  const cancelSelectionBtn = document.getElementById('cancelSelectionBtn');

  if (!selectionBar) return;

  genEmailsBtn.onclick = async () => {
    const selectedFaculty = allFaculty.filter(f => selectedIds.has(f.id));
    const toProcess = selectedFaculty.filter(f => !f.email);

    if (toProcess.length === 0) {
      showToast("Selected members already have accounts.", "info");
      return;
    }

    const confirmed = await showConfirm(`Create accounts for ${toProcess.length} members?`, "Generate Accounts");
    if (!confirmed) return;

    await importFacultyMembers(toProcess);
    selectedIds.clear();
    updateSelectionBar();
  };

  multiDeleteBtn.onclick = async () => {
    const selectedFaculty = allFaculty.filter(f => selectedIds.has(f.id));
    const confirmed = await showConfirm(`Delete ${selectedFaculty.length} members and their accounts?`, "Bulk Delete");
    
    if (confirmed) {
      showToast("Deleting... ⏳", "info");
      for (const f of selectedFaculty) {
        try {
          if (f.email && f.password) await deleteAuthAccount(f.email, f.password);
          await deleteDoc(doc(db, "users", f.id));
          if (f.authUid) await deleteDoc(doc(db, "users", f.authUid));
        } catch (err) {
          console.error("Delete failed for:", f.username, err);
        }
      }
      showToast("Deletion complete.", "success");
      selectedIds.clear();
      updateSelectionBar();
      loadTeachers();
    }
  };

  cancelSelectionBtn.onclick = () => {
    selectedIds.clear();
    updateSelectionBar();
    loadTeachers();
  };

  document.getElementById('deleteAllBtn').onclick = async () => {
    if (allFaculty.length === 0) { showToast("No faculty to delete.", "info"); return; }
    const confirmed = await showConfirm(`Delete ALL ${allFaculty.length} faculty members and their accounts? This cannot be undone.`, "Delete All Faculty");
    if (!confirmed) return;
    showToast("Deleting all... ⏳", "info");
    for (const f of allFaculty) {
      try {
        if (f.email && f.password) await deleteAuthAccount(f.email, f.password);
        await deleteDoc(doc(db, "users", f.id));
        if (f.authUid && f.authUid !== f.id) await deleteDoc(doc(db, "users", f.authUid));
      } catch (err) { console.error("Delete failed for:", f.username, err); }
    }
    showToast("All faculty deleted.", "success");
    selectedIds.clear();
    updateSelectionBar();
    loadTeachers();
  };
}

async function deleteAuthAccount(email, password) {
  let secondaryApp = null;
  try {
    const secondaryAppName = "DeleteApp-" + Date.now() + Math.random().toString(36).substring(7);
    secondaryApp = initializeApp(secondaryConfig, secondaryAppName);
    const secondaryAuth = getAuth(secondaryApp);
    const userCred = await signInWithEmailAndPassword(secondaryAuth, email, password);
    await deleteUser(userCred.user);
  } catch (err) {
    console.warn(`Auth deletion failed for ${email}:`, err.message);
  } finally {
    if (secondaryApp) await deleteApp(secondaryApp).catch(() => {});
  }
}

function updateSelectionBar() {
  const selectionBar = document.getElementById('selectionBar');
  const selectedCountEl = document.getElementById('selectedCount');
  if (selectedIds.size > 0) {
    selectionBar.classList.add('active');
    selectedCountEl.textContent = selectedIds.size;
  } else {
    selectionBar.classList.remove('active');
  }
}

function toggleFacultySelection(id, card) {
  if (selectedIds.has(id)) {
    selectedIds.delete(id);
    card.classList.remove('selected');
  } else {
    selectedIds.add(id);
    card.classList.add('selected');
  }
  updateSelectionBar();
  const checkbox = card.querySelector('.faculty-checkbox');
  if (checkbox) checkbox.checked = selectedIds.has(id);
}

// --- EXISTING FUNCTIONS ---

async function loadTeachers() {
  const facultyGrid = document.getElementById('facultyGrid');
  if (!facultyGrid) return;

  facultyGrid.innerHTML = '';
  for (let i = 0; i < 8; i++) {
    facultyGrid.innerHTML += `
      <div class="faculty-skeleton-card skeleton">
        <div class="skeleton-circle skeleton"></div>
        <div class="skeleton-title skeleton" style="margin: 0 auto 10px;"></div>
        <div class="skeleton-text skeleton" style="width: 60%; margin: 0 auto;"></div>
      </div>
    `;
  }

  try {
    const q = query(collection(db, "users"), where("role", "==", "teacher"));
    const snap = await getDocs(q);

    if (snap.empty) {
      facultyGrid.innerHTML = "<p style='text-align: center; width: 100%; grid-column: 1/-1;'>No teachers found.</p>";
      return;
    }

    facultyGrid.innerHTML = "";
    const rawData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    // Filter duplicates: prefer UID-indexed docs
    const uniqueMap = new Map();
    rawData.forEach(f => {
      const key = f.authUid || f.id;
      if (!uniqueMap.has(key) || f.id === f.authUid) {
        uniqueMap.set(key, f);
      }
    });
    allFaculty = Array.from(uniqueMap.values());
    allFaculty.sort((a, b) => {
      const lastName = f => (f.username || f.name || "").trim().split(' ').pop().toUpperCase();
      return lastName(a).localeCompare(lastName(b));
    });

    allFaculty.forEach(d => {
      const subjects = (d.subjects || []).join(", ");
      const teacherName = d.username || d.name || "Unnamed Teacher";
      const employmentStatus = d.employmentStatus || d.status || "N/A";
      const isSelected = selectedIds.has(d.id);
      const isAdmin = localStorage.getItem('userRole') === 'admin';

      const card = document.createElement("div");
      card.className = `faculty-card ${isSelected ? 'selected' : ''}`;
      card.dataset.title = teacherName;
      card.dataset.description = `${subjects} ${employmentStatus} `;

      card.onclick = (e) => {
        if (selectedIds.size > 0 || e.target.classList.contains('faculty-checkbox')) {
          toggleFacultySelection(d.id, card);
        } else {
          window.location.href = "facultyprofile.html?id=" + d.id;
        }
      };

      card.innerHTML = `
        <div class="checkbox-wrapper">
          <input type="checkbox" class="faculty-checkbox" ${isSelected ? 'checked' : ''}>
        </div>
        <div class="faculty-photo">
          <img src="${d.photoURL || 'images/default_shark.jpg'}"
            onerror="this.src='images/default_shark.jpg'">
        </div>
        <div class="faculty-name">${teacherName}</div>
        <div class="faculty-details">
          ${subjects ? `<strong>Subjects:</strong> ${subjects}` : "No subjects assigned"}
          ${isAdmin && d.email ? `<br><strong>Email:</strong> ${d.email}` : ""}
          ${isAdmin && d.password ? `<br><strong>Password:</strong> ${d.password}` : ""}
        </div>
        <div class="status-badge ${employmentStatus.toLowerCase().includes('regular') ? 'status-regular' : 'status-parttime'}">
          ${employmentStatus}
        </div>
      `;

      facultyGrid.appendChild(card);
    });
  } catch (error) {
    console.error("Error loading teachers:", error);
    facultyGrid.innerHTML = `<p style='text-align: center; width: 100%; grid-column: 1/-1;'>Error loading teachers.</p>`;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initUserProfile("#userProfile");
  initUniversalSearch(db);
  initMobileNav();
  initDragAndDrop();
  initSelectionUI();
  loadTeachers();
});

window.addFaculty = function () {
  showToast("Add Faculty clicked!", "info");
};

// Expose for faculty-doc-import.js
window.importFacultyMembers = importFacultyMembers;
