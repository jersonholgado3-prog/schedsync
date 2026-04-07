import { db, auth } from "./js/config/firebase-config.js";
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  where, // Retained 'where' for loadTeachers function
  getDocs // Retained 'getDocs' for loadTeachers function
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { initUniversalSearch } from './search.js';
import { initUserProfile } from "./userprofile.js";
import { initMobileNav } from "./js/ui/mobile-nav.js";
import { showToast, showConfirm } from "./js/utils/ui-utils.js";




async function loadTeachers() {
  const facultyGrid = document.getElementById("facultyGrid");
  if (!facultyGrid) return;
  facultyGrid.innerHTML = "<p style='text-align: center; width: 100%; grid-column: 1/-1;'>Loading teachers...</p>";

  try {
    const q = query(
      collection(db, "users"),
      where("role", "==", "teacher")
    );

    const snap = await getDocs(q);

    if (snap.empty) {
      facultyGrid.innerHTML = "<p style='text-align: center; width: 100%; grid-column: 1/-1;'>No teachers found.</p>";
      return;
    }

    facultyGrid.innerHTML = "";

    snap.forEach(docSnap => {
      const d = docSnap.data();
      const subjects = (d.subjects || []).join(", ");
      const teacherName = d.username || d.name || "Unnamed Teacher";
      const employmentStatus = d.employmentStatus || d.status || "N/A";

      const card = document.createElement("div");
      card.className = "faculty-card";

      // SEARCH DATA
      card.dataset.title = teacherName;
      card.dataset.description = `${subjects} ${employmentStatus} `;

      card.onclick = () => {
        window.location.href = "facultyprofile.html?id=" + docSnap.id;
      };

      card.innerHTML = `
        <div class="faculty-photo">
          <img src="${d.photoURL || 'images/default_shark.jpg'}"
            onerror="this.src='images/default_shark.jpg'">
        </div>
        <div class="faculty-name">${teacherName}</div>
        <div class="faculty-details">
          ${subjects ? `<strong>Subjects:</strong> ${subjects}` : "No subjects assigned"}
        </div>
        <div class="status-badge ${employmentStatus.toLowerCase().includes('regular') ? 'status-regular' : 'status-parttime'}">
          ${employmentStatus}
        </div>
`;

      facultyGrid.appendChild(card);
    });



  } catch (error) {
    console.error("Error loading teachers:", error);
    facultyGrid.innerHTML = `<p style='text-align: center; width: 100%; grid-column: 1/-1;'>Error loading teachers. Please try again.</p>`;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initUserProfile("#userProfile");
  initUniversalSearch(db);
  initMobileNav();
  loadTeachers();
});

// FAB (Keep existing placeholder)
window.addFaculty = function () {
  showToast("Add Faculty clicked!", "info");
};
