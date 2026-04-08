// React is loaded via CDN in HTML
const { useState, useEffect } = React;
const { createRoot } = ReactDOM;
const h = React.createElement; // Helper for creating elements

import { getApps, getApp, initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getFirestore, addDoc, collection, doc, updateDoc, setDoc, deleteDoc, arrayUnion, getDocs, getDoc, query, serverTimestamp, where } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { showToast, showConfirm } from "./js/utils/ui-utils.js";

console.log("Loading EventModal script...");

// ✅ PRE-INITIALIZE MODAL CONTAINER
const modalContainer = document.createElement('div');
modalContainer.id = 'react-modal-root';
document.body.appendChild(modalContainer);

const eventModalRoot = createRoot(modalContainer);

// ✅ EXPORT RENDER FUNCTION (Attached to window for non-module access)
window.renderEventModal = function (eventData = null) {
  console.log("renderEventModal executing inside eventmodal.js!");

  const modalEl = document.getElementById('createEventModal');
  if (modalEl) modalEl.style.display = 'flex';

  eventModalRoot.render(h(EventModal, {
    key: eventData ? eventData.createdAt : Date.now(),
    initialData: eventData,
    onClose: () => {
      if (modalEl) modalEl.style.display = 'none';
      eventModalRoot.render(null);
    }
  }));
};

window.renderEventModal.isReady = true;
console.log("renderEventModal exposed to window via assignment!");

const toMinutes = t => {
  if (!t) return 0;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

const convertTo24h = (timeStr) => {
  if (!timeStr || !timeStr.includes(' ')) return timeStr;
  const [time, period] = timeStr.split(' ');
  let [h, m] = time.split(':').map(Number);
  if (period === 'PM' && h < 12) h += 12;
  if (period === 'AM' && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

const overlaps = (t1, t2) => {
  // t1, t2 format: "07:30-09:00"
  const [start1, end1] = t1.split("-").map(toMinutes);
  const [start2, end2] = t2.split("-").map(toMinutes);
  return start1 < end2 && end1 > start2;
};

// DELETED CAMPUS_ROOMS

async function fetchAllRooms(db) {
  // Check if we can get rooms dynamically from firestore
  try {
    const snap = await getDocs(collection(db, "rooms"));
    if (!snap.empty) {
      const rooms = snap.docs.map(d => {
        const rawName = d.data().name || "";
        // Nuclear Sanitization (Catch "Room 2060%" even if dikit)
        const cleanName = rawName.replace(/\s*\|?\s*\d{1,3}%\s*(?:OCCUPIED)?$/i, "").trim();

        return {
          name: cleanName || rawName,
          type: d.data().type || "classroom"
        };
      });

      // Custom Numeric Sort
      return rooms.sort((a, b) => {
        const nameA = a.name.toUpperCase();
        const nameB = b.name.toUpperCase();

        const isRoomA = nameA.startsWith("ROOM");
        const isRoomB = nameB.startsWith("ROOM");

        // If both are "Room XXX", sort numerically
        if (isRoomA && isRoomB) {
          const numA = parseInt(nameA.replace(/\D/g, "")) || 0;
          const numB = parseInt(nameB.replace(/\D/g, "")) || 0;
          return numA - numB;
        }

        // Rooms always come before non-rooms (Labs, Kitchen, etc.)
        if (isRoomA && !isRoomB) return -1;
        if (!isRoomA && isRoomB) return 1;

        // Both are specialized, sort alphabetically
        return nameA.localeCompare(nameB);
      });
    }
  } catch (e) { console.warn("Firestore rooms fetch failed", e); }

  // Fallback map (Removed hardcoded list to favor Firestore exclusively)
  return [];
}

async function fetchRoomOccupancies(db, rooms) {
  try {
    const q = query(collection(db, "schedules"), where("status", "==", "published"));
    const snap = await getDocs(q);
    const roomMinutes = {};

    snap.forEach(doc => {
      const data = doc.data();
      // Skip events/overrides
      if (data.targetDate || data.originalId) return;

      (data.classes || []).forEach(c => {
        if (!c.room || !c.timeBlock) return;
        const block = parseBlockInMins(c.timeBlock);
        const duration = block.end - block.start;
        if (duration <= 0) return;

        const key = c.room.toLowerCase().replace(/room|rm|\s/g, "").trim();
        roomMinutes[key] = (roomMinutes[key] || 0) + duration;
      });
    });

    const TOTAL_WEEKLY_MINS = 4500;
    return rooms.map(r => {
      // Nuclear Sanitization
      const cleanLabel = r.name.replace(/\s*\|?\s*\d{1,3}%\s*(?:OCCUPIED)?$/i, "").trim();
      const key = cleanLabel.toLowerCase().replace(/room|rm|\s/g, "").trim();
      const mins = roomMinutes[key] || 0;
      const percentage = Math.min(100, Math.round((mins / TOTAL_WEEKLY_MINS) * 100));
      return { ...r, name: cleanLabel, occupancy: percentage };
    });
  } catch (err) {
    console.error("Occupancy fetch failed:", err);
    return rooms.map(r => ({ ...r, occupancy: 0 }));
  }
}

// Helper for duration calculation
function parseBlockInMins(block) {
  if (!block || !block.includes("-")) return { start: 0, end: 0 };
  const [s, e] = block.split("-");
  return { start: toMinutes(s), end: toMinutes(e) };
}

async function checkRoomConflicts(db, roomName, day, timeBlock) {
  try {
    // Fetch Section Names
    const sectionSnap = await getDocs(collection(db, "sections"));
    const sectionMap = {};
    sectionSnap.forEach(s => {
      sectionMap[s.id] = s.data().name;
    });

    const q = query(collection(db, "schedules"));
    const snap = await getDocs(q);

    let conflicts = [];

    for (const doc of snap.docs) {
      if (doc.id === "DEFAULT_SECTION") continue; // ✅ SKIP EVENTS
      const data = doc.data();
      if (!data.classes) continue;

      // Multi-Tier Section Name Resolution
      const looksLikeId = (s) => s && s.length > 15 && !s.includes(" ");
      let resolvedName = "Section";
      const potentialNames = [data.section, data.scheduleName, data.name, doc.id];

      // Tier 1: Map Resolution
      for (const p of potentialNames) {
        if (p && sectionMap[p]) {
          resolvedName = sectionMap[p];
          break;
        }
      }

      // Tier 2: Clean Names
      if (resolvedName === "Section") {
        for (const p of potentialNames) {
          if (p && !looksLikeId(p)) {
            resolvedName = p;
            break;
          }
        }
      }

      // Tier 3: Last Resort (Show what we have)
      if (resolvedName === "Section") {
        for (const p of potentialNames) {
          if (p) {
            resolvedName = p;
            break;
          }
        }
      }

      for (const c of data.classes) {
        const cRoom = (c.room || "").toLowerCase().trim();
        const tRoom = roomName.toLowerCase().trim();

        if (cRoom !== tRoom) continue;
        if (c.day !== day) continue;
        if (c.subject === "VACANT" || c.subject === "MARKED_VACANT") continue;

        if (overlaps(c.timeBlock, timeBlock)) {
          conflicts.push({
            ...c,
            scheduleId: doc.id,
            sectionName: resolvedName
          });
        }
      }
    }
    return conflicts;

  } catch (error) {
    console.error("Error checking conflicts:", error);
    return [];
  }
}

async function findVacantRooms(db, day, timeBlock, requiredType = null) {
  try {
    const allRooms = await fetchAllRooms(db);
    const occupiedRooms = new Set();

    const q = query(collection(db, "schedules"));
    const snap = await getDocs(q);

    snap.forEach(doc => {
      const data = doc.data();
      if (!data.classes) return;

      data.classes.forEach(c => {
        if (c.day !== day) return;
        if (c.subject === "VACANT" || c.subject === "MARKED_VACANT") return;
        if (overlaps(c.timeBlock, timeBlock)) {
          if (c.room) occupiedRooms.add(c.room.toLowerCase().trim());
        }
      });
    });

    let vacant = allRooms.filter(r => !occupiedRooms.has(r.name.toLowerCase().trim()));

    // Enforce Type Constraint
    if (requiredType) {
      vacant = vacant.filter(r => r.type === requiredType);
    }

    return vacant.map(r => r.name);
  } catch (error) {
    console.error("Error finding vacant rooms:", error);
    return [];
  }
}

async function moveClass(db, scheduleId, classData, newRoom, requesterName) {
  try {
    const schedRef = doc(db, "schedules", scheduleId);
    const schedSnap = await getDoc(schedRef);

    if (!schedSnap.exists()) return { success: false, message: "Schedule not found" };

    const data = schedSnap.data();
    let classes = data.classes || [];

    const idx = classes.findIndex(c =>
      c.day === classData.day &&
      c.timeBlock === classData.timeBlock &&
      c.subject === classData.subject &&
      c.room === classData.room
    );

    if (idx === -1) return { success: false, message: "Class not found in schedule" };

    const oldRoom = classes[idx].room;
    classes[idx].room = newRoom;

    await updateDoc(schedRef, { classes });

    const message = `Your class ${classData.subject} (${classData.day} ${classData.timeBlock}) has been moved from ${oldRoom} to ${newRoom} due to an event.`;
    // Targeted Notification logic 🎯
    const teacherUid = await getTeacherUidByName(db, classData.teacher);
    const sectionName = scheduleId;

    // 1. Notify Teacher
    if (teacherUid) {
      await createNotification(db, "Teacher", "Class Moved", message, requesterName, { targetUserId: teacherUid });
    }

    // 2. Notify Students
    if (sectionName && sectionName !== "DEFAULT_SECTION") {
      await createNotification(db, "Students", "Class Moved", message, requesterName, { targetSection: sectionName });
    }

    return { success: true };

  } catch (error) {
    console.error("Error moving class:", error);
    return { success: false, message: error.message };
  }
}

async function createNotification(db, recipient, title, message, sender = "System", targets = {}) {
  try {
    // Use serverTimestamp for notifications to ensure correct ordering
    const notifData = {
      recipient,
      title,
      message,
      sender,
      date: new Date().toISOString(),
      createdAt: serverTimestamp(),
      ...targets // Inject optional targetUserId, targetSection, etc.
    };

    await addDoc(collection(db, "notifications"), notifData);
    console.log(`Notification sent to ${recipient}`, targets);
    return true;
  } catch (err) {
    console.error("Notification failed:", err);
    return false;
  }
}

// Helper to find teacher UID by name 🔍
async function getTeacherUidByName(db, teacherName) {
  if (!teacherName || teacherName === "NA") return null;
  try {
    const q = query(collection(db, "users"), where("role", "==", "teacher"));
    const snap = await getDocs(q);
    let foundUid = null;
    snap.forEach(d => {
      const t = d.data();
      const n = t.username || t.displayName || t.fullName || (t.lastName ? `Teacher ${t.lastName}` : "Unknown Teacher");
      if (n.trim().toUpperCase() === teacherName.trim().toUpperCase()) {
        foundUid = d.id; // Corrected to use d.id for UID if it's the doc name
      }
    });
    return foundUid;
  } catch (e) {
    console.error("Teacher UID lookup failed:", e);
    return null;
  }
}

const firebaseConfig = {
  apiKey: "AIzaSyBrtJocBlfkPciYO7f8-7FwREE1tSF3VXU",
  authDomain: "schedsync-e60d0.firebaseapp.com",
  projectId: "schedsync-e60d0",
  storageBucket: "schedsync-e60d0.firebasestorage.app",
  messagingSenderId: "334140247575",
  appId: "1:334140247575:web:930b0c12e024e4defc5652",
  measurementId: "G-S59GL1W5Y2"
};

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

function SearchableDropdown({ options, value, onChange, placeholder, label }) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = options.filter(opt => {
    const val = typeof opt === 'object' ? opt.name : opt;
    return String(val).toLowerCase().includes(search.toLowerCase());
  });

  return h('div', { className: 'dg-field' },
    h('label', { className: 'dg-label' }, label),
    h('div', { className: 'dg-dropdown-wrapper' },
      h('input', {
        className: 'dg-input',
        value: isOpen ? search : (value || ''),
        onChange: e => {
          setSearch(e.target.value);
          setIsOpen(true);
        },
        onFocus: () => {
          setSearch('');
          setIsOpen(true);
        },
        onBlur: () => {
          setTimeout(() => setIsOpen(false), 200);
        },
        placeholder: placeholder || 'Search...'
      }),
      isOpen && h('div', { className: 'dg-suggestions' },
        filtered.length > 0 ? filtered.map(opt => {
          const isObj = typeof opt === 'object';
          const name = isObj ? opt.name : opt;
          const occ = isObj ? (opt.occupancy || 0) : null;
          const type = isObj ? (opt.type || 'Room') : null;

          return h('div', {
            key: name,
            className: `dg-suggestion-item ${isObj ? 'rich-suggestion' : ''}`,
            onMouseDown: (e) => {
              e.preventDefault();
              onChange(name);
              setSearch(name);
              setIsOpen(false);
            }
          },
            isObj ? [
              h('div', {
                className: 'occ-badge-mini',
                style: {
                  backgroundColor: occ > 70 ? '#ef4444' : occ > 30 ? '#f97316' : '#10b981',
                }
              }, `${occ}%`),
              h('div', { className: 'suggestion-text' },
                h('div', { className: 'suggestion-name' }, name),
                h('div', { className: 'suggestion-type' }, type)
              )
            ] : name
          );
        }) : h('div', { className: 'dg-suggestion-item no-results' }, 'No results found')
      )
    )
  );
}

function ClockPicker({ value, onChange, onClose, title }) {
  const [mode, setMode] = useState('hour'); // 'hour' or 'minute'
  const [tempHour, setTempHour] = useState(7);
  const [tempMinute, setTempMinute] = useState(0);
  const [tempPeriod, setTempPeriod] = useState('AM');
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (value && value.includes(':')) {
      const parts = value.split(' ');
      const timeParts = parts[0].split(':');
      setTempHour(parseInt(timeParts[0]));
      setTempMinute(parseInt(timeParts[1]));
      setTempPeriod(parts[1] || 'AM');
    } else {
      setTempHour(7);
      setTempMinute(0);
      setTempPeriod('AM');
    }
  }, [value]);

  const handleDialInteraction = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX || (e.touches && e.touches[0].clientX)) - rect.left - 105;
    const y = (e.clientY || (e.touches && e.touches[0].clientY)) - rect.top - 105;

    let angle = Math.atan2(y, x) * (180 / Math.PI) + 90;
    if (angle < 0) angle += 360;

    if (mode === 'hour') {
      let h = Math.round(angle / 30);
      if (h === 0) h = 12;
      setTempHour(h);
    } else {
      let m = Math.round(angle / 6);
      if (m === 60) m = 0;
      setTempMinute(m);
    }
  };

  const dialNumbers = mode === 'hour'
    ? [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
    : [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

  const dialAngle = mode === 'hour' ? (tempHour % 12) * 30 : tempMinute * 6;

  return h('div', { className: 'dg-time-overlay' },
    h('div', { className: 'dg-time-modal' },
      h('div', { className: 'dg-time-header' },
        h('div', { className: 'dg-label', style: { textAlign: 'left', marginBottom: '8px' } }, title || 'Select Time'),
        h('div', { className: 'dg-time-display' },
          h('div', {
            className: `dg-time-box ${mode === 'hour' ? 'active' : ''}`,
            onClick: () => setMode('hour')
          }, String(tempHour).padStart(2, '0')),
          h('div', { style: { fontSize: '40px', color: 'var(--dg-text-bright)', fontWeight: '700' } }, ':'),
          h('div', {
            className: `dg-time-box ${mode === 'minute' ? 'active' : ''}`,
            onClick: () => setMode('minute')
          }, String(tempMinute).padStart(2, '0')),
          h('div', { className: 'dg-time-period' },
            h('button', {
              className: `dg-period-btn ${tempPeriod === 'AM' ? 'active' : ''}`,
              onClick: () => setTempPeriod('AM')
            }, 'AM'),
            h('button', {
              className: `dg-period-btn ${tempPeriod === 'PM' ? 'active' : ''}`,
              onClick: () => setTempPeriod('PM')
            }, 'PM')
          )
        )
      ),
      h('div', {
        className: 'dg-clock-dial',
        onMouseDown: (e) => { setIsDragging(true); handleDialInteraction(e); },
        onMouseMove: (e) => { if (isDragging) handleDialInteraction(e); },
        onMouseUp: () => { if (isDragging) { setIsDragging(false); if (mode === 'hour') setTimeout(() => setMode('minute'), 400); } },
        onTouchStart: (e) => { setIsDragging(true); handleDialInteraction(e); },
        onTouchMove: (e) => { if (isDragging) handleDialInteraction(e); },
        onTouchEnd: () => { if (isDragging) { setIsDragging(false); if (mode === 'hour') setTimeout(() => setMode('minute'), 400); } }
      },
        h('div', { className: 'dg-dial-center' }),
        h('div', {
          className: 'dg-dial-hand',
          style: { transform: `rotate(${dialAngle}deg)` }
        },
          h('div', { className: 'dg-dial-indicator' },
            mode === 'hour' ? tempHour : String(tempMinute).padStart(2, '0')
          )
        ),
        dialNumbers.map((num, i) => {
          const angle = (i * 30 - 90) * (Math.PI / 180);
          const x = 105 + 80 * Math.cos(angle);
          const y = 105 + 80 * Math.sin(angle);
          const isActive = mode === 'hour'
            ? (num === tempHour || (num === 12 && tempHour === 0))
            : (num === Math.round(tempMinute / 5) * 5 % 60);

          return h('div', {
            key: num,
            className: `dg-dial-num ${isActive ? 'active' : ''}`,
            style: { left: `${x - 17}px`, top: `${y - 17}px` }
          }, mode === 'minute' ? String(num).padStart(2, '0') : num);
        })
      ),
      h('div', { style: { display: 'flex', gap: '10px', width: '100%', marginTop: '20px' } },
        h('button', {
          className: 'dg-btn',
          style: { backgroundColor: 'transparent', border: '1px solid var(--dg-border)', color: 'var(--dg-text-bright)', flex: 1, boxShadow: 'none' },
          onClick: onClose
        }, 'Cancel'),
        h('button', {
          className: 'dg-btn',
          style: { flex: 1 },
          onClick: () => onChange(`${tempHour}:${String(tempMinute).padStart(2, '0')} ${tempPeriod}`)
        }, 'OK')
      )
    )
  );
}

function EventModal({ onClose, initialData }) {
  const [step, setStep] = useState('form');
  const [eventType, setEventType] = useState('multi');

  // Form Data
  const [eventName, setEventName] = useState(initialData ? initialData.subject : '');
  const [eventDate, setEventDate] = useState(initialData ? initialData.date : '');
  const [endDate, setEndDate] = useState(initialData ? (initialData.endDate || initialData.date) : '');
  const [startTime, setStartTime] = useState(initialData ? (initialData.timeBlock ? initialData.timeBlock.split('-')[0] : '') : '');
  const [endTime, setEndTime] = useState(initialData ? (initialData.timeBlock ? initialData.timeBlock.split('-')[1] : '') : '');

  // Rooms
  const [allRooms, setAllRooms] = useState([]);
  const [selectedRooms, setSelectedRooms] = useState(() => {
    if (!initialData) return [];
    if (initialData.rooms) return initialData.rooms;
    // Fallback for old data
    const rs = [initialData.room];
    if (initialData.subRoom) rs.push(initialData.subRoom);
    return rs.filter(Boolean);
  });

  // Conflict State
  const [conflicts, setConflicts] = useState([]);
  const [vacantRooms, setVacantRooms] = useState([]);
  const [displacements, setDisplacements] = useState([]); // Array of {from, to, time, classInfo}
  const [isProcessing, setIsProcessing] = useState(false);

  // Picker State
  const [showPicker, setShowPicker] = useState(false);
  const [pickerTarget, setPickerTarget] = useState(null); // 'start' or 'end'
  const [pickerTitle, setPickerTitle] = useState('');

  useEffect(() => {
    fetchAllRooms(db).then(async rooms => {
      const enriched = await fetchRoomOccupancies(db, rooms);
      setAllRooms(enriched);
    });
  }, []);

  const getDatesInRange = (start, end) => {
    const dates = [];
    let current = new Date(start);
    const last = new Date(end);
    while (current <= last) {
      dates.push(new Date(current).toISOString().split('T')[0]);
      current.setDate(current.getDate() + 1);
    }
    return dates;
  };

  const getDayName = (dateStr) => {
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    return days[new Date(dateStr).getDay()];
  };

  const handleTypeSelect = (type) => {
    setEventType(type);
    setStep('form');
  };

  const getTimeBlock = () => {
    return `${convertTo24h(startTime)}-${convertTo24h(endTime)}`;
  };

  const checkAvailability = async () => {
    if (!eventName || !eventDate || !startTime || !endTime || selectedRooms.length === 0) {
      showToast("Please fill all fields and select at least one room", "error");
      return;
    }
    setIsProcessing(true);

    const targetEndDate = endDate || eventDate;
    const dates = getDatesInRange(eventDate, targetEndDate);
    const timeBlock = getTimeBlock();

    let allConflicts = [];

    for (const d of dates) {
      const dayName = getDayName(d);
      for (const room of selectedRooms) {
        const roomConflicts = await checkRoomConflicts(db, room, dayName, timeBlock);

        // Tag conflicts with the specific date they occur on
        roomConflicts.forEach(c => {
          c.conflictDate = d;
          allConflicts.push(c);
        });
      }
    }

    // Filter out initial data parts if editing
    if (initialData) {
      allConflicts = allConflicts.filter(c => c.createdAt !== initialData.createdAt && c.createdAt !== (initialData.createdAt + 1));
    }

    if (allConflicts.length > 0) {
      setConflicts(allConflicts);

      // AUTO DISPLACEMENT PREVIEW
      const autoDisplacements = [];
      const roomsData = await fetchAllRooms(db);

      for (const conf of allConflicts) {
        const sourceRoom = roomsData.find(r => r.name.toLowerCase().trim() === conf.room.toLowerCase().trim());
        const reqType = sourceRoom ? sourceRoom.type : "classroom";

        const dayName = getDayName(conf.conflictDate);
        const vacant = await findVacantRooms(db, dayName, timeBlock, reqType);

        const alreadyAssigned = new Set(autoDisplacements.filter(ad => getDayName(ad.date) === dayName).map(d => d.to));
        const trulyVacant = vacant.filter(v => !alreadyAssigned.has(v));

        if (trulyVacant.length > 0) {
          const assigned = trulyVacant[0];
          autoDisplacements.push({
            from: conf.room,
            to: assigned,
            date: conf.conflictDate,
            time: conf.timeBlock,
            subject: conf.subject,
            teacher: conf.teacher,
            section: conf.sectionName || conf.scheduleId,
            scheduleId: conf.scheduleId,
            classData: conf
          });
        } else {
          autoDisplacements.push({
            from: conf.room,
            to: `NO VACANT ${reqType.toUpperCase()} FOUND`,
            date: conf.conflictDate,
            time: conf.timeBlock,
            subject: conf.subject,
            teacher: conf.teacher,
            section: conf.sectionName || conf.scheduleId,
            scheduleId: conf.scheduleId,
            classData: conf,
            isBlocked: true
          });
        }
      }
      setDisplacements(autoDisplacements);
      setStep('conflict');
    } else {
      await saveEvent("published");
    }
    setIsProcessing(false);
  };

  const saveEvent = async (status = "published", finalDisplacements = []) => {
    try {
      const timeBlock = getTimeBlock();

      const startMins = toMinutes(convertTo24h(startTime));
      const endMins = toMinutes(convertTo24h(endTime));

      if (startMins >= endMins) {
        showToast("Invalid time range! End time must be after start time", "error");
        return;
      }
      if (startMins < 420 || endMins > 1140) {
        showToast("Events must be scheduled within 7:00 AM - 7:00 PM", "error");
        return;
      }

      const targetEndDate = endDate || eventDate;
      const commonFields = {
        timeBlock: timeBlock,
        subject: eventName,
        teacher: "EVENT",
        section: "EVENT_HOST",
        date: eventDate,
        endDate: targetEndDate,
        status: status,
        rooms: selectedRooms,
        userId: auth.currentUser ? auth.currentUser.uid : "ADMIN",
        creatorName: auth.currentUser ? (auth.currentUser.displayName || auth.currentUser.email) : "Admin",
        updatedAt: new Date().toISOString(),
        displacements: finalDisplacements
      };

      const primaryCreatedAt = initialData ? initialData.createdAt : new Date().getTime();
      const dates = getDatesInRange(eventDate, targetEndDate);
      const newClasses = [];

      // Create entries for each room on each day for occupancy tracking
      dates.forEach((d, dateIdx) => {
        const dayName = getDayName(d);
        selectedRooms.forEach((r, roomIdx) => {
          newClasses.push({
            ...commonFields,
            day: dayName,
            date: d,
            room: r,
            // Offset createdAt to keep them unique but grouped
            createdAt: primaryCreatedAt + (dateIdx * 100) + roomIdx
          });
        });
      });

      const defaultRef = doc(db, "schedules", "DEFAULT_SECTION");
      const snap = await getDoc(defaultRef);
      let existingClasses = snap.exists() ? (snap.data().classes || []) : [];

      if (initialData) {
        // Remove ALL pieces of this event (they share the same day/time/subject/etc logic or just ID prefix)
        // Safety: We use the primaryCreatedAt as a root.
        existingClasses = existingClasses.filter(c => Math.floor(c.createdAt / 1000) !== Math.floor(initialData.createdAt / 1000));
      }

      const finalClasses = [...existingClasses, ...newClasses];

      const updates = {
        classes: finalClasses,
        status: status,
        section: "EVENTS",
        userId: auth.currentUser ? auth.currentUser.uid : "ADMIN",
        updatedAt: serverTimestamp()
      };

      await setDoc(defaultRef, updates, { merge: true });

      if (status === "published") {
        const message = `A new event "${eventName}" has been scheduled at ${selectedRooms.join(', ')} from ${eventDate} to ${targetEndDate}.`;
        await createNotification(db, "ALL", "New Event Scheduled", message, auth.currentUser ? (auth.currentUser.displayName || auth.currentUser.email) : "System", {
          isAnnouncement: true,
          targetRole: "ALL",
          targetPage: `event.html?id=${primaryCreatedAt}`,
          linkedEventId: String(primaryCreatedAt)
        });

        // --- 📅 ACADEMIC CALENDAR SYNC ⚓ ---
        // Ensure event appears on Homepage Calendar dots
        const calQuery = query(collection(db, "academic_calendar"), where("eventRootId", "==", String(primaryCreatedAt)));
        const calSnap = await getDocs(calQuery);
        for (const d of calSnap.docs) { await deleteDoc(doc(db, "academic_calendar", d.id)); }

        const calAddPromises = dates.map(d => addDoc(collection(db, "academic_calendar"), {
          date: d,
          subject: eventName, // Homepage looks for .subject
          timeBlock: `${startTime}-${endTime}`, // Homepage looks for .timeBlock
          room: selectedRooms.join(', '), // Homepage looks for .room
          eventRootId: String(primaryCreatedAt),
          createdAt: serverTimestamp()
        }));
        await Promise.all(calAddPromises);
      }

      showToast(initialData ? "Event updated successfully!" : `Event ${status === 'draft' ? 'saved as draft' : 'created'} successfully!`, "success");
      setTimeout(() => {
        onClose();
        window.location.reload();
      }, 1500);
    } catch (err) {
      console.error("Error saving event:", err);
      showToast("Failed to save event", "error");
    }
  };

  const [manualSelection, setManualSelection] = useState({});

  const handleManualMoveConfirm = async () => {
    const manualDisplacements = conflicts.map((conf, index) => {
        const targetRoom = manualSelection[index];
        if (!targetRoom) return null;

        return {
            from: conf.room,
            to: targetRoom,
            date: conf.conflictDate,
            time: conf.timeBlock,
            subject: conf.subject,
            teacher: conf.teacher,
            section: conf.sectionName || conf.scheduleId,
            scheduleId: conf.scheduleId,
            classData: conf
        };
    }).filter(Boolean);

    if (manualDisplacements.length < conflicts.length) {
        showToast("Please select a room for all conflicting classes", "error");
        return;
    }

    setIsProcessing(true);
    await saveEvent("published", manualDisplacements);
    setIsProcessing(false);
  };

  const handleManualMove = async () => {
    // Populate available rooms for manual selection
    const day = getDayName(conflicts[0].conflictDate);
    const time = conflicts[0].timeBlock;
    const rooms = await findVacantRooms(db, day, time);
    setVacantRooms(rooms);
    setStep('manual-conflict');
  };

  const handleDisplaceAll = async () => {
    // Check if any block
    if (displacements.some(d => d.isBlocked)) {
      showToast("Cannot move all classes. Some don't have available rooms", "error");
      return;
    }

    setIsProcessing(true);
    const user = auth.currentUser;
    const userName = user ? (user.email || "Admin") : "System";

    try {
      showToast("Preparing virtual displacement mapping...", "info");

      // We are NO LONGER calling moveClass here to keep roomprofile published
      // Displacements are stored VIRTUALLY in the event document.

      for (const disp of displacements) {
        const teacherUid = await getTeacherUidByName(db, disp.classData.teacher);
        if (teacherUid) {
          const message = `[TEMPORARY RELOCATION] Your class ${disp.subject} has been moved from ${disp.from} to ${disp.to} for an event on ${eventDate}.`;
          await createNotification(db, "Teacher", "Class Relocated", message, userName, { targetUserId: teacherUid });
        }
      }

      showToast("Smart mapping complete! Publishing event", "success");
      await saveEvent("published", displacements);
    } catch (err) {
      console.error("Displacement failed:", err);
      showToast("Displacement failed. Some classes might not have moved", "error");
    }
    setIsProcessing(false);
  };

  const handleCancelConflicts = async () => {
    if (await showConfirm("Cancel All Conflicts?", "Are you sure? This will notify all teachers and students")) {
      setIsProcessing(true);
      const rName = auth.currentUser ? (auth.currentUser.displayName || auth.currentUser.email) : "Admin";
      for (const conf of conflicts) {
        const message = `Class ${conf.subject} in ${conf.room} was cancelled due to an event.`;
        const tUid = await getTeacherUidByName(db, conf.teacher);
        if (tUid) await createNotification(db, "Teacher", "Class Cancelled", message, rName, { targetUserId: tUid });
        if (conf.scheduleId && conf.scheduleId !== "DEFAULT_SECTION") {
          await createNotification(db, "Students", "Class Cancelled", message, rName, { targetSection: conf.scheduleId });
        }
      }
      await saveEvent("published");
      setIsProcessing(false);
    }
  };

  const removeEvent = async () => {
    if (!initialData) return;
    if (!await showConfirm("Delete Event?", "Are you sure you want to permanently delete this event? This action will move displaced classes back to their original rooms and cannot be undone")) return;

    setIsProcessing(true);
    try {
      const defaultRef = doc(db, "schedules", "DEFAULT_SECTION");
      const snap = await getDoc(defaultRef);
      if (snap.exists()) {
        let classes = snap.data().classes || [];
        const eventDoc = classes.find(c => c.createdAt === initialData.createdAt);
        const displaces = (eventDoc && eventDoc.displacements) ? eventDoc.displacements : [];

        // --- RECOVERY PHASE 🔙⚓ ---
        // Move classes back to their original rooms 🛡️
        if (displaces.length > 0) {
          console.log(`Recovering ${displaces.length} classes...`);
          for (const disp of displaces) {
            try {
              // moveClass(db, scheduleId, classData, newRoom, requesterName)
              // We move it from disp.to (current venue) back to disp.from (original)
              await moveClass(db, disp.section, { ...disp.classData, room: disp.to }, disp.from, "System (Event Removal)");
            } catch (err) {
              console.error("Back-move failed for:", disp.subject, err);
            }
          }
        }

        // Remove both main and sub event parts
        classes = classes.filter(c => c.createdAt !== initialData.createdAt && c.createdAt !== (initialData.createdAt + 1));
        await updateDoc(defaultRef, { classes });

        // --- 📅 CALENDAR CLEANUP ⚓ ---
        const calQuery = query(collection(db, "academic_calendar"), where("eventRootId", "==", String(initialData.createdAt)));
        const calSnap = await getDocs(calQuery);
        for (const d of calSnap.docs) { await deleteDoc(doc(db, "academic_calendar", d.id)); }

        showToast("Event deleted and classes returned to original rooms! 🔙✨", "success");
        setTimeout(() => {
          onClose();
          window.location.reload();
        }, 1000);
      }
    } catch (err) {
      console.error("Error removing event:", err);
      showToast("Failed to delete event", "error");
    }
    setIsProcessing(false);
  };

  /* ───────── RENDER ───────── */

  if (step === 'type-select') {
    return h('div', { className: 'create-event-page' },
      h('div', { className: 'dg-modal' },
        h('div', { className: 'dg-header' },
          h('div', { className: 'dg-title' }, initialData ? 'Edit Event' : 'Create New Event'),
          h('button', { className: 'dg-close-btn', onClick: onClose }, '✕')
        ),
        h('div', { className: 'dg-body' },
          h('div', { className: 'dg-label', style: { marginBottom: '2rem', textAlign: 'center', opacity: 0.8 } }, 'Step 1: Choose Event Scale'),
          h('div', { className: 'dg-type-grid' },
            h('div', {
              className: 'dg-type-card',
              onClick: () => handleTypeSelect('small')
            },
              h('div', { className: 'dg-type-icon' }, '📍'),
              h('div', { className: 'dg-type-name' }, 'Small Event'),
              h('div', { className: 'dg-type-desc' }, 'Single venue booking. Perfect for meetings or small classes.')
            ),
            h('div', {
              className: 'dg-type-card',
              onClick: () => handleTypeSelect('big')
            },
              h('div', { className: 'dg-type-icon' }, '🏢'),
              h('div', { className: 'dg-type-name' }, 'Big Event'),
              h('div', { className: 'dg-type-desc' }, 'Main + Sub venue. Ideal for seminars or large festivals.')
            )
          )
        )
      )
    );
  }

  if (step === 'conflict') {
    return h('div', { className: 'create-event-page' },
      h('div', { className: 'dg-modal', style: { maxWidth: '650px' } },
        h('div', { className: 'dg-header', style: { borderBottomColor: 'rgba(239, 68, 68, 0.3)' } },
          h('div', { className: 'dg-title', style: { color: '#f87171' } }, `${conflicts.length} Conflict(s) Detected`),
          h('button', { className: 'dg-close-btn', onClick: onClose }, '✕')
        ),
        h('div', { className: 'dg-body' },
          h('div', { className: 'dg-label', style: { marginBottom: '1rem' } }, 'Automated Displacement Mapping 🤖'),
          h('div', { className: 'dg-resolution-card', style: { padding: '1rem', background: 'rgba(0,0,0,0.05)', borderStyle: 'dashed' } },
            h('table', { style: { width: '100%', fontSize: '0.85rem', borderCollapse: 'separate', borderSpacing: '0 8px' } },
              h('thead', null,
                h('tr', { style: { textAlign: 'left', opacity: 0.6 } },
                  h('th', null, 'Time'),
                  h('th', null, 'Module/From'),
                  h('th', null, 'Target Room')
                )
              ),
              h('tbody', null,
                displacements.map((d, i) => h('tr', { key: i },
                  h('td', { style: { fontWeight: '700' } }, d.time),
                  h('td', null,
                    h('div', { style: { fontWeight: '600' } }, d.subject),
                    h('div', { style: { fontSize: '0.75rem', opacity: 0.7 } }, `${d.from} (${d.section})`)
                  ),
                  h('td', null,
                    h('div', { className: `px-3 py-1 rounded-lg border-2 ${d.isBlocked ? 'bg-red-500/20 border-red-500 text-red-500' : 'bg-green-500/20 border-green-500 text-green-500'}` },
                      d.to
                    )
                  )
                ))
              )
            )
          ),
          h('div', { className: 'dg-form', style: { marginTop: '1.5rem' } },
            h('button', {
              className: 'dg-btn',
              style: { width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', marginBottom: '10px' },
              onClick: handleDisplaceAll,
              disabled: isProcessing || displacements.some(d => d.isBlocked)
            }, h('span', { style: { fontSize: '1.2rem' } }, '🚀'), 'Execute Smart Move & Publish'),
            
            h('button', {
              className: 'dg-btn',
              style: { width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', backgroundColor: 'var(--dg-card-bg)', color: 'var(--dg-text-bright)' },
              onClick: handleManualMove,
              disabled: isProcessing
            }, h('span', { style: { fontSize: '1.2rem' } }, '✍️'), 'Manual Move (Skip Automapping)'),

            h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '10px' } },
              h('button', {
                className: 'dg-btn',
                style: { backgroundColor: 'transparent', border: '1px solid rgba(239, 68, 68, 0.4)', color: '#f87171', boxShadow: 'none' },
                onClick: handleCancelConflicts,
                disabled: isProcessing
              }, 'Cancel Classes'),
              h('button', {
                className: 'dg-btn',
                style: { backgroundColor: 'transparent', border: '1px solid var(--dg-border)', color: 'var(--dg-text-bright)', boxShadow: 'none' },
                onClick: () => setStep('form'),
                disabled: isProcessing
              }, 'Back to Form')
            )
          )
        )
      )
    );
  }

  return h('div', { className: 'create-event-page' },
    h('div', { className: 'dg-modal' },
      h('div', { className: 'dg-header' },
        h('div', { className: 'dg-title' }, initialData ? `Edit: ${eventName}` : 'New Event'),
        h('button', { className: 'dg-close-btn', onClick: onClose }, '✕')
      ),
      h('div', { className: 'dg-body' },
        h('form', { className: 'dg-form', onSubmit: e => e.preventDefault() },
          h('div', { className: 'dg-field' },
            h('label', { className: 'dg-label' }, 'Event Name'),
            h('input', {
              className: 'dg-input',
              value: eventName,
              onChange: e => setEventName(e.target.value),
              placeholder: 'Enter event name...',
              required: true
            })
          ),
          h('div', { className: 'dg-row' },
            h('div', { className: 'dg-field' },
              h('label', { className: 'dg-label' }, 'Start Date'),
              h('input', {
                type: 'date',
                className: 'dg-input',
                value: eventDate,
                onChange: e => {
                  setEventDate(e.target.value);
                  if (!endDate) setEndDate(e.target.value);
                },
                required: true
              })
            ),
            h('div', { className: 'dg-field' },
              h('label', { className: 'dg-label' }, 'End Date'),
              h('input', {
                type: 'date',
                className: 'dg-input',
                value: endDate || eventDate,
                onChange: e => setEndDate(e.target.value),
                min: eventDate,
                required: true
              })
            )
          ),
          h('div', { className: 'dg-row' },
            h('div', { className: 'dg-field' },
              h('label', { className: 'dg-label' }, 'Start Time'),
              h('button', {
                type: 'button',
                className: 'dg-input',
                style: { textAlign: 'left', cursor: 'pointer', background: 'var(--dg-card-bg)' },
                onClick: () => {
                  setPickerTarget('start');
                  setPickerTitle('Select Start Time');
                  setShowPicker(true);
                }
              }, startTime || '--:-- --')
            ),
            h('div', { className: 'dg-field' },
              h('label', { className: 'dg-label' }, 'End Time'),
              h('button', {
                type: 'button',
                className: 'dg-input',
                style: { textAlign: 'left', cursor: 'pointer', background: 'var(--dg-card-bg)' },
                onClick: () => {
                  setPickerTarget('end');
                  setPickerTitle('Select End Time');
                  setShowPicker(true);
                }
              }, endTime || '--:-- --')
            )
          ),
          h('div', { className: 'dg-field' },
            h('label', { className: 'dg-label' }, `Venues (${selectedRooms.length})`),
            h('div', { className: 'selected-rooms-list', style: { display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' } },
              selectedRooms.map((r, i) => h('div', {
                key: r,
                className: 'room-tag',
                style: { background: 'var(--dg-accent)', color: 'white', padding: '4px 12px', borderRadius: '20px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px', border: '2px solid black' }
              },
                r,
                h('button', {
                  type: 'button',
                  onClick: () => setSelectedRooms(selectedRooms.filter(room => room !== r)),
                  style: { fontWeight: 'bold' }
                }, '✕')
              ))
            ),
            h(SearchableDropdown, {
              options: allRooms.filter(r => !selectedRooms.includes(r.name)),
              value: '',
              onChange: (room) => {
                if (room && !selectedRooms.includes(room)) {
                  setSelectedRooms([...selectedRooms, room]);
                }
              },
              placeholder: 'Add venue...',
              label: ''
            })
          ),
          h('div', { className: 'dg-row', style: { marginTop: '1.5rem', gap: '12px' } },
            h('button', {
              type: 'button',
              className: 'dg-btn',
              style: { flex: 1 },
              onClick: checkAvailability,
              disabled: isProcessing
            }, isProcessing ? "Wait..." : (initialData ? "Save Changes ✨" : "Check & Publish ✨")),
            h('button', {
              type: 'button',
              className: 'dg-btn',
              style: { flex: 1, backgroundColor: 'var(--dg-card-bg)', color: 'var(--dg-text-bright)', border: '1px solid var(--dg-border)' },
              onClick: () => saveEvent("draft"),
              disabled: isProcessing
            }, "Draft 📄")
          ),
          initialData && h('div', { style: { display: 'flex', justifyContent: 'center', marginTop: '12px' } },
            h('button', {
              type: 'button',
              className: 'dg-btn',
              style: { width: 'fit-content', padding: '8px 24px', backgroundColor: 'transparent', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.2)', fontSize: '0.85rem' },
              onClick: removeEvent,
              disabled: isProcessing
            }, "🗑️ Remove Event")
          )
        ),
        showPicker && h(ClockPicker, {
          value: pickerTarget === 'start' ? startTime : endTime,
          title: pickerTitle,
          onClose: () => setShowPicker(false),
          onChange: (newTime) => {
            if (pickerTarget === 'start') setStartTime(newTime);
            else setEndTime(newTime);
            setShowPicker(false);
          }
        })
      )
    )
  );
}

const container = document.getElementById('react-modal-content');
const root = createRoot(container);
