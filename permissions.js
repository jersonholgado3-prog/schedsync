import { initMobileNav } from "./js/ui/mobile-nav.js";
import { showToast, showConfirm } from "./js/utils/ui-utils.js";

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import {
    getFirestore,
    collection,
    query,
    where,
    doc,
    updateDoc,
    addDoc,
    serverTimestamp,
    onSnapshot
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { initUserProfile } from "./userprofile.js";

const firebaseConfig = {
    apiKey: "AIzaSyBrtJocBlfkPciYO7f8-7FwREE1tSF3VXU",
    authDomain: "schedsync-e60d0.firebaseapp.com",
    projectId: "schedsync-e60d0",
    storageBucket: "schedsync-e60d0.firebasestorage.app",
    messagingSenderId: "334140247575",
    appId: "1:334140247575:web:930b0c12e024e4defc5652",
    measurementId: "G-S59GL1W5Y2"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Initialize Header Profile
document.addEventListener("DOMContentLoaded", () => {
    initMobileNav();
    initUserProfile("#userProfile");
    checkAdminAccess();
});

function checkAdminAccess() {
    onAuthStateChanged(auth, (user) => {
        if (!user) {
            window.location.href = 'login.html';
            return;
        }

        const role = localStorage.getItem('userRole');
        if (role !== 'admin') {
            showToast("Access Denied: Admins Only 🛡️", "error");
            setTimeout(() => window.location.href = 'homepage.html', 1500);
            return;
        }

        // Load Data if Admin
        loadPendingRequests();
        loadActivePermissions();
    });
}

// ───────── PENDING REQUESTS ─────────
function loadPendingRequests() {
    const q = query(collection(db, "edit_requests"), where("status", "==", "pending"));
    const container = document.getElementById('pendingGrid');

    onSnapshot(q, (snap) => {
        container.innerHTML = '';
        if (snap.empty) {
            container.innerHTML = '<div class="empty-state">No pending requests at the moment. ✨</div>';
            return;
        }

        snap.forEach(docSnap => {
            const data = docSnap.data();
            const date = data.createdAt?.toDate ? data.createdAt.toDate().toLocaleString() : 'Just now';

            const card = document.createElement('div');
            card.className = 'user-card';
            card.innerHTML = `
    < div class="user-header" >
                    <div class="avatar">
                        <img src="${data.photoURL || 'images/default_shark.jpg'}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">
                    </div>
                    <div class="user-info">
                        <h3>${(data.username || data.email || 'User').split('@')[0]}</h3>
                        <p>Requested: ${date}</p>
                    </div>
                </div >
    <div style="display:flex; gap:10px;">
        <button class="action-btn btn-accept" onclick="acceptRequest('${docSnap.id}', '${data.userId}')">
            ✅ ACCEPT
        </button>
        <button class="action-btn btn-deny" onclick="denyRequest('${docSnap.id}', '${data.userId}')">
            🚫 DENY
        </button>
    </div>
`;
            container.appendChild(card);
        });
    });
}

// ───────── ACTIVE PERMISSIONS ─────────
function loadActivePermissions() {
    const q = query(collection(db, "users"), where("editPermission", "==", true));
    const container = document.getElementById('activeGrid');

    onSnapshot(q, (snap) => {
        container.innerHTML = '';
        if (snap.empty) {
            container.innerHTML = '<div class="empty-state">No active permissions found.</div>';
            return;
        }

        snap.forEach(docSnap => {
            const data = docSnap.data();
            // Skip Admin self
            if (data.role === 'admin') return;

            const card = document.createElement('div');
            card.className = 'user-card';
            card.innerHTML = `
    < div class="user-header" >
                    <div class="avatar">
                        <img src="${data.photoURL || 'images/default_shark.jpg'}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">
                    </div>
                     <div class="user-info">
                        <h3>${(data.displayName || data.email || 'User').split('@')[0]}</h3>
                        <p>${data.role.toUpperCase()}</p>
                    </div>
                </div >
    <button class="action-btn btn-revoke" onclick="revokePermission('${docSnap.id}', '${data.displayName}')">
        ❌ REVOKE ACCESS
    </button>
`;
            container.appendChild(card);
        });
    });
}

// ───────── ACTIONS ─────────

window.acceptRequest = async (requestId, userId) => {
    const confirmAction = await window.showConfirm("GRANT PERMISSION", "Are you sure you want to allow this user to edit schedules?");
    if (!confirmAction) return;

    try {
        // 1. Update User
        await updateDoc(doc(db, "users", userId), { editPermission: true });

        // 2. Update Request Status
        await updateDoc(doc(db, "edit_requests", requestId), { status: 'accepted' });

        // 3. Notify User
        await addDoc(collection(db, "notifications"), {
            title: "PERMISSION GRANTED",
            message: "Your request has been approved by the Admin. You can now edit schedules. 🎉",
            sender: "Admin",
            createdAt: serverTimestamp(),
            type: "info",
            targetUserId: userId // Private notification 🔒
        });

        showToast("Permission Granted Successfully! ✨", "success");
    } catch (e) {
        console.error("Error accepting:", e);
        showToast("Action failed.", "error");
    }
};

window.denyRequest = async (requestId, userId) => {
    const confirmAction = await window.showConfirm("DENY REQUEST", "Are you sure you want to deny this request?");
    if (!confirmAction) return;

    try {
        await updateDoc(doc(db, "edit_requests", requestId), { status: 'denied' });

        await addDoc(collection(db, "notifications"), {
            title: "PERMISSION DENIED",
            message: "Your request to edit schedules was denied by the Admin.",
            sender: "Admin",
            createdAt: serverTimestamp(),
            type: "error",
            targetUserId: userId // Private notification 🔒
        });

        showToast("Request Denied.", "info");
    } catch (e) {
        console.error("Error denying:", e);
    }
};

window.revokePermission = async (userId, userName) => {
    const confirmAction = await window.showConfirm("REVOKE ACCESS", `Are you sure you want to revoke edit access for ${userName} ? `);
    if (!confirmAction) return;

    try {
        await updateDoc(doc(db, "users", userId), { editPermission: false });

        await addDoc(collection(db, "notifications"), {
            title: "ACCESS REVOKED",
            message: "Your edit permission has been revoked by the Admin.",
            sender: "Admin",
            createdAt: serverTimestamp(),
            type: "warning",
            targetUserId: userId // Private notification 🔒
        });

        showToast("Access Revoked!", "warning");
    } catch (e) {
        console.error("Error revoking:", e);
    }
};

