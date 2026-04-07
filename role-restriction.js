import { initializeApp, getApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { showToast, showConfirm } from "./js/utils/ui-utils.js";

const firebaseConfig = {
    apiKey: "AIzaSyBrtJocBlfkPciYO7f8-7FwREE1tSF3VXU",
    authDomain: "schedsync-e60d0.firebaseapp.com",
    projectId: "schedsync-e60d0",
    storageBucket: "schedsync-e60d0.firebasestorage.app",
    messagingSenderId: "334140247575",
    appId: "1:334140247575:web:930b0c12e024e4defc5652",
    measurementId: "G-S59GL1W5Y2"
};

let app;
try { app = initializeApp(firebaseConfig); } catch (e) { app = getApp(); }

const auth = getAuth(app);
const db = getFirestore(app);

// 🚀 Early Cache Check for Flicker Prevention
const cachedRole = localStorage.getItem('userRole');
const cachedPermission = localStorage.getItem('editPermission') === 'true';

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

    // Run restriction logic as soon as possible
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            if (cachedRole === 'student') applyStudentRestrictions();
            else applyTeacherRestrictions();
        });
    } else {
        if (cachedRole === 'student') applyStudentRestrictions();
        else applyTeacherRestrictions();
    }
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

                console.log("Hardened check - Role:", role, "Permission:", hasPermission);

                // Update Cache
                localStorage.setItem('userRole', role);
                localStorage.setItem('editPermission', String(hasPermission));

                if ((role === 'student' && !hasPermission) || (role === 'teacher' && !hasPermission)) {
                    injectHiderStyle();
                    if (role === 'student') applyStudentRestrictions();
                    else applyTeacherRestrictions();
                } else {
                    restoreVisibility();
                }
            }
        } catch (error) {
            console.error("Error applying role restrictions:", error);
        }
    } else {
        // If logged out, clear cache
        localStorage.removeItem('userRole');
        localStorage.removeItem('editPermission');
        restoreVisibility();
    }
});

function restoreVisibility() {
    console.log("Restoring full visibility...");
    const style = document.getElementById('role-flicker-prevention');
    if (style) style.remove();

    if (window.restrictionInterval) {
        clearInterval(window.restrictionInterval);
        window.restrictionInterval = null;
    }
    if (window.readOnlyInterval) {
        clearInterval(window.readOnlyInterval);
        window.readOnlyInterval = null;
    }

    // Restore teacher-card onclicks
    document.querySelectorAll('.teacher-card').forEach(el => {
        el.classList.remove('teacher-card');
        if (el.dataset.oldOnclick) {
            el.setAttribute('onclick', el.dataset.oldOnclick);
            delete el.dataset.oldOnclick;
        }
        el.style.display = ''; // Reset display
    });

    // Hide all Request Permission buttons for Admins 🛡️
    document.querySelectorAll('.request-permission-btn, #requestPermissionBtnHeader').forEach(btn => {
        btn.style.setProperty('display', 'none', 'important');
    });

    // Show all buttons (EXCEPT request permission buttons 🛡️)
    document.querySelectorAll('button, div, span, a').forEach(el => {
        // Don't force show the dropdown menu! 🛡️🍔
        if (el.id === 'user-dropdown-menu' || el.classList.contains('user-dropdown-container')) return;
        if (el.classList.contains('request-permission-btn') || el.id === 'requestPermissionBtnHeader') return;

        if (el.style.display === 'none') {
            el.style.display = '';
        }
    });
}

// ───────── GLOBAL PERMISSION REQUEST ─────────
window.requestEditPermission = async function () {
    const user = getAuth().currentUser;
    if (!user) return;

    const confirm = await showConfirm("REQUEST PERMISSION", "This will notify the Head/Admin that you want to edit schedules. Continue?");
    if (!confirm) return;

    try {
        const db = getFirestore();
        const { collection, addDoc, serverTimestamp } = await import("https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js");

        // 1. Create Request
        await addDoc(collection(db, "edit_requests"), {
            userId: user.uid,
            username: user.displayName || user.email,
            status: 'pending',
            createdAt: serverTimestamp()
        });

        // 2. Create Notification
        await addDoc(collection(db, "notifications"), {
            title: "PERMISSION REQUEST",
            message: `${user.displayName || 'A teacher'} is requesting edit permission.`,
            sender: "System",
            createdAt: serverTimestamp(),
            type: "edit_request",
            userId: user.uid,
            targetRole: 'admin' // Only Admins should see this 🛡️
        });

        showToast("Request sent to Admin!", "success");

        // Hide local request buttons
        document.querySelectorAll('.request-permission-btn').forEach(btn => btn.style.display = 'none');
    } catch (e) {
        console.error("Error requesting permission:", e);
        showToast("Failed to send request.", "error");
    }
};

function applyStudentRestrictions() {
    console.log("Applying Student Restrictions...");

    // 1. Hide "New Schedule" from Sidebar
    const newSchedSidebar = document.querySelector('div[onclick*="newschedule.html"]');
    if (newSchedSidebar) newSchedSidebar.style.display = 'none';

    // 2. Hide "New Schedule" Card on Homepage
    const newSchedCard = document.querySelector('.card[data-title="New Schedule"]');
    if (newSchedCard) newSchedCard.style.display = 'none';

    // 3. Hide all Add/Edit/Publish/Remove buttons in My Schedule, Campus, etc.
    const sweep = () => {
        // Hide sidebar icons linking to creates/edits
        document.querySelectorAll('div[onclick*="newschedule.html"]').forEach(el => el.style.display = 'none');
        document.querySelectorAll('div[onclick*="editpage.html"]').forEach(el => el.style.display = 'none');

        // Hide cards
        document.querySelectorAll('.card[data-title="New Schedule"]').forEach(el => el.style.display = 'none');

        // Hide Floating Action Buttons (FAB) - specifically the + in campuspage
        document.querySelectorAll('button[onclick*="openAddRoomModal"], #floatBtn, #editFacultyFloat, .edit-button, .create-event-group, #openCreateEvent').forEach(el => el.style.display = 'none');
        document.querySelectorAll('button').forEach(el => {
            if (el.textContent.trim() === '+') el.style.display = 'none';
        });

        // Hide generic action buttons/containers
        document.querySelectorAll('.action-button, .action-group, .dg-event-actions').forEach(el => {
            el.style.display = 'none';
        });

        // For schedule-actions, we want to hide it ONLY if it doesn't contain a download icon
        // Or better, hide only specific buttons inside it.
        document.querySelectorAll('.schedule-actions, .schedule-actions-alt, .schedule-actions-alt2').forEach(container => {
            // Hide buttons like REMOVE but keep the download image
            container.querySelectorAll('button').forEach(btn => btn.style.display = 'none');
        });

        const blacklist = ['edit', 'add class', 'publish', 'unpublish', 'remove', 'add room', 'new schedule', 'save', 'create new event', 'create event'];
        document.querySelectorAll('button, div, span, a').forEach(el => {
            if (el.children.length === 0) { // Only check leaf nodes/text nodes
                // SKIP if it's protected navigation 🛡️⚓
                if (el.closest('.sidebar-link')) return;

                const txt = el.textContent.trim().toLowerCase();
                if (txt && blacklist.includes(txt)) {
                    el.style.display = 'none';
                }
            }
        });
    };

    // Periodically sweep to handle dynamic content
    if (!window.restrictionInterval) {
        window.restrictionInterval = setInterval(sweep, 500);
    }

    // 4. Forceful Redirects (Only for newschedule.html now)
    const path = window.location.pathname;
    if (path.includes('newschedule.html')) {
        showToast("Students cannot create new schedules", "error");
        window.location.href = 'homepage.html';
    }

    // 5. Read-Only Mode for Edit Page
    const hasPermission = localStorage.getItem('editPermission') === 'true';
    if (path.includes('editpage.html') && !hasPermission) {
        enableReadOnlyMode();
    }
}
window.enableReadOnlyMode = enableReadOnlyMode;

function applyTeacherRestrictions() {
    console.log("Applying Teacher Limited Restrictions...");

    // Teachers without permission can't:
    // 1. Create new schedules
    // 2. Publish/Unpublish
    // 3. Remove sections

    const sweep = () => {
        // Tag New Schedule elements as teacher-cards so they aren't hidden by CSS
        document.querySelectorAll('div[onclick*="newschedule.html"], .card[data-title*="New Schedule"], .sidebar-icon[onclick*="newschedule.html"], a[href*="newschedule.html"]').forEach(el => {
            if (!el.classList.contains('teacher-card')) {
                el.classList.add('teacher-card');

                // Aggressive click interception 🛡️
                const intercept = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (window.requestEditPermission) window.requestEditPermission();
                    showToast("Please request permission to create new schedules", "info");
                    return false;
                };

                if (!el.dataset.intercepted) {
                    el.addEventListener('click', intercept, true); // Use capture to intercept before inline
                    el.dataset.intercepted = "true";

                    if (el.getAttribute('onclick')) {
                        el.dataset.oldOnclick = el.getAttribute('onclick');
                        el.setAttribute('onclick', 'return false;');
                    }
                }
            }
        });

        // Hide Admin-only FABs (Add Room)
        document.querySelectorAll('button[onclick*="openAddRoomModal"], #floatBtn').forEach(el => el.style.display = 'none');

        // In Campus/Faculty pages, hide edit buttons (but NOT request permission buttons 🛡️)
        document.querySelectorAll('.edit-button, .action-button, .action-group').forEach(el => {
            if (!el.classList.contains('request-permission-btn')) {
                el.style.display = 'none';
            }
        });

        // Text-based blacklist for buttons that should be hidden
        const blacklist = ['publish', 'unpublish', 'remove', 'add room', 'new schedule', 'save', 'create new event', 'create event'];
        document.querySelectorAll('button, div, span, a').forEach(el => {
            if (el.children.length === 0) {
                // SKIP if it's protected navigation 🛡️⚓
                if (el.closest('.sidebar-link')) return;

                const txt = el.textContent.trim().toLowerCase();
                if (txt && blacklist.includes(txt)) {
                    el.style.display = 'none';
                }
            }
        });
    };

    if (!window.restrictionInterval) {
        window.restrictionInterval = setInterval(sweep, 500);
    }

    // Forceful Redirect from newschedule.html
    const path = window.location.pathname;
    if (path.includes('newschedule.html')) {
        showToast("Please request permission to create new schedules!", "info");
        window.location.href = 'homepage.html';
    }

    // Read-Only for Edit Page but with Comment Support
    const hasPermission = localStorage.getItem('editPermission') === 'true';
    if (path.includes('editpage.html') && !hasPermission) {
        enableTeacherReadOnlyMode();
    }
}
window.enableTeacherReadOnlyMode = enableTeacherReadOnlyMode;

function enableTeacherReadOnlyMode() {
    console.log("Enabling Teacher Read-Only (Comment Mode)...");

    // Hide Editor Controls but keep Sidebar (if we want to show a 'Request Permission' button there)
    const selectorsToHide = [
        '.btn.save',
        '.btn.vacant-btn',
        '.btn.delete',
        '.edit-controls'
    ];

    selectorsToHide.forEach(sel => {
        const els = document.querySelectorAll(sel);
        els.forEach(el => el.style.display = 'none');
    });

    const disableGrid = () => {
        document.querySelectorAll('td').forEach(td => {
            // We DON'T set pointer-events: none because they need to click to comment!
            td.setAttribute('draggable', 'false');
            td.setAttribute('contenteditable', 'false');

            td.ondragstart = (e) => { e.preventDefault(); return false; };
            td.ondrop = (e) => { e.preventDefault(); return false; };
            td.ondragover = (e) => { e.preventDefault(); return false; };

            // Visually indicate cells are clickable for comments
            if (td.classList.contains('vacant-empty') || td.classList.contains('occupied') || td.classList.contains('vacant-marked')) {
                td.style.cursor = 'help'; // Help cursor for comments
                td.title = "Click to leave a comment";
            }
        });

        document.querySelectorAll('.delete-btn, .remove-icon, .resize-handle').forEach(el => el.style.display = 'none');
    };

    disableGrid();
    if (!window.readOnlyInterval) {
        window.readOnlyInterval = setInterval(disableGrid, 500);
    }
}
