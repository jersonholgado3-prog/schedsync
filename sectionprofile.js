import { auth, db } from "./js/config/firebase-config.js";
import { doc, getDoc, collection, query, where, getDocs, orderBy } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { initUserProfile } from "./userprofile.js";
import { showToast, showConfirm } from "./js/utils/ui-utils.js";

document.addEventListener("DOMContentLoaded", async () => {
    initUserProfile("#userProfile");

    const urlParams = new URLSearchParams(window.location.search);
    const sectionId = urlParams.get("id");

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
                // Check role from users collection
                const user = auth.currentUser;
                if (user) {
                    const userDoc = await getDoc(doc(db, "users", user.uid));
                    if (userDoc.exists() && userDoc.data().role === 'admin') {
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

            // Fetch Schedule for this section
            fetchSectionSchedule(data.name);
        } else {
            document.getElementById("displaySectionName").textContent = "Section Not Found";
        }
    } catch (error) {
        console.error("Error fetching section profile:", error);
    }
});

async function fetchSectionSchedule(sectionName) {
    const container = document.getElementById("sectionScheduleContainer");
    try {
        // Query schedules where section matches
        const q = query(collection(db, "schedules"), where("section", "==", sectionName));
        const snap = await getDocs(q);

        container.innerHTML = "";
        
        if (snap.empty) {
            container.innerHTML = '<div class="text-center py-10 opacity-50">No classes scheduled for this section.</div>';
            return;
        }

        const schedules = snap.docs.map(d => d.data());
        
        // Group by day
        const days = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
        
        days.forEach(day => {
            const dayClasses = schedules.filter(s => s.day && s.day.toUpperCase() === day);
            if (dayClasses.length > 0) {
                const daySection = document.createElement("div");
                daySection.className = "mb-6";
                daySection.innerHTML = `<h4 class="text-lg font-bold mb-3 border-b-2 border-black pb-1">${day}</h4>`;
                
                const grid = document.createElement("div");
                grid.className = "grid grid-cols-1 md:grid-cols-2 gap-4";
                
                dayClasses.sort((a,b) => a.startTime.localeCompare(b.startTime)).forEach(cls => {
                    const card = document.createElement("div");
                    card.className = "p-4 bg-gray-50 dark:bg-slate-700 border-2 border-black rounded-xl shadow-[4px_4px_0px_black]";
                    card.innerHTML = `
                        <div class="font-black text-blue-600 dark:text-blue-400">${cls.subject}</div>
                        <div class="text-sm mt-1">🕒 ${cls.startTime} - ${cls.endTime}</div>
                        <div class="text-sm">📍 Room: ${cls.room}</div>
                        <div class="text-sm">👨‍🏫 Instructor: ${cls.instructor || "TBA"}</div>
                    `;
                    grid.appendChild(card);
                });
                
                daySection.appendChild(grid);
                container.appendChild(daySection);
            }
        });

    } catch (error) {
        console.error("Error fetching section schedule:", error);
        container.innerHTML = '<div class="text-red-500">Error loading schedule.</div>';
    }
}