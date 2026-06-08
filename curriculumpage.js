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
    const attachFiles     = document.getElementById('attachFiles');
    const clearAllBtn    = document.getElementById('clearAllBtn');
    const exportPerBtn   = document.getElementById('exportPerBtn');
    const migrateDataBtn = document.getElementById('migrateDataBtn');
    const downloadTemplateBtn = document.getElementById('downloadTemplateBtn');

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
                if (role === 'admin' || role === 'academic_head' || role === 'program head' || userDoc.data().editPermission === true) isAdmin = true;
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
            initCurriculumFilter();
        } catch (err) {
            console.error(err);
            curriculumGrid.innerHTML = '<div class="no-data">Error loading curriculum data.</div>';
        }
    }

    function showAdminControls() {
        if (!isAdmin) return;
        document.querySelectorAll('.admin-only').forEach(el => el.style.display = '');
    }

    // ── FILTER / SEARCH ──────────────────────────────────────────────────────────
    function initCurriculumFilter() {
        const searchInput   = document.getElementById('curriculumSearch');
        const suggestions   = document.getElementById('curriculumSuggestions');
        const clearBtn      = document.getElementById('curriculumClearFilter');
        if (!searchInput) return;

        function buildSuggestions(q) {
            const lq = q.toLowerCase();
            const items = new Set();
            allCourses.forEach(c => {
                if (c.name.toLowerCase().includes(lq)) items.add(c.name);
                Object.keys(c.terms || {}).forEach(t => {
                    if (t.toLowerCase().includes(lq)) items.add(t);
                });
            });
            return [...items].slice(0, 10);
        }

        function applyFilter(q) {
            const lq = q.trim().toLowerCase();
            clearBtn.style.display = lq ? '' : 'none';
            if (!lq) { renderGrid(allCourses); return; }

            const filtered = allCourses
                .map(c => {
                    // Course name matches → show all terms
                    if (c.name.toLowerCase().includes(lq)) return c;
                    // Term name matches → show only matching terms
                    const matchedTerms = {};
                    Object.entries(c.terms || {}).forEach(([t, subjs]) => {
                        if (t.toLowerCase().includes(lq)) matchedTerms[t] = subjs;
                        else {
                            // Subject description matches
                            const matchedSubjs = subjs.filter(s => {
                                const desc = typeof s === 'object' ? s.description : s;
                                return (desc || '').toLowerCase().includes(lq);
                            });
                            if (matchedSubjs.length) matchedTerms[t] = matchedSubjs;
                        }
                    });
                    if (Object.keys(matchedTerms).length) return { ...c, terms: matchedTerms };
                    return null;
                })
                .filter(Boolean);

            renderGrid(filtered);
        }

        searchInput.addEventListener('input', () => {
            const q = searchInput.value;
            applyFilter(q);
            const hits = buildSuggestions(q);
            if (hits.length && q.trim()) {
                suggestions.innerHTML = hits.map(h =>
                    `<div style="padding:10px 14px;cursor:pointer;font-weight:700;font-size:.88rem;border-bottom:1px solid #e2e8f0;" 
                         onmousedown="event.preventDefault()" 
                         onclick="this.closest('#curriculumSuggestions').dispatchEvent(new CustomEvent('pick',{detail:'${h.replace(/'/g,"\\'")}'}))">
                        ${h}
                    </div>`
                ).join('');
                suggestions.style.display = 'block';
            } else {
                suggestions.style.display = 'none';
            }
        });

        suggestions.addEventListener('pick', e => {
            searchInput.value = e.detail;
            suggestions.style.display = 'none';
            applyFilter(e.detail);
            clearBtn.style.display = '';
        });

        searchInput.addEventListener('blur', () => setTimeout(() => suggestions.style.display = 'none', 150));
        searchInput.addEventListener('focus', () => searchInput.value && searchInput.dispatchEvent(new Event('input')));

        clearBtn.addEventListener('click', () => {
            searchInput.value = '';
            suggestions.style.display = 'none';
            clearBtn.style.display = 'none';
            renderGrid(allCourses);
        });
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

        function makeTable(subjects, courseId, termName) {
            const tableWrap = document.createElement('div');
            tableWrap.className = 'table-wrap';
            const table = document.createElement('table');
            table.className = 'curriculum-table';
            const thead = document.createElement('thead');
            thead.innerHTML = `<tr>${COL_HEADERS.map(h => `<th>${h}</th>`).join('')}${isAdmin ? '<th></th>' : ''}</tr>`;
            table.appendChild(thead);
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
                    editBtn.onclick = () => openModal({ ...obj, courseId, termName, idx });
                    editTd.appendChild(editBtn);
                    tr.appendChild(editTd);
                }
                tbody.appendChild(tr);
            });
            table.appendChild(tbody);
            tableWrap.appendChild(table);
            return tableWrap;
        }

        function renderSHSCourse(course) {
            const section = document.createElement('div');
            section.className = 'course-section collapsed';

            const title = document.createElement('h2');
            title.className = 'course-title';
            title.textContent = course.name;
            const badge = document.createElement('span');
            badge.className = 'shs-badge';
            badge.textContent = 'Senior High';
            title.appendChild(badge);
            title.onclick = () => section.classList.toggle('collapsed');
            section.appendChild(title);

            const sortedTerms = sortTerms(Object.keys(course.terms || {}));
            // Group into Term 1 / Term 2 buckets
            const buckets = { 'Term 1': [], 'Term 2': [] };
            sortedTerms.forEach(t => {
                const n = t.match(/Term\s*(\d)/i);
                const key = n ? `Term ${n[1]}` : 'Term 1';
                if (!buckets[key]) buckets[key] = [];
                buckets[key].push(t);
            });
            const bucketKeys = Object.keys(buckets).filter(k => buckets[k].length);

            const body = document.createElement('div');
            body.className = 'terms-list';

            // Pill buttons
            const pills = document.createElement('div');
            pills.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;';
            const contentArea = document.createElement('div');

            function showBucket(key) {
                pills.querySelectorAll('button').forEach(b => {
                    b.style.background = b.dataset.key === key ? '#005BAB' : '#f1f5f9';
                    b.style.color = b.dataset.key === key ? '#fff' : '#000';
                });
                contentArea.innerHTML = '';
                buckets[key].forEach(termName => {
                    const subjects = course.terms[termName];
                    if (!subjects?.length) return;
                    const hdr = document.createElement('div');
                    hdr.className = 'term-header';
                    hdr.textContent = termName;
                    contentArea.appendChild(hdr);
                    contentArea.appendChild(makeTable(subjects, course.id, termName));
                });
            }

            bucketKeys.forEach((key, i) => {
                const btn = document.createElement('button');
                btn.dataset.key = key;
                btn.textContent = key;
                btn.style.cssText = 'padding:6px 18px;border:2.5px solid #000;border-radius:20px;font-weight:800;font-size:.85rem;cursor:pointer;transition:all .15s;';
                btn.onclick = () => showBucket(key);
                pills.appendChild(btn);
                if (i === 0) showBucket(key);
            });

            body.appendChild(pills);
            body.appendChild(contentArea);
            section.appendChild(body);
            return section;
        }

        function renderTertiaryCourse(course) {
            const section = document.createElement('div');
            section.className = 'course-section collapsed';

            const title = document.createElement('h2');
            title.className = 'course-title';
            title.textContent = course.name;
            title.onclick = () => section.classList.toggle('collapsed');
            section.appendChild(title);

            const sortedTerms = sortTerms(Object.keys(course.terms || {}));
            // Group by year
            const YEARS = ['First Year', 'Second Year', 'Third Year', 'Fourth Year'];
            const yearBuckets = {};
            sortedTerms.forEach(t => {
                const yr = YEARS.find(y => t.toUpperCase().includes(y.toUpperCase())) || 'Other';
                if (!yearBuckets[yr]) yearBuckets[yr] = {};
                const m = t.match(/(\w+)\s+Term/i);
                const termKey = m ? `${m[1]} Term` : t;
                if (!yearBuckets[yr][termKey]) yearBuckets[yr][termKey] = [];
                yearBuckets[yr][termKey].push(t);
            });
            const yearKeys = [...YEARS.filter(y => yearBuckets[y]), ...Object.keys(yearBuckets).filter(y => !YEARS.includes(y))];

            const body = document.createElement('div');
            body.className = 'terms-list';

            // Year tabs
            const yearTabs = document.createElement('div');
            yearTabs.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;border-bottom:2.5px solid #000;padding-bottom:8px;';
            // Term pills (secondary)
            const termPills = document.createElement('div');
            termPills.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px;';
            const contentArea = document.createElement('div');

            let activeYear = null;

            function showTerms(yearKey, termKey) {
                termPills.innerHTML = '';
                const terms = yearBuckets[yearKey] || {};
                const termKeys = Object.keys(terms);
                termKeys.forEach((tk, i) => {
                    const btn = document.createElement('button');
                    btn.dataset.term = tk;
                    btn.textContent = tk;
                    btn.style.cssText = 'padding:5px 14px;border:2px solid #000;border-radius:20px;font-weight:800;font-size:.82rem;cursor:pointer;transition:all .15s;';
                    btn.onclick = () => {
                        termPills.querySelectorAll('button').forEach(b => {
                            b.style.background = b.dataset.term === tk ? '#005BAB' : '#f1f5f9';
                            b.style.color = b.dataset.term === tk ? '#fff' : '#000';
                        });
                        contentArea.innerHTML = '';
                        terms[tk].forEach(termName => {
                            const subjects = course.terms[termName];
                            if (!subjects?.length) return;
                            const hdr = document.createElement('div');
                            hdr.className = 'term-header';
                            hdr.textContent = termName;
                            contentArea.appendChild(hdr);
                            contentArea.appendChild(makeTable(subjects, course.id, termName));
                        });
                    };
                    termPills.appendChild(btn);
                    if (i === 0 || tk === termKey) btn.click();
                });
            }

            function showYear(yearKey) {
                activeYear = yearKey;
                yearTabs.querySelectorAll('button').forEach(b => {
                    const active = b.dataset.year === yearKey;
                    b.style.background = active ? '#1e293b' : 'transparent';
                    b.style.color = active ? '#fff' : '#000';
                    b.style.borderBottom = active ? '3px solid #005BAB' : '3px solid transparent';
                });
                showTerms(yearKey, null);
            }

            yearKeys.forEach((yk, i) => {
                const btn = document.createElement('button');
                btn.dataset.year = yk;
                btn.textContent = yk;
                btn.style.cssText = 'padding:7px 16px;border:none;border-bottom:3px solid transparent;font-weight:800;font-size:.88rem;cursor:pointer;background:transparent;transition:all .15s;border-radius:8px 8px 0 0;';
                btn.onclick = () => showYear(yk);
                yearTabs.appendChild(btn);
                if (i === 0) setTimeout(() => showYear(yk), 0);
            });

            body.appendChild(yearTabs);
            body.appendChild(termPills);
            body.appendChild(contentArea);
            section.appendChild(body);
            return section;
        }

        if (shs.length) {
            const lbl = document.createElement('div');
            lbl.className = 'curriculum-group-label';
            lbl.textContent = 'Senior High School';
            curriculumGrid.appendChild(lbl);
            shs.forEach(c => curriculumGrid.appendChild(renderSHSCourse(c)));
        }
        if (tertiary.length) {
            const lbl = document.createElement('div');
            lbl.className = 'curriculum-group-label';
            lbl.textContent = 'College / Tertiary';
            curriculumGrid.appendChild(lbl);
            tertiary.forEach(c => curriculumGrid.appendChild(renderTertiaryCourse(c)));
        }
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

    // ── ATTACH FILES (PDF + Excel) ────────────────────────────────────────────────
    if (attachFiles) {
        attachFiles.addEventListener('change', async (e) => {
            const files = Array.from(e.target.files);
            if (!files.length) return;
            const pdfs  = files.filter(f => f.name.toLowerCase().endsWith('.pdf'));
            const excels = files.filter(f => /\.(xlsx|xls)$/i.test(f.name));
            if (pdfs.length)  showToast(`Processing ${pdfs.length} PDF(s)... ⏳`, "info");
            if (excels.length) showToast(`Importing ${excels.length} Excel file(s)... ⏳`, "info");
            for (const f of pdfs)   await processPDF(f);
            for (const f of excels) await processExcel(f);
            showToast("Done! ✅", "success");
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

    if (exportPerBtn) {
        exportPerBtn.addEventListener('click', async () => {
            await loadXLSX();
            const wb = buildWorkbook(true);
            window.XLSX.writeFile(wb, 'Curriculum_Template_PerCourse.xlsx');
        });
    }

    if (downloadTemplateBtn) {
        downloadTemplateBtn.addEventListener('click', async () => {
            const courseName = prompt('Course name (e.g. BS Information Technology):');
            if (!courseName?.trim()) return;
            const type = prompt('Type: SHS or Tertiary?')?.trim().toUpperCase();
            if (!type) return;
            const isSHSType = type.startsWith('S');

            const XLSX = await loadXLSX();
            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.aoa_to_sheet([]);
            const rows = [];

            const HEADERS = COL_HEADERS;
            const GUIDE   = ['e.g. 001259','e.g. CORE','e.g. 1010','e.g. 22','e.g. Oral Communication','e.g. 1.00','e.g. Lecture','e.g. None'];
            const BLANK   = Array(8).fill('');

            const terms = isSHSType
                ? ['G11 Term 1','G11 Term 2','G12 Term 1','G12 Term 2']
                : ['First Year - 1st Term','First Year - 2nd Term','Second Year - 1st Term','Second Year - 2nd Term',
                   'Third Year - 1st Term','Third Year - 2nd Term','Fourth Year - 1st Term','Fourth Year - 2nd Term'];

            rows.push([courseName.trim().toUpperCase(), ...Array(7).fill('')]);
            terms.forEach(term => {
                rows.push([term, ...Array(7).fill('')]);
                rows.push(HEADERS);
                rows.push(GUIDE);
                for (let i = 0; i < 8; i++) rows.push([...BLANK]);
                rows.push(['','','','','TOTAL UNITS','','','']);
                rows.push(Array(8).fill(''));
            });

            XLSX.utils.sheet_add_aoa(ws, rows);
            ws['!cols'] = [10,12,10,10,40,8,20,35].map(w => ({ wch: w }));
            XLSX.utils.book_append_sheet(wb, ws, courseName.trim().toUpperCase().slice(0,31));
            XLSX.writeFile(wb, `${courseName.trim()}_template.xlsx`);
        });
    }

    async function processExcel(file) {
        try {
            const XLSX = await loadXLSX();
            const data = await file.arrayBuffer();
            const wb = XLSX.read(data, { type: 'array' });
            for (const sheetName of wb.SheetNames) {
                const ws = wb.Sheets[sheetName];
                const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
                await importRows(rows, sheetName);
            }
        } catch (err) {
            console.error(err);
            showToast(`Import failed: ${file.name}`, "error");
        }
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
