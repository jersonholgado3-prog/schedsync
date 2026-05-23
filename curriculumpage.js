import { db, auth } from "./js/config/firebase-config.js";
import { collection, getDocs, getDoc, doc, setDoc, deleteDoc, query, orderBy } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { showToast } from "./js/utils/ui-utils.js";
import { initUniversalSearch } from "./search.js";
import { initUserProfile } from "./userprofile.js";

// Subject object shape:
// { courseId, subjectArea, catalogNo, offeringNo, description, units, component, preRequisite }

const COLS = ['courseId','subjectArea','catalogNo','offeringNo','description','units','component','preRequisite'];
const COL_HEADERS = ['Course ID','Subject Area','Catalog No','Offering No','Description','Unit/s','Component','Pre Requisite / Co Requisite'];

document.addEventListener('DOMContentLoaded', async () => {
    initUserProfile("#userProfile");
    initUniversalSearch(db);

    const curriculumGrid = document.getElementById('curriculumGrid');
    const pdfUpload      = document.getElementById('pdfUpload');
    const xlsxUpload     = document.getElementById('xlsxUpload');
    const clearAllBtn    = document.getElementById('clearAllBtn');
    const exportAllBtn   = document.getElementById('exportAllBtn');
    const exportPerBtn   = document.getElementById('exportPerBtn');
    const migrateDataBtn = document.getElementById('migrateDataBtn');
    const addSubjectBtn  = document.getElementById('addSubjectBtn');

    let isAdmin = false;
    let allCourses = [];

    if (typeof pdfjsLib !== 'undefined') {
        pdfjsLib.GlobalWorkerOptions.workerSrc =
            'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            const userDoc = await getDoc(doc(db, "users", user.uid));
            if (userDoc.exists()) {
                const role = userDoc.data().role || 'student';
                if (role === 'student') { window.location.href = 'homepage.html'; return; }
                if (role === 'admin' || role === 'program head' || userDoc.data().editPermission === true) isAdmin = true;
            }
        }
        loadSubjects();
    });

    // ── LOAD & RENDER ────────────────────────────────────────────────────────────
    async function loadSubjects() {
        try {
            const snap = await getDocs(query(collection(db, "courses"), orderBy("name")));
            allCourses = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            if (allCourses.length === 0 && isAdmin && migrateDataBtn) migrateDataBtn.style.display = 'block';
            else if (migrateDataBtn) migrateDataBtn.style.display = 'none';
            renderGrid(allCourses);
            showAdminControls();
        } catch (err) {
            console.error(err);
            curriculumGrid.innerHTML = '<div class="no-data">Error loading curriculum data.</div>';
        }
    }

    function showAdminControls() {
        if (!isAdmin) return;
        document.querySelectorAll('.admin-only').forEach(el => el.style.display = '');
    }

    function sortTerms(termNames) {
        return [...termNames].sort((a, b) => {
            const rank = s => {
                const u = s.toUpperCase();
                let yr = 0, sem = 0;
                if      (u.includes("FIRST YEAR")  || u.includes("G11")) yr = 1;
                else if (u.includes("SECOND YEAR") || u.includes("G12")) yr = 2;
                else if (u.includes("THIRD YEAR"))  yr = 3;
                else if (u.includes("FOURTH YEAR")) yr = 4;
                const m = u.match(/TERM\s*(\d)/);
                if (m) sem = parseInt(m[1]);
                else if (u.includes("FIRST TERM") || u.includes("FIRST SEM"))  sem = 1;
                else if (u.includes("SECOND TERM") || u.includes("SECOND SEM")) sem = 2;
                else if (u.includes("THIRD TERM") || u.includes("THIRD SEM"))  sem = 3;
                return yr * 10 + sem;
            };
            return rank(a) - rank(b);
        });
    }

    function isSHS(course) {
        if (!course.terms) return false;
        return Object.keys(course.terms).some(t => /G1[12]/i.test(t));
    }

    function renderGrid(courses) {
        curriculumGrid.innerHTML = '';
        if (!courses.length) {
            curriculumGrid.innerHTML = '<div class="no-data">No curriculum data available. Attach a PDF or Excel file to get started.</div>';
            return;
        }

        const shs = courses.filter(isSHS).sort((a, b) => a.name.localeCompare(b.name));
        const tertiary = courses.filter(c => !isSHS(c)).sort((a, b) => a.name.localeCompare(b.name));

        if (shs.length) {
            const shsLabel = document.createElement('div');
            shsLabel.className = 'curriculum-group-label';
            shsLabel.textContent = 'Senior High School';
            curriculumGrid.appendChild(shsLabel);
        }

        [...shs, ...tertiary].forEach((course, i) => {
            if (i === shs.length && tertiary.length) {
                const colLabel = document.createElement('div');
                colLabel.className = 'curriculum-group-label';
                colLabel.textContent = 'College / Tertiary';
                curriculumGrid.appendChild(colLabel);
            }
            const shsCourse = isSHS(course);
            const section = document.createElement('div');
            section.className = 'course-section collapsed';

            const title = document.createElement('h2');
            title.className = 'course-title';
            title.textContent = course.name;
            if (shsCourse) {
                const badge = document.createElement('span');
                badge.className = 'shs-badge';
                badge.textContent = 'Senior High';
                title.appendChild(badge);
            }
            title.onclick = () => section.classList.toggle('collapsed');
            section.appendChild(title);

            if (course.terms && typeof course.terms === 'object') {
                const termsWrap = document.createElement('div');
                termsWrap.className = 'terms-list';

                sortTerms(Object.keys(course.terms)).forEach(termName => {
                    const subjects = course.terms[termName];
                    if (!subjects || subjects.length === 0) return;

                    const termBlock = document.createElement('div');
                    termBlock.className = 'term-block';

                    const termHeader = document.createElement('div');
                    termHeader.className = 'term-header';
                    termHeader.textContent = termName;
                    termBlock.appendChild(termHeader);

                    // Table
                    const tableWrap = document.createElement('div');
                    tableWrap.className = 'table-wrap';
                    const table = document.createElement('table');
                    table.className = 'curriculum-table';

                    // thead
                    const thead = document.createElement('thead');
                    thead.innerHTML = `<tr>${COL_HEADERS.map(h => `<th>${h}</th>`).join('')}${isAdmin ? '<th></th>' : ''}</tr>`;
                    table.appendChild(thead);

                    // tbody
                    const tbody = document.createElement('tbody');
                    subjects.forEach((subj, idx) => {
                        const obj = typeof subj === 'object' ? subj : { description: subj };
                        const tr = document.createElement('tr');
                        tr.innerHTML = COLS.map(c => `<td>${obj[c] ?? ''}</td>`).join('');
                        if (isAdmin) {
                            const editTd = document.createElement('td');
                            const editBtn = document.createElement('button');
                            editBtn.className = 'edit-subj-btn';
                            editBtn.textContent = '✏️';
                            editBtn.onclick = () => openModal({ ...obj, courseId: course.id, termName, idx });
                            editTd.appendChild(editBtn);
                            tr.appendChild(editTd);
                        }
                        tbody.appendChild(tr);
                    });
                    table.appendChild(tbody);
                    tableWrap.appendChild(table);
                    termBlock.appendChild(tableWrap);
                    termsWrap.appendChild(termBlock);
                });
                section.appendChild(termsWrap);
            }
            curriculumGrid.appendChild(section);
        });
    }

    // ── MODAL (add/edit subject) ─────────────────────────────────────────────────
    const modal         = document.getElementById('subjectModal');
    const closeModalBtn = document.getElementById('closeModalBtn');
    const subjectForm   = document.getElementById('subjectForm');
    const modalTitle    = document.getElementById('modalTitle');
    const deleteSubjectBtn = document.getElementById('deleteSubjectBtn');

    // Build modal fields dynamically
    const modalFieldsContainer = document.getElementById('modalFields');
    if (modalFieldsContainer) {
        COLS.forEach((col, i) => {
            const div = document.createElement('div');
            div.className = 'space-y-2';
            div.innerHTML = `
                <label class="block text-sm font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider ml-1">${COL_HEADERS[i]}</label>
                <input type="text" id="field_${col}"
                    class="w-full bg-[var(--input-bg)] border-[2px] border-black p-3 rounded-2xl outline-none font-bold text-[var(--input-text)] placeholder:opacity-30"
                    placeholder="${COL_HEADERS[i]}">
            `;
            modalFieldsContainer.appendChild(div);
        });
    }

    let _editMeta = null; // { courseId, termName, idx }

    function openModal(data = null) {
        _editMeta = null;
        COLS.forEach(c => { const el = document.getElementById(`field_${c}`); if (el) el.value = ''; });
        if (data) {
            modalTitle.textContent = 'Edit Subject';
            _editMeta = { courseId: data.courseId, termName: data.termName, idx: data.idx };
            COLS.forEach(c => { const el = document.getElementById(`field_${c}`); if (el) el.value = data[c] ?? ''; });
            deleteSubjectBtn.style.display = 'block';
        } else {
            modalTitle.textContent = 'Add Subject';
            deleteSubjectBtn.style.display = 'none';
        }
        modal.style.display = 'flex';
    }

    if (addSubjectBtn) addSubjectBtn.addEventListener('click', () => openModal());
    closeModalBtn.addEventListener('click', () => { modal.style.display = 'none'; });

    subjectForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const obj = {};
        COLS.forEach(c => { obj[c] = (document.getElementById(`field_${c}`)?.value || '').trim(); });

        try {
            if (_editMeta) {
                const { courseId, termName, idx } = _editMeta;
                const courseDoc = await getDoc(doc(db, "courses", courseId));
                const terms = courseDoc.data().terms || {};
                terms[termName][idx] = obj;
                await setDoc(doc(db, "courses", courseId), { terms }, { merge: true });
            } else {
                // Add to GENERAL_CURRICULUM / General Subjects
                const courseId = 'GENERAL_CURRICULUM';
                const termName = 'General Subjects';
                const courseDoc = await getDoc(doc(db, "courses", courseId));
                const terms = courseDoc.exists() ? courseDoc.data().terms : {};
                if (!terms[termName]) terms[termName] = [];
                terms[termName].push(obj);
                await setDoc(doc(db, "courses", courseId), { name: 'GENERAL CURRICULUM', terms, updatedAt: new Date().toISOString() });
            }
            modal.style.display = 'none';
            loadSubjects();
        } catch (err) {
            console.error(err);
            showToast("Error saving subject", "error");
        }
    });

    deleteSubjectBtn.addEventListener('click', async () => {
        if (!_editMeta || !confirm('Delete this subject?')) return;
        try {
            const { courseId, termName, idx } = _editMeta;
            const courseDoc = await getDoc(doc(db, "courses", courseId));
            const terms = courseDoc.data().terms || {};
            terms[termName].splice(idx, 1);
            await setDoc(doc(db, "courses", courseId), { terms }, { merge: true });
            modal.style.display = 'none';
            loadSubjects();
        } catch (err) {
            showToast("Error deleting subject", "error");
        }
    });

    // ── PDF UPLOAD ───────────────────────────────────────────────────────────────
    if (pdfUpload) {
        pdfUpload.addEventListener('change', async (e) => {
            const files = Array.from(e.target.files);
            if (!files.length) return;
            showToast(`Processing ${files.length} PDF(s)... ⏳`, "info");
            for (const file of files) await processPDF(file);
            showToast("All PDFs processed! ✅", "success");
            e.target.value = '';
            loadSubjects();
        });
    }

    async function processPDF(file) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = async function () {
                try {
                    const pdf = await pdfjsLib.getDocument(new Uint8Array(this.result)).promise;
                    const courseName = file.name.replace(/\.pdf$/i, '').trim().toUpperCase();
                    const terms = {};

                    // Column x-ranges from actual PDF coordinates (same across all program PDFs)
                    const X = {
                        courseId:    [30,   82],
                        subjectArea: [82,   124],
                        catalogNo:   [124,  163],
                        offeringNo:  [163,  200],
                        description: [200,  348],
                        units:       [348,  380],
                        component:   [380,  426],
                        preRequisite:[426,  9999],
                    };

                    const TERM_RE = /(?:First|Second|Third|Fourth)\s+Year|G1[12]\s+Term\s+\d/i;
                    const HEADER_ROW_RE = /^Course\s+ID/i;
                    const TOTAL_ROW_RE  = /^\d{2,3}\.\d{2}$/;
                    const SECTION_CODE_RE = /^[A-Z]+-\d{2}-\d{2}\s/; // e.g. "ABM-20-01 G11 Term 1" — skip

                    function groupRows(items) {
                        const sorted = [...items].sort((a, b) => b.transform[5] - a.transform[5] || a.transform[4] - b.transform[4]);
                        const rows = []; let bucket = [], avgY = null;
                        sorted.forEach(it => {
                            const y = it.transform[5];
                            if (avgY === null || Math.abs(y - avgY) <= 6) {
                                bucket.push(it); avgY = bucket.reduce((s,x) => s + x.transform[5], 0) / bucket.length;
                            } else {
                                if (bucket.length) rows.push(bucket);
                                bucket = [it]; avgY = y;
                            }
                        });
                        if (bucket.length) rows.push(bucket);
                        rows.forEach(r => r.sort((a, b) => a.transform[4] - b.transform[4]));
                        return rows;
                    }

                    function getCol(row, [xMin, xMax]) {
                        return row
                            .filter(it => it.transform[4] >= xMin && it.transform[4] < xMax)
                            .map(it => it.str.trim())
                            .filter(Boolean)
                            .join(' ');
                    }

                    let currentTerm = null;
                    let pendingSubj = null;

                    function flushPending() {
                        if (pendingSubj && currentTerm) {
                            if (!terms[currentTerm]) terms[currentTerm] = [];
                            terms[currentTerm].push(pendingSubj);
                        }
                        pendingSubj = null;
                    }

                    for (let p = 1; p <= pdf.numPages; p++) {
                        const content = await (await pdf.getPage(p)).getTextContent();
                        const rows = groupRows(content.items);

                        for (const row of rows) {
                            const rowText = row.map(it => it.str.trim()).filter(Boolean).join(' ');
                            if (!rowText) continue;
                            if (HEADER_ROW_RE.test(rowText)) continue;
                            if (TOTAL_ROW_RE.test(rowText.trim())) { flushPending(); continue; }
                            if (/^CURRICULUM STRUCTURE/i.test(rowText)) continue;
                            if (SECTION_CODE_RE.test(rowText)) continue; // skip "ABM-20-01 G11 Term 1"

                            // Term header: has term info but no 6-digit Course ID
                            const hasCourseId = /^\d{6}/.test(getCol(row, X.courseId));
                            if (!hasCourseId && TERM_RE.test(rowText) && rowText.length < 100) {
                                flushPending();
                                currentTerm = rowText.replace(/\s{2,}/g, ' ').trim();
                                continue;
                            }

                            if (!currentTerm) continue;

                            const courseIdVal = getCol(row, X.courseId);
                            const descVal     = getCol(row, X.description);

                            if (!courseIdVal && !descVal) continue;

                            if (courseIdVal && /^\d{6}/.test(courseIdVal)) {
                                // New subject row
                                flushPending();
                                pendingSubj = {
                                    courseId:    courseIdVal,
                                    subjectArea: getCol(row, X.subjectArea),
                                    catalogNo:   getCol(row, X.catalogNo),
                                    offeringNo:  getCol(row, X.offeringNo),
                                    description: descVal,
                                    units:       getCol(row, X.units),
                                    component:   getCol(row, X.component),
                                    preRequisite:getCol(row, X.preRequisite),
                                };
                            } else if (pendingSubj && descVal) {
                                // Continuation row (wrapped text)
                                pendingSubj.description   += ' ' + descVal;
                                pendingSubj.preRequisite  += ' ' + getCol(row, X.preRequisite);
                                pendingSubj.component     += ' ' + getCol(row, X.component);
                            }
                        }
                        flushPending();
                    }

                    // Clean up whitespace
                    Object.values(terms).forEach(arr => arr.forEach(s => {
                        COLS.forEach(c => { if (s[c]) s[c] = s[c].replace(/\s+/g, ' ').trim(); });
                    }));

                    const docId = courseName.replace(/[^A-Z0-9]/g, '_');
                    await setDoc(doc(db, "courses", docId), { name: courseName, terms, updatedAt: new Date().toISOString() });
                    console.log(`[PDF] Saved "${courseName}":`, Object.entries(terms).map(([k,v]) => `${k}: ${v.length}`));
                    resolve();
                } catch (err) {
                    console.error(`[PDF] Error:`, err);
                    showToast(`Error processing ${file.name}`, "error");
                    resolve();
                }
            };
            reader.readAsArrayBuffer(file);
        });
    }

    // ── HARDCODED TEMPLATE STRUCTURE ─────────────────────────────────────────────
    const TEMPLATE_STRUCTURE = [
        { name: 'PROGRAM_CURRICULUM (ABM)', terms: ['ABM G11 Term 1','ABM G11 Term 2','ABM G12 Term 1','ABM G12 Term 2'] },
        { name: 'PROGRAM_CURRICULUM (AIS)', terms: ['BSAIS First Year, First Term','BSAIS First Year, Second Term','BSAIS Second Year, First Term','BSAIS Second Year, Second Term','BSAIS Third Year, First Term','BSAIS Third Year, Second Term','BSAIS Fourth Year, First Term','BSAIS Fourth Year, Second Term'] },
        { name: 'PROGRAM_CURRICULUM (CS)',  terms: ['BSCS First Year, First Term','BSCS First Year, Second Term','BSCS Second Year, First Term','BSCS Second Year, Second Term','BSCS Third Year, First Term','BSCS Third Year, Second Term','BSCS Fourth Year, First Term','BSCS Fourth Year, Second Term'] },
        { name: 'PROGRAM_CURRICULUM (HM)',  terms: ['BSHM First Year, First Term','BSHM First Year, Second Term','BSHM Second Year, First Term','BSHM Second Year, Second Term','BSHM Third Year, First Term','BSHM Third Year, Second Term','BSHM Fourth Year, First Term','BSHM Fourth Year, Second Term'] },
        { name: 'PROGRAM_CURRICULUM (IT)',  terms: ['BSIT First Year, First Term','BSIT First Year, Second Term','BSIT Second Year, First Term','BSIT Second Year, Second Term','BSIT Third Year, First Term','BSIT Third Year, Second Term','BSIT Fourth Year, First Term','BSIT Fourth Year, Second Term'] },
        { name: 'PROGRAM_CURRICULUM (ITM)', terms: ['MAWD G11 Term 1','MAWD G11 Term 2','MAWD G12 Term 1','MAWD G12 Term 2'] },
        { name: 'PROGRAM_CURRICULUM (STEM)',terms: ['STEM G11 Term 1','STEM G11 Term 2','STEM G12 Term 1','STEM G12 Term 2'] },
        { name: 'PROGRAM_CURRICULUM (TM)',  terms: ['BSTM First Year, First Term','BSTM First Year, Second Term','BSTM Second Year, First Term','BSTM Second Year, Second Term','BSTM Third Year, First Term','BSTM Third Year, Second Term','BSTM Fourth Year, First Term','BSTM Fourth Year, Second Term'] },
    ];
    const BLANK_ROWS = 15;

    function buildTemplateRows(prog) {
        const rows = [];
        prog.terms.forEach(termName => {
            rows.push([termName]);
            rows.push(COL_HEADERS);
            for (let i = 0; i < BLANK_ROWS; i++) rows.push(new Array(8).fill(''));
            rows.push([]);
        });
        return rows;
    }

    function buildWorkbook(perSheet) {
        const XLSX = window.XLSX;
        const wb = XLSX.utils.book_new();
        if (perSheet) {
            TEMPLATE_STRUCTURE.forEach(prog => {
                const rows = buildTemplateRows(prog);
                const ws = XLSX.utils.aoa_to_sheet(rows);
                styleSheet(ws);
                XLSX.utils.book_append_sheet(wb, ws, prog.name.substring(0, 31).replace(/[\\\/\?\*\[\]]/g, '_'));
            });
        } else {
            const allRows = [];
            TEMPLATE_STRUCTURE.forEach(prog => {
                allRows.push([prog.name]);
                allRows.push([]);
                buildTemplateRows(prog).forEach(r => allRows.push(r));
                allRows.push([]);
            });
            const ws = XLSX.utils.aoa_to_sheet(allRows);
            styleSheet(ws);
            XLSX.utils.book_append_sheet(wb, ws, 'All Courses');
        }
        return wb;
    }

    async function loadXLSX() {
        if (window.XLSX) return window.XLSX;
        await new Promise((res, rej) => {
            const s = document.createElement('script');
            s.src = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
            s.onload = res; s.onerror = rej;
            document.head.appendChild(s);
        });
        return window.XLSX;
    }

    function styleSheet(ws) {
        ws['!cols'] = [10,12,10,10,40,8,20,35].map(w => ({ wch: w }));
    }

    if (exportAllBtn) {
        exportAllBtn.addEventListener('click', async () => {
            await loadXLSX();
            const wb = buildWorkbook(false);
            window.XLSX.writeFile(wb, 'Curriculum_Template_All.xlsx');
        });
    }

    if (exportPerBtn) {
        exportPerBtn.addEventListener('click', async () => {
            await loadXLSX();
            const wb = buildWorkbook(true);
            window.XLSX.writeFile(wb, 'Curriculum_Template_PerCourse.xlsx');
        });
    }

    // ── EXCEL IMPORT ─────────────────────────────────────────────────────────────
    if (xlsxUpload) {
        xlsxUpload.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            showToast("Importing Excel... ⏳", "info");
            try {
                const XLSX = await loadXLSX();
                const data = await file.arrayBuffer();
                const wb = XLSX.read(data, { type: 'array' });

                for (const sheetName of wb.SheetNames) {
                    const ws = wb.Sheets[sheetName];
                    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
                    await importRows(rows, sheetName);
                }
                showToast("Import complete! ✅", "success");
                e.target.value = '';
                loadSubjects();
            } catch (err) {
                console.error(err);
                showToast("Import failed", "error");
            }
        });
    }

    async function importRows(rows, sheetName) {
        // Detect if "All Courses" sheet (has program name rows) or per-course sheet
        const terms = {};
        let currentTerm = null;
        let courseName = sheetName === 'All Courses' ? null : sheetName.toUpperCase();
        let currentCourseName = courseName;

        for (const row of rows) {
            const first = String(row[0] || '').trim();
            if (!first) continue;

            // Program header row (all courses sheet): non-header, non-term, single cell
            if (sheetName === 'All Courses' && row.filter(c => String(c).trim()).length === 1 && first !== COL_HEADERS[0]) {
                // Could be program name or term name — distinguish by content
                if (/Year|Term\s+\d|Semester|G1[12]/i.test(first)) {
                    currentTerm = first;
                    if (!terms[currentTerm]) terms[currentTerm] = [];
                } else {
                    // New program — save previous
                    if (currentCourseName && Object.keys(terms).length) {
                        await saveCourse(currentCourseName, { ...terms });
                        Object.keys(terms).forEach(k => delete terms[k]);
                    }
                    currentCourseName = first.toUpperCase();
                    currentTerm = null;
                }
                continue;
            }

            // Term header (single non-empty cell that looks like a term)
            if (row.filter(c => String(c).trim()).length === 1 && /Year|Term\s+\d|Semester|G1[12]/i.test(first)) {
                currentTerm = first;
                if (!terms[currentTerm]) terms[currentTerm] = [];
                continue;
            }

            // Column header row — skip
            if (first === COL_HEADERS[0]) continue;

            // Data row — must have at least description
            if (!currentTerm) continue;
            const obj = {};
            COLS.forEach((c, i) => { obj[c] = String(row[i] ?? '').trim(); });
            if (!obj.description && !obj.courseId) continue;
            terms[currentTerm].push(obj);
        }

        // Save last course
        if (currentCourseName && Object.keys(terms).length) {
            await saveCourse(currentCourseName, terms);
        }
    }

    async function saveCourse(name, terms) {
        const docId = name.replace(/[^A-Z0-9]/g, '_');
        await setDoc(doc(db, "courses", docId), { name, terms, updatedAt: new Date().toISOString() }, { merge: true });
    }

    // ── CLEAR ALL ────────────────────────────────────────────────────────────────
    if (clearAllBtn) {
        clearAllBtn.addEventListener('click', async () => {
            const snap = await getDocs(collection(db, "courses"));
            if (snap.empty) { showToast("No data to clear", "info"); return; }
            try {
                const { showArchiveOrDeleteModal } = await import('./archive-or-delete-modal.js');
                const action = await showArchiveOrDeleteModal(snap.size, 'courses');
                if (!action) return;
                if (action === 'archive') {
                    const { showArchiveModal } = await import('./archive-modal.js');
                    const reason = await showArchiveModal(snap.size, 'courses');
                    if (reason === null) return;
                    const { archiveItem } = await import('./archive-item.js');
                    for (const d of snap.docs) {
                        await archiveItem('curriculum', d.id, d.data(), reason);
                        await deleteDoc(doc(db, "courses", d.id));
                    }
                    showToast(`${snap.size} courses archived`, "success");
                } else if (action === 'delete') {
                    if (!confirm("⚠️ PERMANENTLY DELETE all curriculum? This CANNOT be undone!")) return;
                    await Promise.all(snap.docs.map(d => deleteDoc(doc(db, "courses", d.id))));
                    showToast("All curriculum deleted permanently", "success");
                }
                loadSubjects();
            } catch (err) {
                console.error(err);
                showToast("Failed to clear data", "error");
            }
        });
    }
});
