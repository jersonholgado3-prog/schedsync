/**
 * UI Utilities for SchedSync
 * Centralized feedback and interaction logic
 */

/**
 * Show a toast notification
 * @param {string} message 
 * @param {string} type - 'success', 'error', 'info', 'warning'
 */
export function showToast(message, type = "info") {
    let container = document.getElementById("toast-container");
    if (!container) {
        container = document.createElement("div");
        container.id = "toast-container";
        document.body.appendChild(container);
    }

    const toast = document.createElement("div");
    toast.className = `toast-message ${type}`;

    // Icon based on type 🎨
    let icon = "";
    switch (type) {
        case "success":
            icon = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1 -5.93 -9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`;
            break;
        case "error":
            icon = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;
            break;
        case "warning":
            icon = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;
            break;
        default:
            icon = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
    }

    toast.innerHTML = `${icon}<span>${message}</span>`;
    container.appendChild(toast);

    // Auto-remove with fallback 💨
    setTimeout(() => {
        toast.style.animation = "toastSlideOut 0.3s forwards";
        // Final cleanup after animation completes
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

/**
 * Show a Maangas-style Confirmation Modal
 * @param {string} title 
 * @param {string} message 
 * @returns {Promise<boolean>}
 */
export function showConfirm(titleOrMessage, messageOrCallback) {
    let title = "Confirm Action";
    let message = "";
    let callback = null;

    if (typeof messageOrCallback === 'function') {
        // Legacy: showConfirm(msg, callback)
        message = titleOrMessage;
        callback = messageOrCallback;
    } else if (typeof messageOrCallback === 'string') {
        // Modern: showConfirm(title, msg)
        title = titleOrMessage;
        message = messageOrCallback;
    } else {
        // Promise-style single argument: showConfirm(msg)
        title = "Confirm Action";
        message = titleOrMessage;
    }

    return new Promise((resolve) => {
        let overlay = document.querySelector('.maangas-confirm-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'maangas-confirm-overlay';
            overlay.innerHTML = `
                <div class="maangas-confirm-box">
                    <div class="maangas-confirm-title" id="confirmTitle">Confirm Action</div>
                    <div class="maangas-confirm-message" id="confirmMessage">Are you sure?</div>
                    <div class="maangas-confirm-actions">
                        <button class="maangas-btn btn-cancel" id="confirmCancelBtn">Cancel</button>
                        <button class="maangas-btn btn-confirm" id="confirmOkBtn">Confirm</button>
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);
        }

        const titleEl = document.getElementById('confirmTitle');
        const messageEl = document.getElementById('confirmMessage');
        const cancelBtn = document.getElementById('confirmCancelBtn');
        const okBtn = document.getElementById('confirmOkBtn');

        titleEl.textContent = title || "Confirm Action";
        messageEl.textContent = message || "Are you sure you want to proceed?";

        const close = (result) => {
            overlay.classList.remove('open');
            setTimeout(() => {
                overlay.style.visibility = 'hidden';
                overlay.style.opacity = '0';
                if (callback && result) callback();
                resolve(result);
            }, 200);
        };

        cancelBtn.onclick = (e) => { e.stopPropagation(); close(false); };
        okBtn.onclick = (e) => { e.stopPropagation(); close(true); };

        // Force Show 🛡️
        overlay.style.visibility = 'visible';
        overlay.style.display = 'flex'; // Ensure it's not display: none
        
        // Use a tiny timeout to ensure the transition plays correctly every time
        setTimeout(() => {
            overlay.classList.add('open');
            overlay.style.opacity = '1';
        }, 10);
    });
}

/**
 * Show a simple prompt for text input
 * @param {string} title 
 * @param {string} message 
 * @returns {Promise<string|null>} - Resolves with the input string or null if cancelled
 */
export function showPrompt(title, message) {
    return new Promise((resolve) => {
        const overlay = document.createElement("div");
        overlay.className = "confirm-overlay"; // Reuse existing styles
        overlay.style.zIndex = "10005";

        overlay.innerHTML = `
            <div class="confirm-box">
                 <div style="margin-bottom: 20px;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="50" height="50" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                    </svg>
                </div>
                <div class="confirm-title">${title}</div>
                <div class="confirm-text">${message}</div>
                <input type="text" class="confirm-input" placeholder="Type here..." id="promptInput" style="width:100%; padding:10px; margin:15px 0; border-radius:8px; border:2px solid #ddd;">
                <div class="confirm-buttons" style="display:flex; gap:10px; justify-content:center;">
                    <button class="confirm-btn cancel" style="padding:10px 20px; border-radius:8px; cursor:pointer; background:#ddd; border:none;">Cancel</button>
                    <button class="confirm-btn confirm" style="padding:10px 20px; border-radius:8px; cursor:pointer; background:#6366f1; color:white; border:none;">Confirm</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);
        const input = overlay.querySelector("#promptInput");
        const cancelBtn = overlay.querySelector(".cancel");
        const confirmBtn = overlay.querySelector(".confirm");

        input.focus();

        const close = (value = null) => {
            overlay.style.animation = "fadeOut 0.2s forwards";
            setTimeout(() => {
                overlay.remove();
                resolve(value);
            }, 200);
        };

        cancelBtn.onclick = () => close(null);
        confirmBtn.onclick = () => close(input.value.trim());
        input.onkeydown = (e) => {
            if (e.key === "Enter") confirmBtn.click();
            if (e.key === "Escape") cancelBtn.click();
        };
    });
}

// Global exposure for non-module scripts
window.showToast = showToast;
window.showConfirm = showConfirm;
window.showPrompt = showPrompt;
