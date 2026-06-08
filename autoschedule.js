import { db, auth } from "./js/config/firebase-config.js";
import {
  collection, getDocs, getDoc, addDoc, query,
  where, orderBy, doc, writeBatch
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { to12, toMin, parseBlock, overlaps } from "./js/utils/time-utils.js";
import { showToast } from "./js/utils/ui-utils.js";
import { initUserProfile } from "./userprofile.js";
import { initMobileNav } from "./js/ui/mobile-nav.js";

initMobileNav();
initUserProfile("#userProfile");

// ── Room type helpers ─────────────────────────────────────────────────────────
function requiredRoomType(component, description) {
  const c = (component || '').toLowerCase();
  const d = (description || '').toLowerCase();
  if (c.includes('computer') || c.includes('laboratory') ||
      /programming|computer|web development|animation|multimedia|mobile app|systems analysis/i.test(d))
    return 'laboratory';
  if (c.includes('kitchen'))  return 'kitchen';
  if (c.includes('bar'))      return 'bar';
  if (c.includes('pe') || c.includes('pathfit')) return 'other';
  return 'classroom';
}

function isComlab(room) {
  return room.type === 'laboratory' ||
    /LAB|MAC|CISCO|PROGRAMMING|COMLAB/i.test(room.name || '');
}

// ── State ─────────────────────────────────────────────────────────────────────
let allSections = [];
let allRooms    = [];
let allCourses  = [];
let allUsers    = []; // faculty
let selectedSections     = new Set();
let selectedRooms        = new Set(); // kept for backward compat
let selectedLectureRooms = new Set();
let currentUser = null;

document.addEventListener('DOMContentLoaded', async () => {
  // Auth guard — admin / program head only
  onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = 'index.html'; return; }
    currentUser = user;
    const udoc = await getDoc(doc(db, 'users', user.uid));
    const role = udoc.data()?.role || '';
    const hasPerm = udoc.data()?.editPermission === true;
    if (role !== 'admin' && role !== 'academic_head' && role !== 'program head' && !hasPerm) {
      window.location.href = 'homepage.html'; return;
    }
    // Show admin sidebar links
    const adminLinks = document.getElementById('adminSidebarLinks');
    if (adminLinks && (role === 'admin' || role === 'academic_head')) adminLinks.style.display = 'block';

    await Promise.all([loadSections(), loadRooms(), loadCourses(), loadFaculty()]);
    setupUI();
    setupAiPrompt();
  });
});

async function loadSections() {
  const snap = await getDocs(query(collection(db, 'sections'), orderBy('name')));
  allSections = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  renderSections();
}

async function loadRooms() {
  const snap = await getDocs(query(collection(db, 'rooms'), orderBy('name')));
  allRooms = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  renderRooms();
}

async function loadCourses() {
  const snap = await getDocs(query(collection(db, 'courses'), orderBy('name')));
  allCourses = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  const sel = document.getElementById('courseSelect');
  allCourses.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id; opt.textContent = c.name;
    sel.appendChild(opt);
  });
}

async function loadFaculty() {
  const snap = await getDocs(query(collection(db, 'users'), where('role', 'in', ['teacher', 'program head'])));
  allUsers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

function renderSections() {
  const list = document.getElementById('sectionsList');
  if (!allSections.length) { list.innerHTML = '<div style="color:#94a3b8;font-size:.85rem;">No sections found.</div>'; return; }
  list.innerHTML = '';
  allSections.forEach(s => {
    const chip = document.createElement('div');
    chip.className = 'section-chip';
    chip.innerHTML = `<input type="checkbox" value="${s.id}"> <span>${s.name || s.id}</span>`;
    const cb = chip.querySelector('input');
    cb.addEventListener('change', () => {
      if (cb.checked) { selectedSections.add(s.id); chip.classList.add('selected'); }
      else { selectedSections.delete(s.id); chip.classList.remove('selected'); }
    });
    list.appendChild(chip);
  });
}

function renderRooms() {
  // Rooms are loaded into allRooms; lecture room UI is rendered on term selection
}

function renderLectureRooms() {
  const list = document.getElementById('lectureRoomsList');
  const lectureRooms = allRooms.filter(r => !isComlab(r));
  if (!lectureRooms.length) {
    list.innerHTML = '<div style="color:#94a3b8;font-size:.85rem;">No lecture rooms found.</div>';
    return;
  }
  list.innerHTML = '';
  selectedLectureRooms.clear();
  lectureRooms.forEach(r => {
    const chip = document.createElement('div');
    chip.className = 'room-chip';
    const label = `${r.name}${r.subtype ? ` (${r.subtype})` : ''}`;
    chip.innerHTML = `<input type="checkbox" value="${r.id}" checked> <span>${label}</span>`;
    const cb = chip.querySelector('input');
    selectedLectureRooms.add(r.id); // default all selected
    chip.classList.add('selected');
    cb.addEventListener('change', () => {
      if (cb.checked) { selectedLectureRooms.add(r.id); chip.classList.add('selected'); }
      else { selectedLectureRooms.delete(r.id); chip.classList.remove('selected'); }
    });
    list.appendChild(chip);
  });
}

function setupUI() {
  // Day chips
  document.querySelectorAll('.day-chip').forEach(chip => {
    chip.addEventListener('click', () => chip.classList.toggle('selected'));
  });

  // Course → Term cascade
  document.getElementById('courseSelect').addEventListener('change', () => {
    const courseId = document.getElementById('courseSelect').value;
    const termSel = document.getElementById('termSelect');
    termSel.innerHTML = '<option value="">— Select Term —</option>';
    document.getElementById('subjectPreview').textContent = '';
    if (!courseId) return;
    const course = allCourses.find(c => c.id === courseId);
    if (!course?.terms) return;
    const sorted = sortTerms(Object.keys(course.terms));
    sorted.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t; opt.textContent = t;
      termSel.appendChild(opt);
    });
  });

  document.getElementById('termSelect').addEventListener('change', () => {
    updateSubjectPreview();
    const termName = document.getElementById('termSelect').value;
    const card = document.getElementById('lectureRoomCard');
    if (termName) {
      card.style.display = 'block';
      renderLectureRooms();
    } else {
      card.style.display = 'none';
    }
  });

  // Auto-teacher toggle label
  document.getElementById('autoTeacherToggle').addEventListener('change', (e) => {
    document.getElementById('autoTeacherLabel').textContent =
      e.target.checked ? 'ON — teachers auto-assigned from faculty list' : 'OFF — all slots will be VACANT';
  });

  // Lecture room select all / clear
  document.getElementById('selectAllLectureRooms').addEventListener('click', () => {
    document.querySelectorAll('#lectureRoomsList input[type=checkbox]').forEach(cb => {
      cb.checked = true; cb.closest('.room-chip').classList.add('selected');
      selectedLectureRooms.add(cb.value);
    });
  });
  document.getElementById('clearAllLectureRooms').addEventListener('click', () => {
    document.querySelectorAll('#lectureRoomsList input[type=checkbox]').forEach(cb => {
      cb.checked = false; cb.closest('.room-chip').classList.remove('selected');
    });
    selectedLectureRooms.clear();
  });

  document.getElementById('generateBtn').addEventListener('click', generate);
}

function updateSubjectPreview() {
  const courseId = document.getElementById('courseSelect').value;
  const termName = document.getElementById('termSelect').value;
  const preview  = document.getElementById('subjectPreview');
  if (!courseId || !termName) { preview.textContent = ''; return; }
  const course = allCourses.find(c => c.id === courseId);
  const subjects = course?.terms?.[termName] || [];
  preview.textContent = `${subjects.length} subject(s) in this term`;
}

function sortTerms(names) {
  return [...names].sort((a, b) => {
    const rank = s => {
      const u = s.toUpperCase();
      let yr = 0, sem = 0;
      if      (u.includes('FIRST YEAR')  || u.includes('G11')) yr = 1;
      else if (u.includes('SECOND YEAR') || u.includes('G12')) yr = 2;
      else if (u.includes('THIRD YEAR'))  yr = 3;
      else if (u.includes('FOURTH YEAR')) yr = 4;
      const m = u.match(/TERM\s*(\d)/);
      if (m) sem = parseInt(m[1]);
      else if (u.includes('FIRST TERM') || u.includes('FIRST SEM'))   sem = 1;
      else if (u.includes('SECOND TERM') || u.includes('SECOND SEM')) sem = 2;
      else if (u.includes('THIRD TERM') || u.includes('THIRD SEM'))   sem = 3;
      return yr * 10 + sem;
    };
    return rank(a) - rank(b);
  });
}

// ── MAIN GENERATOR ────────────────────────────────────────────────────────────
async function generate() {
  const schedName    = document.getElementById('schedName').value.trim();
  const startTimeVal = document.getElementById('startTime').value;
  const endTimeVal   = document.getElementById('endTime').value;
  const courseId     = document.getElementById('courseSelect').value;
  const termName     = document.getElementById('termSelect').value;
  const autoTeacher  = document.getElementById('autoTeacherToggle').checked;
  const selectedDays = [...document.querySelectorAll('.day-chip.selected')].map(c => c.dataset.day);

  if (!schedName)             return showToast('Enter a schedule name', 'error');
  if (!selectedSections.size) return showToast('Select at least one section', 'error');
  if (!selectedDays.length)   return showToast('Select at least one day', 'error');
  if (!startTimeVal || !endTimeVal) return showToast('Set start and end time', 'error');
  if (!courseId || !termName) return showToast('Select a program and term', 'error');
  if (!selectedLectureRooms.size && !allRooms.some(r => isComlab(r)))
    return showToast('Select at least one lecture room', 'error');

  const startMin = toMin(startTimeVal);
  const endMin   = toMin(endTimeVal);
  if (startMin >= endMin) return showToast('End time must be after start time', 'error');

  const btn = document.getElementById('generateBtn');
  btn.disabled = true; btn.textContent = '⏳ Generating...';

  // Reset teacher load counters so each run starts fresh
  allUsers.forEach(u => { u._assignedMins = 0; });

  try {
    const course   = allCourses.find(c => c.id === courseId);
    const rawSubjs = course?.terms?.[termName] || [];
    // Sort longest subjects first — fills tight slots before easy ones
    const subjects = rawSubjs
      .map(s => typeof s === 'object' ? s : { description: s, units: '1.00', component: '' })
      .sort((a, b) => (parseFloat(b.units) || 1) - (parseFloat(a.units) || 1));

    // Separate rooms: lecture rooms (user-selected) and comlabs (auto-used for programming)
    const lectureRooms = allRooms.filter(r => selectedLectureRooms.has(r.id));
    const comlabRooms  = allRooms.filter(r => isComlab(r));

    // ── 1. Load ALL existing schedules ONCE ──────────────────────────────────
    const pubSnap = await getDocs(query(collection(db, 'schedules'), where('status', '==', 'published')));

    // ── 2. Build global busy map ──────────────────────────────────────────────
    // busyByDay[day] = [ {start, end, room, teacher} ]
    const busyByDay = {};
    const addBusy = (day, s, e, room, teacher) => {
      const d = day.toLowerCase();
      if (!busyByDay[d]) busyByDay[d] = [];
      busyByDay[d].push({ start: s, end: e, room: room?.toUpperCase() || null, teacher: teacher?.toUpperCase() || null });
    };

    pubSnap.docs.forEach(d => {
      const data = d.data();
      if (data.section === 'EVENTS' || data.section === 'EVENT_HOST' || d.id === 'DEFAULT_SECTION') return;
      (data.classes || []).forEach(c => {
        const subj = (c.subject || '').trim().toUpperCase();
        if (!subj || subj === 'VACANT' || subj === 'MARKED_VACANT') return;
        const b = parseBlock(c.timeBlock);
        if (!b.start || !b.end) return;
        addBusy(c.day || '', b.start, b.end,
          c.room    !== 'NA' ? c.room    : null,
          c.teacher !== 'NA' ? c.teacher : null);
      });
    });

    const conflicts = (day, s, e, key, val) =>
      (busyByDay[day.toLowerCase()] || []).some(b => b[key] === val?.toUpperCase() && s < b.end && b.start < e);

    // Find next free slot on a day for a specific section (avoids section double-booking)
    function nextFreeForSection(day, from, sectionBusy) {
      const global = busyByDay[day.toLowerCase()] || [];
      const local  = sectionBusy[day.toLowerCase()] || [];
      let cursor = from, changed = true;
      while (changed) {
        changed = false;
        for (const b of [...global, ...local]) {
          if (cursor >= b.start && cursor < b.end) { cursor = b.end; changed = true; }
        }
      }
      return cursor;
    }

    // ── 3. Schedule all sections, batch-write at the end ─────────────────────
    const sectionDocs = allSections.filter(s => selectedSections.has(s.id));
    const unscheduled = [];
    let totalScheduled = 0;
    const batch = writeBatch(db);

    for (const section of sectionDocs) {
      const classes = [];
      // Per-section busy map — prevents same-section double-booking
      const sectionBusy = {};
      const markSection = (day, s, e) => {
        const d = day.toLowerCase();
        if (!sectionBusy[d]) sectionBusy[d] = [];
        sectionBusy[d].push({ start: s, end: e });
      };
      // Track minutes used per day for load balancing
      const dayLoad = {};
      selectedDays.forEach(d => { dayLoad[d] = 0; });

      for (const subj of subjects) {
        const desc        = subj.description || '';
        const units       = parseFloat(subj.units) || 1;
        const component   = subj.component || '';
        const roomType    = requiredRoomType(component, desc);
        const durationMin = Math.round(units * 60);

        // Pick days sorted by least load first (load balancing)
        const sortedDays = [...selectedDays].sort((a, b) => dayLoad[a] - dayLoad[b]);

        let placed = false;
        for (const day of sortedDays) {
          const cursor  = nextFreeForSection(day, startMin, sectionBusy);
          const slotEnd = cursor + durationMin;
          if (slotEnd > endMin) continue;

          // Room: programming subjects use comlab; others use lecture rooms
          let room;
          if (roomType === 'laboratory') {
            room = comlabRooms.find(r => !conflicts(day, cursor, slotEnd, 'room', r.name));
          } else {
            room = lectureRooms.find(r => !conflicts(day, cursor, slotEnd, 'room', r.name));
          }
          if (!room) continue;

          // Teacher: find free teacher who teaches this subject
          let teacherName = 'NA';
          if (autoTeacher) {
            // Sort teachers by fewest hours assigned (load balance)
            const teacher = allUsers
              .filter(u => {
                const uSubjs = u.subjects || [];
                return uSubjs.some(s => (typeof s === 'string' ? s : s.description || '').toLowerCase() === desc.toLowerCase());
              })
              .sort((a, b) => (a._assignedMins || 0) - (b._assignedMins || 0))
              .find(u => {
                const name = u.username || u.displayName || u.fullName || u.name || u.email;
                return name && !conflicts(day, cursor, slotEnd, 'teacher', name);
              });
            if (teacher) {
              teacherName = teacher.username || teacher.displayName || teacher.fullName || teacher.name || teacher.email;
              teacher._assignedMins = (teacher._assignedMins || 0) + durationMin;
            }
          }

          classes.push({ day, timeBlock: `${to12(cursor)}-${to12(slotEnd)}`, subject: desc, teacher: teacherName, room: room.name });
          addBusy(day, cursor, slotEnd, room.name, teacherName !== 'NA' ? teacherName : null);
          markSection(day, cursor, slotEnd);
          dayLoad[day] += durationMin;
          placed = true;
          break;
        }

        if (!placed) unscheduled.push(`${desc} (${section.name || section.id})`);
      }

      totalScheduled += classes.length;
      const newRef = doc(collection(db, 'schedules'));
      batch.set(newRef, {
        userId: currentUser.uid,
        section: section.name || section.id,
        scheduleName: schedName,
        startTime: to12(startMin),
        endTime: to12(endMin),
        classes,
        selectedDays,
        updated: new Date().toDateString(),
        status: 'draft',
        scheduleType: 'regular',
        author: currentUser.displayName || currentUser.email || 'Unknown',
        createdAt: Date.now(),
        autoGenerated: true
      });
    }

    await batch.commit();

    const msg = `✅ ${sectionDocs.length} section(s), ${totalScheduled} slots scheduled${unscheduled.length ? ` — ${unscheduled.length} couldn't fit` : ', no conflicts'}`;
    showToast(msg, 'success');
    if (unscheduled.length) console.warn('Unscheduled:', unscheduled);

    setTimeout(() => {
      window.location.href = `editpage.html?name=${encodeURIComponent(schedName)}`;
    }, 1800);

  } catch (err) {
    console.error(err);
    showToast('Generation failed: ' + err.message, 'error');
    btn.disabled = false; btn.textContent = '⚡ Generate Schedule';
  }
}


const GROQ_PROXY_URL = '/api/groq';

// ── AI PROMPT HANDLER ─────────────────────────────────────────────────────────
function setupAiPrompt() {
  const aiBtn    = document.getElementById('aiGenerateBtn');
  const aiStatus = document.getElementById('aiStatus');

  aiBtn.addEventListener('click', async () => {
    const prompt = document.getElementById('aiPromptInput').value.trim();
    if (!prompt) return showToast('Type a prompt first', 'error');
    if (!allSections.length) return showToast('Sections not loaded yet', 'error');

    aiBtn.disabled = true;
    aiBtn.textContent = '⏳ Thinking...';
    aiStatus.style.display = 'block';
    aiStatus.style.color = '#64748b';
    aiStatus.textContent = 'Asking Groq...';

    try {
      const sectionNames = allSections.map(s => s.name || s.id);
      const roomNames    = allRooms.map(r => r.name);

      // Get currently selected items from the form
      const selectedSectionNames = allSections
        .filter(s => selectedSections.has(s.id))
        .map(s => s.name || s.id);
      const selectedRoomNames = allRooms
        .filter(r => selectedLectureRooms.has(r.id))
        .map(r => r.name);

      // Collect all subjects from all courses/terms
      const allSubjects = [];
      allCourses.forEach(c => {
        Object.values(c.terms || {}).forEach(termSubjs => {
          termSubjs.forEach(s => {
            const desc = typeof s === 'object' ? s.description : s;
            if (desc && !allSubjects.includes(desc)) allSubjects.push(desc);
          });
        });
      });

      // Get subjects from currently selected course+term if any
      const selCourseId = document.getElementById('courseSelect').value;
      const selTermName = document.getElementById('termSelect').value;
      const selCourse   = allCourses.find(c => c.id === selCourseId);
      const termSubjects = selCourse?.terms?.[selTermName]
        ?.map(s => typeof s === 'object' ? s.description : s)
        .filter(Boolean) || [];

      const contextSection = selectedSectionNames.length ? selectedSectionNames : sectionNames.slice(0, 10);
      const contextRooms   = selectedRoomNames.length ? selectedRoomNames : roomNames.slice(0, 20);
      const contextSubjects = termSubjects.length ? termSubjects : allSubjects.slice(0, 40);

      const systemPrompt = `You are a school timetable generator. Output ONLY a raw JSON object, no markdown, no explanation, no extra text.

CONTEXT:
- Sections to use: ${JSON.stringify(contextSection)}
- Rooms to use: ${JSON.stringify(contextRooms)}
- Available subjects: ${JSON.stringify(contextSubjects)}

STRICT RULES:
1. timeBlock format MUST be exactly: "HH:MM AM-HH:MM PM" e.g. "11:30 AM-02:30 PM", "09:30 AM-11:30 AM"
2. Use 12-hour format with AM/PM, zero-padded hours
3. Breaks = skip entirely, no entry for that time
4. VACANT = subject "VACANT", teacher "NA", room ""
5. "major" = 3-hour block of a subject from available subjects
6. "club" = subject "CLUB"
7. "homeroom" = subject "HOMEROOM"
8. Each class entry covers the FULL duration (e.g. a 3-hour major is ONE entry, not three 1-hour entries)
9. teacher = "NA" unless explicitly named
10. Pick room from rooms list or use ""
11. Use the FIRST section from the sections list as sectionName

EXAMPLE OUTPUT for "Monday 11:30am-1pm subject1, break 1pm-2pm, 2pm-4pm subject2":
{"schedName":"My Schedule","sectionName":"Section A","classes":[
  {"day":"Monday","timeBlock":"11:30 AM-01:00 PM","subject":"SUBJECT1","teacher":"NA","room":""},
  {"day":"Monday","timeBlock":"02:00 PM-04:00 PM","subject":"SUBJECT2","teacher":"NA","room":""}
]}

Now generate for this request:
${prompt}`;

      const res = await fetch(GROQ_PROXY_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            messages: [{ role: 'user', content: systemPrompt }],
            temperature: 0.1,
            response_format: { type: 'json_object' }
          })
        }
      );

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || `HTTP ${res.status}`);
      }

      const data    = await res.json();
      const raw     = data.choices?.[0]?.message?.content || '';
      const jsonStr = raw.replace(/```json|```/g, '').trim();
      const parsed  = JSON.parse(jsonStr);

      if (!parsed.classes?.length) throw new Error('Groq returned no classes');

      aiStatus.textContent = `✅ Generated ${parsed.classes.length} slots — saving...`;
      aiStatus.style.color = '#16a34a';

      // Find matching section
      const section = allSections.find(s =>
        (s.name || s.id).toLowerCase() === (parsed.sectionName || '').toLowerCase()
      ) || allSections[0];

      await addDoc(collection(db, 'schedules'), {
        userId: currentUser.uid,
        section: section.name || section.id,
        scheduleName: parsed.schedName || 'AI Generated Schedule',
        classes: parsed.classes,
        selectedDays: [...new Set(parsed.classes.map(c => c.day))],
        updated: new Date().toDateString(),
        status: 'draft',
        scheduleType: 'regular',
        author: currentUser.displayName || currentUser.email || 'Unknown',
        createdAt: Date.now(),
        autoGenerated: true,
        aiGenerated: true
      });

      showToast(`✅ AI schedule saved as draft!`, 'success');
      aiBtn.disabled = false;
      aiBtn.textContent = '🤖 Generate with AI';
      setTimeout(() => {
        window.location.href = `editpage.html?name=${encodeURIComponent(parsed.schedName || 'AI Generated Schedule')}`;
      }, 1500);

    } catch (err) {
      console.error('[AI]', err);
      aiStatus.textContent = `❌ ${err.message}`;
      aiStatus.style.color = '#dc2626';
      showToast('AI error: ' + err.message, 'error');
      aiBtn.disabled = false;
      aiBtn.textContent = '🤖 Generate with AI';
    }
  });
}
