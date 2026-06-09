import { db, auth } from "./js/config/firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { doc, getDoc, collection, addDoc, serverTimestamp, updateDoc } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { showToast, showConfirm } from "./js/utils/ui-utils.js";
import "./import-progress.js";

// 🚀 Early Cache Check for Flicker Prevention
let cachedRole = localStorage.getItem('userRole');
let cachedPermission = localStorage.getItem('editPermission') === 'true';
let cachedProgram = localStorage.getItem('userProgram') || '';

// 🛡️ RBAC HARDENING: MutationObserver instead of setInterval ⚓
const observer = new MutationObserver((mutations) => {
    const role = localStorage.getItem('userRole') || 'student';
    const perm = localStorage.getItem('editPermission') === 'true';
    if (role !== 'admin' && role !== 'academic_head' && !perm) {
        sweep();
    }
});

function injectHiderStyle() {
    if (document.getElementById('role-flicker-prevention')) return;
    const style = document.createElement('style');
    style.id = 'role-flicker-prevention';
    style.textContent = `
        div[onclick*="sectionspage.html"]:not(.teacher-card), 
        .card[data-title*="New Schedule"]:not(.teacher-card),
        .sidebar-icon[onclick*="sectionspage.html"]:not(.teacher-card),
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
    // Also hide draft widget early for non-editors
    const s = document.createElement('style');
    s.textContent = `#draftWidget { display: none !important; }`;
    document.head.appendChild(s);
}

// 🛡️ Student-specific early hide for curriculum, myschedule, and draft widget
if (cachedRole === 'student') {
    const studentStyle = document.createElement('style');
    studentStyle.id = 'student-nav-hide';
    studentStyle.textContent = `
        a[href*="curriculumpage"],
        a[href*="myschedule"],
        #draftWidget {
            display: none !important;
        }
    `;
    document.head.appendChild(studentStyle);
}

// Option B: multi-role helper — returns highest-privilege role from roles[] or falls back to role string
const ROLE_PRIORITY = ['admin', 'academic_head', 'program head', 'teacher', 'student'];
function getEffectiveRole(userData) {
    const roles = Array.isArray(userData.roles) && userData.roles.length ? userData.roles : [userData.role || 'student'];
    for (const r of ROLE_PRIORITY) {
        if (roles.includes(r)) return r;
    }
    return roles[0] || 'student';
}

onAuthStateChanged(auth, async (user) => {
    if (user) {
        try {
            // Direct fetch for hardening 🛡️
            const userDoc = await getDoc(doc(db, "users", user.uid));
            if (userDoc.exists()) {
                const userData = userDoc.data();
                const role = getEffectiveRole(userData);
                const hasPermission = userData.editPermission === true;

                // Update Cache ⚓
                localStorage.setItem('userRole', role);
                localStorage.setItem('userRoles', JSON.stringify(Array.isArray(userData.roles) ? userData.roles : [role]));
                localStorage.setItem('editPermission', String(hasPermission));
                const program = userData.program || '';
                localStorage.setItem('userProgram', program);

                applyRestrictions(role, hasPermission);

                // Update lastSeen for online presence
                updateDoc(doc(db, "users", user.uid), { lastSeen: serverTimestamp() }).catch(() => {});
            }
        } catch (error) {
            console.error("Error applying role restrictions:", error);
        }
    } else {
        localStorage.removeItem('userRole');
        localStorage.removeItem('editPermission');
        window.location.href = 'index.html';
    }
});

// Also run on DOM load to ensure sidebar is updated immediately
document.addEventListener("DOMContentLoaded", () => {
    const role = localStorage.getItem('userRole') || 'student';
    const hasPermission = localStorage.getItem('editPermission') === 'true';
    const program = localStorage.getItem('userProgram') || '';
    applyRestrictions(role, hasPermission);
});

function applyRestrictions(role, hasPermission) {
    // Only admin or users with explicit editPermission can edit
    const isEditor = role === 'admin' || role === 'academic_head' || hasPermission;
    
    if (!isEditor) {
        injectHiderStyle();
        sweep();
        observer.observe(document.body, { childList: true, subtree: true });
    } else {
        restoreVisibility();
    }

    // 🛡️ Global Admin Sidebar Links Toggle ⚓
    const adminLinks = document.getElementById('adminSidebarLinks');
    if (adminLinks) {
        adminLinks.style.display = (role === 'admin' || role === 'academic_head') ? 'block' : 'none';
    }

    // Auto-highlight sidebar link matching current page
    const currentPage = window.location.pathname.split('/').pop();
    document.querySelectorAll('.sidebar-link').forEach(link => {
        const href = link.getAttribute('href') || '';
        if (href === currentPage) link.classList.add('active');
        else link.classList.remove('active');
    });

    // Hide Accounts page link — admin only
    document.querySelectorAll("a[href*='accounts.html']").forEach(el => {
        if (role !== 'admin') {
            el.style.setProperty('display', 'none', 'important');
        } else {
            el.style.removeProperty('display');
        }
    });

    // Hide My Schedule, Curriculum, Archives from students (sidebar + mobile nav)
    if (role === "student") {
        document.querySelectorAll("a[href*='myschedule']").forEach(el => el.style.display = "none");
        document.querySelectorAll("a[href*='curriculumpage']").forEach(el => el.style.display = "none");
        document.querySelectorAll("a[href*='archives']").forEach(el => el.style.display = "none");
    }

    // Hide schedule editing links from teachers without edit permission
    if (!isEditor) {
        document.querySelectorAll("a[href*='newschedule']").forEach(el => el.style.display = "none");
        document.querySelectorAll("#draftWidget").forEach(el => el.style.display = "none");
    }

    // Hide archives from non-admins (teachers/students)
    if (role !== "admin" && role !== "academic_head") {
        document.querySelectorAll("a[href*='archives']").forEach(el => el.style.display = "none");
    }

    // Toggle .admin-only class elements (like in mobile bottom nav)
    document.querySelectorAll('.admin-only').forEach(el => {
        if (role === 'admin' || role === 'academic_head') {
            if (el.classList.contains('selection-bar')) return; // controlled by facultypage.js
            if (el.id === 'bulkDeleteBar' || el.id === 'eventSelectionBar') return; // controlled by select mode
            const isFlexEl = el.classList.contains('mob-nav-item') || el.classList.contains('import-toolbar');
            el.style.display = isFlexEl ? 'flex' : 'block';
        } else {
            el.style.display = 'none';
        }
    });
}

function sweep() {
    const role = localStorage.getItem('userRole') || 'student';
    const perm = localStorage.getItem('editPermission') === 'true';
    if (role === 'admin' || role === 'academic_head' || perm) return;

    // 1. Hide Editor elements
    document.querySelectorAll('div[onclick*="sectionspage.html"], div[onclick*="editpage.html"]').forEach(el => {
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
    document.getElementById('student-nav-hide')?.remove();
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


// Auto-follow OS dark/light mode when user hasn't set a manual preference
(function() {
    const saved = localStorage.getItem('theme');
    const osIsDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    // If saved theme matches OS, remove it so OS changes are followed dynamically
    if ((saved === 'dark' && osIsDark) || (saved === 'light' && !osIsDark)) {
        localStorage.removeItem('theme');
    }
})();

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
    if (!localStorage.getItem('theme')) {
        document.documentElement.classList.toggle('dark', e.matches);
    }
});
