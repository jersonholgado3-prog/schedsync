import { db, auth } from "./js/config/firebase-config.js";
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, onSnapshot, orderBy, writeBatch, getDoc, where } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { onAuthStateChanged, createUserWithEmailAndPassword, signOut, signInWithEmailAndPassword, deleteUser } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { initUserProfile } from "./userprofile.js";
import { initMobileNav } from "./js/ui/mobile-nav.js";
import { showToast, showConfirm } from "./js/utils/ui-utils.js";

// Secondary App Configuration for creating users without logging out admin 🛡️⚓
const secondaryConfig = {
    apiKey: "AIzaSyBrtJocBlfkPciYO7f8-7FwREE1tSF3VXU",
    authDomain: "schedsync-e60d0.firebaseapp.com",
    projectId: "schedsync-e60d0",
    storageBucket: "schedsync-e60d0.firebasestorage.app",
    messagingSenderId: "334140247575",
    appId: "1:334140247575:web:930b0c12e024e4defc5652"
};

document.addEventListener("DOMContentLoaded", () => {
    initUserProfile("#userProfile");
    initMobileNav();

    const sectionsGrid = document.getElementById("sections-grid");
    const sectionModal = document.getElementById("sectionModal");
    const addSectionBtn = document.getElementById("addSectionBtn");
    const clearAllBtn = document.getElementById("clearAllBtn");
    const closeModal = document.getElementById("closeModal");
    const sectionForm = document.getElementById("sectionForm");
    const sectionSearch = document.getElementById("sectionSearch");
    const deleteSectionBtn = document.getElementById("deleteSectionBtn");
    const sectionStrandSelect = document.getElementById("sectionStrand");
    const sectionCountInput = document.getElementById("sectionCount");
    const sectionCountGroup = document.getElementById("sectionCountGroup");

    // Multi-select elements
    const selectionBar = document.getElementById("selectionBar");
    const selectedCountEl = document.getElementById("selectedCount");
    const multiDeleteBtn = document.getElementById("multiDeleteBtn");
    const multiSchedBtn = document.getElementById("multiSchedBtn");
    const cancelSelectionBtn = document.getElementById("cancelSelectionBtn");
    const genEmailsBtn = document.getElementById("genEmailsBtn");

    let allSections = [];
    let isAdmin = false;
    let availablePrograms = [];
    let selectedIds = new Set();
    let selectedSchedDays = new Set();
    // Sync initial UI state (chips marked active in HTML) with JS state
    document.querySelectorAll(".day-chip.active").forEach(el => {
        selectedSchedDays.add(el.dataset.day || el.textContent.trim());
    });
    
    let currentUser = null;
    let selectedScheduleType = "regular";

    // UI Elements
    const scheduleModal = document.getElementById("scheduleModal");
    const closeScheduleModal = document.getElementById("closeScheduleModal");
    const scheduleForm = document.getElementById("scheduleForm");
    const scheduleNameInput = document.getElementById("scheduleNameInput");
    const startTimeInput = document.getElementById("startTimeInput");
    const endTimeInput = document.getElementById("endTimeInput");
    const dayItems = document.querySelectorAll(".day-chip");
    const quickSelectBtns = document.querySelectorAll('.quick-select-btn');
    const selectedDaysContainer = document.getElementById("selectedDaysContainer");

    const gradeLevelMap = {
        "11": "11",
        "12": "12",
        "1st Year": "1",
        "2nd Year": "2",
        "3rd Year": "3",
        "4th Year": "4"
    };

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            currentUser = user;
            // Update isAdmin for local UI logic (modal editing)
            const userDoc = await getDocs(query(collection(db, "users")));
            const currentUserDoc = userDoc.docs.find(d => d.id === user.uid);
            if (currentUserDoc && currentUserDoc.data().role === 'admin') {
                isAdmin = true;
            }
            await loadAvailablePrograms();
            listenForSections();
        }
    });

    // Schedule Type Toggle
    const scheduleTypeToggle = document.getElementById("scheduleTypeToggle");
    const typeBtns = document.querySelectorAll(".type-btn");

    if (scheduleTypeToggle && typeBtns.length > 0) {
        typeBtns.forEach(btn => {
            btn.addEventListener("click", (e) => {
                e.preventDefault();
                selectedScheduleType = btn.dataset.type;
                scheduleTypeToggle.dataset.type = selectedScheduleType;
                typeBtns.forEach(b => b.classList.remove("active"));
                btn.classList.add("active");
            });
        });
    }

    // Day Selection Logic
    dayItems.forEach(day => {
        day.addEventListener("click", () => {
            const name = day.dataset.day || day.textContent.trim();
            if (selectedSchedDays.has(name)) {
                selectedSchedDays.delete(name);
                day.classList.remove("active");
            } else {
                selectedSchedDays.add(name);
                day.classList.add("active");
            }
            renderSelectedDays();
            quickSelectBtns.forEach(btn => btn.classList.remove('active'));
        });
    });

    // Quick Select Logic
    quickSelectBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            quickSelectBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const val = btn.dataset.days;
            selectedSchedDays.clear();
            dayItems.forEach(d => d.classList.remove("active"));
            
            let daysToSelect = [];
            const lowVal = val.toLowerCase();
            if (lowVal === "mon-fri") daysToSelect = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
            else if (lowVal === "mon-sat") daysToSelect = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
            else if (lowVal === "mwf") daysToSelect = ["Monday", "Wednesday", "Friday"];
            else if (lowVal === "tths") daysToSelect = ["Tuesday", "Thursday", "Saturday"];

            daysToSelect.forEach(dayName => {
                const dayEl = Array.from(dayItems).find(el => (el.dataset.day || el.textContent.trim()) === dayName);
                if (dayEl) {
                    selectedSchedDays.add(dayName);
                    dayEl.classList.add("active");
                }
            });
            renderSelectedDays();
        });
    });

    function renderSelectedDays() {
        if (!selectedDaysContainer) return;
        selectedDaysContainer.innerHTML = "";
        const dayOrder = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
        const sortedDays = [...selectedSchedDays].sort((a, b) => dayOrder.indexOf(a) - dayOrder.indexOf(b));
        sortedDays.forEach(d => {
            const chip = document.createElement("div");
            chip.className = "selected-day";
            chip.textContent = d;
            selectedDaysContainer.appendChild(chip);
        });
    }

    multiSchedBtn.onclick = () => {
        const sections = allSections.filter(s => selectedIds.has(s.id));
        if (sections.length === 0) return;

        const grades = [...new Set(sections.map(s => s.gradeLevel))];
        const schedName = grades.length === 1 ? `Grade ${grades[0]} Schedule` : "Multi-Level Schedule";
        scheduleNameInput.value = schedName;

        scheduleModal.classList.remove("hidden");
        scheduleModal.classList.add("flex");
    };

    closeScheduleModal.onclick = () => {
        scheduleModal.classList.add("hidden");
        scheduleModal.classList.remove("flex");
    };

    scheduleForm.onsubmit = async (e) => {
        e.preventDefault();
        showToast("Starting save process... 🏁", "info");
        console.log("SchedSync DEBUG - Saving with:", { start: startTimeInput.value, end: endTimeInput.value });
        
        if (!currentUser) {
            showToast("User not authenticated", "error");
            return;
        }

        const sections = allSections.filter(s => selectedIds.has(s.id));
        const start = startTimeInput.value;
        const end = endTimeInput.value;
        const schedName = scheduleNameInput.value;

        if (!start || !end || selectedSchedDays.size === 0) {
            showToast("Please complete all fields", "error");
            return;
        }

        try {
            if (sections.length === 0) {
                showToast("No sections selected. Please close and re-select sections.", "error");
                return;
            }

            showToast("Generating schedules... ⏳", "info");
            
            // Robust time parsing 🕰️
            const toMin = (t) => {
                if (!t) return 0;
                let timeStr = t.trim();
                let period = null;

                if (timeStr.includes(" ")) {
                    const parts = timeStr.split(" ");
                    timeStr = parts[0];
                    period = parts[1];
                } else {
                    const match = timeStr.match(/(\d+:\d+)\s*([AP]M)/i);
                    if (match) {
                        timeStr = match[1];
                        period = match[2];
                    }
                }

                const parts = timeStr.split(':');
                if (parts.length < 2) return 0;
                let h = parseInt(parts[0]);
                let m = parseInt(parts[1]);

                if (period) {
                    const p = period.toUpperCase();
                    if ((p === "PM" || p === "P.M.") && h !== 12) h += 12;
                    if (p === "AM" && h === 12) h = 0;
                }
                return h * 60 + m;
            };

            const toTimeStr = (m) => {
                const hrs = Math.floor(m / 60);
                const mins = m % 60;
                const period = hrs >= 12 ? 'PM' : 'AM';
                const h12 = hrs % 12 || 12;
                return `${h12}:${String(mins).padStart(2, '0')} ${period}`;
            };

            const startMin = toMin(start);
            const endMin = toMin(end);

            if (startMin >= endMin) {
                showToast(`End time (${end}) must be after start time (${start})`, "error");
                return;
            }

            const INTERVAL = 30;
            const timeBlocks = [];
            for (let m = startMin; m + INTERVAL <= endMin; m += INTERVAL) {
                timeBlocks.push(`${toTimeStr(m)}-${toTimeStr(m + INTERVAL)}`);
            }

            if (timeBlocks.length === 0) {
                showToast("Time range is too short for 30-minute blocks.", "error");
                return;
            }

            const newClasses = [];
            selectedSchedDays.forEach(day => {
                timeBlocks.forEach(block => {
                    newClasses.push({ day, timeBlock: block, subject: "VACANT", teacher: "NA" });
                });
            });

            // --- FIX 3: Validate schedName before use ---
            const finalSchedName = (schedName && schedName.trim()) ? schedName.trim() : "Untitled Schedule";
            console.log("SchedSync DEBUG - schedName:", finalSchedName, "| sections:", sections.length, "| days:", [...selectedSchedDays]);

            const redirectUrl = `editpage.html?name=${encodeURIComponent(finalSchedName)}`;

            // --- FIX 1: Forced redirect fallback after 10 seconds ---
            const redirectFallback = setTimeout(() => {
                console.warn("SchedSync DEBUG - Fallback redirect triggered after timeout.");
                window.location.href = redirectUrl;
            }, 10000);

            // --- FIX 5: Promise.allSettled so one failure doesn't kill the rest ---
            const savePromises = sections.map(section =>
                addDoc(collection(db, "schedules"), {
                    userId: currentUser.uid,
                    section: section.name,
                    scheduleName: finalSchedName,
                    startTime: toTimeStr(startMin),
                    endTime: toTimeStr(endMin),
                    classes: newClasses,
                    selectedDays: Array.from(selectedSchedDays),
                    updated: new Date().toDateString(),
                    status: "draft",
                    scheduleType: selectedScheduleType,
                    author: currentUser.displayName || currentUser.email || "Unknown",
                    createdAt: Date.now()
                })
            );

            const results = await Promise.allSettled(savePromises);
            clearTimeout(redirectFallback); // cancel fallback — finished in time

            console.log("SchedSync DEBUG - Results:", results);
            const succeeded = results.filter(r => r.status === "fulfilled").length;
            const failedResults = results.filter(r => r.status === "rejected");

            if (failedResults.length > 0) {
                const firstErr = failedResults[0].reason;
                console.error("SchedSync DEBUG - Some saves failed:", firstErr);
                showToast(`⚠️ ${succeeded}/${sections.length} saved. Error: ${firstErr?.message || String(firstErr)}`, "error");
            } else {
                showToast(`✅ All ${sections.length} schedules saved successfully!`, "success");
            }

            // Close modal and clear state
            scheduleModal.classList.add("hidden");
            scheduleModal.classList.remove("flex");
            selectedSchedDays.clear();
            dayItems.forEach(d => d.classList.remove("active"));
            if (selectedDaysContainer) selectedDaysContainer.innerHTML = "";
            selectedIds.clear();
            renderSections(allSections);
            updateSelectionBar();

            // --- Robust Redirection ---
            if (succeeded > 0 || (sections.length > 0 && failedResults.length === 0)) {
                console.log("SchedSync DEBUG - Attempting redirect to:", redirectUrl);
                setTimeout(() => {
                    window.location.assign(redirectUrl);
                }, 1200);
            } else {
                console.warn("SchedSync DEBUG - No successful saves, redirect skipped.");
            }

        } catch (error) {
            // --- FIX 2: Always surface the real error message ---
            console.error("DEBUG - Schedule Save Error:", error);
            showToast(`❌ Save failed: ${error?.message || JSON.stringify(error) || "Unknown error"}`, "error");
        }
    };

    async function loadAvailablePrograms() {
        try {
            const q = query(collection(db, "courses"), orderBy("name"));
            const snapshot = await getDocs(q);
            availablePrograms = snapshot.docs.map(doc => doc.data().name);
            
            // Populate the select element
            sectionStrandSelect.innerHTML = "";
            if (availablePrograms.length === 0) {
                const option = document.createElement("option");
                option.value = "";
                option.textContent = "No programs available (Add to Curriculum first)";
                sectionStrandSelect.appendChild(option);
            } else {
                availablePrograms.forEach(program => {
                    const option = document.createElement("option");
                    option.value = program;
                    option.textContent = program;
                    sectionStrandSelect.appendChild(option);
                });
            }
        } catch (error) {
            console.error("Error loading programs from curriculum:", error);
        }
    }

    function listenForSections() {
        const q = query(collection(db, "sections"), orderBy("name"));
        onSnapshot(q, (snapshot) => {
            allSections = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            renderSections(allSections);
        });
    }

    function renderSections(sections) {
        sectionsGrid.innerHTML = "";
        sectionsGrid.className = "space-y-8";

        if (sections.length === 0) {
            sectionsGrid.innerHTML = '<div class="col-span-full text-center py-10 opacity-50">No sections found.</div>';
            return;
        }

        const groups = {};
        sections.forEach(s => {
            const grade = s.gradeLevel || "Other";
            if (!groups[grade]) groups[grade] = [];
            groups[grade].push(s);
        });

        const sortedGrades = Object.keys(groups).sort((a, b) => {
            const rank = g => {
                if (g === "11") return 1;
                if (g === "12") return 2;
                if (g.includes("1st")) return 3;
                if (g.includes("2nd")) return 4;
                if (g.includes("3rd")) return 5;
                if (g.includes("4th")) return 6;
                return 10;
            };
            return rank(a) - rank(b);
        });

        sortedGrades.forEach(grade => {
            const groupData = groups[grade];
            const groupEl = document.createElement("div");
            groupEl.className = "grade-group";
            
            // Check if all sections in this group are selected
            const allSelected = groupData.every(s => selectedIds.has(s.id));

            groupEl.innerHTML = `
                <div class="grade-header">
                    <div class="flex items-center gap-4">
                        <input type="checkbox" class="grade-checkbox" ${allSelected ? 'checked' : ''}>
                        <span>Grade / Level: ${grade} (${groupData.length})</span>
                    </div>
                </div>
                <div class="sections-grid-inner grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                </div>
            `;

            const header = groupEl.querySelector(".grade-header");
            const gradeCheckbox = groupEl.querySelector(".grade-checkbox");

            // Toggle collapse only when clicking the header background, not the checkbox
            header.onclick = (e) => {
                if (e.target !== gradeCheckbox) {
                    groupEl.classList.toggle("collapsed");
                }
            };

            gradeCheckbox.onclick = (e) => {
                e.stopPropagation();
                toggleGradeSelection(groupData, gradeCheckbox.checked);
            };

            const gridInner = groupEl.querySelector(".sections-grid-inner");

            groupData.forEach(section => {
                const card = document.createElement("div");
                card.className = `section-card relative group ${selectedIds.has(section.id) ? 'selected' : ''}`;
                card.innerHTML = `
                    <div class="checkbox-wrapper">
                        <input type="checkbox" class="section-checkbox" ${selectedIds.has(section.id) ? 'checked' : ''}>
                    </div>
                    <div class="section-name">${section.name}</div>
                    <div class="section-strand">${section.strand}</div>
                `;
                
                // Clicking the checkbox
                const checkbox = card.querySelector('.section-checkbox');
                checkbox.onclick = (e) => {
                    e.stopPropagation();
                    toggleSectionSelection(section.id, card);
                };

                // Normal click -> Profile (if NOT in selection mode)
                card.onclick = () => {
                    if (selectedIds.size > 0) {
                        toggleSectionSelection(section.id, card);
                    } else {
                        window.location.href = `sectionprofile.html?id=${section.id}`;
                    }
                };

                if (isAdmin) {
                    const editBtn = document.createElement('div');
                    editBtn.innerHTML = `
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                        </svg>
                    `;
                    editBtn.className = "absolute top-3 right-3 p-2 bg-white border-2 border-black rounded-lg shadow-[2px_2px_0px_black] hover:bg-slate-100 hover:scale-110 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all cursor-pointer z-10 opacity-0 group-hover:opacity-100";
                    
                    editBtn.onclick = (e) => {
                        e.stopPropagation();
                        openEditModal(section);
                    };
                    card.appendChild(editBtn);
                }
                gridInner.appendChild(card);
            });

            sectionsGrid.appendChild(groupEl);
        });
    }

    function toggleGradeSelection(groupData, isChecked) {
        groupData.forEach(section => {
            if (isChecked) {
                selectedIds.add(section.id);
            } else {
                selectedIds.delete(section.id);
            }
        });
        renderSections(allSections);
        updateSelectionBar();
    }

    function toggleSectionSelection(id, card) {
        const checkbox = card.querySelector('.section-checkbox');
        if (selectedIds.has(id)) {
            selectedIds.delete(id);
            card.classList.remove('selected');
            checkbox.checked = false;
        } else {
            selectedIds.add(id);
            card.classList.add('selected');
            checkbox.checked = true;
        }
        updateSelectionBar();
    }

    function updateSelectionBar() {
        if (selectedIds.size > 0) {
            selectionBar.classList.add('active');
            selectedCountEl.textContent = selectedIds.size;
        } else {
            selectionBar.classList.remove('active');
        }
    }

    cancelSelectionBtn.onclick = () => {
        selectedIds.clear();
        renderSections(allSections);
        updateSelectionBar();
    };

    genEmailsBtn.onclick = async () => {
        const selectedSections = allSections.filter(s => selectedIds.has(s.id));
        if (selectedSections.length === 0) {
            showToast("No sections selected.", "info");
            return;
        }

        const sectionsToProcess = selectedSections.filter(s => !s.sectionEmail);

        if (sectionsToProcess.length === 0) {
            showToast("All selected sections already have emails. Skipping.", "info");
            return;
        }

        const confirmed = await showConfirm("GENERATE ACCOUNTS", `Create Firebase Auth accounts for ${sectionsToProcess.length} section(s)?`);
        if (!confirmed) return;

        try {
            let succeeded = 0;
            let failed = 0;

            for (const section of sectionsToProcess) {
                const sanitizedName = section.name.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
                const email = `${sanitizedName}@stamaria.sti.edu`;
                const password = `SCHEDSYNC${sanitizedName}`;

                let tempApp = null;
                try {
                    showToast(`Processing ${sanitizedName}... ⏳`, "info");
                    
                    // 1. Create a dedicated temporary app for THIS user 🛡️⚓
                    // Use a more unique name to avoid "Duplicate App" errors if clicked rapidly
                    const tempAppName = "AuthGen-" + sanitizedName + "-" + Math.random().toString(36).substring(7);
                    tempApp = initializeApp(secondaryConfig, tempAppName);
                    const tempAuth = getAuth(tempApp);

                    let uid = null;
                    try {
                        // 2. Try to create the Auth account
                        const userCredential = await createUserWithEmailAndPassword(tempAuth, email, password);
                        uid = userCredential.user.uid;
                    } catch (authErr) {
                        // 2b. If already exists, sign in to get the UID and sync Firestore 🔄
                        if (authErr.code === 'auth/email-already-in-use') {
                            console.log(`Email ${email} exists in Auth. Syncing Firestore...`);
                            const userCredential = await signInWithEmailAndPassword(tempAuth, email, password);
                            uid = userCredential.user.uid;
                        } else {
                            throw authErr; // Rethrow other errors
                        }
                    }

                    // 3. Update Firestore using the admin's primary connection
                    const batch = writeBatch(db);
                    batch.update(doc(db, "sections", section.id), {
                        sectionEmail: email,
                        defaultPassword: password,
                        authUid: uid,
                        updatedAt: new Date().toISOString()
                    });

                    batch.set(doc(db, "users", uid), {
                        email: email,
                        role: 'student',
                        section: section.name,
                        displayName: section.name,
                        username: sanitizedName,
                        password: password,
                        createdAt: new Date().toISOString()
                    }, { merge: true }); // Merge to avoid overwriting extra fields if they exist

                    await batch.commit();
                    succeeded++;

                    // 4. Cleanup this specific temp app immediately
                    await deleteApp(tempApp);
                    
                    // 5. Small delay to prevent rate-limiting
                    await new Promise(res => setTimeout(res, 500));

                } catch (err) {
                    console.error(`Failed for ${email}:`, err);
                    if (tempApp) await deleteApp(tempApp).catch(() => {});
                    showToast(`Error creating ${sanitizedName}: ${err.message}`, "error");
                    failed++;
                }
            }

            showToast(`✅ Successfully created ${succeeded} accounts!`, "success");
            selectedIds.clear();
            renderSections(allSections);
            updateSelectionBar();
        } catch (error) {
            console.error("General Error in GenEmails:", error);
            showToast("Failed to process accounts.", "error");
        }
    };

    // Helper to delete Auth account via secondary app 🛡️⚓
    async function deleteAuthAccount(email, password) {
        if (!email || !password) return;
        let secondaryApp = null;
        try {
            const secondaryAppName = "DeleteApp-" + Date.now() + Math.random().toString(36).substring(7);
            secondaryApp = initializeApp(secondaryConfig, secondaryAppName);
            const secondaryAuth = getAuth(secondaryApp);
            const userCred = await signInWithEmailAndPassword(secondaryAuth, email, password);
            await deleteUser(userCred.user);
            console.log(`Auth account deleted for ${email}`);
        } catch (err) {
            console.warn(`Auth deletion skipped/failed for ${email} (User might not exist in Auth):`, err.message);
        } finally {
            if (secondaryApp) await deleteApp(secondaryApp).catch(() => {});
        }
    }

    multiDeleteBtn.onclick = async () => {
        if (!isAdmin) {
            showToast("Only admins can bulk delete.", "error");
            return;
        }

        const selectedSections = allSections.filter(s => selectedIds.has(s.id));
        const confirmed = await showConfirm("DELETE SELECTED", `Delete ${selectedSections.length} sections and their associated Auth accounts?`);
        
        if (confirmed) {
            try {
                showToast("Processing bulk deletion... ⏳", "info");
                
                for (const section of selectedSections) {
                    // 1. Delete Auth
                    if (section.sectionEmail && section.defaultPassword) {
                        await deleteAuthAccount(section.sectionEmail, section.defaultPassword);
                    }

                    // 2. Delete Firestore Section
                    await deleteDoc(doc(db, "sections", section.id));

                    // 3. Delete User Profile
                    if (section.sectionEmail) {
                        const userQuery = query(collection(db, "users"), where("email", "==", section.sectionEmail));
                        const userSnap = await getDocs(userQuery);
                        if (!userSnap.empty) {
                            const batch = writeBatch(db);
                            userSnap.forEach(d => batch.delete(doc(db, "users", d.id)));
                            await batch.commit();
                        }
                    }
                }

                showToast(`✅ Deleted ${selectedSections.length} sections and accounts.`, "success");
                selectedIds.clear();
                updateSelectionBar();
            } catch (error) {
                console.error("Error in bulk deleting sections:", error);
                showToast("Failed to delete all sections.", "error");
            }
        }
    };

    function openEditModal(section = null) {
        if (section) {
            document.getElementById("modalTitle").textContent = "Edit Section";
            document.getElementById("sectionId").value = section.id;
            document.getElementById("sectionStrand").value = section.strand;
            document.getElementById("sectionGrade").value = section.gradeLevel || "11";
            sectionCountGroup.classList.add("hidden");
            deleteSectionBtn.classList.remove("hidden");
        } else {
            document.getElementById("modalTitle").textContent = "Add New Section";
            document.getElementById("sectionId").value = "";
            sectionForm.reset();
            sectionCountGroup.classList.remove("hidden");
            deleteSectionBtn.classList.add("hidden");
        }
        sectionModal.classList.remove("hidden");
        sectionModal.classList.add("flex");
    }

    addSectionBtn.onclick = () => openEditModal();
    closeModal.onclick = () => {
        sectionModal.classList.add("hidden");
        sectionModal.classList.remove("flex");
    };

    sectionForm.onsubmit = async (e) => {
        e.preventDefault();
        const id = document.getElementById("sectionId").value;
        const strand = document.getElementById("sectionStrand").value;
        const gradeLevel = document.getElementById("sectionGrade").value;
        const count = parseInt(sectionCountInput.value) || 1;

        const gradeCode = gradeLevelMap[gradeLevel] || "1";

        try {
            if (id) {
                // For editing, we just update program and grade. 
                // Name will be re-generated based on these.
                const name = `${strand}${gradeCode}01`; // Defaulting to 01 for edit single
                const sectionData = { name, strand, gradeLevel, updatedAt: new Date().toISOString() };
                await updateDoc(doc(db, "sections", id), sectionData);
                showToast("Section updated", "success");
            } else {
                // For adding multiple sections
                const batch = writeBatch(db);
                for (let i = 1; i <= count; i++) {
                    const paddedNum = i.toString().padStart(2, '0');
                    const name = `${strand}${gradeCode}${paddedNum}`;
                    const sectionData = { 
                        name, 
                        strand, 
                        gradeLevel, 
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString() 
                    };
                    const newDocRef = doc(collection(db, "sections"));
                    batch.set(newDocRef, sectionData);
                }
                await batch.commit();
                showToast(`${count} sections created successfully`, "success");
            }
            sectionModal.classList.add("hidden");
            sectionModal.classList.remove("flex");
        } catch (error) {
            console.error("Error saving sections:", error);
            showToast("Error saving sections.", "error");
        }
    };

    deleteSectionBtn.onclick = async () => {
        const id = document.getElementById("sectionId").value;
        const confirmed = await showConfirm("DELETE SECTION", "Are you sure you want to delete this section? This will also remove the associated Firebase Auth account.");
        if (confirmed) {
            try {
                // Get section data first to get the email and password
                const sectionSnap = await getDoc(doc(db, "sections", id));
                if (sectionSnap.exists()) {
                    const sectionData = sectionSnap.data();
                    const email = sectionData.sectionEmail;
                    const password = sectionData.defaultPassword;

                    // 1. Delete Auth Account first (requires credentials)
                    if (email && password) {
                        showToast(`Deleting Auth account for ${email}...`, "info");
                        await deleteAuthAccount(email, password);
                    }

                    // 2. Delete the section document
                    await deleteDoc(doc(db, "sections", id));

                    // 3. Delete the user profile document
                    if (email) {
                        const userQuery = query(collection(db, "users"), where("email", "==", email));
                        const userSnap = await getDocs(userQuery);
                        if (!userSnap.empty) {
                            const batch = writeBatch(db);
                            userSnap.forEach(d => batch.delete(doc(db, "users", d.id)));
                            await batch.commit();
                        }
                    }
                }
                
                showToast("Section and account deleted successfully", "success");
                sectionModal.classList.add("hidden");
                sectionModal.classList.remove("flex");
            } catch (error) {
                console.error("Error deleting section:", error);
                showToast("Failed to delete section", "error");
            }
        }
    };

    clearAllBtn.onclick = async () => {
        if (allSections.length === 0) {
            showToast("No sections to clear.", "info");
            return;
        }

        const confirmed = await showConfirm("CLEAR ALL SECTIONS", `Are you sure you want to delete ALL ${allSections.length} sections and their associated accounts? This action cannot be undone.`);
        
        if (confirmed) {
            try {
                showToast("Clearing everything... ⏳", "info");
                
                for (const section of allSections) {
                    // 1. Delete Auth Account
                    if (section.sectionEmail && section.defaultPassword) {
                        await deleteAuthAccount(section.sectionEmail, section.defaultPassword);
                    }

                    // 2. Delete Firestore Section
                    await deleteDoc(doc(db, "sections", section.id));

                    // 3. Delete User Profile
                    if (section.sectionEmail) {
                        const userQuery = query(collection(db, "users"), where("email", "==", section.sectionEmail));
                        const userSnap = await getDocs(userQuery);
                        if (!userSnap.empty) {
                            const batch = writeBatch(db);
                            userSnap.forEach(d => batch.delete(doc(db, "users", d.id)));
                            await batch.commit();
                        }
                    }
                }

                showToast("✅ All sections and accounts cleared successfully!", "success");
            } catch (error) {
                console.error("Error clearing sections:", error);
                showToast("Failed to clear everything.", "error");
            }
        }
    };

    sectionSearch.oninput = (e) => {
        const query = e.target.value.toLowerCase();
        const filtered = allSections.filter(s => 
            s.name.toLowerCase().includes(query) || 
            s.strand.toLowerCase().includes(query)
        );
        renderSections(filtered);
    };
});