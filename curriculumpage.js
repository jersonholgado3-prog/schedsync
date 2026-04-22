import { db, auth } from "./js/config/firebase-config.js";
import { collection, getDocs, getDoc, doc, setDoc, deleteDoc, query, orderBy } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { SUBJECT_DATA } from "./subject-data.js";
import { showToast } from "./js/utils/ui-utils.js";
import { initUserProfile } from "./userprofile.js";

document.addEventListener('DOMContentLoaded', async () => {
    initUserProfile("#userProfile");
    const curriculumGrid = document.getElementById('curriculumGrid');
    const addSubjectBtn  = document.getElementById('addSubjectBtn');
    const migrateDataBtn = document.getElementById('migrateDataBtn');
    const pdfUpload      = document.getElementById('pdfUpload');
    const clearAllBtn    = document.getElementById('clearAllBtn');

    let isAdmin = false;

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            const userDoc = await getDoc(doc(db, "users", user.uid));
            if (userDoc.exists() && userDoc.data().role === 'admin') {
                isAdmin = true;
            }
            loadSubjects();
        } else {
            loadSubjects();
        }
    });

    if (typeof pdfjsLib !== 'undefined') {
        pdfjsLib.GlobalWorkerOptions.workerSrc =
            'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }

    const modal            = document.getElementById('subjectModal');
    const closeModalBtn    = document.getElementById('closeModalBtn');
    const subjectForm      = document.getElementById('subjectForm');
    const subjectIdInput   = document.getElementById('subjectId');
    const subjectNameInput = document.getElementById('subjectName');
    const deleteSubjectBtn = document.getElementById('deleteSubjectBtn');
    const modalTitle       = document.getElementById('modalTitle');
    const courseIdInput    = document.getElementById('courseId');
    const termNameInput    = document.getElementById('termName');

    // ─────────────────────────────────────────────────────────────────────────────
    // LOAD & RENDER
    // ─────────────────────────────────────────────────────────────────────────────
    async function loadSubjects() {
        try {
            const q        = query(collection(db, "courses"), orderBy("name"));
            const snapshot = await getDocs(q);
            const courses  = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

            if (courses.length === 0 && isAdmin) {
                const legacyQ        = query(collection(db, "curriculums"));
                const legacySnapshot = await getDocs(legacyQ);
                if (legacySnapshot.empty) migrateDataBtn.style.display = 'block';
            } else {
                migrateDataBtn.style.display = 'none';
            }

            renderHierarchicalGrid(courses);
        } catch (error) {
            console.error("Error loading subjects: ", error);
            curriculumGrid.innerHTML = '<div class="error">Error loading curriculum data.</div>';
        }
    }

    function renderHierarchicalGrid(courses) {
        curriculumGrid.innerHTML = '';
        if (courses.length === 0) {
            curriculumGrid.innerHTML =
                '<div class="no-data">No curriculum data available. Attach a PDF to get started.</div>';
            return;
        }

        courses.forEach(course => {
            const courseSection = document.createElement('div');
            courseSection.className = 'course-section collapsed'; // Start collapsed

            const courseTitle = document.createElement('h2');
            courseTitle.className = 'course-title';
            courseTitle.textContent = course.name;
            courseSection.appendChild(courseTitle);

            courseTitle.onclick = () => {
                courseSection.classList.toggle('collapsed');
            };

            if (course.terms && typeof course.terms === 'object') {
                // Sort terms by year then semester/term number
                const termNames = Object.keys(course.terms).sort((a, b) => {
                    const rank = s => {
                        const upper = s.toUpperCase();
                        let yr = 0, sem = 0;
                        // College style: "First Year" / "Second Year"
                        if      (upper.includes("FIRST YEAR")  || upper.includes("G11")) yr = 1;
                        else if (upper.includes("SECOND YEAR") || upper.includes("G12")) yr = 2;
                        else if (upper.includes("THIRD YEAR"))  yr = 3;
                        else if (upper.includes("FOURTH YEAR")) yr = 4;
                        // Semester / term number
                        const termMatch = upper.match(/TERM\s*(\d)|FIRST\s+TERM|SECOND\s+TERM|THIRD\s+TERM/);
                        if (termMatch) {
                            if (termMatch[1]) sem = parseInt(termMatch[1]);
                            else if (upper.includes("FIRST TERM"))  sem = 1;
                            else if (upper.includes("SECOND TERM")) sem = 2;
                            else if (upper.includes("THIRD TERM"))  sem = 3;
                        }
                        return yr * 10 + sem;
                    };
                    return rank(a) - rank(b);
                });

                const termsGrid = document.createElement('div');
                termsGrid.className = 'terms-grid';

                termNames.forEach(termName => {
                    const subjects = course.terms[termName];
                    if (!subjects || subjects.length === 0) return;

                    const termCard = document.createElement('div');
                    termCard.className = 'category-card collapsed'; // Start collapsed
                    termCard.innerHTML = `
                        <div class="category-header">
                            <span>${termName}</span>
                        </div>
                        <div class="category-body"></div>
                    `;

                    const header = termCard.querySelector('.category-header');
                    header.onclick = () => {
                        termCard.classList.toggle('collapsed');
                    };

                    const body = termCard.querySelector('.category-body');

                    subjects.forEach(subj => {
                        const item = document.createElement('div');
                        item.className = 'subject-item';
                        item.innerHTML = `<span class="subject-name">${subj}</span>`;
                        if (isAdmin) {
                            item.onclick = () => openModal({
                                name: subj, courseId: course.id,
                                termName, originalName: subj
                            });
                        }
                        body.appendChild(item);
                    });
                    termsGrid.appendChild(termCard);
                });
                courseSection.appendChild(termsGrid);
            }
            curriculumGrid.appendChild(courseSection);
        });
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // MODAL
    // ─────────────────────────────────────────────────────────────────────────────
    function openModal(data = null) {
        if (data) {
            modalTitle.textContent         = "Edit Subject";
            subjectIdInput.value           = data.originalName || "";
            courseIdInput.value            = data.courseId || "";
            termNameInput.value            = data.termName || "";
            subjectNameInput.value         = data.name || "";
            deleteSubjectBtn.style.display = 'block';
        } else {
            modalTitle.textContent         = "Add Subject";
            subjectIdInput.value           = "";
            courseIdInput.value            = "GENERAL_CURRICULUM";
            termNameInput.value            = "General Subjects";
            subjectNameInput.value         = "";
            deleteSubjectBtn.style.display = 'none';
        }
        modal.style.display = 'flex';
    }

    closeModalBtn.addEventListener('click', () => { modal.style.display = 'none'; });
    addSubjectBtn.addEventListener('click', () => openModal());

    // ─────────────────────────────────────────────────────────────────────────────
    // CLEAR ALL
    // ─────────────────────────────────────────────────────────────────────────────
    clearAllBtn.addEventListener('click', async () => {
        if (!confirm("Are you sure you want to WIPE ALL curriculum data? This cannot be undone! ⚠️")) return;
        try {
            const snap           = await getDocs(collection(db, "courses"));
            const deletePromises = snap.docs.map(d => deleteDoc(doc(db, "courses", d.id)));
            await Promise.all(deletePromises);
            showToast("All curriculum data cleared. 🗑️", "success");
            loadSubjects();
        } catch (error) {
            console.error("Clear All failed:", error);
            showToast("Failed to clear data.", "error");
        }
    });

    // ─────────────────────────────────────────────────────────────────────────────
    // PDF UPLOAD  — TUNED PARSER
    // ─────────────────────────────────────────────────────────────────────────────
    pdfUpload.addEventListener('change', async (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;

        showToast(`Processing ${files.length} PDF(s)... ⏳`, "info");
        
        for (const file of files) {
            await processFile(file);
        }
        
        showToast("All files processed! ✅", "success");
        loadSubjects();
    });

    async function processFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = async function () {
                try {
                    const pdf        = await pdfjsLib.getDocument(new Uint8Array(this.result)).promise;
                    const courseName = file.name.replace(/\.pdf$/i, "").trim().toUpperCase();
                    const terms      = {};

                    // ── Column constants (calibrated from real PDFs) ───────────────────
                    const DESC_X_MIN = 190;   
                    const DESC_X_MAX = 352;   
                    const ID_X_MAX   = 185;   

                    // ── Term header regexes ───────────────────────────────────────────
                    const SHS_TERM_RE     = /^.+\s+G\d{1,2}\s+Term\s+\d\s*$/i;
                    const COLLEGE_TERM_RE = /^.+(?:First|Second|Third|Fourth)\s+Year,?\s+(?:First|Second|Third)\s+(?:Term|Semester)\s*$/i;
                    const DISCARD_RE = /^(Course ID|Subject|Catalog|Offering|Description|Unit\/s|Unit|Component|Pre Requisite|Area|No|\d+\.\d+|Page:\s*\d+|CURRICULUM STRUCTURE)$/i;
                    const SECTION_RE = /Y\d+S\d+\s+Course\s+List/i;

                    function groupIntoRows(items) {
                        const sorted = [...items].sort((a, b) =>
                            b.transform[5] - a.transform[5] || a.transform[4] - b.transform[4]
                        );
                        const Y_TOL = 8;
                        const rows  = [];
                        let bucket  = [], avgY = null;
                        sorted.forEach(it => {
                            const y = it.transform[5];
                            if (avgY === null || Math.abs(y - avgY) <= Y_TOL) {
                                bucket.push(it);
                                avgY = bucket.reduce((s, x) => s + x.transform[5], 0) / bucket.length;
                            } else {
                                if (bucket.length) rows.push(bucket);
                                bucket = [it]; avgY = y;
                            }
                        });
                        if (bucket.length) rows.push(bucket);
                        rows.forEach(r => r.sort((a, b) => a.transform[4] - b.transform[4]));
                        return rows;
                    }

                    function cleanDesc(str) {
                        return str
                            .replace(/\|/g, " ")           
                            .replace(/^\d{2}\s+/, "")      
                            .replace(/\s{2,}/g, " ")       
                            .trim();
                    }

                    let currentTerm = null;
                    console.log(`[PDF Parser] Processing: "${courseName}"`);

                    for (let pageIdx = 1; pageIdx <= pdf.numPages; pageIdx++) {
                        const rows = groupIntoRows(
                            (await (await pdf.getPage(pageIdx)).getTextContent()).items
                        );

                        rows.forEach(row => {
                            const rowText = row
                                .map(it => it.str.trim())
                                .filter(Boolean)
                                .join(" ")
                                .trim();

                            if (!rowText) return;
                            if (SECTION_RE.test(rowText)) return;
                            if (/Description/.test(rowText) && /Unit/.test(rowText)) return;
                            if (/^Area\s*\|?\s*No/.test(rowText)) return;

                            if (SHS_TERM_RE.test(rowText) || COLLEGE_TERM_RE.test(rowText)) {
                                const hasDashCode = /^[A-Z]+-\d{2}-\d{2}\s/i.test(rowText);
                                if (!hasDashCode) {
                                    currentTerm = rowText.replace(/\s{2,}/g, " ");
                                    if (!terms[currentTerm]) terms[currentTerm] = [];
                                }
                                return;
                            }

                            if (!currentTerm) return;

                            const descItems = row.filter(it => {
                                const x = it.transform[4];
                                return x >= DESC_X_MIN && x < DESC_X_MAX && it.str.trim().length > 0;
                            });
                            if (descItems.length === 0) return;

                            const rawText = descItems.map(it => it.str).join(" ");
                            const frag    = cleanDesc(rawText);

                            if (frag.length < 2)          return;
                            if (DISCARD_RE.test(frag))    return;
                            if (/^\d[\d\s.]*$/.test(frag)) return;

                            const hasIdColumn = row.some(it =>
                                it.transform[4] < ID_X_MAX && it.str.trim().length > 0
                            );

                            const arr = terms[currentTerm];
                            if (hasIdColumn || arr.length === 0) {
                                arr.push(frag);
                            } else {
                                arr[arr.length - 1] += " " + frag;
                            }
                        });
                    }

                    const subjCount = Object.values(terms).reduce((s, a) => s + a.length, 0);
                    const docId = courseName.replace(/[^A-Z0-9]/g, "_");
                    await setDoc(
                        doc(db, "courses", docId),
                        { name: courseName, terms, updatedAt: new Date().toISOString() }
                    );
                    console.log(`[PDF Parser] Success: "${courseName}"`);
                    resolve();

                } catch (err) {
                    console.error(`[PDF Parser] Error processing ${file.name}:`, err);
                    showToast(`Error processing ${file.name}`, "error");
                    resolve(); // Resolve anyway to continue with next files
                }
            };
            reader.onerror = reject;
            reader.readAsArrayBuffer(file);
        });
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // SUBJECT FORM SAVE
    // ─────────────────────────────────────────────────────────────────────────────
    subjectForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
            const courseDoc = await getDoc(doc(db, "courses", courseIdInput.value));
            let terms = courseDoc.exists() ? courseDoc.data().terms : {};
            if (!terms[termNameInput.value]) terms[termNameInput.value] = [];
            if (subjectIdInput.value) {
                terms[termNameInput.value] = terms[termNameInput.value].map(
                    s => s === subjectIdInput.value ? subjectNameInput.value : s
                );
            } else {
                terms[termNameInput.value].push(subjectNameInput.value);
            }
            await setDoc(
                doc(db, "courses", courseIdInput.value),
                { terms, updatedAt: new Date().toISOString() },
                { merge: true }
            );
            modal.style.display = 'none';
            loadSubjects();
        } catch (err) {
            showToast("Error saving", "error");
            console.error(err);
        }
    });
});
