import { doc, getDoc, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { auth, db } from "./js/config/firebase-config.js";
import { initUserProfile } from "./userprofile.js";
import { showToast, showConfirm } from "./js/utils/ui-utils.js";
import { toMin, toTime, to12, parseBlock } from "./js/utils/time-utils.js";

document.addEventListener("DOMContentLoaded", async () => {
    initUserProfile("#userProfile");

    const urlParams = new URLSearchParams(window.location.search);
    const sectionId = urlParams.get("id");
    let userRole = 'student';
    let hasEditPermission = false;

    if (!sectionId) {
        document.getElementById("displaySectionName").textContent = "Section Not Found";
        return;
    }

    // Fetch Section Info
    try {
        const sectionDoc = await getDoc(doc(db, "sections", sectionId));
        if (sectionDoc.exists()) {
            const data = sectionDoc.data();
            document.getElementById("displaySectionName").textContent = data.name;
            document.getElementById("strandLabel").innerHTML = `<strong>Strand/Program:</strong> ${data.strand}`;
            document.getElementById("gradeLabel").innerHTML = `<strong>Grade Level:</strong> ${data.gradeLevel}`;

            // Load profile photo from section's user account
            if (data.authUid) {
                const userSnap = await getDoc(doc(db, "users", data.authUid));
                if (userSnap.exists() && userSnap.data().photoURL) {
                    document.getElementById("sectionImg").src = userSnap.data().photoURL;
                } else {
                    document.getElementById("sectionImg").src = "images/default_shark.jpg";
                }
            } else {
                document.getElementById("sectionImg").src = "images/default_shark.jpg";
            }

            // Display Credentials for Admin Only
            const credentialSection = document.getElementById("credentialSection");
            const emailLabel = document.getElementById("emailLabel");
            const passwordLabel = document.getElementById("passwordLabel");

            if (data.sectionEmail && credentialSection) {
                const user = auth.currentUser;
                if (user) {
                    const userDoc = await getDoc(doc(db, "users", user.uid));
                    if (userDoc.exists()) {
                        const userData = userDoc.data();
                        userRole = userData.role || 'student';
                        hasEditPermission = userData.editPermission === true;

                        if (userRole === 'admin') {
                            credentialSection.style.display = "block";
                            emailLabel.innerHTML = `<strong>Email:</strong> ${data.sectionEmail}`;
                            passwordLabel.innerHTML = `<strong>Password:</strong> ${data.defaultPassword || "Not Set"}`;

                            // Reset Password button
                            const resetBtn = document.getElementById('resetSectionPassBtn');
                            if (resetBtn) {
                                resetBtn.onclick = async () => {
                                    const sectionName = data.name || '';
                                    const sanitized = sectionName.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
                                    const defaultPass = 'SCHEDSYNC' + sanitized;
                                    const uid = data.authUid;
                                    if (!uid) { showToast('No Auth UID found.', 'error'); return; }
                                    const confirmed = await showConfirm('Reset Password?', 'Reset to default: ' + defaultPass + '?');
                                    if (!confirmed) return;
                                    try {
                                        const { adminResetPassword } = await import('./admin-reset.js');
                                        await adminResetPassword(uid, defaultPass);
                                        const { updateDoc, doc: _doc } = await import("https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js");
                                        await updateDoc(_doc(db, 'sections', sectionId), { defaultPassword: defaultPass });
                                        passwordLabel.innerHTML = `<strong>Password:</strong> ${defaultPass}`;
                                        showToast('Password reset to: ' + defaultPass, 'success');
                                    } catch (err) {
                                        showToast('Reset failed: ' + err.message, 'error');
                                    }
                                };
                            }
                        }
                    }
                }
            }

            // Fetch Schedule for this section
            fetchSectionSchedule(data.name, userRole, hasEditPermission);
        } else {
            document.getElementById("displaySectionName").textContent = "Section Not Found";
        }
    } catch (error) {
        console.error("Error fetching section profile:", error);
    }
});

async function fetchSectionSchedule(sectionName, userRole = 'student', hasEditPermission = false) {
    const container = document.getElementById("sectionScheduleContainer");
    const tbody = document.getElementById("tbody");
    try {
        const q = query(collection(db, "schedules"), where("section", "==", sectionName));
        const snap = await getDocs(q);

        container.innerHTML = "";

        if (snap.empty) {
            container.innerHTML = '<div style="text-align:center;padding:2.5rem;opacity:0.5;font-size:1rem;">📭 No schedule found for this section yet.</div>';
            document.querySelector('.table-scroll').style.display = 'none';
            return;
        }

        // Collect all classes from published schedules (prefer published, fallback to any)
        let allClasses = [];
        let schedName = "";
        let schedStatus = "draft";
        snap.docs.forEach(d => {
            const data = d.data();
            if (!schedName) { schedName = data.scheduleName || "Schedule"; schedStatus = data.status || "draft"; }
            if (Array.isArray(data.classes)) allClasses.push(...data.classes);
        });

        const nonVacant = allClasses.filter(c => c.subject && c.subject !== "VACANT" && c.subject !== "MARKED_VACANT");

        // Header
        const isEditor = userRole === 'admin' || hasEditPermission;
        const statusColor = schedStatus === "published" ? "#16a34a" : "#f59e0b";
        const statusLabel = schedStatus === "published" ? "✅ Published" : "📝 Draft";
        const editBtn = isEditor ? `<a href="editpage.html?name=${encodeURIComponent(schedName)}" style="padding:5px 14px;background:#005BAB;color:white;border:2px solid #000;border-radius:8px;font-size:0.75rem;font-weight:800;text-decoration:none;box-shadow:2px 2px 0 #000;">✏️ Edit</a>` : "";
        const headerDiv = document.createElement("div");
        headerDiv.className = "section-header-div";
        headerDiv.style.cssText = "display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem;padding:12px 16px;border:2.5px solid #000;border-radius:16px;box-shadow:3px 3px 0 #000;";
        headerDiv.innerHTML = `
            <div style="font-weight:900;font-size:1.05rem;">${schedName}</div>
            <div style="display:flex;align-items:center;gap:10px;">
                <span style="padding:3px 10px;border-radius:20px;font-size:0.75rem;font-weight:800;background:${statusColor};color:white;border:1.5px solid #000;">${statusLabel}</span>
                ${editBtn}
            </div>
        `;
        container.appendChild(headerDiv);

        renderTable(nonVacant);

    } catch (error) {
        console.error("Error fetching section schedule:", error);
        container.innerHTML = '<div style="color:#ef4444;padding:1rem;font-weight:700;">Error loading schedule. Please try again.</div>';
    }
}

function renderTable(classes) {
    const tbody = document.getElementById("tbody");
    if (!tbody) return;
    tbody.innerHTML = "";

    const colgroup = document.querySelector("colgroup");
    const theadTr = document.querySelector("thead tr");
    const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

    colgroup.innerHTML = `<col class="time">`;
    theadTr.innerHTML = `<th>TIME</th>`;
    DAYS.forEach(d => {
        colgroup.insertAdjacentHTML("beforeend", `<col class="day">`);
        theadTr.insertAdjacentHTML("beforeend", `<th>${d.slice(0,3).toUpperCase()}</th>`);
    });

    const timePoints = new Set();
    classes.forEach(c => {
        if (c.timeBlock) { const b = parseBlock(c.timeBlock); if(b){ timePoints.add(b.start); timePoints.add(b.end); } }
    });

    if (timePoints.size === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:2rem;opacity:0.5;">No classes assigned yet.</td></tr>';
        return;
    }

    const sorted = Array.from(timePoints).sort((a,b) => a-b);
    const intervals = [];
    for (let i = 0; i < sorted.length - 1; i++) {
        intervals.push({ start: sorted[i], end: sorted[i+1], label: `${to12(toTime(sorted[i]))} - ${to12(toTime(sorted[i+1]))}` });
    }

    intervals.forEach((interval, i) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${interval.label}</td>`;
        DAYS.forEach(day => {
            const c = classes.find(x => x.day === day && parseBlock(x.timeBlock)?.start === interval.start);
            const occupied = classes.some(x => { const b = parseBlock(x.timeBlock); return b && x.day === day && b.start < interval.start && b.end > interval.start; });
            if (occupied) return;
            const td = document.createElement("td");
            if (c) {
                const b = parseBlock(c.timeBlock);
                let span = 0;
                for (let k = i; k < intervals.length; k++) {
                    const m = intervals[k];
                    if (b && m.start >= b.start && m.end <= b.end) span++; else break;
                }
                if (span > 1) td.rowSpan = span;
                td.classList.add("occupied");
                td.innerHTML = `<div style="font-weight:bold;font-size:12px;">${c.subject}</div><div style="font-size:11px;margin-top:2px;">${c.section||""}</div><div style="font-size:11px;opacity:0.8;">${c.teacher||""}</div>`;
                if (c.color) { td.style.setProperty('background-color', c.color, 'important'); td.style.setProperty('color','#000','important'); }
            } else {
                td.classList.add("vacant-empty");
            }
            tr.appendChild(td);
        });
        tbody.appendChild(tr);
    });
}

