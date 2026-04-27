import { initMobileNav } from "./js/ui/mobile-nav.js";
import { auth, db, app } from "./js/config/firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { collection, getDocs, query, where, doc, getDoc, setDoc, updateDoc } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { initUserProfile } from "./userprofile.js";
import { initUniversalSearch } from "./search.js";
import { toMin, toTime, to12, parseBlock, overlaps, normalizeDay } from "./js/utils/time-utils.js";
import { showToast } from "./js/utils/ui-utils.js";

// Global state for download
let currentRoomName = "";
let currentRoomClasses = [];

document.addEventListener("DOMContentLoaded", async () => {
    initUserProfile("#userProfile");
    initUniversalSearch(db);

    const urlParams = new URLSearchParams(window.location.search);
    const roomName = urlParams.get("room");
    if (!roomName) {
        document.querySelector(".profile-name").textContent = "No Room Selected";
        return;
    }

    currentRoomName = roomName.replace(/\s*\|?\s*\d{1,3}%\s*(?:OCCUPIED)?$/i, "").trim();

    // Set Room Name
    const displayRoomNameEl = document.getElementById("displayRoomName") || document.querySelector(".profile-name");
    if (displayRoomNameEl) {
        displayRoomNameEl.textContent = currentRoomName;
    }

    // 1. Fetch Room Data
    await fetchRoomData(roomName);

    // 2. Fetch Schedule
    fetchRoomSchedule(roomName);

    // 3. Admin Check for Photo Update
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            const userDoc = await getDoc(doc(db, "users", user.uid));
            if (userDoc.exists() && userDoc.data().role === "admin") {
                setupAdminFeatures(roomName);
            }
        }
    });
});

async function fetchRoomData(roomName) {
    try {
        const q = query(collection(db, "rooms"), where("name", "==", roomName));
        const snap = await getDocs(q);

        if (!snap.empty) {
            const data = snap.docs[0].data();
            if (data.photoURL) {
                document.getElementById("roomImg").src = data.photoURL;
            }
            if (data.capacity) {
                document.getElementById("capacityLabel").innerHTML = `<strong>Capacity:</strong> ${data.capacity} students`;
            } else {
                document.getElementById("capacityLabel").innerHTML = `<strong>Capacity:</strong> 40 students (Standard)`;
            }
            if (data.type) {
                document.getElementById("typeLabel").innerHTML = `<strong>Type:</strong> ${data.type}`;
            } else {
                document.getElementById("typeLabel").innerHTML = `<strong>Type:</strong> Lecture Room`;
            }
        } else {
            document.getElementById("capacityLabel").innerHTML = `<strong>Capacity:</strong> 40 students (Standard)`;
            document.getElementById("typeLabel").innerHTML = `<strong>Type:</strong> Lecture Room`;
        }
    } catch (error) {
        console.error("Error fetching room data:", error);
    }
}

function setupAdminFeatures(roomName) {
    const container = document.getElementById("roomImageContainer");
    if (!container) return;

    container.style.cursor = "pointer";
    container.title = "Click to change room picture";

    container.addEventListener("click", async () => {
        const currentUrl = document.getElementById("roomImg").src;
        const newUrl = window.prompt("Enter new Room Image URL:", currentUrl.includes("placehold.co") ? "" : currentUrl);

        if (newUrl === null) return;
        if (newUrl.trim() === "") {
            showToast("Please enter a valid URL.", "error");
            return;
        }

        try {
            const roomRef = doc(db, "rooms", roomName);
            const roomSnap = await getDoc(roomRef);

            if (roomSnap.exists()) {
                await updateDoc(roomRef, { photoURL: newUrl });
            } else {
                await setDoc(roomRef, { photoURL: newUrl, capacity: 40, type: "Lecture Room" });
            }

            document.getElementById("roomImg").src = newUrl;
            showToast("Room picture updated successfully!", "success");
        } catch (error) {
            console.error("Error updating room photo:", error);
            showToast("Failed to update room photo.", "error");
        }
    });
}

/* ───────── SCHEDULE LOGIC ───────── */
async function fetchRoomSchedule(roomName) {
    console.log("Fetching schedule for Room:", roomName);
    try {
        const q = query(collection(db, "schedules"), where("status", "==", "published"));
        const snap = await getDocs(q);

        currentRoomClasses = [];
        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];

        // 1. Fetch all Published Schedules + Events
        const schedules = [];
        const eventDocSnap = await getDoc(doc(db, "schedules", "DEFAULT_SECTION"));
        const eventClasses = eventDocSnap.exists() ? (eventDocSnap.data().classes || []) : [];

        snap.forEach(doc => {
            if (doc.id === "DEFAULT_SECTION") return;
            schedules.push({ ...doc.data(), id: doc.id });
        });

        // 2. Identify Relocated Classes for today
        const todaysEvents = eventClasses.filter(c => c.date === todayStr);
        const relocated = [];
        todaysEvents.forEach(ev => {
            if (ev.displacements) {
                ev.displacements.forEach(d => {
                    if (d.date === todayStr) relocated.push(d);
                });
            }
        });

        // 3. Process Regular Schedules
        schedules.forEach(sched => {
            const classes = sched.classes || [];
            classes.forEach(c => {
                const target = currentRoomName.toLowerCase().trim();
                const current = (c.room || "").toLowerCase().trim();
                const cleanCurrent = current.replace(/room|rm|\s/gi, "");
                const cleanTarget = target.replace(/room|rm|\s/gi, "");

                if (cleanCurrent === cleanTarget) {
                    // Check if class is relocated away today
                    const isRelocatedAway = relocated.some(r => 
                        r.scheduleId === sched.id && 
                        r.classData.timeBlock === c.timeBlock && 
                        r.classData.day === c.day
                    );

                    if (!isRelocatedAway) {
                        currentRoomClasses.push({ ...c, section: sched.section || "Unknown Section" });
                    }
                }
            });
        });

        // 4. Add Classes Relocated TO this room today
        relocated.forEach(r => {
            if (r.to.toLowerCase().trim().replace(/room|rm|\s/gi, "") === currentRoomName.toLowerCase().trim().replace(/room|rm|\s/gi, "")) {
                currentRoomClasses.push({
                    ...r.classData,
                    subject: `${r.subject} (Relocated)`,
                    section: r.section
                });
            }
        });

        // 5. Add Events for today
        todaysEvents.forEach(ev => {
            if (ev.rooms.includes(currentRoomName)) {
                currentRoomClasses.push({
                    ...ev,
                    subject: ev.subject,
                    section: "EVENT"
                });
            }
        });

        console.log("Found classes for room:", currentRoomClasses.length);
        renderTable(currentRoomClasses);
        updateOccupancyDisplay(currentRoomClasses);
    } catch (error) {
        console.error("Error fetching schedules:", error);
    }
}

function updateOccupancyDisplay(classes) {
    const container = document.getElementById("occupancyContainer");
    if (!container) return;

    const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const TOTAL_DAILY_MINS = 750;

    const todayName = new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(new Date());

    let dailyStats = {};
    DAYS.forEach(d => dailyStats[d] = 0);

    classes.forEach(c => {
        if (!c.timeBlock || !c.day) return;
        const block = parseBlock(c.timeBlock);
        if (block) {
            const duration = block.end - block.start;
            if (duration > 0 && dailyStats[c.day] !== undefined) {
                dailyStats[c.day] += duration;
            }
        }
    });

    let html = `<div class="daily-occupancy-grid">`;

    DAYS.forEach(day => {
        const mins = dailyStats[day];
        const percentage = Math.min(100, Math.round((mins / TOTAL_DAILY_MINS) * 100));
        const isToday = day === todayName;

        html += `
            <div class="daily-occ-item ${isToday ? 'today' : ''}">
                <div class="daily-occ-day">${day.slice(0, 3)}</div>
                <div class="daily-occ-value">${percentage}%</div>
            </div>
        `;
    });

    html += `</div>`;
    container.innerHTML = html;
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
        colgroup.insertAdjacentHTML("beforeend", `<col class="day" style="width: calc((100% - 150px)/${DAYS.length})">`);
        theadTr.insertAdjacentHTML("beforeend", `<th>${d.slice(0, 3).toUpperCase()}</th>`);
    });

    const timePoints = new Set();
    const START_MIN = 450;
    const END_MIN = 1200;
    const INTERVAL = 90;

    for (let m = START_MIN; m <= END_MIN; m += INTERVAL) {
        timePoints.add(m);
    }

    classes.forEach(c => {
        if (c.timeBlock) {
            const block = parseBlock(c.timeBlock);
            if (block) {
                timePoints.add(block.start);
                timePoints.add(block.end);
            }
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

    matrixIntervals.forEach((interval, i) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${interval.label}</td>`;

        DAYS.forEach(day => {
            const c = classes.find(x => x.day === day && parseBlock(x.timeBlock)?.start === interval.start);

            const isOccupiedByPrevious = classes.some(x => {
                const b = parseBlock(x.timeBlock);
                return b && x.day === day && b.start < interval.start && b.end > interval.start;
            });

            if (isOccupiedByPrevious) return;

            const td = document.createElement("td");

            if (c) {
                const b = parseBlock(c.timeBlock);
                let spanCount = 0;
                for (let k = i; k < matrixIntervals.length; k++) {
                    const m = matrixIntervals[k];
                    if (b && m.start >= b.start && m.end <= b.end) spanCount++;
                    else break;
                }
                if (spanCount > 1) td.rowSpan = spanCount;

                if (c.subject === "MARKED_VACANT" || c.subject === "VACANT") {
                    td.textContent = "VACANT";
                    td.classList.add("vacant-marked");
                } else {
                    td.innerHTML = `
                        <div style="font-weight:bold; font-size:12px;">${c.subject}</div>
                        <div style="font-size:11px; margin-top:2px;">${c.section}</div>
                        <div style="font-size:11px; opacity:0.8;">${c.teacher || "TBD"}</div>
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

/* ───────── DOWNLOAD LOGIC (OFFICIAL STI THEME) ───────── */
function downloadSchedule(format = null) {
    if (!format) {
        showDownloadFormatSelector((f) => downloadSchedule(f));
        return;
    }

    if (currentRoomClasses.length === 0) {
        showToast("No classes found to export.", "error");
        return;
    }

    // Libraries Check
    if (format === 'pdf' && !window.html2pdf) {
        const script = document.createElement('script');
        script.src = "https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js";
        script.onload = () => downloadSchedule('pdf');
        document.head.appendChild(script);
        return;
    }
    if (format === 'image' && !window.html2canvas) {
        const script = document.createElement('script');
        script.src = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
        script.onload = () => downloadSchedule('image');
        document.head.appendChild(script);
        return;
    }
    if (format === 'excel' && !window.XLSX) {
        const script = document.createElement('script');
        script.src = "https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/dist/xlsx.bundle.js";
        script.onload = () => downloadSchedule('excel');
        document.head.appendChild(script);
        return;
    }

    const exportSched = {
        section: currentRoomName,
        classes: currentRoomClasses,
        selectedDays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
    };

    if (format === 'excel') {
        const wb = XLSX.utils.book_new();
        const wsData = [];
        wsData.push(["STI COLLEGE SANTA MARIA"]);
        wsData.push(["OFFICIAL ROOM SCHEDULE"]);
        wsData.push([`ROOM: ${currentRoomName}`]);
        wsData.push(["ACADEMIC YEAR 2025-2026"]);
        wsData.push([]);

        const localDays = exportSched.selectedDays;
        const headerRow = ["TIME BLOCK", ...localDays];
        wsData.push(headerRow);

        const timePoints = new Set();
        const START_MIN_EXPORT = 450;
        const END_MIN_EXPORT = 1080;
        const INTERVAL_EXPORT = 90;
        for (let m = START_MIN_EXPORT; m <= END_MIN_EXPORT; m += INTERVAL_EXPORT) timePoints.add(m);
        exportSched.classes.forEach(c => {
            const block = parseBlock(c.timeBlock);
            if (block) {
                timePoints.add(block.start);
                timePoints.add(block.end);
            }
        });
        const sortedPoints = Array.from(timePoints).sort((a, b) => a - b);
        const matrixIntervals = [];
        for (let i = 0; i < sortedPoints.length - 1; i++) {
            const start = sortedPoints[i];
            const end = sortedPoints[i + 1];
            if (start >= END_MIN_EXPORT) break;
            matrixIntervals.push({ start, end, label: `${to12(toTime(start))} - ${to12(toTime(end))}` });
        }

        matrixIntervals.forEach(interval => {
            const row = [interval.label];
            localDays.forEach(day => {
                const classItem = exportSched.classes.find(c => {
                    if (normalizeDay(c.day) !== normalizeDay(day)) return false;
                    const b = parseBlock(c.timeBlock);
                    return b && b.start < interval.end && b.end > interval.start;
                });
                if (classItem && classItem.subject !== "VACANT" && classItem.subject !== "MARKED_VACANT") {
                    row.push(`${classItem.subject}\n${classItem.section}\n${classItem.teacher || "TBD"}`);
                } else {
                    row.push("");
                }
            });
            wsData.push(row);
        });

        wsData.push([]);
        wsData.push(["GENERATED VIA SCHEDSYNC ENGINE"]);
        const ws = XLSX.utils.aoa_to_sheet(wsData);
        const range = XLSX.utils.decode_range(ws['!ref']);
        for (let R = range.s.r; R <= range.e.r; ++R) {
            for (let C = range.s.c; C <= range.e.c; ++C) {
                const cell_ref = XLSX.utils.encode_cell({ r: R, c: C });
                if (!ws[cell_ref]) ws[cell_ref] = { t: 's', v: '' };
                ws[cell_ref].s = {
                    alignment: { vertical: "center", horizontal: "center", wrapText: true },
                    font: { name: "Inter", sz: 10 }
                };
            }
        }
        ws['!cols'] = [{ wch: 25 }, ...localDays.map(() => ({ wch: 35 }))];
        XLSX.utils.book_append_sheet(wb, ws, "Room Schedule");
        XLSX.writeFile(wb, `${currentRoomName.replace(/\s+/g, '_')}_Schedule.xlsx`);
        showToast("Records saved", "success");
    } else {
        const overlay = document.createElement('div');
        overlay.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100%;background:#005BAB;z-index:2000000;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;color:white;padding:40px 20px;overflow-y:auto;`;
        overlay.innerHTML = `
            <div style="text-align:center;margin-bottom:30px;">
                <div style="font-size:50px;">📑</div>
                <div style="font-size:28px;font-weight:800;">PREPARING EXPORT</div>
                <div style="font-size:16px;">Generating official document for <b>${currentRoomName}</b>...</div>
            </div>
            <div id="paper-container" style="background:white;color:#111;width:1123px;padding:50px;border-radius:4px;box-shadow:0 20px 50px rgba(0,0,0,0.4);transform:scale(0.65);transform-origin:top center;">
                <div style="text-align:center;margin-bottom:40px;border-bottom:6px solid #005BAB;padding-bottom:30px;">
                    <div style="font-size:14px;color:#005BAB;font-weight:700;margin-bottom:5px;">STI COLLEGE SANTA MARIA</div>
                    <h1 style="margin:5px 0;font-size:36px;color:#0f172a;text-transform:uppercase;">ROOM SCHEDULE</h1>
                    <div style="font-size:18px;background:#FFD200;color:black;padding:10px 30px;display:inline-block;margin-top:15px;font-weight:900;">ROOM: ${currentRoomName}</div>
                </div>
                <table style="width:100%;border-collapse:collapse;font-family:Inter,sans-serif;">
                    <thead><tr style="background:#f8fafc;">
                        <th style="border:1.5px solid #e2e8f0;padding:15px;color:#005BAB;">TIME BLOCK</th>
                        ${exportSched.selectedDays.map(d => `<th style="border:1.5px solid #e2e8f0;padding:15px;color:#005BAB;">${d.toUpperCase()}</th>`).join('')}
                    </tr></thead>
                    <tbody id="export-tbody"></tbody>
                </table>
            </div>
        `;
        document.body.appendChild(overlay);

        const exportTbody = overlay.querySelector('#export-tbody');
        const timePoints = new Set();
        const START_MIN_EXPORT = 450;
        const END_MIN_EXPORT = 1080;
        const INTERVAL_EXPORT = 90;
        for (let m = START_MIN_EXPORT; m <= END_MIN_EXPORT; m += INTERVAL_EXPORT) timePoints.add(m);
        exportSched.classes.forEach(c => {
            const b = parseBlock(c.timeBlock);
            if (b) { timePoints.add(b.start); timePoints.add(b.end); }
        });
        const sortedPoints = Array.from(timePoints).sort((a, b) => a - b);
        const matrixIntervals = [];
        for (let i = 0; i < sortedPoints.length - 1; i++) {
            const s = sortedPoints[i], e = sortedPoints[i + 1];
            if (s >= END_MIN_EXPORT) break;
            matrixIntervals.push({ start: s, end: e, label: `${to12(toTime(s))} - ${to12(toTime(e))}` });
        }

        matrixIntervals.forEach(interval => {
            let rowHtml = `<tr><td style="border:1.5px solid #e2e8f0;padding:10px;font-weight:bold;background:#f8fafc;width:150px;text-align:center;">${interval.label}</td>`;
            exportSched.selectedDays.forEach(day => {
                const classItem = exportSched.classes.find(c => {
                    if (normalizeDay(c.day) !== normalizeDay(day)) return false;
                    const b = parseBlock(c.timeBlock);
                    return b && b.start < interval.end && b.end > interval.start;
                });
                if (classItem && classItem.subject !== "VACANT" && classItem.subject !== "MARKED_VACANT") {
                    const bgColor = classItem.color || "#BFDBFE";
                    rowHtml += `<td style="border:1.5px solid #e2e8f0;padding:10px;background:${bgColor};text-align:center;">
                        <div style="font-weight:bold;font-size:12px;">${classItem.subject}</div>
                        <div style="font-size:10px;margin-top:2px;">${classItem.section}</div>
                        <div style="font-size:10px;">${classItem.teacher || "TBD"}</div>
                    </td>`;
                } else {
                    rowHtml += `<td style="border:1.5px solid #e2e8f0;padding:10px;"></td>`;
                }
            });
            rowHtml += `</tr>`;
            exportTbody.innerHTML += rowHtml;
        });

        const paper = overlay.querySelector('#paper-container');
        setTimeout(async () => {
            if (format === 'pdf') {
                const opt = { margin: 10, filename: `${currentRoomName}_Schedule.pdf`, image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2, useCORS: true }, jsPDF: { unit: 'mm', format: 'a3', orientation: 'landscape' } };
                await html2pdf().set(opt).from(paper).save();
            } else if (format === 'image') {
                const canvas = await html2canvas(paper, { scale: 2, useCORS: true });
                const link = document.createElement('a');
                link.download = `${currentRoomName}_Schedule.png`;
                link.href = canvas.toDataURL("image/png");
                link.click();
            }
            overlay.remove();
            showToast("Export complete", "success");
        }, 1200);
    }
}

function showDownloadFormatSelector(callback) {
    const overlay = document.createElement('div');
    overlay.className = "maangas-export-overlay";
    overlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(15, 23, 42, 0.8); backdrop-filter: blur(12px);
        display: flex; justify-content: center; align-items: center;
        z-index: 2000001; opacity: 0; transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
    `;

    overlay.innerHTML = `
        <div class="export-card-container" style="background: white; border: 5px solid black; padding: 45px; border-radius: 32px; box-shadow: 15px 15px 0px #000; text-align: center; max-width: 650px; width: 95%; transform: scale(0.9); transition: all 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275); position: relative;">
            
            <button class="close-modal-btn" style="position: absolute; top: 20px; right: 20px; background: #f1f5f9; border: 3px solid black; width: 40px; height: 40px; border-radius: 12px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: 900; transition: all 0.2s; box-shadow: 3px 3px 0px black;">×</button>

            <div style="margin-bottom: 35px;">
                <h2 style="color: #005BAB; font-size: 32px; font-weight: 950; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 2px;">Export Schedule</h2>
                <p style="font-size: 16px; color: #64748b; font-weight: 700;">Select your preferred format below.</p>
            </div>

            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 25px;">
                
                <div class="format-option pdf-btn" id="pdfBtn" style="background: #fef2f2; border: 4px solid black; padding: 30px 10px; border-radius: 20px; cursor: pointer; transition: all 0.3s; box-shadow: 6px 6px 0px black; position: relative; overflow: hidden;">
                    <div style="font-size: 45px; margin-bottom: 15px;">📑</div>
                    <div style="font-weight: 900; color: #991b1b; font-size: 14px; text-transform: uppercase;">PDF Document</div>
                    <div style="font-size: 11px; color: #ef4444; font-weight: 700; margin-top: 5px;">Best for Printing</div>
                    <div class="hover-glow" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: radial-gradient(circle at center, rgba(239, 68, 68, 0.1) 0%, transparent 70%); opacity: 0; transition: opacity 0.3s;"></div>
                </div>

                <div class="format-option img-btn" id="imgBtn" style="background: #eff6ff; border: 4px solid black; padding: 30px 10px; border-radius: 20px; cursor: pointer; transition: all 0.3s; box-shadow: 6px 6px 0px black; position: relative; overflow: hidden;">
                    <div style="font-size: 45px; margin-bottom: 15px;">🖼️</div>
                    <div style="font-weight: 900; color: #1e40af; font-size: 14px; text-transform: uppercase;">Image (PNG/JPG)</div>
                    <div style="font-size: 11px; color: #3b82f6; font-weight: 700; margin-top: 5px;">Perfect for Shares</div>
                    <div class="hover-glow" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: radial-gradient(circle at center, rgba(59, 130, 246, 0.1) 0%, transparent 70%); opacity: 0; transition: opacity 0.3s;"></div>
                </div>

                <div class="format-option xls-btn" id="xlsBtn" style="background: #f0fdf4; border: 4px solid black; padding: 30px 10px; border-radius: 20px; cursor: pointer; transition: all 0.3s; box-shadow: 6px 6px 0px black; position: relative; overflow: hidden;">
                    <div style="font-size: 45px; margin-bottom: 15px;">📊</div>
                    <div style="font-weight: 900; color: #166534; font-size: 14px; text-transform: uppercase;">Excel Spreadsheet</div>
                    <div style="font-size: 11px; color: #22c55e; font-weight: 700; margin-top: 5px;">Editable & Styled</div>
                    <div class="hover-glow" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: radial-gradient(circle at center, rgba(34, 197, 94, 0.1) 0%, transparent 70%); opacity: 0; transition: opacity 0.3s;"></div>
                </div>

            </div>

            <div style="margin-top: 35px; font-size: 12px; color: #94a3b8; font-weight: 800; text-transform: uppercase; letter-spacing: 1px;">
                Powered by SchedSync Engine
            </div>
        </div>

        <style>
            .format-option:hover { transform: translate(-4px, -4px); box-shadow: 10px 10px 0px black; }
            .format-option:hover .hover-glow { opacity: 1; }
            .format-option:active { transform: translate(2px, 2px); box-shadow: 2px 2px 0px black; }
            .close-modal-btn:hover { background: #ef4444; color: white; transform: scale(1.1); }
        </style>
    `;

    document.body.appendChild(overlay);

    // Entrance Animation
    requestAnimationFrame(() => {
        overlay.style.opacity = "1";
        overlay.querySelector('.export-card-container').style.transform = "scale(1)";
    });

    const close = () => {
        overlay.style.opacity = "0";
        overlay.querySelector('.export-card-container').style.transform = "scale(0.9)";
        setTimeout(() => overlay.remove(), 400);
    };

    overlay.querySelector('.close-modal-btn').onclick = close;
    overlay.querySelector('#pdfBtn').onclick = () => { close(); setTimeout(() => callback('pdf'), 450); };
    overlay.querySelector('#imgBtn').onclick = () => { close(); setTimeout(() => callback('image'), 450); };
    overlay.querySelector('#xlsBtn').onclick = () => { close(); setTimeout(() => callback('excel'), 450); };
    overlay.onclick = (e) => { if (e.target === overlay) close(); };
}

window.downloadSchedule = downloadSchedule;

initMobileNav();
