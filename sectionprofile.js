import { auth, db } from "./js/config/firebase-config.js";
import { doc, getDoc, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { initUserProfile } from "./userprofile.js";
import { showToast, showConfirm } from "./js/utils/ui-utils.js";

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
    try {
        // Query schedules where section field matches this section name
        // Each schedule doc has: scheduleName, section, status, classes[]
        // classes[] contains: {day, timeBlock, subject, teacher, room}
        const q = query(collection(db, "schedules"), where("section", "==", sectionName));
        const snap = await getDocs(q);

        container.innerHTML = "";

        if (snap.empty) {
            container.innerHTML = '<div style="text-align:center;padding:2.5rem;opacity:0.5;font-size:1rem;">📭 No schedule found for this section yet.</div>';
            return;
        }

        const scheduleDocs = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        // Group by scheduleName
        const scheduleGroups = {};
        scheduleDocs.forEach(sdoc => {
            const name = sdoc.scheduleName || "Untitled Schedule";
            if (!scheduleGroups[name]) {
                scheduleGroups[name] = { name, status: sdoc.status || "draft", classes: [] };
            }
            if (Array.isArray(sdoc.classes)) {
                sdoc.classes.forEach(cls => {
                    scheduleGroups[name].classes.push(cls);
                });
            }
        });

        const dayOrder = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

        Object.values(scheduleGroups).forEach(sg => {
            const schedBlock = document.createElement("div");
            schedBlock.style.cssText = "margin-bottom:2.5rem;";

            // Schedule header
            const statusColor = sg.status === "published" ? "#16a34a" : "#f59e0b";
            const statusLabel = sg.status === "published" ? "✅ Published" : "📝 Draft";
            const headerDiv = document.createElement("div");
            headerDiv.style.cssText = "display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem;padding:12px 16px;background:#f1f5f9;border:2.5px solid #000;border-radius:16px;box-shadow:3px 3px 0 #000;";
            
            const isEditor = (userRole !== 'student') && (userRole === 'admin' || userRole === 'program head' || hasEditPermission);
            const editBtn = isEditor ? `<a href="editpage.html?name=${encodeURIComponent(sg.name)}" style="padding:5px 14px;background:#005BAB;color:white;border:2px solid #000;border-radius:8px;font-size:0.75rem;font-weight:800;text-decoration:none;box-shadow:2px 2px 0 #000;">✏️ Edit</a>` : "";

            headerDiv.innerHTML = `
                <div style="font-weight:900;font-size:1.05rem;">${sg.name}</div>
                <div style="display:flex;align-items:center;gap:10px;">
                    <span style="padding:3px 10px;border-radius:20px;font-size:0.75rem;font-weight:800;background:${statusColor};color:white;border:1.5px solid #000;">${statusLabel}</span>
                    ${editBtn}
                </div>
            `;
            schedBlock.appendChild(headerDiv);

            // Filter out VACANT classes
            const nonVacant = sg.classes.filter(c => c.subject && c.subject !== "VACANT");

            if (nonVacant.length === 0) {
                const emptyMsg = document.createElement("div");
                emptyMsg.style.cssText = "text-align:center;padding:1.5rem;opacity:0.5;font-size:0.9rem;border:2px dashed #cbd5e1;border-radius:12px;";
                emptyMsg.textContent = "This schedule has no assigned classes yet.";
                schedBlock.appendChild(emptyMsg);
                container.appendChild(schedBlock);
                return;
            }

            // Group by day
            const byDay = {};
            nonVacant.forEach(cls => {
                const day = cls.day || "Unknown";
                if (!byDay[day]) byDay[day] = [];
                byDay[day].push(cls);
            });

            const sortedDays = Object.keys(byDay).sort(
                (a, b) => (dayOrder.indexOf(a) === -1 ? 99 : dayOrder.indexOf(a)) -
                           (dayOrder.indexOf(b) === -1 ? 99 : dayOrder.indexOf(b))
            );

            sortedDays.forEach(day => {
                const daySection = document.createElement("div");
                daySection.style.cssText = "margin-bottom:1.25rem;";
                daySection.innerHTML = `<div style="font-weight:900;font-size:0.85rem;color:#005BAB;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:0.6rem;padding-bottom:4px;border-bottom:2.5px solid #000;">${day}</div>`;

                const grid = document.createElement("div");
                grid.style.cssText = "display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:10px;";

                // Sort by timeBlock
                byDay[day].sort((a, b) => (a.timeBlock || "").localeCompare(b.timeBlock || ""));

                byDay[day].forEach(cls => {
                    const card = document.createElement("div");
                    card.style.cssText = "padding:10px 13px;background:white;border:2px solid #000;border-radius:12px;box-shadow:3px 3px 0 #000;";
                    card.innerHTML = `
                        <div style="font-weight:800;color:#005BAB;font-size:0.85rem;margin-bottom:5px;">${cls.subject}</div>
                        <div style="font-size:0.75rem;color:#64748b;">🕒 ${cls.timeBlock || "N/A"}</div>
                        ${cls.teacher && cls.teacher !== "NA" ? `<div style="font-size:0.75rem;color:#64748b;margin-top:3px;">👨‍🏫 ${cls.teacher}</div>` : ""}
                        ${cls.room ? `<div style="font-size:0.75rem;color:#64748b;margin-top:3px;">📍 ${(cls.room || "").replace(/\s*\|?\s*\d{1,3}%\s*(?:OCCUPIED)?$/i, "").trim()}</div>` : ""}
                    `;
                    grid.appendChild(card);
                });

                daySection.appendChild(grid);
                schedBlock.appendChild(daySection);
            });

            container.appendChild(schedBlock);
        });

    } catch (error) {
        console.error("Error fetching section schedule:", error);
        container.innerHTML = '<div style="color:#ef4444;padding:1rem;font-weight:700;">Error loading schedule. Please try again.</div>';
    }
}