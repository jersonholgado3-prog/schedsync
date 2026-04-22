import { initMobileNav } from "./js/ui/mobile-nav.js";
import { auth, db, app } from "./js/config/firebase-config.js";
import {
  doc,
  getDocs,
  getDoc,
  updateDoc,
  onSnapshot,
  collection,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { initUserProfile } from "./userprofile.js";
import { initUniversalSearch } from "./search.js";

document.addEventListener("DOMContentLoaded", () => {
  initMobileNav();
  initUserProfile("#userProfile");
  initUniversalSearch();
});

let allEvents = [];
let itemsToShow = 5;
const eventsContainer = document.getElementById("eventsContainer");
const loadMoreBtn = document.querySelector(".load-more-btn");
const isAdmin = () => localStorage.getItem("userRole") === "admin";

// --- LOAD MORE LOGIC ---
if (loadMoreBtn) {
  loadMoreBtn.onclick = () => {
    itemsToShow += 5;
    renderEvents(allEvents);
  };
}

// --- EVENT LISTENING ---
async function listenForEvents() {
  // Fetch Section Mapping
  let sectionMap = {};
  try {
    const sectionSnap = await getDocs(collection(db, "sections"));
    sectionSnap.forEach(s => { sectionMap[s.id] = s.data().name; });
  } catch (e) { console.error("Could not fetch sections map:", e); }

  const defaultRef = doc(db, "schedules", "DEFAULT_SECTION");
  const academicRef = collection(db, "academic_calendar");

  // Handle Academic Calendar 🗓️
  onSnapshot(academicRef, (snap) => {
    const academicEvents = [];
    snap.forEach(d => {
      const data = d.data();
      academicEvents.push({
        ...data,
        id: d.id,
        creatorName: "Academic Admin",
        status: "published",
        createdAt: data.createdAt || Date.now()
      });
    });
    
    // Sort and update global list (will be merged with host events)
    updateAllEvents("academic", academicEvents);
  });

  // Handle Event Host Section 🏢
  onSnapshot(defaultRef, (snap) => {
    if (snap.exists()) {
      const data = snap.data();
      const hostEvents = (data.classes || []).filter(c => c.section === "EVENT_HOST");
      
      // Resolve IDs in displacements if any
      const looksLikeId = (s) => s && s.length > 15 && !s.includes(" ");
      hostEvents.forEach(ev => {
        if (ev.displacements) {
          ev.displacements.forEach(d => {
            if (looksLikeId(d.section) && sectionMap[d.section]) {
              d.section = sectionMap[d.section];
            }
          });
        }
      });
      
      updateAllEvents("host", hostEvents);
    }
  });
}

const eventBuckets = { academic: [], host: [] };
function updateAllEvents(bucket, events) {
  eventBuckets[bucket] = events;
  
  // Merge and Deduplicate
  const events_flat = [...eventBuckets.academic, ...eventBuckets.host];
  
  // Group by date+subject to deduplicate if same event exists in both (unlikely but safe)
  const grouped = {};
  events_flat.forEach(ev => {
    const key = `${ev.date}_${ev.subject}`.toLowerCase();
    if (!grouped[key] || (ev.createdAt > (grouped[key].createdAt || 0))) {
      grouped[key] = { ...ev };
    }
  });

  const uniqueEvents = Object.values(grouped);
  uniqueEvents.sort((a, b) => new Date(b.date) - new Date(a.date));

  allEvents = uniqueEvents;
  renderEvents(allEvents);
}

function renderEvents(events) {
  eventsContainer.innerHTML = "";

  if (events.length === 0) {
    eventsContainer.innerHTML = `<div class="p-8 text-center opacity-50">No events scheduled</div>`;
    if (loadMoreBtn) loadMoreBtn.style.display = "none";
    return;
  }

  const visibleEvents = events.slice(0, itemsToShow);

  visibleEvents.forEach(event => {
    const card = document.createElement("div");
    card.className = "event-card group cursor-pointer relative interactive-card bg-white dark:bg-slate-800 border-3 border-black rounded-[30px] p-5 mb-5 shadow-[6px_6px_0px_black] transition-all hover:-translate-y-1 hover:shadow-[10px_10px_0px_black] active:translate-y-0 active:shadow-[2px_2px_0px_black]";

    // Status Badge if Draft
    const statusMarkup = event.status === "draft" ? `<span class="bg-amber-500 text-white text-[10px] px-2 py-0.5 rounded-full ml-2 uppercase font-bold">Draft</span>` : "";

    const roomDisplay = event.rooms && event.rooms.length > 1
      ? `<span class="bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded-lg text-[10px] font-bold border border-indigo-500/20">${event.rooms.length} Venues</span>`
      : event.room;

    card.innerHTML = `
      <div class="flex items-center w-full">
        <div class="event-card-item col-from font-bold text-slate-500 dark:text-slate-400 w-[15%] uppercase text-xs tracking-wider">${event.creatorName || "Admin"}</div>
        <div class="event-card-item col-title font-black text-lg w-[25%]">${event.subject} ${statusMarkup}</div>
        <div class="event-card-item col-content text-slate-600 dark:text-slate-300 w-[45%] line-clamp-1">${roomDisplay} • ${format12h(event.timeBlock)}</div>
        <div class="event-card-item col-date text-right font-medium text-slate-400 w-[15%] text-sm">${formatDateRange(event.date, event.endDate)}</div>
      </div>
    `;

    // ADMIN ACTIONS
    if (isAdmin()) {
      const actions = document.createElement("div");
      actions.className = "absolute right-4 top-1/2 -translate-y-1/2 flex gap-2 z-10 sm:opacity-0 group-hover:opacity-100 transition-opacity";

      const editBtn = document.createElement("button");
      editBtn.className = "p-2 bg-[#005BAB] text-white rounded-full border-2 border-black shadow-[3px_3px_0px_black] hover:scale-110 active:scale-95 transition-transform flex items-center justify-center";
      editBtn.style.width = "40px";
      editBtn.style.height = "40px";
      editBtn.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>`;
      editBtn.onclick = (e) => {
        e.stopPropagation();
        if (window.renderEventModal) window.renderEventModal(event);
      };

      actions.appendChild(editBtn);
      card.appendChild(actions);
    }

    card.onclick = () => showEventDetails(event);
    eventsContainer.appendChild(card);
  });

  // Toggle Load More button visibility
  if (loadMoreBtn) {
    loadMoreBtn.style.display = events.length > itemsToShow ? "block" : "none";
  }
}

function showEventDetails(event) {
  const overlay = document.createElement("div");
  overlay.className = "fixed inset-0 z-[3000] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4 animate-in fade-in duration-300";

  // MOVED CLASSES TABLE
  let displacementMarkup = "";
  if (event.displacements && event.displacements.length > 0) {
    displacementMarkup = `
            <div class="mt-8">
                <div class="text-indigo-500 font-black text-xs uppercase tracking-widest mb-4 flex items-center gap-2">
                    <span class="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></span>
                    Relocated Classes (${event.displacements.length})
                </div>
                <div class="bg-slate-50/50 dark:bg-slate-900/40 backdrop-blur-md border-3 border-black rounded-[32px] overflow-hidden shadow-[6px_6px_0px_black]">
                    <div class="overflow-x-auto">
                        <table class="w-full text-left border-collapse">
                            <thead>
                                <tr class="bg-[#005BAB] text-white text-[11px] uppercase font-black tracking-widest">
                                    <th class="p-4 border-r border-white/10">Time</th>
                                    <th class="p-4 border-r border-white/10">Module</th>
                                    <th class="p-4 border-r border-white/10">Section</th>
                                    <th class="p-4 border-r border-white/10">Instructor</th>
                                    <th class="p-4 border-r border-white/10 opacity-70">From</th>
                                    <th class="p-4">Assigned Venue</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y-3 divide-black/10 dark:divide-white/10">
                                ${event.displacements.map(d => `
                                    <tr class="hover:bg-indigo-500/5 transition-colors">
                                        <td class="p-4 font-black text-[11px] text-indigo-600 dark:text-indigo-400 whitespace-nowrap">${format12h(d.time)}</td>
                                        <td class="p-4">
                                            <div class="font-black text-[14px] leading-tight text-slate-800 dark:text-slate-100">${d.subject}</div>
                                        </td>
                                        <td class="p-4">
                                            <div class="text-[10px] font-bold opacity-70 uppercase tracking-wider bg-slate-200 dark:bg-slate-700 w-fit px-2 py-0.5 rounded-lg border border-black/5">${d.section}</div>
                                        </td>
                                        <td class="p-4 text-xs font-bold text-slate-600 dark:text-slate-300">${d.teacher || 'TBD'}</td>
                                        <td class="p-4 text-xs font-bold text-slate-400 italic">${d.from}</td>
                                        <td class="p-4">
                                            <div class="flex items-center gap-2">
                                                <span class="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                                                <span class="bg-green-500 text-white text-[11px] font-black px-3 py-1.5 rounded-xl border-3 border-black shadow-[4px_4px_0px_black] transform rotate-1 group-hover:rotate-0 transition-transform">
                                                    ${d.to}
                                                </span>
                                            </div>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
  }

  overlay.innerHTML = `
        <div class="bg-white dark:bg-slate-800 border-4 border-black rounded-[40px] w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-[12px_12px_0px_black] relative p-8 animate-in zoom-in-95 duration-300">
            <button class="absolute right-6 top-6 w-10 h-10 border-3 border-black rounded-xl flex items-center justify-center hover:bg-red-500 hover:text-white transition-colors font-bold text-xl" onclick="this.closest('.fixed').remove()">✕</button>
            
            <div class="flex flex-col gap-2">
                <div class="text-indigo-500 font-bold uppercase tracking-widest text-xs">Event Details</div>
                <h2 class="text-4xl font-black leading-tight">${event.subject}</h2>
                <div class="flex flex-wrap gap-4 mt-4">
                    <div class="flex items-center gap-2 bg-slate-100 dark:bg-slate-700/50 px-4 py-2 rounded-2xl border-2 border-black font-bold">
                        <span>📅</span> ${formatDateRange(event.date, event.endDate)}
                    </div>
                    <div class="flex items-center gap-2 bg-slate-100 dark:bg-slate-700/50 px-4 py-2 rounded-2xl border-2 border-black font-bold">
                        <span>⏰</span> ${format12h(event.timeBlock)}
                    </div>
                    <div class="flex items-center gap-2 bg-indigo-500 text-white px-4 py-2 rounded-2xl border-2 border-black font-bold shadow-[3px_3px_0px_black]">
                        <span>📍</span> ${event.rooms ? event.rooms.join(', ') : event.room}
                    </div>
                </div>
            </div>

            <div class="mt-8 p-6 bg-slate-50 dark:bg-slate-900/50 border-3 border-black rounded-3xl">
                <div class="text-[10px] uppercase font-black opacity-40 mb-2">Organizer</div>
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-xl border-2 border-black font-bold">👤</div>
                    <div class="font-bold text-lg">${event.creatorName || "Academic Admin"}</div>
                </div>
            </div>

            ${displacementMarkup}

            <div class="mt-8 flex justify-end">
                <button class="px-8 py-3 bg-[#005BAB] text-white rounded-2xl font-black hover:scale-105 active:scale-95 transition-transform border-3 border-black shadow-[4px_4px_0px_black]" onclick="this.closest('.fixed').remove()">Close</button>
            </div>
        </div>
    `;

  document.body.appendChild(overlay);
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
}

function format12h(timeRange) {
  if (!timeRange || !timeRange.includes('-')) return timeRange;
  const parts = timeRange.split('-');

  const convert = (t) => {
    let [h, m] = t.trim().split(':').map(Number);
    if (isNaN(h)) return t;
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h}:${String(m).padStart(2, '0')} ${ampm}`;
  };

  return `${convert(parts[0])} - ${convert(parts[1])}`;
}

function formatDate(dateStr) {
  const options = { month: 'short', day: 'numeric', year: 'numeric' };
  return new Date(dateStr).toLocaleDateString('en-US', options);
}

function formatDateRange(start, end) {
  if (!end || start === end) return formatDate(start);

  const d1 = new Date(start);
  const d2 = new Date(end);

  const sameMonth = d1.getMonth() === d2.getMonth();
  const sameYear = d1.getFullYear() === d2.getFullYear();

  if (sameYear && sameMonth) {
    return `${d1.toLocaleDateString('en-US', { month: 'short' })} ${d1.getDate()} - ${d2.getDate()}, ${d1.getFullYear()}`;
  } else if (sameYear) {
    return `${d1.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${d2.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${d1.getFullYear()}`;
  }
  return `${formatDate(start)} - ${formatDate(end)}`;
}

// Initialize
onAuthStateChanged(auth, (user) => {
  if (user) {
    const roleBtn = document.getElementById("openCreateEvent");
    if (roleBtn) {
      roleBtn.style.display = isAdmin() ? "flex" : "none";
    }
    listenForEvents();

    // Deep link support
    setTimeout(() => {
      const urlParams = new URLSearchParams(window.location.search);
      const eventId = urlParams.get('id');
      if (eventId && allEvents.length > 0) {
        const linkedEvent = allEvents.find(e => String(e.createdAt) === eventId);
        if (linkedEvent) showEventDetails(linkedEvent);
      }
    }, 1000);
  }
});
