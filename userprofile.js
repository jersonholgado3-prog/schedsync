import { db, auth, app } from "./js/config/firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { getUIMode, setUIMode } from "./ui-effects.js";
import { showToast, showConfirm } from "./js/utils/ui-utils.js";


/**
 * Initializes the User Profile pill in the header with a Burger Dropdown.
 */
export function initUserProfile(profileSelector = "#userProfile") {
  const userProfileEl = document.querySelector(profileSelector);
  if (!userProfileEl || userProfileEl.dataset.initialized) return;
  userProfileEl.dataset.initialized = "true";

  const userNameEl = userProfileEl.querySelector(".user-name");
  const userAvatarEl = userProfileEl.querySelector(".user-avatar");

  // Check for existing dropdown to prevent duplicates 🛡️
  if (document.getElementById('user-dropdown-menu')) return;

  // Create Dropdown Container 🍔
  const dropdown = document.createElement('div');
  dropdown.id = 'user-dropdown-menu';
  dropdown.className = 'user-dropdown-container';
  dropdown.style.cssText = `
    position: absolute;
    top: 100%;
    right: 0;
    width: 240px;
    margin-top: 10px;
    border: 3px solid black;
    border-radius: 20px;
    box-shadow: 6px 6px 0px black;
    display: none; 
    flex-direction: column;
    overflow: hidden;
    z-index: 10000;
    opacity: 0;
    transform: translateY(-10px);
    transition: opacity 0.2s ease, transform 0.2s ease;
  `;

  // 1. Setup Auth Listener
  onAuthStateChanged(auth, (user) => {
    if (user) {
      if (userNameEl) userNameEl.textContent = user.displayName || user.email.split("@")[0] || "User";
      if (userAvatarEl) {
        const pfp = user.photoURL || "images/default_shark.jpg";
        userAvatarEl.innerHTML = `<img src="${pfp}" alt="Avatar" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
      }
    }
  });

  // 2. Render Dropdown Content (Once)
  const renderDropdownItems = () => {
    const userRole = localStorage.getItem('userRole') || 'student';
    const adminLink = userRole === 'admin'
      ? `<div class="dropdown-item dropdown-admin" onclick="window.location.href='permissions.html'">
           🛡️ Manage Permissions
         </div>`
      : '';

    dropdown.innerHTML = `
      <div class="dropdown-item" onclick="window.location.href='profile.html'">
        👤 View Profile
      </div>
      ${adminLink}
      <div class="dropdown-item" id="drop-toggle-mode">
        🦈 Student Mode
      </div>
      <div class="dropdown-item" id="drop-toggle-theme">
        🌙 Dark Mode
      </div>
      <div class="dropdown-item" id="drop-logout" style="background: #ef4444; color: white;">
        🚪 Logout
      </div>
    `;

    // Attach Listeners
    const modeToggle = dropdown.querySelector('#drop-toggle-mode');
    if (modeToggle) modeToggle.onclick = (e) => {
      e.stopPropagation();
      const newMode = getUIMode() === 'professional' ? 'student' : 'professional';
      setUIMode(newMode);
      updateModeToggleText();
      showToast(`${newMode.charAt(0).toUpperCase() + newMode.slice(1)} Mode Activated!`, "success");
    };

    const themeToggle = dropdown.querySelector('#drop-toggle-theme');
    if (themeToggle) themeToggle.onclick = (e) => {
      e.stopPropagation();
      const html = document.documentElement;
      const willBeDark = html.classList.toggle('dark');
      localStorage.setItem('theme', willBeDark ? 'dark' : 'light');
      updateThemeToggleText();

      // Force update atmosphere for instant feedback
      if (window.updateAtmosphere) window.updateAtmosphere();
    };

    const logoutBtn = dropdown.querySelector('#drop-logout');
    if (logoutBtn) logoutBtn.onclick = async (e) => {
      e.stopPropagation();

      const confirmed = await showConfirm(
        "Logout",
        "Are you sure you want to logout? 🚪"
      );

      if (confirmed) {
        try {
          localStorage.setItem('manual_logout', 'true');
          await signOut(auth);
          window.location.href = "index.html";
        } catch (error) {
          console.error("Logout Error:", error);
          showToast("Failed to logout. Please try again.", "error");
        }
      }
    };

    // Set initial text
    updateThemeToggleText();
    updateModeToggleText();

    // ✅ LISTEN FOR GLOBAL MODE CHANGES
    window.addEventListener('uimodechange', () => {
      updateModeToggleText();
    });
  };

  // 3. Burger Icon & Container Setup
  if (!userProfileEl.querySelector('.burger-icon')) {
    const burger = document.createElement('div');
    burger.className = 'burger-icon';
    burger.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
        <line x1="3" y1="12" x2="21" y2="12"></line>
        <line x1="3" y1="6" x2="21" y2="6"></line>
        <line x1="3" y1="18" x2="21" y2="18"></line>
      </svg>
    `;
    burger.style.marginRight = '10px';
    userProfileEl.prepend(burger);
  }

  // Ensure parent is relative for absolute positioning
  // Check if parent exists to avoid errors
  if (userProfileEl.parentElement) {
    userProfileEl.parentElement.style.position = 'relative';
    userProfileEl.parentElement.appendChild(dropdown);
  }

  // Toggle Visibility 🍔
  userProfileEl.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();

    const isShowing = dropdown.classList.contains('active');

    if (isShowing) {
      dropdown.classList.remove('active');
    } else {
      renderDropdownItems();
      dropdown.classList.add('active');
    }
  });

  // Close when clicking anywhere else 🖱️
  document.addEventListener('click', (e) => {
    if (dropdown.classList.contains('active')) {
      if (!userProfileEl.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.classList.remove('active');
      }
    }
  });
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideDown {
      from { opacity: 0; transform: translateY(-10px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .user-dropdown-container.active {
      display: flex !important;
      opacity: 1 !important;
      transform: translateY(0) !important;
    }

    .dropdown-item {
      margin: 10px;
      padding: 12px 15px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      cursor: pointer;
      font-weight: 800;
      transition: all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
      background: white; 
      border: 2px solid black;
      border-radius: 12px;
      box-shadow: 4px 4px 0px black;
      color: black;
      text-transform: uppercase;
      font-size: 13px;
    }
    .dropdown-item:hover { 
      transform: translate(-2px, -2px);
      box-shadow: 6px 6px 0px black;
      background: #f1f5f9;
    }
    
    #user-dropdown-menu { background: #f8fafc; } /* Clean off-white background */

    .dark #user-dropdown-menu { background: #1e293b; border-color: #334155; }
    .dark .dropdown-item { 
      background: #334155; /* Lighter grey for better visibility 🌑 */
      color: white; 
      border-color: black;
      box-shadow: 4px 4px 0px black;
    }
    .dark .dropdown-item:hover { 
      background: #475569; 
      box-shadow: 6px 6px 0px black;
    }
  `;
  document.head.appendChild(style);

  // 4. Initial Render
  renderDropdownItems();
}

function updateThemeToggleText() {
  const toggle = document.getElementById('drop-toggle-theme');
  if (toggle) {
    const isDark = document.documentElement.classList.contains('dark');
    toggle.textContent = isDark ? '☀️ Light Mode' : '🌙 Dark Mode';
  }
}

function updateModeToggleText() {
  const toggle = document.getElementById('drop-toggle-mode');
  if (toggle) {
    const uiMode = getUIMode();
    const isProfessional = uiMode === 'professional';
    // ✅ SHOW TARGET MODE (The one we are NOT currently in)
    toggle.textContent = isProfessional ? '🦈 Student Mode' : '👔 Professional Mode';
  }
}

