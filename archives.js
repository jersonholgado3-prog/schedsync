import { app, db, auth } from "./js/config/firebase-config.js";

import { collection, doc, getDoc, getDocs, setDoc, deleteDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { showToast, showConfirm } from "./js/utils/ui-utils.js";

import { initUserProfile } from "./userprofile.js";

const ARCHIVE_RETENTION_YEARS = 3;
const STORAGE_WARNING_THRESHOLD = 50 * 1024 * 1024;

let currentType = 'schedules';
let allArchives = [];
let selectedArchiveIds = new Set();

document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  initUserProfile('#userProfile');

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
  document.getElementById('searchInput').addEventListener('input', renderArchives);
  document.getElementById('yearFilter').addEventListener('change', renderArchives);
  document.getElementById('sortFilter').addEventListener('change', renderArchives);
}

async function loadArchives() {
  try {
    const types = ['schedules', 'sections', 'faculty', 'curriculum', 'events'];
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
    if (search && !JSON.stringify(item.originalData).toLowerCase().includes(search)) return false;
    if (year && item.academicYear !== year) return false;
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
  if (item.type === 'schedules') return d.section || d.name || 'Schedule';
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
  try {
    const snap = await getDoc(doc(db, 'archives', type, 'items', itemId));
    if (!snap.exists()) { showToast('Archive not found', 'error'); return; }
    const col = type === 'curriculum' ? 'courses' : type;
    await setDoc(doc(db, col, itemId), snap.data().originalData);
    await deleteDoc(doc(db, 'archives', type, 'items', itemId));
    showToast('Item restored successfully', 'success');
    await loadArchives();
  } catch (error) {
    console.error('Error restoring:', error);
    showToast('Failed to restore item', 'error');
  }
};

window.deleteArchive = async function(type, itemId) {
  if (!await showConfirm('Delete Permanently?', 'This cannot be undone.')) return;
  try {
    await deleteDoc(doc(db, 'archives', type, 'items', itemId));
    showToast('Permanently deleted', 'success');
    await loadArchives();
  } catch (error) {
    showToast('Failed to delete', 'error');
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
      const col = item.type === 'curriculum' ? 'courses' : item.type;
      await setDoc(doc(db, col, item.id), snap.data().originalData);
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
