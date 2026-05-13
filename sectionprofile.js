import { auth, db } from "./js/config/firebase-config.js";
import { doc, getDoc, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { initUserProfile } from "./userprofile.js";
import { showToast, showConfirm } from "./js/utils/ui-utils.js";
import { toMin, toTime, to12, parseBlock } from "./js/utils/time-utils.js";

let currentSectionName = "";
let currentSectionClasses = [];
const normalizeDay = d => (d||"").trim().toLowerCase();

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
            currentSectionName = data.name;
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

        currentSectionClasses = nonVacant;

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

// Wire download button
document.addEventListener("DOMContentLoaded", () => {
    const btn = document.getElementById("downloadBtn");
    if (btn) btn.onclick = () => downloadSchedule();
});

function downloadSchedule(format = null) {
    if (!format) { showDownloadFormatSelector((f) => downloadSchedule(f)); return; }
    if (currentSectionClasses.length === 0) { showToast("No classes found to export.", "error"); return; }

    if (format === 'pdf' && !window.html2pdf) {
        const s = document.createElement('script'); s.src = "https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"; s.onload = () => downloadSchedule('pdf'); document.head.appendChild(s); return;
    }
    if (format === 'image' && !window.html2canvas) {
        const s = document.createElement('script'); s.src = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"; s.onload = () => downloadSchedule('image'); document.head.appendChild(s); return;
    }
    if (format === 'excel' && !window.XLSX) {
        const s = document.createElement('script'); s.src = "https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/dist/xlsx.bundle.js"; s.onload = () => downloadSchedule('excel'); document.head.appendChild(s); return;
    }

    const DAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
    const timePoints = new Set();
    currentSectionClasses.forEach(c => { const b = parseBlock(c.timeBlock); if(b){ timePoints.add(b.start); timePoints.add(b.end); } });
    const sorted = Array.from(timePoints).sort((a,b)=>a-b);
    const intervals = [];
    for(let i=0;i<sorted.length-1;i++) intervals.push({start:sorted[i],end:sorted[i+1],label:`${to12(toTime(sorted[i]))} - ${to12(toTime(sorted[i+1]))}`});

    if (format === 'excel') {
        const wb = XLSX.utils.book_new();
        const wsData = [["STI COLLEGE SANTA MARIA"],["OFFICIAL SECTION SCHEDULE"],[`SECTION: ${currentSectionName}`],["ACADEMIC YEAR 2025-2026"],[],["TIME BLOCK",...DAYS]];
        intervals.forEach(interval => {
            const row = [interval.label];
            DAYS.forEach(day => {
                const c = currentSectionClasses.find(x => { const b=parseBlock(x.timeBlock); return normalizeDay(x.day)===normalizeDay(day) && b && b.start<interval.end && b.end>interval.start; });
                row.push(c ? `${c.subject}\n${c.teacher||""}\n${c.room||""}` : "");
            });
            wsData.push(row);
        });
        const ws = XLSX.utils.aoa_to_sheet(wsData);
        ws['!cols'] = [{wch:25},...DAYS.map(()=>({wch:30}))];
        XLSX.utils.book_append_sheet(wb, ws, "Section Schedule");
        XLSX.writeFile(wb, `${currentSectionName.replace(/\s+/g,'_')}_Schedule.xlsx`);
        showToast("Records saved", "success");
        return;
    }

    const overlay = document.createElement('div');
    overlay.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100%;background:#005BAB;z-index:2000000;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;color:white;padding:40px 20px;overflow-y:auto;`;
    overlay.innerHTML = `
        <div style="text-align:center;margin-bottom:30px;"><div style="font-size:50px;">📑</div><div style="font-size:28px;font-weight:800;">PREPARING EXPORT</div><div style="font-size:16px;">Generating for <b>${currentSectionName}</b>...</div></div>
        <div id="paper-container" style="background:white;color:#111;width:1123px;padding:50px;border-radius:4px;box-shadow:0 20px 50px rgba(0,0,0,0.4);transform:scale(0.65);transform-origin:top center;">
            <div style="text-align:center;margin-bottom:40px;border-bottom:6px solid #005BAB;padding-bottom:30px;">
                <div style="font-size:14px;color:#005BAB;font-weight:700;">STI COLLEGE SANTA MARIA</div>
                <h1 style="margin:5px 0;font-size:36px;color:#0f172a;text-transform:uppercase;">SECTION SCHEDULE</h1>
                <div style="font-size:18px;background:#FFD200;color:black;padding:10px 30px;display:inline-block;margin-top:15px;font-weight:900;">SECTION: ${currentSectionName}</div>
            </div>
            <table style="width:100%;border-collapse:collapse;">
                <thead><tr style="background:#f8fafc;"><th style="border:1.5px solid #e2e8f0;padding:15px;color:#005BAB;">TIME BLOCK</th>${DAYS.map(d=>`<th style="border:1.5px solid #e2e8f0;padding:15px;color:#005BAB;">${d.toUpperCase()}</th>`).join('')}</tr></thead>
                <tbody id="export-tbody"></tbody>
            </table>
        </div>`;
    document.body.appendChild(overlay);

    const tbody = overlay.querySelector('#export-tbody');
    intervals.forEach(interval => {
        let row = `<tr><td style="border:1.5px solid #e2e8f0;padding:10px;font-weight:bold;background:#f8fafc;text-align:center;">${interval.label}</td>`;
        DAYS.forEach(day => {
            const c = currentSectionClasses.find(x => { const b=parseBlock(x.timeBlock); return normalizeDay(x.day)===normalizeDay(day) && b && b.start<interval.end && b.end>interval.start; });
            if (c) {
                row += `<td style="border:1.5px solid #e2e8f0;padding:10px;background:${c.color||"#BFDBFE"};text-align:center;"><div style="font-weight:bold;font-size:12px;">${c.subject}</div><div style="font-size:10px;">${c.teacher||""}</div><div style="font-size:10px;">${c.room||""}</div></td>`;
            } else {
                row += `<td style="border:1.5px solid #e2e8f0;padding:10px;"></td>`;
            }
        });
        row += `</tr>`;
        tbody.innerHTML += row;
    });

    const paper = overlay.querySelector('#paper-container');
    setTimeout(async () => {
        if (format === 'pdf') {
            await html2pdf().set({margin:10,filename:`${currentSectionName}_Schedule.pdf`,image:{type:'jpeg',quality:0.98},html2canvas:{scale:2,useCORS:true},jsPDF:{unit:'mm',format:'a3',orientation:'landscape'}}).from(paper).save();
        } else if (format === 'image') {
            const canvas = await html2canvas(paper, {scale:2,useCORS:true});
            const link = document.createElement('a'); link.download = `${currentSectionName}_Schedule.png`; link.href = canvas.toDataURL("image/png"); link.click();
        }
        overlay.remove();
        showToast("Export complete", "success");
    }, 1200);
}

function showDownloadFormatSelector(callback) {
    const overlay = document.createElement('div');
    overlay.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(15,23,42,0.8);backdrop-filter:blur(12px);display:flex;justify-content:center;align-items:center;z-index:2000001;opacity:0;transition:opacity 0.3s;`;
    overlay.innerHTML = `
        <div style="background:white;border: 1.5px solid var(--border-main);padding:45px;border-radius:32px;box-shadow:15px 15px 0px #000;text-align:center;max-width:600px;width:95%;position:relative;">
            <button id="closeExportModal" style="position:absolute;top:20px;right:20px;background:#f1f5f9;border: 1.5px solid #cbd5e1;width:40px;height:40px;border-radius:12px;cursor:pointer;font-size:20px;font-weight:900;box-shadow: 0 2px 8px rgba(0,0,0,0.08);">×</button>
            <h2 style="color:#005BAB;font-size:28px;font-weight:950;margin-bottom:8px;text-transform:uppercase;">Export Schedule</h2>
            <p style="color:#64748b;font-weight:700;margin-bottom:30px;">Select format</p>
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:20px;">
                <div data-fmt="pdf" style="background:#fef2f2;border: 1.5px solid var(--border-main);padding:25px 10px;border-radius:20px;cursor:pointer;box-shadow: 0 2px 8px rgba(0,0,0,0.08);"><div style="font-size:40px;">📑</div><div style="font-weight:900;color:#991b1b;font-size:13px;text-transform:uppercase;margin-top:8px;">PDF</div></div>
                <div data-fmt="image" style="background:#eff6ff;border: 1.5px solid var(--border-main);padding:25px 10px;border-radius:20px;cursor:pointer;box-shadow: 0 2px 8px rgba(0,0,0,0.08);"><div style="font-size:40px;">🖼️</div><div style="font-weight:900;color:#1e40af;font-size:13px;text-transform:uppercase;margin-top:8px;">Image</div></div>
                <div data-fmt="excel" style="background:#f0fdf4;border: 1.5px solid var(--border-main);padding:25px 10px;border-radius:20px;cursor:pointer;box-shadow: 0 2px 8px rgba(0,0,0,0.08);"><div style="font-size:40px;">📊</div><div style="font-weight:900;color:#166534;font-size:13px;text-transform:uppercase;margin-top:8px;">Excel</div></div>
            </div>
        </div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.style.opacity = "1");
    const close = () => { overlay.style.opacity="0"; setTimeout(()=>overlay.remove(),300); };
    overlay.querySelector('#closeExportModal').onclick = close;
    overlay.querySelectorAll('[data-fmt]').forEach(el => {
        el.onclick = () => { close(); setTimeout(()=>callback(el.dataset.fmt),350); };
    });
    overlay.onclick = (e) => { if(e.target===overlay) close(); };
}

