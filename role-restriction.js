import { db, auth } from "./js/config/firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { doc, getDoc, collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { showToast, showConfirm } from "./js/utils/ui-utils.js";

// 🚀 Early Cache Check for Flicker Prevention
let cachedRole = localStorage.getItem('userRole');
let cachedPermission = localStorage.getItem('editPermission') === 'true';

// 🛡️ RBAC HARDENING: MutationObserver instead of setInterval ⚓
const observer = new MutationObserver((mutations) => {
    const role = localStorage.getItem('userRole') || 'student';
    const perm = localStorage.getItem('editPermission') === 'true';
    if (role !== 'admin' && !perm) {
        sweep();
    }
});

function injectHiderStyle() {
    if (document.getElementById('role-flicker-prevention')) return;
    const style = document.createElement('style');
    style.id = 'role-flicker-prevention';
    style.textContent = `
        div[onclick*="newschedule.html"]:not(.teacher-card), 
        .card[data-title*="New Schedule"]:not(.teacher-card),
        .sidebar-icon[onclick*="newschedule.html"]:not(.teacher-card),
        .create-event-group,
        #openCreateEvent,
        .dg-event-actions,
        button[onclick*="openAddRoomModal"],
        #floatBtn,
        #editFacultyFloat,
        .edit-button,
        .action-button,
        .action-group {
            display: none !important;
        }
    `;
    document.head.appendChild(style);
}

if ((cachedRole === 'student' && !cachedPermission) || (cachedRole === 'teacher' && !cachedPermission)) {
    injectHiderStyle();
    observer.observe(document.body, { childList: true, subtree: true });
}

onAuthStateChanged(auth, async (user) => {
    if (user) {
        try {
            // Direct fetch for hardening 🛡️
            const userDoc = await getDoc(doc(db, "users", user.uid));
            if (userDoc.exists()) {
                const userData = userDoc.data();
                const role = userData.role || 'student';
                const hasPermission = userData.editPermission === true;

                // Update Cache ⚓
                localStorage.setItem('userRole', role);
                localStorage.setItem('editPermission', String(hasPermission));

                applyRestrictions(role, hasPermission);
            }
        } catch (error) {
            console.error("Error applying role restrictions:", error);
        }
    } else {
        localStorage.removeItem('userRole');
        localStorage.removeItem('editPermission');
        restoreVisibility();
    }
});

// Also run on DOM load to ensure sidebar is updated immediately
document.addEventListener("DOMContentLoaded", () => {
    const role = localStorage.getItem('userRole') || 'student';
    const hasPermission = localStorage.getItem('editPermission') === 'true';
    applyRestrictions(role, hasPermission);
});

function applyRestrictions(role, hasPermission) {
    if (role !== 'admin' && !hasPermission) {
        injectHiderStyle();
        sweep();
        observer.observe(document.body, { childList: true, subtree: true });
    } else {
        restoreVisibility();
    }

    // 🛡️ Global Admin Sidebar Links Toggle ⚓
    const adminLinks = document.getElementById('adminSidebarLinks');
    if (adminLinks) {
        adminLinks.style.display = (role === 'admin') ? 'block' : 'none';
    }
}

function sweep() {
    const role = localStorage.getItem('userRole') || 'student';
    if (role === 'admin') return;

    // 1. Hide Editor elements
    document.querySelectorAll('div[onclick*="newschedule.html"], div[onclick*="editpage.html"]').forEach(el => {
        if (el.style.display !== 'none') el.dataset.roleHidden = 'true';
        el.style.display = 'none';
    });
    document.querySelectorAll('button[onclick*="openAddRoomModal"], #floatBtn, #editFacultyFloat, .dg-event-actions').forEach(el => {
        if (el.style.display !== 'none') el.dataset.roleHidden = 'true';
        el.style.display = 'none';
    });

    // 2. Text-based blacklist 🧤
    const blacklist = ['publish', 'unpublish', 'remove', 'add room', 'new schedule', 'save', 'create new event', 'create event'];
    document.querySelectorAll('button, div, span, a').forEach(el => {
        if (el.children.length === 0 && !el.closest('.sidebar-link')) {
            const txt = el.textContent.trim().toLowerCase();
            if (txt && blacklist.includes(txt)) {
                if (el.style.display !== 'none') el.dataset.roleHidden = 'true';
                el.style.display = 'none';
            }
        }
    });
}

function restoreVisibility() {
    observer.disconnect();
    const style = document.getElementById('role-flicker-prevention');
    if (style) style.remove();
    // Show all elements previously hidden 🔓
    document.querySelectorAll('[data-role-hidden="true"]').forEach(el => {
        el.style.display = '';
        delete el.dataset.roleHidden;
    });
}

window.requestEditPermission = async function () {
    const user = auth.currentUser;
    if (!user) return;

    const confirm = await showConfirm("REQUEST PERMISSION", "Notify Admin that you want to edit schedules?");
    if (!confirm) return;

    try {
        await addDoc(collection(db, "edit_requests"), {
            userId: user.uid,
            username: user.displayName || user.email,
            status: 'pending',
            createdAt: serverTimestamp()
        });
        showToast("Request sent!", "success");
    } catch (e) {
        showToast("Failed to send request.", "error");
    }
};

