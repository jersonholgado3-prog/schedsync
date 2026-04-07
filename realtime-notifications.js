import { db, auth, app } from "./js/config/firebase-config.js";
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  limit,
  where,
  serverTimestamp,
  addDoc,
  deleteDoc,
  updateDoc,
  getDocs,
  getDoc,
  doc
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { showToast, showConfirm } from "./js/utils/ui-utils.js";

// Tracking session start to avoid showing old notifications as "new"
const sessionStartTime = Date.now();
let lastVisibleNotificationId = null;

// Styles for the Game-Style Popups
const style = document.createElement('style');
style.textContent = `
  #dg-game-notify-container {
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 99999;
    display: flex;
    flex-direction: column;
    gap: 15px;
    pointer-events: none;
    perspective: 1000px;
  }

  .dg-game-popup {
    width: 320px;
    background: #fff;
    border: 2px solid black;
    border-radius: 20px;
    padding: 16px;
    color: black;
    display: flex;
    gap: 12px;
    box-shadow: 6px 6px 0px black;
    pointer-events: auto;
    cursor: pointer;
    animation: dg-game-pop-in 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
    transition: all 0.3s ease;
    position: relative;
    overflow: hidden;
  }

  .dark .dg-game-popup {
    background: #1e293b;
    color: white;
    border-color: #475569;
    box-shadow: 6px 6px 0px #000;
  }

  .dg-game-popup:hover {
    transform: translate(-2px, -2px);
    box-shadow: 8px 8px 0px black;
  }

  .dark .dg-game-popup:hover {
    box-shadow: 8px 8px 0px #000;
  }

  /* Overlay List Styles */
  #dg-notification-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(15, 23, 42, 0.4);
    backdrop-filter: blur(8px);
    z-index: 100000;
    display: none;
    align-items: center;
    justify-content: center;
    animation: dg-fade-in 0.3s ease;
  }

  .dg-notif-panel {
    width: 480px;
    max-width: 90vw;
    height: 650px;
    max-height: 85vh;
    background: white;
    border: 3px solid black;
    border-radius: 30px;
    display: flex;
    flex-direction: column;
    box-shadow: 12px 12px 0px black;
    overflow: hidden;
    animation: dg-panel-slide 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
    position: relative;
  }

  .dark .dg-notif-panel {
    background: #0f172a;
    border-color: #475569;
    box-shadow: 12px 12px 0px #000;
  }

  .dg-notif-header {
    padding: 12px 20px;
    border-bottom: 2px solid black;
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: #B0C6F8;
  }


  .dark .dg-notif-header {
    background: #1e293b;
    border-color: #475569;
  }

  .dg-notif-title {
    font-size: 1.5rem;
    font-weight: 900;
    color: black;
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }

  .dark .dg-notif-title {
    color: white;
  }

  .dg-notif-list {
    flex: 1;
    overflow-y: auto;
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .dg-notif-item {
    background: #fff;
    border: 3px solid black;
    border-radius: 20px;
    padding: 20px;
    position: relative;
    transition: all 0.2s ease;
    box-shadow: 4px 4px 0px black;
  }

  .dark .dg-notif-item {
    background: #1e293b;
    border-color: #475569;
    box-shadow: 4px 4px 0px #000;
  }

  .dg-notif-item:hover {
    transform: translate(-2px, -2px);
    box-shadow: 6px 6px 0px black;
  }

  .dark .dg-notif-item:hover {
    box-shadow: 6px 6px 0px #000;
  }

  .dg-notif-item-delete {
    position: absolute;
    top: 15px;
    right: 15px;
    width: 30px;
    height: 30px;
    border: 2px solid black;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    background: #fee2e2;
    transition: all 0.2s;
  }

  .dg-notif-item-delete:hover {
    background: #ef4444;
    color: white;
    transform: scale(1.1);
  }

  .dg-clear-all {
    padding: 8px 16px;
    background: #fff;
    border: 2px solid black;
    border-radius: 12px;
    font-weight: 800;
    font-size: 0.75rem;
    cursor: pointer;
    box-shadow: 2px 2px 0px black;
    transition: all 0.2s;
  }

  .dg-clear-all:hover {
    transform: translate(-1px, -1px);
    box-shadow: 3px 3px 0px black;
    background: #fee2e2;
  }

  .dark .dg-clear-all {
    background: #3b82f6;
    color: white;
    border-color: #60a5fa;
    box-shadow: 2px 2px 0px #000; 
  }

  .dark .dg-clear-all:hover {
    background: #2563eb;
    box-shadow: 3px 3px 0px #000; 
  }

  /* Badge Style */
  .dg-notif-badge {
    position: absolute;
    top: -2px;
    right: -2px;
    background: #ef4444;
    color: white;
    font-size: 10px;
    font-weight: 900;
    min-width: 18px;
    height: 18px;
    padding: 0 4px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 2px solid white;
    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
    pointer-events: none;
    z-index: 50;
    animation: dg-badge-pop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  .dark .dg-notif-badge {
    border-color: #0f172a;
  }

  @keyframes dg-badge-pop {
    0% { transform: scale(0); }
    100% { transform: scale(1); }
  }

  .notification-icon-wrapper {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  /* Toast Notification */
  #dg-toast-container {
    position: fixed;
    top: 24px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 200000;
    display: flex;
    flex-direction: column;
    gap: 12px;
    pointer-events: none;
  }

  .dg-toast {
    padding: 14px 28px;
    border-radius: 20px;
    background: rgba(15, 23, 42, 0.9);
    backdrop-filter: blur(20px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: white;
    font-weight: 700;
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
    animation: dg-toast-in 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
    font-size: 0.95rem;
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 320px;
    pointer-events: auto;
  }

  @keyframes dg-toast-in {
    from { transform: translateY(-20px) scale(0.9); opacity: 0; }
    to { transform: translateY(0) scale(1); opacity: 1; }
  }

  .dg-toast-success { border-left: 5px solid #10b981; }
  .dg-toast-error { border-left: 5px solid #ef4444; }
  .dg-toast-info { border-left: 5px solid #6366f1; }

  /* LIGHT MODE OVERRIDES - WHEN .dark CLASS IS NOT ON HTML */
  html:not(.dark) #dg-notification-overlay {
    background: rgba(255, 255, 255, 0.4);
  }

  html:not(.dark) .dg-notif-panel {
    background: rgba(255, 255, 255, 0.95);
    border-color: rgba(99, 102, 241, 0.2);
    box-shadow: 0 40px 100px -20px rgba(0, 0, 0, 0.1),
                inset 0 0 40px rgba(99, 102, 241, 0.05);
  }

  html:not(.dark):not(.professional-mode) .dg-notif-title {
    background: linear-gradient(135deg, #1e293b 0%, #6366f1 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }

  .professional-mode .dg-notif-title {
    background: none !important;
    -webkit-text-fill-color: initial !important;
    color: black !important;
  }


  html:not(.dark) .dg-notif-close {
    background: rgba(0, 0, 0, 0.05);
    color: #64748b;
    border: 1px solid rgba(0, 0, 0, 0.1);
  }

  html:not(.dark) .dg-notif-item {
    background: rgba(0, 0, 0, 0.02);
    border: 1px solid rgba(0, 0, 0, 0.05);
  }

  html:not(.dark) .dg-notif-item:hover {
    background: rgba(99, 102, 241, 0.05);
    border-color: rgba(99, 102, 241, 0.2);
  }

  html:not(.dark) .dg-notif-item .notif-title-text {
    color: #1e293b !important;
  }

  html:not(.dark) .dg-notif-item .notif-msg-text {
    color: #475569 !important;
  }
`;
document.head.appendChild(style);
// Add toast-out and fade-out animations
const extraStyle = document.createElement('style');
extraStyle.textContent = `
    @keyframes dg-toast-out {
      to { transform: translateY(-20px) scale(0.9); opacity: 0; }
    }
    @keyframes dg-fade-out {
      from { opacity: 1; }
      to { opacity: 0; }
    }
    `;
document.head.appendChild(extraStyle);

// UI Container
const container = document.createElement('div');
container.id = 'dg-game-notify-container';
document.body.appendChild(container);

// Local Persistence for Dismissals and Seen Status
const DISMISSED_KEY = 'schedsync_dismissed_notifs';
const LAST_SEEN_KEY = 'schedsync_notifs_last_seen';

function getDismissed() {
  try {
    const uid = auth.currentUser ? auth.currentUser.uid : 'guest';
    const key = `${DISMISSED_KEY}_${uid}`;
    return JSON.parse(localStorage.getItem(key) || '[]');
  } catch { return []; }
}

function dismissNotification(id) {
  const dismissed = getDismissed();
  if (!dismissed.includes(id)) {
    dismissed.push(id);
    const uid = auth.currentUser ? auth.currentUser.uid : 'guest';
    const key = `${DISMISSED_KEY}_${uid}`;
    localStorage.setItem(key, JSON.stringify(dismissed));
    loadAllNotificationsForOverlay(); // Refresh UI
  }
}

function clearAllNotifications() {
  const list = document.getElementById('dg-notif-list-content');
  const ids = Array.from(list.querySelectorAll('.dg-notif-item')).map(el => el.dataset.id);
  const dismissed = getDismissed();
  ids.forEach(id => {
    if (!dismissed.includes(id)) dismissed.push(id);
  });
  const uid = auth.currentUser ? auth.currentUser.uid : 'guest';
  const key = `${DISMISSED_KEY}_${uid}`;
  localStorage.setItem(key, JSON.stringify(dismissed));
  loadAllNotificationsForOverlay();
}

function markAllAsSeen() {
  const uid = auth.currentUser ? auth.currentUser.uid : 'guest';
  const key = `${LAST_SEEN_KEY}_${uid}`;
  localStorage.setItem(key, Date.now().toString());
  updateNotificationBadge(0);
}

// Overlay Container
const overlay = document.createElement('div');
overlay.id = 'dg-notification-overlay';
overlay.innerHTML = `
      <div class="dg-notif-panel">
    <div class="dg-notif-header">
      <div class="dg-notif-title">NOTIFICATIONS</div>
      <div style="display: flex; gap: 10px; align-items: center;">
        <button class="dg-clear-all" onclick="clearAllNotifications()">CLEAR ALL</button>
        <div class="dg-notif-close" style="position: static; margin: 0;">✕</div>
      </div>
    </div>
    <div class="dg-notif-list" id="dg-notif-list-content">
      <div style="padding: 40px; text-align: center; color: #64748b;">Loading messages...</div>
    </div>
  </div >
    `;
document.body.appendChild(overlay);

overlay.querySelector('.dg-notif-close').onclick = () => {
  overlay.style.display = 'none';
  markAllAsSeen();
};
overlay.onclick = (e) => {
  if (e.target === overlay) {
    overlay.style.display = 'none';
    markAllAsSeen();
  }
};

// Functions
function showGamePopup(data) {
  const popup = document.createElement('div');
  popup.className = 'dg-game-popup';

  const icon = '📩';
  const time = data.createdAt?.toDate ? data.createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now';

  popup.innerHTML = `
    <div class="dg-game-popup-icon">${icon}</div>
      <div class="dg-game-popup-content">
        <div style="font-weight: 800; font-size: 0.75rem; color: #6366f1; text-transform: uppercase;">${data.title || 'NEW MESSAGE'}</div>
        <div style="font-size: 0.9rem; font-weight: 700;">${data.message}</div>
        <div style="font-size: 0.7rem; opacity: 0.6; margin-top: 4px;">${time} • Published by: ${data.sender || 'System'}</div>
      </div>
  `;

  popup.onclick = () => {
    popup.classList.add('dg-game-popup-out');
    setTimeout(() => popup.remove(), 400);
    overlay.style.display = 'flex';
    loadAllNotificationsForOverlay();
  };

  container.appendChild(popup);

  // Auto remove
  setTimeout(() => {
    if (popup.parentElement) {
      popup.classList.add('dg-game-popup-out');
      setTimeout(() => popup.remove(), 400);
    }
  }, 8000);
}

async function loadAllNotificationsForOverlay() {
  const list = document.getElementById('dg-notif-list-content');
  const q = query(collection(db, "notifications"), orderBy("createdAt", "desc"), limit(20));

  onSnapshot(q, (snap) => {
    list.innerHTML = '';
    const dismissed = getDismissed();

    const visibleDocs = snap.docs.filter(doc => !dismissed.includes(doc.id));

    if (visibleDocs.length === 0) {
      list.innerHTML = '<div style="padding: 60px 40px; text-align: center; color: #64748b; font-weight: 600;">No notifications for now.</div>';
      return;
    }

    visibleDocs.forEach(doc => {
      const d = doc.data();

      // Filtering logic 🛡️
      const checkIsAnnouncement = (data) => {
        const title = (data.title || "").toUpperCase();
        return data.isAnnouncement === true ||
          data.isAnnouncement === "true" ||
          data.type === "announcement" ||
          title.includes("EVENT") ||
          title.includes("SCHEDULE");
      };

      const isEventAnn = (d.title || "").toUpperCase().includes("EVENT") || d.isAnnouncement === true;
      if (checkIsAnnouncement(d) && !isEventAnn) return;

      const myRole = localStorage.getItem('userRole');
      const myUid = auth.currentUser ? auth.currentUser.uid : null;
      const mySection = localStorage.getItem('userSection');

      // If notification has targeting, check if user matches 🛡️
      const hasTargeting = d.targetRole || d.targetUserId || d.targetSection;
      if (hasTargeting) {
        let matched = false;
        if (d.targetRole && (d.targetRole === myRole || d.targetRole === 'ALL')) matched = true;
        if (d.targetUserId && d.targetUserId === myUid) matched = true;
        if (d.targetSection && d.targetSection === mySection) matched = true;

        if (!matched) return;
      }

      const div = document.createElement('div');
      div.className = 'dg-notif-item';
      div.dataset.id = doc.id;

      const dateObj = d.createdAt?.toDate ? d.createdAt.toDate() : new Date();
      const dateStr = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const timeStr = dateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

      let actionButtons = '';
      if (d.type === 'edit_request' && d.userId) {
        actionButtons = `
    <div style="display: flex; gap: 10px; margin-top: 12px;">
              <button onclick="event.stopPropagation(); acceptEditRequest('${d.userId}', '${doc.id}')" style="flex: 1; padding: 10px; border-radius: 12px; border: none; background: #10b981; color: white; font-weight: 800; cursor: pointer; border: 2px solid black; box-shadow: 2px 2px 0px black;">ACCEPT</button>
              <button onclick="event.stopPropagation(); denyEditRequest('${d.userId}', '${doc.id}')" style="flex: 1; padding: 10px; border-radius: 12px; border: none; background: #64748b; color: white; font-weight: 800; cursor: pointer; border: 2px solid black; box-shadow: 2px 2px 0px black;">DENY</button>
            </div>
    `;
      }

      div.innerHTML = `
    <div class="dg-notif-item-delete" onclick="event.stopPropagation(); dismissNotification('${doc.id}')">✕</div>
          <div style="margin-bottom: 8px;">
              <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 2px;">
                  <div style="font-weight: 900; color: #6366f1; font-size: 0.75rem; text-transform: uppercase;">Published by: ${d.sender || 'SYSTEM'}</div>
              </div>
              <div style="font-size: 0.65rem; color: #64748b; font-weight: 800;">${dateStr.toUpperCase()} • ${timeStr}</div>
          </div>
          <div style="font-weight: 900; margin-bottom: 4px; font-size: 1.25rem; line-height: 1.1; letter-spacing: -0.02em;" class="notif-title-text">${d.title}</div>
          <div style="font-size: 0.95rem; line-height: 1.5; font-weight: 500;" class="notif-msg-text">${d.message}</div>
          ${actionButtons}
  `;
      list.appendChild(div);
    });
  });
}

// --- Badge Management ---
function updateNotificationBadge(count) {
  const bells = document.querySelectorAll('.notification-icon');
  bells.forEach(bell => {
    let wrapper = bell.parentElement;
    if (!wrapper.classList.contains('notification-icon-wrapper')) {
      wrapper = document.createElement('div');
      wrapper.className = 'notification-icon-wrapper';
      bell.parentNode.insertBefore(wrapper, bell);
      wrapper.appendChild(bell);
    }

    let badge = wrapper.querySelector('.dg-notif-badge');
    if (count > 0) {
      if (!badge) {
        badge = document.createElement('div');
        badge.className = 'dg-notif-badge';
        wrapper.appendChild(badge);
      }
      badge.textContent = count > 9 ? '9+' : count;
    } else if (badge) {
      badge.remove();
    }
  });
}

window.openGameNotifications = () => {
  overlay.style.display = 'flex';
  loadAllNotificationsForOverlay();
};

onSnapshot(query(collection(db, "notifications"), orderBy("createdAt", "desc"), limit(10)), (snap) => {
  const uid = auth.currentUser ? auth.currentUser.uid : 'guest';
  const lastSeenKey = `${LAST_SEEN_KEY}_${uid}`;
  const lastSeen = parseInt(localStorage.getItem(lastSeenKey) || '0');
  const dismissed = getDismissed();

  let unreadCount = 0;

  snap.docChanges().forEach((change) => {
    const data = change.doc.data();
    const docId = change.doc.id;
    const createdMillis = data.createdAt?.toMillis ? data.createdAt.toMillis() : Date.now();

    if (change.type === "added") {
      const d = data;
      const myRole = localStorage.getItem('userRole');
      const myUid = auth.currentUser ? auth.currentUser.uid : null;
      const mySection = localStorage.getItem('userSection');

      // Filter Logic for Popups too 🛡️
      const checkIsAnnouncement = (data) => {
        const title = (data.title || "").toUpperCase();
        return data.isAnnouncement === true ||
          data.isAnnouncement === "true" ||
          data.type === "announcement" ||
          title.includes("EVENT") ||
          title.includes("SCHEDULE");
      };

      const isEventAnnPopup = (d.title || "").toUpperCase().includes("EVENT") || d.isAnnouncement === true;
      if (checkIsAnnouncement(d) && !isEventAnnPopup) return;

      const hasTargeting = d.targetRole || d.targetUserId || d.targetSection;
      if (hasTargeting) {
        let matched = false;
        if (d.targetRole && (d.targetRole === myRole || d.targetRole === 'ALL')) matched = true;
        if (d.targetUserId && d.targetUserId === myUid) matched = true;
        if (d.targetSection && d.targetSection === mySection) matched = true;

        if (!matched) return;
      }

      if (createdMillis > sessionStartTime && docId !== lastVisibleNotificationId && !dismissed.includes(docId)) {
        lastVisibleNotificationId = docId;
        showGamePopup(data);
      }
    }
  });

  // Recalculate unread count based on last seen timestamp and targeting filters 🎯
  const myRole = localStorage.getItem('userRole');
  const myUid = auth.currentUser ? auth.currentUser.uid : null;
  const mySection = localStorage.getItem('userSection');

  snap.docs.forEach(doc => {
    const d = doc.data();

    // Check targeting 🎯
    const checkIsAnnouncement = (data) => {
      const title = (data.title || "").toUpperCase();
      return data.isAnnouncement === true ||
        data.isAnnouncement === "true" ||
        data.type === "announcement" ||
        title.includes("EVENT") ||
        title.includes("SCHEDULE");
    };

    const isAnn = checkIsAnnouncement(d);
    const hasTargeting = d.targetRole || d.targetUserId || d.targetSection;

    let matched = true;
    if (hasTargeting) {
      matched = false;
      if (d.targetRole && d.targetRole === myRole) matched = true;
      if (d.targetUserId && d.targetUserId === myUid) matched = true;
      if (d.targetSection && d.targetSection === mySection) matched = true;

      // Public announcements or ALL targeting
      if (d.targetRole === 'ALL') matched = true;
    }

    // Always count announcements if they pertain to the user or are for everyone
    if (matched) {
      const createdMillis = d.createdAt?.toMillis ? d.createdAt.toMillis() : Date.now();
      if (createdMillis > lastSeen && !dismissed.includes(doc.id)) {
        unreadCount++;
      }
    }
  });

  updateNotificationBadge(unreadCount);
});

// --- Permission Handlers ---
async function createNotification(db, target, title, message, sender, metadata = {}) {
  try {
    const payload = {
      title,
      message,
      sender: sender || "System",
      createdAt: serverTimestamp(),
      ...metadata
    };

    if (target === "ALL") {
      // Just a general notification
    } else if (target.startsWith("ROLE:")) {
      payload.targetRole = target.split(":")[1];
    } else if (target.startsWith("USER:")) {
      payload.targetUserId = target.split(":")[1];
    }

    await addDoc(collection(db, "notifications"), payload);
    console.log("Notification created", payload);
    if (window.showToast) {
      const type = metadata.isAnnouncement ? "success" : "info";
      showToast(`Notification sent: ${title} `, type);
    }
  } catch (e) {
    console.error("Error creating notification:", e);
  }
}

async function cleanupAnnouncement(db, eventId) {
  try {
    const q = query(collection(db, "notifications"), where("linkedEventId", "==", String(eventId)));
    const snap = await getDocs(q);
    const deletes = snap.docs.map(d => deleteDoc(d.ref));
    await Promise.all(deletes);
    console.log(`Cleaned up ${snap.size} announcements for event: `, eventId);
    if (snap.size > 0 && window.showToast) {
      showToast("Outdated announcements removed! 🧹", "info");
    }
  } catch (e) {
    console.error("Error cleaning up announcements:", e);
  }
}

async function acceptEditRequest(userId, notifId) {
  try {
    // 1. Update User Document
    await updateDoc(doc(db, "users", userId), {
      editPermission: true
    });

    // 2. Notify Teacher
    await addDoc(collection(db, "notifications"), {
      title: "PERMISSION GRANTED",
      message: "Admin has approved your edit request. You can now edit schedules!",
      sender: "Admin",
      createdAt: serverTimestamp(),
      type: "info",
      targetUserId: userId // Make sure only the requestor sees this! 🔒
    });

    // 3. Clear the request notification
    await dismissNotification(notifId);
    if (window.showToast) showToast("Permission granted! Notification sent.", "success");
  } catch (e) {
    console.error("Error accepting request:", e);
  }
}

async function denyEditRequest(userId, notifId) {
  try {
    // 1. Notify Teacher
    await addDoc(collection(db, "notifications"), {
      title: "PERMISSION DENIED",
      message: "Your edit request was declined by the Admin.",
      sender: "Admin",
      createdAt: serverTimestamp(),
      type: "error",
      targetUserId: userId // Make sure only the requestor sees this!
    });

    // 2. Clear the request notification
    await dismissNotification(notifId);
    if (window.showToast) showToast("Request denied.", "info");
  } catch (e) {
    console.error("Error denying request:", e);
  }
}

// Expose globals for onclick handlers
window.dismissNotification = dismissNotification;
window.clearAllNotifications = clearAllNotifications;
window.acceptEditRequest = acceptEditRequest;
window.denyEditRequest = denyEditRequest;
window.createNotification = createNotification;
window.cleanupAnnouncement = cleanupAnnouncement;
