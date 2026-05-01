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
  deleteDoc,
  setDoc
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
        if (tempApp) await deleteApp(tempApp).catch(() => { });
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
  clearImportProgress();
  showToast(`Successfully processed ${succeeded}/${items.length} faculty!`, "success");
  loadTeachers();
}

// --- SELECTION LOGIC ---

function initSelectionUI() {
  const selectionBar = document.getElementById('selectionBar');
  const genEmailsBtn = document.getElementById('genEmailsBtn');
  const multiDeleteBtn = document.getElementById('multiDeleteBtn');
  const multiArchiveBtn = document.getElementById('multiArchiveBtn');
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

  multiArchiveBtn.onclick = async () => {
    const selectedFaculty = allFaculty.filter(f => selectedIds.has(f.id));
    const { showArchiveModal } = await import('./archive-modal.js');
    const reason = await showArchiveModal(selectedFaculty.length, 'faculty members');
    if (reason === null) return;

    try {
      showToast("Archiving faculty... ⏳", "info");
      const { archiveItem } = await import('./archive-item.js');
      
      for (const f of selectedFaculty) {
        await archiveItem('faculty', f.id, f, reason);
        await deleteDoc(doc(db, 'faculty', f.id));
      }

      showToast(`{selectedFaculty.length} faculty archived successfully`, "success");
      selectedIds.clear();
      loadTeachers();
    } catch (error) {
      console.error("Bulk archive error:", error);
      showToast("Failed to archive faculty", "error");
    }
  };

  multiDeleteBtn.onclick = async () => {
    const selectedFaculty = allFaculty.filter(f => selectedIds.has(f.id));
    const confirmed = await showConfirm(Archive \ faculty members?, 'Move to Archives');

    if (confirmed) {
      showToast('Archiving... ⏳', 'info');
      const { archiveItem } = await import('./archive-item.js');
      for (const f of selectedFaculty) {
        try {
          await archiveItem('faculty', f.id, f, '');
          await deleteDoc(doc(db, 'faculty', f.id));
        } catch (err) {
          console.error('Archive failed for:', f.username, err);
        }
      }
      showToast('Faculty archived successfully.', 'success');
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
    if (secondaryApp) await deleteApp(secondaryApp).catch(() => { });
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
    const [teacherSnap, phSnap] = await Promise.all([
      getDocs(query(collection(db, "users"), where("role", "==", "teacher"))),
      getDocs(query(collection(db, "users"), where("role", "==", "program head")))
    ]);
    const snap = { docs: [...teacherSnap.docs, ...phSnap.docs], empty: teacherSnap.empty && phSnap.empty };

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
      const isProgramHead = localStorage.getItem('userRole') === 'program head';
      const canAssignSubjects = isAdmin || isProgramHead;
      const role = d.role || 'teacher';
      const program = d.program || '';

      // Program Head specialization label
      const programHeadTypes = {
        'ICT/IT': '💻 ICT/IT Program Head',
        'GE': '📚 GE Program Head',
        'BM': '💼 BM Program Head',
        'SHS': '🎓 Asst. Principal (SHS)'
      };
      const roleLabel = role === 'program head' ? (programHeadTypes[program] || 'Program Head') :
        role === 'admin' ? 'Admin' : 'Teacher';

      const card = document.createElement("div");
      card.className = `faculty-card ${isSelected ? 'selected' : ''}`;
      card.dataset.title = teacherName;
      card.dataset.description = `${subjects} ${employmentStatus} ${roleLabel}`;

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
          ${role !== 'teacher' ? `<br><strong>Role:</strong> ${roleLabel}` : ""}
          ${isAdmin && d.email ? `<br><strong>Email:</strong> ${d.email}` : ""}
          ${isAdmin && d.password ? `<br><strong>Password:</strong> ${d.password}` : ""}
        </div>
        <div class="status-badge ${employmentStatus.toLowerCase().includes('regular') ? 'status-regular' : 'status-parttime'}">
          ${employmentStatus}
        </div>
        ${canAssignSubjects ? `<button class="assign-subjects-btn" data-id="${d.id}" data-name="${teacherName.replace(/"/g,'&quot;')}" style="margin-top:8px;width:100%;padding:6px;border:2px solid #000;border-radius:8px;background:#fff;font-size:0.75rem;font-weight:700;cursor:pointer;">📚 Assign Subjects</button>` : ''}
      `;

      facultyGrid.appendChild(card);

      if (canAssignSubjects) {
        const assignBtn = card.querySelector('.assign-subjects-btn');
        if (assignBtn) {
          assignBtn.addEventListener('click', e => {
            e.stopPropagation();
            openAssignSubjectsModal(d.id, teacherName, d.subjects || []);
          });
        }
      }
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
  initAddFacultyModal();
  initAssignSubjectsModal();
  loadTeachers();
  const locked = localStorage.getItem('importLocked');
  if (locked) lockImportUI(locked);
});

function lockImportUI(message) {
  const msg = message || 'Account generation unavailable. Try again later.';
  localStorage.setItem('importLocked', msg);

  ['uploadDocBtn', 'genEmailsBtn'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.disabled = true; el.title = msg; el.style.opacity = '0.45'; el.style.cursor = 'not-allowed'; }
  });

  if (!document.getElementById('import-lock-banner')) {
    const banner = document.createElement('div');
    banner.id = 'import-lock-banner';
    banner.style.cssText = 'background:#fef2f2;border:2px solid #ef4444;border-radius:10px;padding:10px 14px;margin-bottom:12px;font-size:13px;font-weight:700;color:#b91c1c;display:flex;align-items:center;gap:8px;';
    banner.innerHTML = '<span>ðŸš«</span><span>' + msg + '</span>';
    const toolbar = document.querySelector('.import-toolbar');
    if (toolbar) toolbar.insertAdjacentElement('beforebegin', banner);
  }
}

function restoreImportUI() {
  localStorage.removeItem('importLocked');
  ['uploadDocBtn', 'genEmailsBtn'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.disabled = false; el.title = ''; el.style.opacity = ''; el.style.cursor = ''; }
  });
  document.getElementById('import-lock-banner')?.remove();
}
// --- ADD FACULTY MODAL ---

function initAddFacultyModal() {
  const fab = document.getElementById('addFacultyFab');
  const modal = document.getElementById('addFacultyModal');
  const form = document.getElementById('addFacultyForm');
  const cancelBtn = document.getElementById('cancelFacultyBtn');
  const roleSelect = document.getElementById('facultyRole');
  const programGroup = document.getElementById('programGroup');

  if (!fab || !modal || !form) return;

  fab.addEventListener('click', () => modal.classList.remove('hidden'));
  cancelBtn.addEventListener('click', () => { modal.classList.add('hidden'); form.reset(); });
  modal.addEventListener('click', (e) => { if (e.target === modal) { modal.classList.add('hidden'); form.reset(); } });

  roleSelect.addEventListener('change', () => {
    programGroup.style.display = roleSelect.value === 'program head' ? '' : 'none';
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = form.querySelector('.modal-btn-save');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Adding...';

    const firstName = document.getElementById('facultyFirstName').value.trim();
    const middleName = document.getElementById('facultyMiddleName').value.trim();
    const lastName = document.getElementById('facultyLastName').value.trim();
    const email = document.getElementById('facultyEmail').value.trim();
    const status = document.getElementById('facultyStatus').value;
    const role = document.getElementById('facultyRole').value;
    const program = role === 'program head' ? document.getElementById('facultyProgram').value : '';

    const fullName = [firstName, middleName, lastName].filter(Boolean).join(' ');
    const sanitized = lastName.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    const password = `${sanitized}@SCHEDSYNC`;

    let tempApp = null;
    try {
      const tempAppName = 'AddFaculty-' + Date.now();
      tempApp = initializeApp(secondaryConfig, tempAppName);
      const tempAuth = getAuth(tempApp);

      let uid;
      try {
        const cred = await createUserWithEmailAndPassword(tempAuth, email, password);
        uid = cred.user.uid;
      } catch (authErr) {
        if (authErr.code === 'auth/email-already-in-use') {
          const cred = await signInWithEmailAndPassword(tempAuth, email, password);
          uid = cred.user.uid;
        } else throw authErr;
      }

      const facultyData = {
        username: fullName,
        email,
        password,
        authUid: uid,
        role,
        ...(program && { program }),
        employmentStatus: status,
        subjects: [],
        photoURL: '',
        createdAt: new Date().toISOString()
      };

      await setDoc(doc(db, 'users', uid), facultyData, { merge: true });

      showToast(`${fullName} added successfully!`, 'success');
      modal.classList.add('hidden');
      form.reset();
      programGroup.style.display = 'none';
      loadTeachers();
    } catch (err) {
      console.error('Add faculty error:', err);
      let msg = 'Failed to add faculty.';
      if (err.code === 'auth/email-already-in-use') msg = 'Email already in use.';
      if (err.code === 'auth/invalid-email') msg = 'Invalid email address.';
      if (err.code === 'auth/weak-password') msg = 'Password too weak.';
      showToast(msg, 'error');
    } finally {
      if (tempApp) await deleteApp(tempApp).catch(() => {});
      submitBtn.disabled = false;
      submitBtn.textContent = 'Add Faculty';
    }
  });
}

window.addFaculty = function () {
  document.getElementById('addFacultyModal')?.classList.remove('hidden');
};

// --- ASSIGN SUBJECTS (Program Head) ---

const PROGRAM_KEYWORDS = {
  'ICT/IT': ['BSIT', 'BSCS', 'ICT', 'IT', 'COMPUTER', 'INFORMATION'],
  'GE':     ['GE', 'GENERAL', 'MATH', 'SCIENCE', 'ENGLISH', 'FILIPINO', 'HISTORY', 'PE', 'NSTP'],
  'BM':     ['BM', 'BUSINESS', 'ACCOUNTANCY', 'MANAGEMENT', 'BSBA', 'BSAC', 'ECONOMICS'],
  'SHS':    ['SHS', 'SENIOR', 'G11', 'G12', 'GRADE 11', 'GRADE 12'],
};

let _assignTeacherId = null;
let _groupedCourses = [];

function rankTerm(s) {
  const u = s.toUpperCase();
  let yr = 0, sem = 0;
  if      (u.includes('FIRST YEAR')  || u.includes('G11') || u.includes('GRADE 11')) yr = 1;
  else if (u.includes('SECOND YEAR') || u.includes('G12') || u.includes('GRADE 12')) yr = 2;
  else if (u.includes('THIRD YEAR'))  yr = 3;
  else if (u.includes('FOURTH YEAR')) yr = 4;
  if      (u.includes('FIRST TERM')  || u.includes('FIRST SEM'))  sem = 1;
  else if (u.includes('SECOND TERM') || u.includes('SECOND SEM')) sem = 2;
  else if (u.includes('THIRD TERM')  || u.includes('THIRD SEM'))  sem = 3;
  const termMatch = u.match(/TERM\s*(\d)/);
  if (termMatch) sem = parseInt(termMatch[1]);
  return yr * 10 + sem;
} // [{name, terms: [{termName, subjects:[]}]}]

async function openAssignSubjectsModal(teacherId, teacherName, currentSubjects) {
  _assignTeacherId = teacherId;

  const modal = document.getElementById('assignSubjectsModal');
  const nameEl = document.getElementById('assignTeacherName');
  const list = document.getElementById('subjectCheckboxList');
  const searchInput = document.getElementById('subjectSearchInput');

  nameEl.textContent = `Teacher: ${teacherName}`;
  list.innerHTML = '<div style="text-align:center;padding:1rem;color:#64748b;">Loading subjects...</div>';
  searchInput.value = '';
  modal.classList.remove('hidden');

  const myRole = localStorage.getItem('userRole') || '';
  const myProgram = localStorage.getItem('userProgram') || '';
  const keywords = myRole === 'admin' ? [] : (PROGRAM_KEYWORDS[myProgram] || []);

  try {
    const snap = await getDocs(collection(db, 'courses'));
    _groupedCourses = [];

    snap.docs.forEach(d => {
      const data = d.data();
      const courseName = data.name || d.id;
      const matches = keywords.length === 0 || keywords.some(kw => courseName.toUpperCase().includes(kw));
      if (!matches || !data.terms) return;

      const terms = Object.entries(data.terms)
        .map(([termName, subjects]) => ({ termName, subjects: (subjects || []).filter(Boolean) }))
        .filter(t => t.subjects.length > 0)
        .sort((a, b) => rankTerm(a.termName) - rankTerm(b.termName));

      if (terms.length > 0) _groupedCourses.push({ name: courseName, terms });
    });

    _groupedCourses.sort((a, b) => a.name.localeCompare(b.name));
    renderGroupedSubjects(currentSubjects, '');
  } catch (err) {
    list.innerHTML = '<div style="color:#ef4444;padding:1rem;">Failed to load subjects.</div>';
    console.error(err);
  }
}

function renderGroupedSubjects(currentSubjects, filter) {
  const list = document.getElementById('subjectCheckboxList');
  const currentSet = new Set(currentSubjects || []);
  const q = (filter || '').toLowerCase();

  if (_groupedCourses.length === 0) {
    list.innerHTML = '<div style="text-align:center;padding:1rem;color:#64748b;">No subjects found.</div>';
    return;
  }

  let html = '';
  _groupedCourses.forEach((course, ci) => {
    // Flatten all subjects in this course for filtering
    const allCourseSubjects = course.terms.flatMap(t => t.subjects);
    const matchingSubjects = q ? allCourseSubjects.filter(s => s.toLowerCase().includes(q)) : allCourseSubjects;
    if (matchingSubjects.length === 0) return;

    const checkedCount = matchingSubjects.filter(s => currentSet.has(s)).length;
    html += `
      <div class="assign-course-group">
        <div class="assign-course-header" style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;background:#f1f5f9;border:2px solid #000;border-radius:10px;cursor:pointer;font-weight:800;font-size:0.85rem;user-select:none;">
          <span>📁 ${course.name}</span>
          <span style="font-size:0.75rem;color:#64748b;">${checkedCount > 0 ? `${checkedCount} selected · ` : ''}▼</span>
        </div>
        <div class="assign-course-body" style="display:none;flex-direction:column;gap:4px;padding:6px 0 0 8px;">
    `;

    if (q) {
      // Flat list when searching
      matchingSubjects.forEach(s => {
        html += subjectCheckboxHTML(s, currentSet.has(s));
      });
    } else {
      // Grouped by term
      course.terms.forEach(term => {
        if (term.subjects.length === 0) return;
        html += `<div style="font-size:0.75rem;font-weight:700;color:#94a3b8;padding:4px 0 2px;">${term.termName}</div>`;
        term.subjects.forEach(s => {
          html += subjectCheckboxHTML(s, currentSet.has(s));
        });
      });
    }

    html += `</div></div>`;
  });

  list.innerHTML = html || '<div style="text-align:center;padding:1rem;color:#64748b;">No subjects found.</div>';

  // Toggle open/close
  list.querySelectorAll('.assign-course-header').forEach(h => {
    h.addEventListener('click', () => {
      const body = h.nextElementSibling;
      const isOpen = body.style.display === 'flex';
      body.style.display = isOpen ? 'none' : 'flex';
    });
  });
}

function subjectCheckboxHTML(s, checked) {
  const escaped = s.replace(/"/g, '&quot;');
  return `<label style="display:flex;align-items:center;gap:8px;padding:5px 8px;border:1.5px solid #e2e8f0;border-radius:7px;cursor:pointer;font-size:0.82rem;font-weight:600;">
    <input type="checkbox" value="${escaped}" ${checked ? 'checked' : ''} style="width:15px;height:15px;cursor:pointer;">
    <span>${s}</span>
  </label>`;
}

function initAssignSubjectsModal() {
  const modal = document.getElementById('assignSubjectsModal');
  const cancelBtn = document.getElementById('cancelAssignBtn');
  const saveBtn = document.getElementById('saveAssignBtn');
  const searchInput = document.getElementById('subjectSearchInput');

  if (!modal) return;

  cancelBtn.addEventListener('click', () => { modal.classList.add('hidden'); _assignTeacherId = null; });
  modal.addEventListener('click', e => { if (e.target === modal) { modal.classList.add('hidden'); _assignTeacherId = null; } });

  searchInput.addEventListener('input', () => {
    // Preserve currently checked values before re-render
    const checked = new Set(
      Array.from(document.querySelectorAll('#subjectCheckboxList input[type=checkbox]:checked')).map(cb => cb.value)
    );
    renderGroupedSubjects(checked, searchInput.value);
  });

  saveBtn.addEventListener('click', async () => {
    if (!_assignTeacherId) return;
    const selected = Array.from(document.querySelectorAll('#subjectCheckboxList input[type=checkbox]:checked')).map(cb => cb.value);
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';
    try {
      await setDoc(doc(db, 'users', _assignTeacherId), { subjects: selected }, { merge: true });
      showToast('Subjects saved!', 'success');
      modal.classList.add('hidden');
      _assignTeacherId = null;
      loadTeachers();
    } catch (err) {
      showToast('Failed to save subjects.', 'error');
      console.error(err);
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save';
    }
  });
}

// Expose for faculty-doc-import.js
window.importFacultyMembers = importFacultyMembers;
