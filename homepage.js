import { db, auth, analytics } from "./js/config/firebase-config.js";
import {
  onSnapshot,
  query,
  collection,
  where,
  orderBy,
  limit,
  deleteDoc,
  doc,
  getDoc,
  writeBatch,
  getDocs
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { initUniversalSearch } from "./search.js";
import { initUserProfile } from "./userprofile.js";
import { syncStaticRooms } from './room-sync.js';
import { initMobileNav } from "./js/ui/mobile-nav.js";
import { showToast, showConfirm } from "./js/utils/ui-utils.js";


// Global state for announcement selection 🧐
let selectedAnnouncements = new Set();

document.addEventListener("DOMContentLoaded", () => {
  console.log("SchedSync: Initializing Homepage Components...");
  try {
    initUserProfile("#userProfile");
  } catch (e) {
    console.error("SchedSync: Profile Init Failed:", e);
  }

  try {
    initUniversalSearch(db);
  } catch (e) {
    console.error("SchedSync: Search Init Failed:", e);
  }

  try {
    initMobileNav();
  } catch (e) {
    console.error("SchedSync: Mobile Nav Init Failed:", e);
  }

  const greetingEl = document.getElementById("greeting");

  onAuthStateChanged(auth, async (user) => {
    if (user) {
      console.log("SchedSync: User authenticated:", user.uid);
      const name =
        user.displayName ||
        (user.email ? user.email.split("@")[0] : "User");

      if (greetingEl) {
        greetingEl.textContent = `Good Day, ${name}!`;
      }

      let role = localStorage.getItem('userRole') || 'student';
      let hasPerm = localStorage.getItem('editPermission') === 'true';

      // Sync Role 🛡️
      try {
        const udoc = await getDoc(doc(db, "users", user.uid));
        if (udoc.exists()) {
          const userData = udoc.data();
          role = userData.role || 'student';
          hasPerm = userData.editPermission === true;
          localStorage.setItem('userRole', role);
          localStorage.setItem('editPermission', String(hasPerm));
        }
      } catch (e) {
        console.error("Sync error:", e);
      }

      // Initialize widgets with direct data 🚀
      console.log("SchedSync: Initializing Widgets for role:", role);
      initAnnouncements(role);
      initDraftSchedules(user.uid, role, hasPerm);
      initEventCalendar();
      setupAnnouncementActions(role);
    } else {
      console.log("SchedSync: No user authenticated.");
      greetingEl.textContent = "Good Day!";
      // Clear loading states if no user
      ['announcements-list', 'drafts-list', 'events-list'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = '<div class="widget-empty">Please log in to view data.</div>';
      });
    }
  });
});

function setupAnnouncementActions(role) {
  const isAdmin = role === 'admin';
  if (!isAdmin) return;

  const selectAllBtn = document.getElementById("selectAllAnnouncements");
  const deleteSelBtn = document.getElementById("deleteSelectedAnnouncements");

  if (selectAllBtn) {
    selectAllBtn.style.display = "flex";
    selectAllBtn.addEventListener("click", () => {
      const isChecking = !selectAllBtn.classList.contains("checked");
      selectAllBtn.classList.toggle("checked", isChecking);

      const allCheckboxes = document.querySelectorAll("#announcements-list .circle-checkbox");
      allCheckboxes.forEach(cb => {
        const id = cb.dataset.id;
        cb.classList.toggle("checked", isChecking);
        cb.closest(".announcement-item")?.classList.toggle("checked", isChecking);
        if (isChecking) selectedAnnouncements.add(id);
        else selectedAnnouncements.delete(id);
      });
      updateAnnouncementActionVisibility();
    });
  }

  if (deleteSelBtn) {
    deleteSelBtn.addEventListener("click", async () => {
      if (selectedAnnouncements.size === 0) return;

      const isSelectAll = selectAllBtn && selectAllBtn.classList.contains("checked");
      const confirmTitle = isSelectAll ? "Delete All Announcements?" : "Delete Selected?";
      const confirmMsg = isSelectAll
        ? "Are you sure you want to delete ALL announcements? 🗑️⚠️"
        : `Are you sure you want to delete the ${selectedAnnouncements.size} selected announcements?`;

      if (await window.showConfirm(confirmTitle, confirmMsg)) {
        const batch = writeBatch(db);
        selectedAnnouncements.forEach(id => {
          batch.delete(doc(db, "notifications", id));
        });
        await batch.commit();
        selectedAnnouncements.clear();
        if (selectAllBtn) selectAllBtn.classList.remove("checked");
        updateAnnouncementActionVisibility();
        showToast("Announcements deleted! 🗑️✨", "success");
      }
    });
  }
}

function updateAnnouncementActionVisibility() {
  const deleteSelBtn = document.getElementById("deleteSelectedAnnouncements");
  if (deleteSelBtn) {
    deleteSelBtn.style.display = selectedAnnouncements.size > 0 ? "flex" : "none";
  }
}

/* ───────── WIDGET LOGIC 🛡️🕰️ ───────── */

function initAnnouncements(role) {
  const list = document.getElementById('announcements-list');
  const badge = document.getElementById('announcement-badge');
  if (!list) return;

  // Fetch all and filter in memory 🕰️
  const q = collection(db, "notifications");

  onSnapshot(q, (snap) => {
    list.innerHTML = '';

    const allNotes = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    // Loosen filter to catch more "Updates" 🛡️
    const items = allNotes
      .filter(d => {
        const title = (d.title || "").toUpperCase();
        const msg = (d.message || "").toUpperCase();
        return d.isAnnouncement === true ||
          d.isAnnouncement === "true" ||
          d.type === "announcement" ||
          title.includes("EVENT") ||
          title.includes("SCHEDULE") ||
          title.includes("UPDATE") ||
          title.includes("NOTICE") ||
          msg.includes("SCHEDULE") ||
          msg.includes("EVENT");
      })
      .sort((a, b) => {
        const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (Number(a.createdAt) || 0);
        const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (Number(b.createdAt) || 0);
        return timeB - timeA;
      })
      .slice(0, 20);

    if (items.length === 0 && allNotes.length > 0) {
      const fallback = allNotes.slice(0, 5);
      if (window.initHeroCarousel) window.initHeroCarousel(fallback);
    } else if (items.length > 0) {
      if (window.initHeroCarousel) window.initHeroCarousel(items);
    }

    if (items.length === 0) {
      list.innerHTML = '<div class="widget-empty">No new announcements for now.</div>';
      return;
    }

    const isAdmin = role === 'admin';

    items.forEach(d => {
      const item = document.createElement('div');
      item.className = 'announcement-item';

      const isChecked = selectedAnnouncements.has(d.id);
      item.className = `announcement-item ${isChecked ? 'checked' : ''}`;
      const checkbox = isAdmin ? `<div class="circle-checkbox ${isChecked ? 'checked' : ''}" data-id="${d.id}"></div>` : '';

      if (d.targetPage) {
        item.style.cursor = 'pointer';
        item.onclick = (e) => {
          if (e.target.classList.contains('announcement-delete') || e.target.classList.contains('circle-checkbox')) return;
          window.location.href = d.targetPage;
        };
      }

      const dateObj = d.createdAt?.toDate ? d.createdAt.toDate() : (d.createdAt ? new Date(d.createdAt) : new Date());
      const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      const deleteBtn = isAdmin ? `<div class="announcement-delete" onclick="deleteAnnouncement('${d.id}')" title="Delete Announcement (Global)">✕</div>` : '';

      const isEvent = (d.title || "").toUpperCase().includes('EVENT');

      item.innerHTML = `
        ${checkbox}
        ${deleteBtn}
        <div class="announcement-icon">${isEvent ? '📅' : '📢'}</div>
        <div class="announcement-content">
          <div class="announcement-title">${d.title || 'Notification'}</div>
          <div class="announcement-msg">${d.message || ''}</div>
          <div class="announcement-meta">${timeStr} • Published by: ${d.sender || 'System'}</div>
        </div>
      `;

      // Add selection listener ⚪
      const cbElement = item.querySelector('.circle-checkbox');
      if (cbElement) {
        cbElement.addEventListener('click', (e) => {
          e.stopPropagation();
          const checked = cbElement.classList.toggle('checked');
          item.classList.toggle('checked', checked);
          if (checked) selectedAnnouncements.add(d.id);
          else {
            selectedAnnouncements.delete(d.id);
            document.getElementById('selectAllAnnouncements')?.classList.remove('checked');
          }
          updateAnnouncementActionVisibility();
        });
      }

      list.appendChild(item);
    });

  }, (err) => {
    console.error("Announcements listener failed:", err);
    list.innerHTML = '<div class="widget-empty" style="color:#f87171">Failed to load announcements ❌</div>';
  });
}

async function deleteAnnouncement(id) {
  if (await window.showConfirm("Delete Announcement?", "Are you sure you want to delete this announcement for EVERYONE?")) {
    try {
      await deleteDoc(doc(db, "notifications", id));
    } catch (e) {
      console.error("Delete failed:", e);
    }
  }
}
window.deleteAnnouncement = deleteAnnouncement;

function initDraftSchedules(uid, role, hasPerm) {
  const list = document.getElementById('drafts-list');
  if (!list) return;

  const q = collection(db, "schedules");

  onSnapshot(q, (snap) => {
    list.innerHTML = '';
    const groups = {};
    snap.docs.forEach(docSnap => {
      const data = docSnap.data();
      const status = data.status || "draft";
      if (status !== "draft") return;
      if (docSnap.id === "DEFAULT_SECTION" || data.section === "EVENTS" || data.section === "EVENT_HOST") return;

      // Show only own drafts
      const docUid = String(data.userId || "").trim();
      const currUid = String(uid || "").trim();
      if (docUid !== currUid) return;

      // --- targetDate Auto-Vanishing Logic ---
      if (data.targetDate) {
        const todayStr = new Date().toISOString().split('T')[0];
        if (data.targetDate < todayStr) return; // Expired
        if (data.targetDate > todayStr) return; // Not for today
      }

      const name = (data.scheduleName || "Untitled").trim();
      if (!groups[name]) {
        groups[name] = {
          name: name,
          sections: [],
          updated: data.updated || "Recently",
          updatedMillis: data.updatedAt?.toMillis ? data.updatedAt.toMillis() : 0
        };
      }

      const sectionName = data.section || "N/A";
      if (!groups[name].sections.includes(sectionName)) {
        groups[name].sections.push(sectionName);
      }

      const currentMillis = data.updatedAt?.toMillis ? data.updatedAt.toMillis() : 0;
      if (currentMillis > groups[name].updatedMillis) {
        groups[name].updatedMillis = currentMillis;
        groups[name].updated = data.updated || "Recently";
      }
    });

    const groupedList = Object.values(groups).sort((a, b) => b.updatedMillis - a.updatedMillis); // Sliced limit removed

    if (groupedList.length === 0) {
      list.innerHTML = `<div class="widget-empty">No active drafts found.</div>`;
      return;
    }

    groupedList.forEach(g => {
      const item = document.createElement('div');
      item.className = 'draft-item';
      item.onclick = () => window.location.href = `editpage.html?name=${encodeURIComponent(g.name)}`;

      const sectionsStr = g.sections.length > 2
        ? `${g.sections.slice(0, 2).join(", ")} +${g.sections.length - 2}`
        : g.sections.join(", ");

      item.innerHTML = `
        <div class="draft-delete" onclick="event.stopPropagation(); window.deleteDraftGroup('${g.name}')" title="Delete Draft Group">✕</div>
        <div class="draft-icon-box">📝</div>
        <div class="draft-content">
          <div class="draft-title">${g.name}</div>
          <div class="draft-msg">Sections: ${sectionsStr}</div>
          <div class="draft-meta">Updated: ${g.updated}</div>
        </div>
      `;
      list.appendChild(item);
    });
  }, (err) => {
    console.error("Drafts listener failed:", err);
    list.innerHTML = '<div class="widget-empty" style="color:#f87171">Failed to load drafts ❌</div>';
  });
}

async function deleteDraftGroup(name) {
  if (await window.showConfirm("Delete Draft Group?", `Are you sure you want to delete ALL drafts under "${name}"? 🗑️⚠️`)) {
    try {
      const user = auth.currentUser;
      if (!user) return;

      const q = query(
        collection(db, "schedules"),
        where("userId", "==", user.uid),
        where("scheduleName", "==", name),
        where("status", "==", "draft")
      );

      const snap = await getDocs(q);
      const batch = writeBatch(db);
      snap.forEach(d => batch.delete(d.ref));
      await batch.commit();

      showToast(`Draft group "${name}" deleted! 🗑️✨`, "success");
    } catch (e) {
      console.error("Delete draft failed:", e);
      showToast("Failed to delete draft.", "error");
    }
  }
}
window.deleteDraftGroup = deleteDraftGroup;

// --- EVENT CALENDAR LOGIC 📅 ---
function initEventCalendar() {
  const calDays = document.getElementById('calendarDays');
  const monthLabel = document.getElementById('currentMonthYear');
  const prevBtn = document.getElementById('prevMonth');
  const nextBtn = document.getElementById('nextMonth');
  const eventList = document.getElementById('events-list');
  const dateLabel = document.getElementById('selected-date-label');

  if (!calDays || !monthLabel) return;

  let today = new Date();
  let currentMonth = today.getMonth();
  let currentYear = today.getFullYear();
  let selectedDate = new Date(); // Default select today
  let allEvents = []; // Cache events from DB

  const render = () => {
    calDays.innerHTML = '';
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    monthLabel.textContent = `${monthNames[currentMonth]} ${currentYear}`;

    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const todayStr = `${year}-${month}-${day}`;

    // Day Headers
    ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].forEach(d => {
      const el = document.createElement('div');
      el.className = 'cal-day-label';
      el.textContent = d;
      calDays.appendChild(el);
    });

    const firstDay = new Date(currentYear, currentMonth, 1).getDay();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

    // Padding
    for (let i = 0; i < firstDay; i++) {
      calDays.appendChild(document.createElement('div'));
    }

    // Actual Days
    for (let day = 1; day <= daysInMonth; day++) {
      const d = document.createElement('div');
      d.className = 'cal-day';
      d.textContent = day;

      const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

      // Has Event Dot? (Only if today or future)
      const hasEvent = allEvents.some(ev => normalizeDate(ev.date) === dateStr);
      if (hasEvent) d.classList.add('has-event');

      // Today?
      if (day === today.getDate() && currentMonth === today.getMonth() && currentYear === today.getFullYear()) {
        d.classList.add('today');
      }

      // Selected?
      if (day === selectedDate.getDate() && currentMonth === selectedDate.getMonth() && currentYear === selectedDate.getFullYear()) {
        d.classList.add('selected');
        updateEventList(dateStr, todayStr);
      }

      d.onclick = () => {
        selectedDate = new Date(currentYear, currentMonth, day);
        render();
      };

      calDays.appendChild(d);
    }
  };

  const updateEventList = (dateStr, todayStr) => {
    if (!eventList) return;
    // Filter by date and ensure it's not in the past
    const filtered = allEvents.filter(ev => normalizeDate(ev.date) === dateStr);

    // Label
    const displayDate = new Date(dateStr).toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' });
    if (dateLabel) dateLabel.textContent = displayDate === today.toLocaleDateString() ? "Today's Events" : `Events for ${displayDate}`;

    if (filtered.length === 0) {
      eventList.innerHTML = `<div class="widget-empty">No events scheduled for this day.</div>`;
      return;
    }

    eventList.innerHTML = '';
    filtered.sort((a, b) => (a.timeBlock || "").localeCompare(b.timeBlock || ""));

    filtered.forEach(ev => {
      const item = document.createElement('div');
      item.className = 'event-item';
      item.innerHTML = `
        <div class="event-time-badge">${(ev.timeBlock || "").split('-')[0]}</div>
        <div class="event-info">
          <div class="event-title">${ev.subject}</div>
          <div class="event-room">📍 ${(ev.room || "").replace(/\s*\|?\s*\d{1,3}%\s*(?:OCCUPIED)?$/i, "").trim()}</div>
        </div>
      `;
      eventList.appendChild(item);
    });
  };

  const normalizeDate = (d) => {
    if (!d) return "";
    const cDate = String(d);
    let dateStr = "";
    if (cDate.includes('T')) dateStr = cDate.split('T')[0];
    else if (cDate.includes('-')) dateStr = cDate.trim();
    else if (cDate.includes('/')) {
      const parts = cDate.split('/');
      if (parts[0].length === 4) dateStr = parts[0] + "-" + parts[1].padStart(2, '0') + "-" + parts[2].padStart(2, '0');
      else if (parts[2].length === 4) dateStr = parts[2] + "-" + parts[0].padStart(2, '0') + "-" + parts[1].padStart(2, '0');
    } else dateStr = cDate;
    return dateStr;
  };

  // Listen to DB 📡 --- MIGRATED TO GLOBAL ACADEMIC CALENDAR 🗓️
  const q = collection(db, "academic_calendar");
  onSnapshot(q, (snap) => {
    allEvents = [];
    snap.forEach(doc => {
      const data = doc.data();
      // Ensure date is a string YYYY-MM-DD
      if (data.date) {
        allEvents.push({ id: doc.id, ...data });
      }
    });
    console.log("SchedSync: Loaded", allEvents.length, "academic events for calendar dots.");
    render();
  });

  prevBtn.onclick = () => {
    currentMonth--;
    if (currentMonth < 0) { currentMonth = 11; currentYear--; }
    render();
  };
  nextBtn.onclick = () => {
    currentMonth++;
    if (currentMonth > 11) { currentMonth = 0; currentYear++; }
    render();
  };

  render();
}


/* =============================
   HERO CAROUSEL LOGIC 🎠⚓
   ============================= */
let carouselInterval = null;
let currentSlide = 0;
let startX = 0;

function initHeroCarousel(announcements) {
  const container = document.getElementById('heroCarousel');
  const track = document.getElementById('carouselTrack');
  const indicators = document.getElementById('carouselIndicators');
  if (!container || !track || !indicators) return;

  // Clear existing
  track.innerHTML = '';
  indicators.innerHTML = '';

  // Filter urgent and latest
  const urgentItems = announcements.filter(d => (d.title || "").toUpperCase().includes("URGENT") || d.isUrgent === true);
  const latestItems = announcements.filter(d => !urgentItems.includes(d)).slice(0, 3); // Top 3 latest

  const slidesToCreate = [...urgentItems, ...latestItems];

  if (slidesToCreate.length === 0) {
    container.style.display = 'none';
    return;
  }
  container.style.display = 'block';

  slidesToCreate.forEach((ann, index) => {
    const isUrgent = (ann.title || "").toUpperCase().includes("URGENT") || ann.isUrgent === true;

    // Create Slide
    const slide = document.createElement('div');
    slide.className = `carousel-slide announcement-slide ${isUrgent ? 'urgent' : ''}`;
    slide.innerHTML = `
      <div class="slide-tag" style="background: ${isUrgent ? 'rgba(239, 68, 68, 0.9)' : 'rgba(16, 185, 129, 0.9)'}; color: white;">
        ${isUrgent ? '⚠️ Urgent' : '✨ Latest Update'}
      </div>
      <div class="slide-title">${ann.title || 'Notification'}</div>
      <div class="slide-msg">${ann.message || ''}</div>
    `;
    track.appendChild(slide);

    // Create Indicator
    const indicator = document.createElement('span');
    indicator.className = 'indicator';
    indicators.appendChild(indicator);
  });

  // Cycle Logic
  const allSlides = track.querySelectorAll('.carousel-slide');
  const allIndicators = indicators.querySelectorAll('.indicator');

  function goToSlide(index) {
    if (index >= allSlides.length) index = 0;
    if (index < 0) index = allSlides.length - 1;
    currentSlide = index;
    track.style.transform = `translateX(-${index * 100}%)`;
    allIndicators.forEach((ind, i) => ind.classList.toggle('active', i === index));
  }

  // Initial State Reset ⚓
  currentSlide = 0;
  track.style.transform = 'translateX(0)';
  if (allIndicators.length > 0) allIndicators[0].classList.add('active');

  // Auto Cycle
  if (carouselInterval) clearInterval(carouselInterval);
  if (allSlides.length > 1) {
    carouselInterval = setInterval(() => {
      goToSlide(currentSlide + 1);
    }, 6000);
  }

  // Swipe Support
  container.addEventListener('touchstart', (e) => {
    startX = e.touches[0].clientX;
    clearInterval(carouselInterval);
  }, { passive: true });

  container.addEventListener('touchend', (e) => {
    const endX = e.changedTouches[0].clientX;
    if (startX - endX > 50) goToSlide(currentSlide + 1); // Swipe Left
    else if (endX - startX > 50) goToSlide(currentSlide - 1); // Swipe Right

    // Resume cycle
    carouselInterval = setInterval(() => goToSlide(currentSlide + 1), 6000);
  }, { passive: true });

  // Mouse Drag Fallback
  container.onmousedown = (e) => {
    startX = e.clientX;
    clearInterval(carouselInterval);
    document.onmouseup = (ue) => {
      const endX = ue.clientX;
      if (startX - endX > 50) goToSlide(currentSlide + 1);
      else if (endX - startX > 50) goToSlide(currentSlide - 1);
      document.onmouseup = null;
      carouselInterval = setInterval(() => goToSlide(currentSlide + 1), 6000);
    };
  };
}
window.initHeroCarousel = initHeroCarousel;
