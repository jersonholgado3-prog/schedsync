import { db, auth } from "./js/config/firebase-config.js";
import { collection, getDocs, setDoc, deleteDoc, doc, query, where, addDoc } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-functions.js";
import { showToast } from "./js/utils/ui-utils.js";
import { initUserProfile } from "./userprofile.js";

// Admin-only guard
const userRole = localStorage.getItem('userRole');
if (userRole !== 'admin') {
  window.location.href = 'homepage.html';
}

const secondaryConfig = {
  apiKey: "AIzaSyBrtJocBlfkPciYO7f8-7FwREE1tSF3VXU",
  authDomain: "schedsync-e60d0.firebaseapp.com",
  projectId: "schedsync-e60d0",
};

let allAccounts = [];

async function loadAccounts() {
  const tbody = document.getElementById('accountsTableBody');
  tbody.innerHTML = '<tr><td colspan="4" class="empty-state">Loading...</td></tr>';
  try {
    const snap = await getDocs(collection(db, 'users'));
    allAccounts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    allAccounts.sort((a, b) => (a.username || '').localeCompare(b.username || ''));
    renderTable(allAccounts);
  } catch (e) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty-state">Failed to load accounts.</td></tr>';
  }
}

function isOnline(lastSeen) {
  if (!lastSeen) return false;
  const ms = lastSeen.toDate ? lastSeen.toDate().getTime() : new Date(lastSeen).getTime();
  return Date.now() - ms < 3 * 60 * 1000; // 3 minutes
}

const ROLE_PRIORITY = ['admin', 'academic_head', 'teacher', 'student'];

// Sync admin_login collection — called when admin/acad_head account is created or password changes
async function syncAdminLogin(uid, email, password, role) {
  if (role !== 'admin' && role !== 'academic_head') return;
  await setDoc(doc(db, 'admin_login', uid), { email, password, role });
}
async function removeAdminLogin(uid) {
  await deleteDoc(doc(db, 'admin_login', uid)).catch(() => {});
}
const ALL_ROLES = [
  { value: 'admin', label: 'Admin' },
  { value: 'academic_head', label: 'Academic Head' },
  { value: 'teacher', label: 'Teacher' },
  { value: 'student', label: 'Student' },
];

function getUserRoles(a) {
  return Array.isArray(a.roles) && a.roles.length ? a.roles : [a.role || 'student'];
}

function renderTable(accounts) {
  const tbody = document.getElementById('accountsTableBody');
  if (!accounts.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No accounts found.</td></tr>';
    return;
  }
  tbody.innerHTML = accounts.map(a => {
    const online = isOnline(a.lastSeen);
    const userRoles = getUserRoles(a);
    const checkboxes = ALL_ROLES.map(r => `
      <label style="display:flex;align-items:center;gap:4px;font-size:0.8rem;cursor:pointer;">
        <input type="checkbox" value="${r.value}" ${userRoles.includes(r.value) ? 'checked' : ''}
          onchange="window._updateRoles('${a.id}', this)">
        ${r.label}
      </label>`).join('');
    return `
    <tr>
      <td>${a.username || a.displayName || '—'}</td>
      <td>${a.email || '—'}</td>
      <td><div style="display:flex;flex-direction:column;gap:2px;">${checkboxes}</div></td>
      <td><span class="online-dot ${online ? 'online' : 'offline'}"></span>${online ? 'Online' : 'Offline'}</td>
      <td>
        <button class="action-btn reset" onclick="window._showPassword('${a.id}')">Show Password</button>
        <button class="action-btn reset" onclick="window._resetPassword('${a.id}')">Reset Password</button>
        <button class="action-btn delete" onclick="window._deleteAccount('${a.id}', '${(a.email || '').replace(/'/g, "\\'")}')">Delete</button>
      </td>
    </tr>
  `}).join('');
}

function applyFilters() {
  const q = document.getElementById('accountSearch').value.toLowerCase();
  const role = document.getElementById('roleFilter').value;
  const filtered = allAccounts.filter(a => {
    const matchQ = !q || (a.username || '').toLowerCase().includes(q) || (a.email || '').toLowerCase().includes(q);
    const matchRole = !role || getUserRoles(a).includes(role);
    return matchQ && matchRole;
  });
  renderTable(filtered);
}

document.getElementById('accountSearch').addEventListener('input', applyFilters);
document.getElementById('roleFilter').addEventListener('change', applyFilters);

// Modal
const modal = document.getElementById('newAccountModal');
document.getElementById('addAccountBtn').addEventListener('click', () => modal.classList.add('open'));
document.getElementById('cancelNewAccount').addEventListener('click', () => modal.classList.remove('open'));
modal.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('open'); });

document.getElementById('saveNewAccount').addEventListener('click', async () => {
  const name = document.getElementById('newName').value.trim();
  const email = document.getElementById('newEmail').value.trim();
  const password = document.getElementById('newPassword').value;
  const role = document.getElementById('newRole').value;

  if (!name || !email || !password) { showToast('Please fill in all fields.', 'error'); return; }
  if (password.length < 6) { showToast('Password must be at least 6 characters.', 'error'); return; }

  const saveBtn = document.getElementById('saveNewAccount');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Creating...';

  let tempApp = null;
  try {
    const appName = 'AccountCreate-' + Math.random().toString(36).substring(7);
    tempApp = initializeApp(secondaryConfig, appName);
    const { getAuth } = await import("https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js");
    const tempAuth = getAuth(tempApp);
    const cred = await createUserWithEmailAndPassword(tempAuth, email, password);
    const uid = cred.user.uid;

    await setDoc(doc(db, 'users', uid), {
      username: name,
      email,
      password,
      role,
      roles: [role],
      authUid: uid,
      createdAt: new Date().toISOString(),
    });
    await syncAdminLogin(uid, email, password, role);

    showToast(`Account created for ${name}!`, 'success');
    modal.classList.remove('open');
    document.getElementById('newName').value = '';
    document.getElementById('newEmail').value = '';
    document.getElementById('newPassword').value = '';
    loadAccounts();
  } catch (err) {
    let msg = 'Failed to create account.';
    if (err.code === 'auth/email-already-in-use') msg = 'Email already in use.';
    if (err.code === 'auth/invalid-email') msg = 'Invalid email.';
    if (err.code === 'auth/weak-password') msg = 'Password too weak.';
    showToast(msg, 'error');
  } finally {
    if (tempApp) await deleteApp(tempApp).catch(() => {});
    saveBtn.disabled = false;
    saveBtn.textContent = 'Create Account';
  }
});

const functions = getFunctions();
const deleteUserAccount = httpsCallable(functions, 'deleteUserAccount');
const resetUserPassword = httpsCallable(functions, 'resetUserPassword');

window._updateRoles = async (uid, checkbox) => {
  const acc = allAccounts.find(a => a.id === uid);
  if (!acc) return;
  const currentRoles = getUserRoles(acc);
  let updatedRoles;
  if (checkbox.checked) {
    updatedRoles = [...new Set([...currentRoles, checkbox.value])];
  } else {
    updatedRoles = currentRoles.filter(r => r !== checkbox.value);
    if (!updatedRoles.length) { checkbox.checked = true; showToast('User must have at least one role.', 'error'); return; }
  }
  // Derive highest-privilege role as the primary role field
  const primaryRole = ROLE_PRIORITY.find(r => updatedRoles.includes(r)) || updatedRoles[0];
  try {
    const { updateDoc, doc: fsDoc } = await import("https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js");
    await updateDoc(fsDoc(db, 'users', uid), { role: primaryRole, roles: updatedRoles });
    acc.role = primaryRole;
    acc.roles = updatedRoles;
    // Sync admin_login lookup
    if (primaryRole === 'admin' || primaryRole === 'academic_head') {
      await syncAdminLogin(uid, acc.email, acc.password, primaryRole);
    } else {
      await removeAdminLogin(uid);
    }
    showToast('Roles updated.', 'success');
  } catch (e) {
    showToast('Failed to update roles.', 'error');
  }
};

window._showPassword = async (uid) => {
  try {
    const { getDoc, doc: fsDoc } = await import("https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js");
    const snap = await getDoc(fsDoc(db, 'users', uid));
    const data = snap.data();
    console.log('[ShowPassword] uid:', uid, 'data:', data);
    const password = data?.password;
    if (!password) { showToast('No saved password for this account.', 'error'); return; }

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9999;';
    overlay.innerHTML = `
      <div style="background:#fff;border-radius:12px;padding:2rem;min-width:300px;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,0.2);">
        <div style="font-size:0.85rem;color:#64748b;margin-bottom:0.5rem;">${data.email || ''}</div>
        <div style="font-size:0.9rem;font-weight:600;margin-bottom:0.25rem;">Password:</div>
        <div style="font-size:1.1rem;font-family:monospace;background:#f1f5f9;padding:0.75rem 1rem;border-radius:8px;letter-spacing:1px;user-select:all;">${password}</div>
        <button onclick="this.closest('div[style]').parentElement.remove()" style="margin-top:1.25rem;padding:0.5rem 1.5rem;border:none;border-radius:8px;background:#3b82f6;color:#fff;cursor:pointer;font-size:0.9rem;">Close</button>
      </div>`;
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
  } catch (e) {
    console.error('[ShowPassword] error:', e);
    showToast('Failed to fetch password: ' + e.message, 'error');
  }
};

window._resetPassword = async (uid) => {
  const { getDoc, doc: fsDoc } = await import("https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js");
  const snap = await getDoc(fsDoc(db, 'users', uid));
  const acc = snap.data();
  const savedPassword = acc?.password;
  if (!savedPassword) { showToast('No saved password found for this account.', 'error'); return; }
  if (!confirm(`Reset password for ${acc.email} back to their saved password?`)) return;
  try {
    await resetUserPassword({ uid, password: savedPassword });
    showToast('Password reset successfully.', 'success');
  } catch (e) {
    showToast('Failed to reset: ' + (e.message || e), 'error');
  }
};

window._deleteAccount = async (uid, email) => {
  if (!confirm(`Delete account: ${email}?\nThis will permanently delete the account.`)) return;
  try {
    // Delete Firebase Auth user via Cloud Function
    await deleteUserAccount({ uid });
    // Delete Firestore document
    await deleteDoc(doc(db, 'users', uid));
    showToast('Account deleted.', 'success');
    loadAccounts();
  } catch (e) {
    showToast('Failed to delete: ' + (e.message || e), 'error');
  }
};

document.addEventListener('DOMContentLoaded', () => {
  initUserProfile();
  loadAccounts();
});
