import { initMobileNav } from "./js/ui/mobile-nav.js";
import { db, auth, app } from "./js/config/firebase-config.js";
import { onAuthStateChanged, updateProfile, signOut } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { doc, getDoc, updateDoc, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { initUserProfile } from "./userprofile.js";
import { initUniversalSearch } from "./search.js";
import { getUIMode, setUIMode } from "./ui-effects.js";
import { showToast, showPrompt, showConfirm } from "./js/utils/ui-utils.js";

/* ───────── TIME HELPERS ───────── */
const toMin = t => {
    if (!t) return 0;
    const parts = t.split(":");
    if (parts.length < 2) return 0;
    const [h, m] = parts.map(Number);
    return (h || 0) * 60 + (m || 0);
};
const toTime = m =>
    `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const to12 = t => {
    if (!t) return "";
    let [h, m] = t.split(":");
    h = +h;
    return `${((h + 11) % 12) + 1}:${m} ${h >= 12 ? "PM" : "AM"}`;
};

const parseBlock = block => {
    const [s, e] = block.split("-");
    return {
        start: toMin(s),
        end: toMin(e)
    };
};

let currentUserData = null;

document.addEventListener("DOMContentLoaded", () => {
    initMobileNav();
    initUserProfile("#userProfile");
    initUniversalSearch(db);

    // ✅ PROFILE EDIT BUTTON LOGIC
    const editBtn = document.getElementById('floatBtn');
    if (editBtn) {
        editBtn.addEventListener('click', async () => {
            const currentName = document.getElementById("userNameLarge").textContent;
            const newName = await showPrompt("Edit Profile", "Enter your new name:", currentName);

            if (newName && newName.trim() !== "" && newName !== currentName) {
                try {
                    const user = auth.currentUser;
                    if (!user) {
                        showToast("You must be logged in to edit your profile.", "error");
                        return;
                    }

                    // 1. Update Firebase Auth
                    await updateProfile(user, { displayName: newName });

                    // 2. Update Firestore
                    const docRef = doc(db, "users", user.uid);
                    await updateDoc(docRef, { username: newName });

                    // 3. Update UI
                    document.getElementById("userNameLarge").textContent = newName;
                    const headerUserName = document.querySelector("#userProfile .user-name");
                    if (headerUserName) headerUserName.textContent = newName;

                    showToast("Profile updated successfully!", "success");
                } catch (error) {
                    console.error("Failed to update profile:", error);
                    showToast("Error updating profile. Please try again.", "error");
                }
            }
        });
    }

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            setupImageUpdate(user);
            try {
                const docRef = doc(db, "users", user.uid);
                const docSnap = await getDoc(docRef);

                if (docSnap.exists()) {
                    currentUserData = docSnap.data();
                    renderProfile(currentUserData);
                } else {
                    console.error("No Firestore document for user");
                    renderProfile({ username: user.displayName || "User", email: user.email });
                }
            } catch (error) {
                console.error("Error loading profile:", error);
            }
        } else {
            window.location.href = "index.html";
        }
    });
});

function setupImageUpdate(user) {
    const profileContainer = document.querySelector(".profile-image");
    if (!profileContainer) return;
    profileContainer.style.cursor = "pointer";
    profileContainer.addEventListener("click", async () => {
        const newUrl = await showPrompt("Update Profile Picture", "Paste your new image URL:");
        if (!newUrl || !newUrl.trim()) return;
        try {
            await updateProfile(user, { photoURL: newUrl });
            await updateDoc(doc(db, "users", user.uid), { photoURL: newUrl });
            document.getElementById("profileImg").src = newUrl;
            const h = document.querySelector("#userProfile img");
            if (h) h.src = newUrl;
            showToast("Profile picture updated!", "success");
        } catch (e) {
            showToast("Error updating profile picture.", "error");
        }
    });
}

function renderProfile(data) {
    const name = data.username || data.name || "Unnamed User";
    const role = data.role || "User";

    document.getElementById("userNameLarge").textContent = name;

    const roleLabel = document.getElementById("roleLabel");
    const roleValue = document.getElementById("roleValue");
    const extraLabel = document.getElementById("extraLabel");
    const extraValue = document.getElementById("extraValue");

    if (role === 'teacher') {
        roleLabel.innerHTML = "<strong>Subjects:</strong>";
        roleValue.textContent = (data.subjects || []).join(", ") || "None selected";
        extraLabel.innerHTML = "<strong>Status:</strong>";
        extraValue.textContent = data.employmentStatus || "N/A";

        // Fetch Schedule for Teacher
        fetchTeacherSchedule(name);

    } else if (role === 'student') {
        roleLabel.innerHTML = "<strong>Section:</strong>";
        roleValue.textContent = data.section || "N/A";
        extraLabel.innerHTML = "<strong>Role:</strong>";
        extraValue.textContent = "Student";

        // Fetch Schedule for Student's Section
        if (data.section) {
            fetchStudentSchedule(data.section);
        }
    } else {
        roleLabel.innerHTML = "<strong>Email:</strong>";
        roleValue.textContent = data.email || "N/A";
        extraLabel.innerHTML = "<strong>Role:</strong>";
        extraValue.textContent = role.charAt(0).toUpperCase() + role.slice(1);
    }

    const pfp = data.photoURL || auth.currentUser?.photoURL || "images/default_shark.jpg";
    document.getElementById("profileImg").src = pfp;
}

/* ───────── STUDENT SCHEDULE LOGIC ───────── */
async function fetchStudentSchedule(sectionName) {
    console.log("Fetching schedule for section:", sectionName);
    try {
        const q = query(collection(db, "schedules"),
            where("status", "==", "published"),
            where("section", "==", sectionName)
        );
        const snap = await getDocs(q);

        let sectionClasses = [];
        snap.forEach(doc => {
            const sched = doc.data();
            const classes = sched.classes || [];
            classes.forEach(c => {
                sectionClasses.push({
                    ...c,
                    section: sched.section || sectionName,
                    schedName: sched.scheduleName
                });
            });
        });

        console.log(`Found ${sectionClasses.length} classes for section ${sectionName}`);
        renderTable(sectionClasses);

    } catch (error) {
        console.error("Error fetching student schedule:", error);
    }
}

/* ───────── SCHEDULE LOGIC (Copied from facultyprofile.js) ───────── */
async function fetchTeacherSchedule(teacherName) {
    console.log("Fetching schedule for:", teacherName);
    try {
        const q = query(collection(db, "schedules"), where("status", "==", "published"));
        const snap = await getDocs(q);

        let teacherClasses = [];

        snap.forEach(doc => {
            const sched = doc.data();
            const classes = sched.classes || [];

            classes.forEach(c => {
                // Robust matching
                const target = teacherName.toLowerCase().trim();
                const current = (c.teacher || "").toLowerCase().trim();

                const isMatch = target === current ||
                    (target.includes(current) && current.length > 3) ||
                    (current.includes(target) && target.length > 3);

                if (isMatch) {
                    teacherClasses.push({
                        ...c,
                        section: sched.section || "Unknown Section",
                        schedName: sched.scheduleName
                    });
                }
            });
        });

        console.log("Found classes:", teacherClasses.length);
        renderTable(teacherClasses);

    } catch (error) {
        console.error("Error fetching schedules:", error);
    }
}

function renderTable(classes) {
    const tbody = document.getElementById("tbody");
    if (!tbody) return;

    tbody.innerHTML = "";

    const colgroup = document.querySelector("colgroup");
    const theadTr = document.querySelector("thead tr");

    // 1. Fixed Days (Monday - Saturday)
    const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

    // 2. Build Headers
    colgroup.innerHTML = `<col class="time">`;
    theadTr.innerHTML = `<th>TIME</th>`;

    DAYS.forEach(d => {
        colgroup.insertAdjacentHTML("beforeend", `<col class="day" style="width: calc((100% - 150px)/${DAYS.length})">`);
        theadTr.insertAdjacentHTML("beforeend", `<th>${d.slice(0, 3).toUpperCase()}</th>`);
    });

    // 3. 🔑 DYNAMIC MATRIX SYSTEM
    const timePoints = new Set();
    const START_MIN = 450; // 7:30 AM
    const END_MIN = 1200;  // 8:00 PM
    const INTERVAL = 90;

    for (let m = START_MIN; m <= END_MIN; m += INTERVAL) {
        timePoints.add(m);
    }

    classes.forEach(c => {
        if (c.timeBlock) {
            const block = parseBlock(c.timeBlock);
            timePoints.add(block.start);
            timePoints.add(block.end);
        }
    });

    const sortedPoints = Array.from(timePoints).sort((a, b) => a - b);
    const matrixIntervals = [];

    for (let i = 0; i < sortedPoints.length - 1; i++) {
        const start = sortedPoints[i];
        const end = sortedPoints[i + 1];
        if (start >= END_MIN) break;
        matrixIntervals.push({
            start: start,
            end: end,
            label: `${to12(toTime(start))} - ${to12(toTime(end))}`
        });
    }

    // 4. Render Rows
    matrixIntervals.forEach((interval, i) => {
        const tr = document.createElement("tr");

        // Time Column
        tr.innerHTML = `<td>${interval.label}</td>`;

        // Day Columns
        DAYS.forEach(day => {
            const c = classes.find(x => x.day === day && parseBlock(x.timeBlock).start === interval.start);

            const isOccupiedByPrevious = classes.some(x => {
                const b = parseBlock(x.timeBlock);
                return x.day === day && b.start < interval.start && b.end > interval.start;
            });

            if (isOccupiedByPrevious) return;

            const td = document.createElement("td");

            if (c) {
                const b = parseBlock(c.timeBlock);
                let spanCount = 0;
                for (let k = i; k < matrixIntervals.length; k++) {
                    const m = matrixIntervals[k];
                    if (m.start >= b.start && m.end <= b.end) spanCount++;
                    else break;
                }
                if (spanCount > 1) td.rowSpan = spanCount;

                if (c.subject === "MARKED_VACANT" || c.subject === "VACANT") {
                    td.textContent = "VACANT";
                    td.classList.add("vacant-marked");
                } else {
                    // Context-aware display
                    const role = currentUserData?.role || "student";
                    const subLine1 = role === 'teacher' ? c.section : (c.teacher || "No Teacher");
                    const subLine2 = c.room || "Room TBD";

                    td.innerHTML = `
                        <div style="font-weight:bold; font-size:12px;">${c.subject}</div>
                        <div style="font-size:11px; margin-top:2px;">${subLine1}</div>
                        <div style="font-size:11px; opacity:0.8;">${subLine2}</div>
                     `;
                    td.classList.add("occupied");

                    if (c.color) {
                        td.style.setProperty('background-color', c.color, 'important');
                        td.style.setProperty('color', '#000000', 'important');
                    }
                }
            } else {
                td.textContent = "";
                td.classList.add("vacant-empty");
            }
            tr.appendChild(td);
        });

        tbody.appendChild(tr);
    });
}


