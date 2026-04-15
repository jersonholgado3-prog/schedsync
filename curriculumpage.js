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
            const q = query(collection(db, "curriculums"));
            const snapshot = await getDocs(q);
            allSubjects = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            if (allSubjects.length === 0 && isAdmin) {
                migrateDataBtn.style.display = 'block';
            } else {
                migrateDataBtn.style.display = 'none';
            }

            renderGrid();
        } catch (error) {
            console.error("Error loading subjects: ", error);
            // Fallback to static if firebase fails
            allSubjects = [];
            Object.keys(SUBJECT_DATA).forEach(cat => {
                if (cat === "GENERAL_KEYS") return;
                SUBJECT_DATA[cat].forEach(sub => {
                    allSubjects.push({ id: `static_${Date.now()}_${Math.random()}`, name: sub, category: cat });
                });
            });
            renderGrid();
        }
    }

    function renderGrid() {
        curriculumGrid.innerHTML = '';
        
        // Define standard SHS categories and combine with dynamic ones from PDFs
        const baseCategories = ["CORE", "APPLIED", "STEM", "HUMSS", "ICT", "ABM"];
        const dynamicCategories = [...new Set(allSubjects.map(s => s.category))];
        const categories = [...new Set([...baseCategories, ...dynamicCategories])];

        // Sort categories, but keep SHS ones potentially separate or just alphabetical
        categories.sort().forEach(cat => {
            const subs = allSubjects.filter(s => s.category === cat);
            if (subs.length === 0) return;

            const card = document.createElement('div');
            card.className = 'category-card';

            const header = document.createElement('div');
            header.className = 'category-header';
            header.textContent = cat;

            const body = document.createElement('div');
            body.className = 'category-body';

            subs.forEach(subj => {
                const item = document.createElement('div');
                item.className = 'subject-item';
                
                const nameSpan = document.createElement('span');
                nameSpan.className = 'subject-name';
                nameSpan.textContent = subj.name;

                item.appendChild(nameSpan);

                if (isAdmin) {
                    item.addEventListener('click', () => openModal(subj));
                }

                body.appendChild(item);
            });

            card.appendChild(header);
            card.appendChild(body);
            curriculumGrid.appendChild(card);
        });
    }

    // PDF Parsing Logic
    if (pdfUpload) {
        pdfUpload.addEventListener('change', async (event) => {
            const file = event.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = async function() {
                const typedarray = new Uint8Array(this.result);
                try {
                    const pdf = await pdfjsLib.getDocument(typedarray).promise;
                    let fullText = "";
                    
                    for (let i = 1; i <= pdf.numPages; i++) {
                        const page = await pdf.getPage(i);
                        const textContent = await page.getTextContent();
                        const pageText = textContent.items.map(item => item.str).join(" ");
                        fullText += pageText + "\n";
                    }

                    extractAndSaveSubjects(fullText, file.name);
                } catch (error) {
                    console.error("Error parsing PDF:", error);
                    alert("Failed to parse PDF file.");
                }
            };
            reader.readAsArrayBuffer(file);
        });
    }

    async function extractAndSaveSubjects(text, fileName) {
        // Simple logic to guess category from filename or content
        let category = "GENERAL";
        const upperName = fileName.toUpperCase();
        if (upperName.includes("STEM")) category = "STEM";
        else if (upperName.includes("BSCS")) category = "BSCS";
        else if (upperName.includes("BSIT")) category = "BSIT";
        else if (upperName.includes("BSAIS") || upperName.includes("ACCOUNTING")) category = "BSIS";
        else if (upperName.includes("BSHM") || upperName.includes("HOSPITALITY")) category = "BSHM";
        else if (upperName.includes("BSTM") || upperName.includes("TOURISM")) category = "BSTM";
        else if (upperName.includes("ABM")) category = "ABM";
        else if (upperName.includes("MAWD")) category = "MAWD";
        else if (upperName.includes("HUMSS")) category = "HUMSS";

        const subjects = [];
        
        // Target format: CourseID (6 digits) -> SubjectCode -> CatalogNo -> OfferingNo -> Description -> Units
        // Example: 001615 ACCT 1001 20 Basic Accounting 6.00
        const subjectRegex = /\d{6}\s+[A-Z]{3,4}\s+\d{4}\s+\d{2}\s+([A-Za-z0-9\s,&:\-().]+?)\s+\d\.\d\d/g;
        let match;
        while ((match = subjectRegex.exec(text)) !== null) {
            const name = match[1].trim();
            if (name && name.length > 3) {
                subjects.push(name);
            }
        }

        // Fallback for SHS or other formats
        if (subjects.length === 0) {
            const lines = text.split('\n');
            lines.forEach(line => {
                // Look for common subject-like patterns if the specific regex fails
                if (line.includes("Lecture") || line.includes("Laboratory")) {
                    // Try to extract the name before the component type
                    const parts = line.split(/\s{2,}/);
                    if (parts.length > 2) {
                        const name = parts[parts.length - 3].trim();
                        if (name.length > 3 && !name.includes("Page")) subjects.push(name);
                    }
                }
            });
        }

        const uniqueSubjects = [...new Set(subjects)];
        if (uniqueSubjects.length === 0) {
            alert("Could not extract any subjects from the PDF. Please ensure it follows the curriculum format.");
            return;
        }

        if (confirm(`Found ${uniqueSubjects.length} subjects for category ${category}. Save to system?`)) {
            const promises = uniqueSubjects.map(name => {
                const docId = doc(collection(db, "curriculums")).id;
                return setDoc(doc(db, "curriculums", docId), { name, category });
            });
            try {
                await Promise.all(promises);
                alert("Subjects imported successfully!");
                loadSubjects();
            } catch (err) {
                console.error("Error saving subjects:", err);
                alert("Failed to save subjects to database.");
            }
        }
    }

    if (clearAllBtn) {
        clearAllBtn.addEventListener('click', async () => {
            if (!confirm("Are you sure you want to delete ALL subjects from the curriculum? This cannot be undone.")) return;
            
            try {
                const q = query(collection(db, "curriculums"));
                const snapshot = await getDocs(q);
                const deletePromises = snapshot.docs.map(d => deleteDoc(doc(db, "curriculums", d.id)));
                await Promise.all(deletePromises);
                alert("All subjects cleared.");
                loadSubjects();
            } catch (error) {
                console.error("Error clearing subjects:", error);
                alert("Failed to clear subjects.");
            }
        });
    }
    function openModal(subject = null) {
        if (subject) {
            modalTitle.textContent = "Edit Subject";
            subjectIdInput.value = subject.id;
            subjectNameInput.value = subject.name;
            subjectCategoryInput.value = subject.category;
            deleteSubjectBtn.style.display = 'block';
        } else {
            modalTitle.textContent = "Add Subject";
            subjectIdInput.value = "";
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
        const docId = subjectIdInput.value || doc(collection(db, "curriculums")).id;
        const subjectData = {
            name: subjectNameInput.value.trim(),
            category: subjectCategoryInput.value,
        };

        try {
            await setDoc(doc(db, "curriculums", docId), subjectData);
            modal.style.display = 'none';
            loadSubjects(); // Reload
        } catch (error) {
            console.error("Error saving subject:", error);
            alert("Failed to save subject.");
        }
    });

    deleteSubjectBtn.addEventListener('click', async () => {
        if (!confirm("Are you sure you want to delete this subject?")) return;
        const docId = subjectIdInput.value;
        try {
            await deleteDoc(doc(db, "curriculums", docId));
            modal.style.display = 'none';
            loadSubjects();
        } catch (error) {
            console.error("Error deleting subject:", error);
        }
    });

    migrateDataBtn.addEventListener('click', async () => {
        if (!confirm("This will upload static subjects from subject-data.js to Firestore. Proceed?")) return;
        
        migrateDataBtn.textContent = "Migrating...";
        migrateDataBtn.disabled = true;

        let promises = [];
        Object.keys(SUBJECT_DATA).forEach(cat => {
            if (cat === "GENERAL_KEYS") return;
            SUBJECT_DATA[cat].forEach(sub => {
                const newDocRef = doc(collection(db, "curriculums"));
                promises.push(setDoc(newDocRef, { name: sub, category: cat }));
            });
        });

        try {
            await Promise.all(promises);
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
