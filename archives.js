import { app, db, auth } from "./js/config/firebase-config.js";

import { collection, doc, getDoc, getDocs, setDoc, deleteDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, deleteUser } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { showToast, showConfirm, showLoading, hideLoading } from "./js/utils/ui-utils.js";

const secondaryConfig = {
  apiKey: "AIzaSyBrtJocBlfkPciYO7f8-7FwREE1tSF3VXU",
  authDomain: "schedsync-e60d0.firebaseapp.com",
  projectId: "schedsync-e60d0",
  storageBucket: "schedsync-e60d0.firebasestorage.app",
  messagingSenderId: "334140247575",
  appId: "1:334140247575:web:930b0c12e024e4defc5652"
};

import { initUserProfile } from "./userprofile.js";
import { initUniversalSearch } from "./search.js";

const ARCHIVE_RETENTION_YEARS = 3;
const STORAGE_WARNING_THRESHOLD = 50 * 1024 * 1024;

let currentType = 'schedules';
let allArchives = [];
let selectedArchiveIds = new Set();

document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  initUserProfile('#userProfile');
  initUniversalSearch(db);

  onAuthStateChanged(auth, async (user) => {
    console.log('[Archives] Auth state:', user ? user.email : 'not logged in');
    console.log('[Archives] userRole:', localStorage.getItem('userRole'));
    if (!user) { window.location.href = 'login.html'; return; }
    const role = localStorage.getItem('userRole');
    if (role !== 'admin') { window.location.href = 'homepage.html'; return; }
    await autoCleanupOldArchives();
    await loadArchives();
    updateStats();
  });
});

function setupEventListeners() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentType = btn.dataset.type;
      renderArchives();
    });
  });

  const searchInput = document.getElementById('searchInput');
  const searchWrapper = searchInput?.closest('.search-wrapper');
  if (searchInput && searchWrapper) {
    searchInput.addEventListener('focus', () => searchWrapper.classList.add('expanded'));
    searchInput.addEventListener('blur', () => {
      setTimeout(() => { if (!searchInput.value) searchWrapper.classList.remove('expanded'); }, 200);
    });
    searchWrapper.addEventListener('click', () => searchInput.focus());
  }

  searchInput?.addEventListener('input', renderArchives);
  document.getElementById('yearFilter').addEventListener('change', renderArchives);
  document.getElementById('sortFilter').addEventListener('change', renderArchives);
}

async function loadArchives() {
  try {
    const types = ['schedules', 'sections', 'curriculum', 'events'];
    allArchives = [];
    for (const type of types) {
      const snapshot = await getDocs(collection(db, 'archives', type, 'items'));
      snapshot.forEach(d => allArchives.push({ id: d.id, type, ...d.data() }));
    }
    populateYearFilter();
    renderArchives();
  } catch (error) {
    console.error('Error loading archives:', error);
    showToast('Failed to load archives', 'error');
  }
}



function populateYearFilter() {
  const years = new Set(allArchives.filter(i => i.academicYear).map(i => i.academicYear));
  const el = document.getElementById('yearFilter');
  el.innerHTML = '<option value="">All Years</option>';
  Array.from(years).sort().reverse().forEach(y => el.innerHTML += `<option value="${y}">${y}</option>`);
}

function renderArchives() {
  const search = document.getElementById('searchInput').value.toLowerCase();
  const year = document.getElementById('yearFilter').value;
  const sort = document.getElementById('sortFilter').value;

  let filtered = allArchives.filter(item => {
    if (item.type !== currentType) return false;
    if (year && item.academicYear !== year) return false;
    if (search) {
      const title = getItemTitle(item).toLowerCase();
      const meta = (item.archivedBy || '').toLowerCase();
      const raw = item.originalData ? JSON.stringify(item.originalData).toLowerCase() : '';
      if (!title.includes(search) && !meta.includes(search) && !raw.includes(search)) return false;
    }
    return true;
  });

  filtered.sort((a, b) => {
    const dA = a.archivedAt?.toDate?.() || new Date(a.archivedAt);
    const dB = b.archivedAt?.toDate?.() || new Date(b.archivedAt);
    return sort === 'newest' ? dB - dA : dA - dB;
  });

  const listEl = document.getElementById('archiveList');
  document.getElementById('archiveSelectionBar').style.display = filtered.length > 0 ? 'flex' : 'none';
  document.getElementById('archiveSelectedCount').textContent = selectedArchiveIds.size + ' Selected';
  listEl.innerHTML = filtered.length === 0
    ? '<div class="empty-state">No archived items found</div>'
    : filtered.map(createArchiveCard).join('');
  // Attach events
  listEl.querySelectorAll('.archive-item').forEach(el => {
    const id = el.dataset.id; const type = el.dataset.type;
    el.querySelector('.archive-cb')?.addEventListener('change', () => toggleArchiveSelect(type, id, el));
    el.querySelector('.restore')?.addEventListener('click', e => { e.stopPropagation(); restoreArchive(type, id); });
    el.querySelector('.delete')?.addEventListener('click', e => { e.stopPropagation(); deleteArchive(type, id); });
  });
}

function createArchiveCard(item) {
  const date = (item.archivedAt && item.archivedAt.toDate ? item.archivedAt.toDate() : new Date(item.archivedAt)).toLocaleDateString();
  const title = getItemTitle(item);
  const sel = selectedArchiveIds.has(item.id);
  return '<div class="archive-item' + (sel ? ' selected' : '') + '" data-id="' + item.id + '" data-type="' + item.type + '">' +
    '<input type="checkbox" class="archive-cb"' + (sel ? ' checked' : '') + ' style="width:18px;height:18px;cursor:pointer;flex-shrink:0;">' +
    '<div class="archive-item-info"><div class="archive-item-title">' + title + '</div>' +
    '<div class="archive-item-meta"><span>📅 ' + date + '</span> <span>👤 ' + (item.archivedBy || 'Unknown') + '</span></div></div>' +
    '<div class="archive-item-actions"><button class="archive-btn restore">Restore</button><button class="archive-btn delete">🗑️</button></div></div>';
}










function getItemTitle(item) {
  const d = item.originalData;
  if (item.type === 'schedules') {
    const schedName = d.scheduleName || d.name || '';
    const section = d.section || '';
    if (schedName && section) return `${schedName} — ${section}`;
    return schedName || section || 'Schedule';
  }
  if (item.type === 'faculty') return d.name || 'Faculty Member';
  if (item.type === 'sections') return d.name || 'Section';
  if (item.type === 'curriculum') return d.name || 'Curriculum';
  if (item.type === 'events') return d.eventName || d.subject || 'Event';
  return 'Archived Item';
}

export async function archiveItem(type, itemId, originalData, reason = '', academicYear = '') {
  try {
    await setDoc(doc(db, 'archives', type, 'items', itemId), {
      originalData, archivedAt: serverTimestamp(),
      archivedBy: auth.currentUser?.email || 'Unknown',
      reason, academicYear, type
    });
    showToast(`Archived successfully`, 'success');
    return true;
  } catch (error) {
    console.error('Error archiving:', error);
    showToast('Failed to archive item', 'error');
    return false;
  }
}

window.restoreArchive = async function(type, itemId) {
  if (!await showConfirm('Restore Item?', 'This will move the item back to active data.')) return;
  showLoading('Restoring...');
  try {
    const snap = await getDoc(doc(db, 'archives', type, 'items', itemId));
    if (!snap.exists()) { showToast('Archive not found', 'error'); return; }
    const originalData = snap.data().originalData;
    const col = type === 'curriculum' ? 'courses' : type;

    // Handle group-archived schedules (archived via deleteDraftGroup)
    // These have { scheduleName, sections: [{id, ...data}, ...] } as originalData
    if (type === 'schedules' && Array.isArray(originalData.sections)) {
      const { addDoc, collection: col2 } = await import('https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js');
      for (const section of originalData.sections) {
        const { id, ...sectionData } = section;
        await setDoc(doc(db, 'schedules', id), sectionData);
      }
    } else {
      await setDoc(doc(db, col, itemId), originalData);
    }

    await deleteDoc(doc(db, 'archives', type, 'items', itemId));
    showToast('Item restored successfully', 'success');
    await loadArchives();
  } catch (error) {
    console.error('Error restoring:', error);
    showToast('Failed to restore item', 'error');
  } finally { hideLoading(); }
};

window.bulkDeleteArchives = async function() {
  if (selectedArchiveIds.size === 0) return;
  if (!await showConfirm('Delete Permanently?', `Delete ${selectedArchiveIds.size} selected item(s)? This cannot be undone.`)) return;
  showLoading('Deleting...');
  try {
    for (const itemId of selectedArchiveIds) {
      const item = allArchives.find(a => a.id === itemId);
      if (item) await window.deleteArchive(item.type, itemId, true);
    }
    selectedArchiveIds.clear();
    await loadArchives();
    showToast('Permanently deleted', 'success');
  } finally { hideLoading(); }
};

window.deleteArchive = async function(type, itemId, silent = false) {
  if (!silent && !await showConfirm('Delete Permanently?', 'This cannot be undone.')) return;
  if (!silent) showLoading('Deleting...');
  try {
    // Delete from original collection
    const collectionMap = {
      schedules: 'schedules',
      faculty: 'users',
      sections: 'sections',
      curriculum: 'courses',
      events: 'academic_calendar'
    };
    const originalCollection = collectionMap[type];
    if (originalCollection) {
      try { await deleteDoc(doc(db, originalCollection, itemId)); } catch (e) { /* may not exist */ }
    }

    // Delete Firebase Auth account for faculty
    if (type === 'faculty') {
      const archiveDoc = await getDoc(doc(db, 'archives', type, 'items', itemId));
      const data = archiveDoc.exists() ? archiveDoc.data()?.originalData : null;
      if (data?.email && data?.password) {
        let tempApp;
        try {
          tempApp = initializeApp(secondaryConfig, 'ArchiveDel-' + Date.now());
          const tempAuth = getAuth(tempApp);
          const cred = await signInWithEmailAndPassword(tempAuth, data.email, data.password);
          await deleteUser(cred.user);
        } catch (e) { /* auth user may already be deleted */ }
        finally { if (tempApp) await deleteApp(tempApp).catch(() => {}); }
      }
    }

    // Delete from archives
    await deleteDoc(doc(db, 'archives', type, 'items', itemId));
    if (!silent) { showToast('Permanently deleted', 'success'); await loadArchives(); }
  } catch (error) {
    console.error(error);
    showToast('Failed to delete', 'error');
  } finally {
    if (!silent) hideLoading();
  }
};

window.exportAllArchives = async function() {
  try {
    const blob = new Blob([JSON.stringify({ exportDate: new Date().toISOString(), archives: allArchives }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `schedsync-archives-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    showToast('Archives exported', 'success');
  } catch (error) {
    showToast('Failed to export', 'error');
  }
};

function updateStats() {
  const size = (JSON.stringify(allArchives).length / (1024 * 1024)).toFixed(2);
  document.getElementById('totalArchives').textContent = allArchives.length;
  document.getElementById('storageUsed').textContent = `${size} MB`;
  if (JSON.stringify(allArchives).length > STORAGE_WARNING_THRESHOLD)
    document.getElementById('archiveWarning').style.display = 'flex';
}

async function autoCleanupOldArchives() {
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  const lastRun = parseInt(localStorage.getItem('_archiveCleanupLastRun') || '0');
  if (Date.now() - lastRun < WEEK_MS) return;
  try {
    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - ARCHIVE_RETENTION_YEARS);
    for (const type of ['schedules', 'sections', 'faculty', 'curriculum', 'events']) {
      const snap = await getDocs(collection(db, 'archives', type, 'items'));
      for (const d of snap.docs) {
        const date = d.data().archivedAt?.toDate?.() || new Date(d.data().archivedAt);
        if (date < cutoff) await deleteDoc(d.ref);
      }
    }
    localStorage.setItem('_archiveCleanupLastRun', Date.now().toString());
  } catch (e) { console.error('Auto-cleanup error:', e); }
}

window.toggleArchiveSelect = function(type, id, el) {
  if (selectedArchiveIds.has(id)) {
    selectedArchiveIds.delete(id);
  } else {
    selectedArchiveIds.add(id);
  }
  const cb = el.querySelector('input[type=checkbox]');
  const sel = selectedArchiveIds.has(id);
  el.classList.toggle('selected', sel);
  if (cb) cb.checked = sel;
  const bar = document.getElementById('archiveSelectionBar');
  const count = document.getElementById('archiveSelectedCount');
  bar.style.display = selectedArchiveIds.size > 0 ? 'flex' : 'none';
  count.textContent = `${selectedArchiveIds.size} Selected`;
};

window.clearArchiveSelection = function() {
  selectedArchiveIds.clear();
  document.getElementById('archiveSelectionBar').style.display = 'none';
  renderArchives();
};

window.bulkRestoreArchives = async function() {
  if (!await showConfirm('Restore Selected?', 'Restore ' + selectedArchiveIds.size + ' items back to active data?')) return;
  showToast('Restoring... ⏳', 'info');
  for (const id of [...selectedArchiveIds]) {
    const item = allArchives.find(a => a.id === id);
    if (!item) continue;
    try {
      const snap = await getDoc(doc(db, 'archives', item.type, 'items', item.id));
      if (!snap.exists()) continue;
      const originalData = snap.data().originalData;
      const col = item.type === 'curriculum' ? 'courses' : item.type;

      if (item.type === 'schedules' && Array.isArray(originalData.sections)) {
        for (const section of originalData.sections) {
          const { id: sId, ...sectionData } = section;
          await setDoc(doc(db, 'schedules', sId), sectionData);
        }
      } else {
        await setDoc(doc(db, col, item.id), originalData);
      }

      await deleteDoc(doc(db, 'archives', item.type, 'items', item.id));
    } catch(e) { console.error('Restore failed:', e); }
  }
  showToast('Items restored successfully', 'success');
  selectedArchiveIds.clear();
  document.getElementById('archiveSelectionBar').style.display = 'none';
  await loadArchives();
};


window.toggleSelectAllArchives = function(checked) {
  const visible = allArchives.filter(a => a.type === currentType);
  visible.forEach(item => {
    if (checked) selectedArchiveIds.add(item.id);
    else selectedArchiveIds.delete(item.id);
  });
  renderArchives();
  const bar = document.getElementById('archiveSelectionBar');
  const count = document.getElementById('archiveSelectedCount');
  bar.style.display = selectedArchiveIds.size > 0 ? 'flex' : 'none';
  count.textContent = selectedArchiveIds.size + ' Selected';
};
