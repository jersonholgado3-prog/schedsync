import { db, auth } from "./js/config/firebase-config.js";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  getDocs,
  deleteDoc,
  doc,
  addDoc,
  serverTimestamp,
  where,
  writeBatch,
  Timestamp
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { initMobileNav } from "./js/ui/mobile-nav.js";
import { showToast, showConfirm } from "./js/utils/ui-utils.js";
import { initUniversalSearch } from './search.js';
import { initUserProfile } from "./userprofile.js";

document.addEventListener("DOMContentLoaded", () => {
  initMobileNav();
  initUserProfile("#userProfile");
  initUniversalSearch(db);

  // Selection state 🧐
  let selectedIds = new Set();

  // Setup Modal Listeners
  const modal = document.getElementById("notificationModal");
  const openBtn = document.getElementById("openNotificationModalBtn");
  const closeBtn = document.querySelector(".close-btn");
  const sendBtn = document.querySelector(".send-button");

  if (openBtn) {
    openBtn.addEventListener("click", () => {
      if (modal) modal.classList.add("show");
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      if (modal) modal.classList.remove("show");
    });
  }

  if (sendBtn) {
    sendBtn.addEventListener("click", async () => {
      await sendNotification();
    });
  }

  // Selection and Deletion Listeners 🗑️✅
  const selectAllBtn = document.getElementById("selectAllCheckbox");
  const deleteSelectedBtn = document.getElementById("deleteSelectedBtn");

  if (selectAllBtn) {
    selectAllBtn.addEventListener("click", () => {
      const allCards = document.querySelectorAll(".notification-card");
      const isChecking = !selectAllBtn.classList.contains("checked");

      selectAllBtn.classList.toggle("checked", isChecking);
      allCards.forEach(card => {
        const checkbox = card.querySelector(".circle-checkbox");
        const id = card.dataset.id;
        if (checkbox && id) {
          checkbox.classList.toggle("checked", isChecking);
          if (isChecking) selectedIds.add(id);
          else selectedIds.delete(id);
        }
      });
      updateDeleteButtonsVisibility();
    });
  }

  if (deleteSelectedBtn) {
    deleteSelectedBtn.addEventListener("click", async () => {
      if (selectedIds.size === 0) return;

      const isSelectAll = selectAllBtn && selectAllBtn.classList.contains("checked");
      const confirmTitle = isSelectAll ? "Delete All Announcements?" : "Delete Selected?";
      const confirmMsg = isSelectAll
        ? "Are you sure you want to delete ALL announcements? This cannot be undone! 🗑️⚠️"
        : `Do you want to delete the ${selectedIds.size} selected announcements? 🗑️`;

      const confirmed = await showConfirm(confirmTitle, confirmMsg);
      if (confirmed) {
        await deleteSelectedNotifications(selectedIds);
        selectedIds.clear();
        if (selectAllBtn) selectAllBtn.classList.remove("checked");
        updateDeleteButtonsVisibility();
      }
    });
  }

  function updateDeleteButtonsVisibility() {
    const deleteSelectedBtn = document.getElementById("deleteSelectedBtn");
    if (deleteSelectedBtn) {
      deleteSelectedBtn.style.display = selectedIds.size > 0 ? "flex" : "none";
    }
  }

  // Load Notifications
  loadNotifications(selectedIds, updateDeleteButtonsVisibility);
});

function loadNotifications(selectedIds, updateDeleteButtonsVisibility) {
  const container = document.getElementById("notificationsContainer");
  if (!container) return;

  // Listen to notifications collection
  const q = query(collection(db, "notifications"), orderBy("createdAt", "desc"));

  onSnapshot(q, (snapshot) => {
    container.innerHTML = "";

    if (snapshot.empty) {
      container.innerHTML = "<p style='padding: 1rem; text-align: center;'>No notifications yet.</p>";
      if (updateDeleteButtonsVisibility) updateDeleteButtonsVisibility();
      return;
    }

    snapshot.forEach(doc => {
      const data = doc.data();
      renderNotificationCard(container, data, doc.id, selectedIds, updateDeleteButtonsVisibility);
    });
  });
}

function renderNotificationCard(container, data, id, selectedIds, updateDeleteButtonsVisibility) {
  const card = document.createElement("div");
  card.className = "notification-card";
  card.dataset.id = id;

  // Format Date
  let dateStr = "";
  if (data.createdAt && data.createdAt.toDate) {
    dateStr = data.createdAt.toDate().toLocaleDateString();
  } else if (data.date) {
    dateStr = new Date(data.date).toLocaleDateString();
  }

  const isChecked = selectedIds && selectedIds.has(id);

  card.innerHTML = `
        <div class="circle-checkbox ${isChecked ? 'checked' : ''}"></div>
        <div class="notification-card-item col-from">By: ${data.sender || "System"}</div>
        <div class="notification-card-item col-title">${data.title}</div>
        <div class="notification-card-item col-content">${data.message}</div>
        <div class="notification-card-item col-date">${dateStr}</div>
    `;

  // Add click listener for checkbox
  const checkbox = card.querySelector(".circle-checkbox");
  checkbox.addEventListener("click", (e) => {
    e.stopPropagation();
    const checked = checkbox.classList.toggle("checked");
    if (checked) selectedIds.add(id);
    else {
      selectedIds.delete(id);
      const selectAll = document.getElementById("selectAllCheckbox");
      if (selectAll) selectAll.classList.remove("checked");
    }
    if (updateDeleteButtonsVisibility) updateDeleteButtonsVisibility();
  });

  container.appendChild(card);
}

async function deleteSelectedNotifications(ids) {
  const batch = writeBatch(db);
  ids.forEach(id => {
    const docRef = doc(db, "notifications", id);
    batch.delete(docRef);
  });

  try {
    await batch.commit();
    showToast("Announcements deleted successfully! 🗑️✨", "success");
  } catch (error) {
    console.error("Error deleting notifications:", error);
    showToast("Failed to delete notifications. ❌", "error");
  }
}

async function sendNotification() {
  const toInput = document.querySelector(".input-field[placeholder='Recipients']");
  const titleInput = document.querySelector(".input-field[placeholder='Notification title']");
  const msgInput = document.querySelector(".textarea-field");
  const sendBtn = document.querySelector(".send-button");
  if (!toInput || !titleInput || !msgInput || !sendBtn) return;

  const originalText = sendBtn.textContent;

  const recipient = toInput.value.trim();
  const title = titleInput.value.trim();
  const message = msgInput.value.trim();

  if (!recipient || !title || !message) {
    showToast("Please fill all fields.", "error");
    return;
  }

  sendBtn.textContent = "Sending...";
  sendBtn.disabled = true;

  try {
    const user = auth.currentUser;
    const senderName = user ? (user.displayName || user.email) : "Administrator";

    await addDoc(collection(db, "notifications"), {
      recipient: recipient,
      title: title,
      message: message,
      sender: senderName,
      createdAt: serverTimestamp(),
      date: new Date().toISOString()
    });

    showToast("Notification sent!", "success");
    const modal = document.getElementById("notificationModal");
    if (modal) modal.classList.remove("show");

    // Clear fields
    toInput.value = "";
    titleInput.value = "";
    msgInput.value = "";

  } catch (error) {
    console.error("Error sending notification:", error);
    showToast("Failed to send notification.", "error");
  } finally {
    sendBtn.textContent = originalText;
    sendBtn.disabled = false;
  }
}
