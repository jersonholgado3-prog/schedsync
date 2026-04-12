import { db, auth, app } from "./js/config/firebase-config.js";
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
  Timestamp,
  limit
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
      if (modal) {
        modal.classList.remove("show");
        resetForm(); // Clean up 🧹
      }
    });
  }

  if (sendBtn) {
    sendBtn.addEventListener("click", async () => {
      await sendNotification();
    });
  }

  // Image URL Preview Logic 📸
  const imageUrlInput = document.getElementById("notificationImageUrl");
  const imagePreview = document.getElementById("imagePreview");
  const previewImg = document.getElementById("previewImg");

  if (imageUrlInput) {
    imageUrlInput.oninput = () => {
      const url = imageUrlInput.value.trim();
      if (url) {
        previewImg.src = url;
        imagePreview.style.display = "block";
        previewImg.onerror = () => {
          imagePreview.style.display = "none";
        };
      } else {
        resetImagePreview();
      }
    };
  }

  function resetImagePreview() {
    if (imageUrlInput) imageUrlInput.value = "";
    if (imagePreview) imagePreview.style.display = "none";
    if (previewImg) previewImg.src = "";
  }

  function resetForm() {
    const fields = document.querySelectorAll(".input-field, .textarea-field");
    fields.forEach(f => f.value = "");
    resetImagePreview();
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

  // 🦴 SHOW SKELETONS while loading
  container.innerHTML = `
    <div class="skeleton-item skeleton" style="height: 60px;"></div>
    <div class="skeleton-item skeleton" style="height: 60px;"></div>
    <div class="skeleton-item skeleton" style="height: 60px;"></div>
  `;

  // Listen to notifications collection with a limit to stay within free tier easily 🛡️
  const q = query(collection(db, "notifications"), orderBy("createdAt", "desc"), limit(50));

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
  const hasImage = data.imageUrl ? `<span title="Has Attachment" style="margin-left: 5px; cursor: help;">🖼️</span>` : "";

  card.innerHTML = `
        <div class="circle-checkbox ${isChecked ? 'checked' : ''}"></div>
        <div class="notification-card-item col-from">By: ${data.sender || "System"}</div>
        <div class="notification-card-item col-title">${data.title} ${hasImage}</div>
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
  const imageUrlInput = document.getElementById("notificationImageUrl");
  const sendBtn = document.querySelector(".send-button");
  if (!toInput || !titleInput || !msgInput || !sendBtn) return;

  const originalText = sendBtn.textContent;

  const recipient = toInput.value.trim();
  const title = titleInput.value.trim();
  const message = msgInput.value.trim();
  const imageUrl = imageUrlInput ? imageUrlInput.value.trim() : null;

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
      date: new Date().toISOString(),
      isAnnouncement: true, // Mark for homepage carousel ⚓
      imageUrl: imageUrl // External URL link
    });

    showToast("Notification sent! 🚀✨", "success");
    const modal = document.getElementById("notificationModal");
    if (modal) modal.classList.remove("show");

    // Clear fields
    toInput.value = "";
    titleInput.value = "";
    msgInput.value = "";
    if (imageUrlInput) imageUrlInput.value = "";
    const imagePreview = document.getElementById("imagePreview");
    if (imagePreview) imagePreview.style.display = "none";

  } catch (error) {
    console.error("Error sending notification:", error);
    showToast("Failed to send notification.", "error");
  } finally {
    sendBtn.textContent = originalText;
    sendBtn.disabled = false;
  }
}

