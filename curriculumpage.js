import { db, auth } from "./js/config/firebase-config.js";
import { collection, getDocs, doc, setDoc, deleteDoc, query, orderBy } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { SUBJECT_DATA } from "./subject-data.js";

document.addEventListener('DOMContentLoaded', async () => {
    const curriculumGrid = document.getElementById('curriculumGrid');
    const addSubjectBtn = document.getElementById('addSubjectBtn');
    const migrateDataBtn = document.getElementById('migrateDataBtn');
    const pdfUpload = document.getElementById('pdfUpload');
    const clearAllBtn = document.getElementById('clearAllBtn');
    
    // Configure PDF.js worker
    if (typeof pdfjsLib !== 'undefined') {
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }

    // Modal Selectors
    const modal = document.getElementById('subjectModal');
    const closeModalBtn = document.getElementById('closeModalBtn');
    const subjectForm = document.getElementById('subjectForm');
    const subjectIdInput = document.getElementById('subjectId');
    const subjectNameInput = document.getElementById('subjectName');
    const subjectCategoryInput = document.getElementById('subjectCategory');
    const deleteSubjectBtn = document.getElementById('deleteSubjectBtn');
    const modalTitle = document.getElementById('modalTitle');

    let allSubjects = [];
    const isAdmin = localStorage.getItem('userRole') === 'admin';

    if (isAdmin) {
        document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'block');
    }

    async function loadSubjects() {
        try {
            // Load from 'courses' collection for hierarchical structure
            const q = query(collection(db, "courses"), orderBy("name"));
            const snapshot = await getDocs(q);
            const courses = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            if (courses.length === 0 && isAdmin) {
                // Check legacy 'curriculums' collection
                const legacyQ = query(collection(db, "curriculums"));
                const legacySnapshot = await getDocs(legacyQ);
                if (legacySnapshot.empty) {
                    migrateDataBtn.style.display = 'block';
                }
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
            curriculumGrid.innerHTML = '<div class="no-data">No curriculum data available. Attach a PDF to get started.</div>';
            return;
        }

        courses.forEach(course => {
            const courseSection = document.createElement('div');
            courseSection.className = 'course-section';

            const courseTitle = document.createElement('h2');
            courseTitle.className = 'course-title';
            courseTitle.textContent = course.name;
            courseSection.appendChild(courseTitle);

            if (course.terms && typeof course.terms === 'object') {
                const termNames = Object.keys(course.terms).sort((a, b) => {
                    const getOrder = (name) => {
                        let order = 0;
                        if (name.includes("First Year")) order += 10;
                        else if (name.includes("Second Year")) order += 20;
                        else if (name.includes("Third Year")) order += 30;
                        else if (name.includes("Fourth Year")) order += 40;
                        if (name.includes("First Term")) order += 1;
                        else if (name.includes("Second Term")) order += 2;
                        return order;
                    };
                    return getOrder(a) - getOrder(b);
                });

                const termsGrid = document.createElement('div');
                termsGrid.className = 'terms-grid';

                termNames.forEach(termName => {
                    const subjects = course.terms[termName];
                    const termCard = document.createElement('div');
                    termCard.className = 'category-card';

                    const header = document.createElement('div');
                    header.className = 'category-header';
                    header.innerHTML = `<div class="term-main">${termName}</div>`;
                    
                    const body = document.createElement('div');
                    body.className = 'category-body';

                    subjects.forEach(subj => {
                        const item = document.createElement('div');
                        item.className = 'subject-item';
                        
                        const nameSpan = document.createElement('span');
                        nameSpan.className = 'subject-name';
                        nameSpan.textContent = subj;

                        item.appendChild(nameSpan);

                        if (isAdmin) {
                            item.addEventListener('click', () => openModal({
                                name: subj,
                                courseId: course.id,
                                termName: termName,
                                originalName: subj
                            }));
                        }

                        body.appendChild(item);
                    });

                    termCard.appendChild(header);
                    termCard.appendChild(body);
                    termsGrid.appendChild(termCard);
                });
                courseSection.appendChild(termsGrid);
            }
            curriculumGrid.appendChild(courseSection);
        });
    }

    const courseIdInput = document.getElementById('courseId');
    const termNameInput = document.getElementById('termName');

    function openModal(data = null) {
        if (data) {
            modalTitle.textContent = "Edit Subject";
            subjectIdInput.value = data.originalName || "";
            courseIdInput.value = data.courseId || "";
            termNameInput.value = data.termName || "";
            subjectNameInput.value = data.name || "";
            subjectCategoryInput.value = data.category || "";
            deleteSubjectBtn.style.display = 'block';
        } else {
            modalTitle.textContent = "Add Subject (General)";
            subjectIdInput.value = "";
            courseIdInput.value = "GENERAL_CURRICULUM";
            termNameInput.value = "General Subjects";
            subjectNameInput.value = "";
            subjectCategoryInput.value = "CORE";
            deleteSubjectBtn.style.display = 'none';
        }
        modal.style.display = 'flex';
    }

    closeModalBtn.addEventListener('click', () => {
        modal.style.display = 'none';
    });

    addSubjectBtn.addEventListener('click', () => openModal());

    subjectForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const cId = courseIdInput.value || "GENERAL_CURRICULUM";
        const tName = termNameInput.value || "General Subjects";
        const originalName = subjectIdInput.value;
        const newName = subjectNameInput.value.trim();

        try {
            const courseRef = doc(db, "courses", cId);
            const courseSnap = await getDocs(query(collection(db, "courses")));
            const courseDoc = courseSnap.docs.find(d => d.id === cId);
            
            let terms = {};
            if (courseDoc && courseDoc.exists()) {
                terms = courseDoc.data().terms || {};
            }

            if (!terms[tName]) terms[tName] = [];

            if (originalName) {
                // Edit existing
                const idx = terms[tName].indexOf(originalName);
                if (idx !== -1) terms[tName][idx] = newName;
                else terms[tName].push(newName);
            } else {
                // Add new
                if (!terms[tName].includes(newName)) terms[tName].push(newName);
            }

            await setDoc(doc(db, "courses", cId), {
                name: cId === "GENERAL_CURRICULUM" ? "General Curriculum" : (courseDoc?.data()?.name || cId),
                terms: terms,
                updatedAt: new Date().toISOString()
            }, { merge: true });

            modal.style.display = 'none';
            loadSubjects();
        } catch (error) {
            console.error("Error saving subject:", error);
            alert("Failed to save subject.");
        }
    });

    deleteSubjectBtn.addEventListener('click', async () => {
        const cId = courseIdInput.value;
        const tName = termNameInput.value;
        const originalName = subjectIdInput.value;

        if (!confirm(`Are you sure you want to delete "${originalName}"?`)) return;

        try {
            const courseSnap = await getDocs(query(collection(db, "courses")));
            const courseDoc = courseSnap.docs.find(d => d.id === cId);
            
            if (courseDoc && courseDoc.exists()) {
                const data = courseDoc.data();
                const terms = data.terms || {};
                if (terms[tName]) {
                    terms[tName] = terms[tName].filter(s => s !== originalName);
                    await setDoc(doc(db, "courses", cId), { terms }, { merge: true });
                }
            }
            modal.style.display = 'none';
            loadSubjects();
        } catch (error) {
            console.error("Error deleting subject:", error);
        }
    });

    migrateDataBtn.addEventListener('click', async () => {
        if (!confirm("This will upload all static subjects to the 'General Curriculum' course. Proceed?")) return;
        
        migrateDataBtn.textContent = "Migrating...";
        migrateDataBtn.disabled = true;

        const terms = {};
        Object.keys(SUBJECT_DATA).forEach(cat => {
            if (cat === "GENERAL_KEYS") return;
            terms[cat] = SUBJECT_DATA[cat];
        });

        try {
            await setDoc(doc(db, "courses", "GENERAL_CURRICULUM"), {
                name: "General Curriculum (SHS)",
                terms: terms,
                updatedAt: new Date().toISOString()
            });
            alert("Migration complete!");
            loadSubjects();
        } catch (error) {
            console.error("Migration failed:", error);
            alert("Migration failed.");
            migrateDataBtn.textContent = "Migrate Static Data";
            migrateDataBtn.disabled = false;
        }
    });

    // Initial load
    loadSubjects();
});
