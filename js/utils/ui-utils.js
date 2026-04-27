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
    let title = "Confirm Action", message = "", callback = null;
    if (typeof messageOrCallback === "function") { message = titleOrMessage; callback = messageOrCallback; }
    else if (typeof messageOrCallback === "string") { title = titleOrMessage; message = messageOrCallback; }
    else { message = titleOrMessage; }

    return new Promise((resolve) => {
        const overlay = document.createElement("div");
        overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.5);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;z-index:99999;";
        overlay.innerHTML = `
            <div style="background:#fff;border:3px solid #000;border-radius:20px;box-shadow:6px 6px 0 #000;padding:2rem;width:90%;max-width:400px;display:flex;flex-direction:column;gap:16px;font-family:Poppins,sans-serif;text-align:center;">
                <div style="font-size:1.1rem;font-weight:800;text-transform:uppercase;">${title}</div>
                <div style="font-size:0.9rem;color:#334155;line-height:1.5;">${message}</div>
                <div style="display:flex;gap:10px;justify-content:center;">
                    <button id="scCancelBtn" style="flex:1;padding:10px;border:2px solid #000;border-radius:10px;background:#f1f5f9;font-weight:700;cursor:pointer;">Cancel</button>
                    <button id="scConfirmBtn" style="flex:1;padding:10px;border:2px solid #000;border-radius:10px;background:#000;color:#fff;font-weight:700;cursor:pointer;">Confirm</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        const close = (result) => { overlay.remove(); if (callback && result) callback(); resolve(result); };
        overlay.querySelector("#scCancelBtn").onclick = (e) => { e.stopPropagation(); close(false); };
        overlay.querySelector("#scConfirmBtn").onclick = (e) => { e.stopPropagation(); close(true); };
        overlay.onclick = (e) => { if (e.target === overlay) close(false); };
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
        overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.5);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;z-index:99999;";
        overlay.innerHTML = `
            <div style="background:#fff;border:3px solid #000;border-radius:20px;box-shadow:6px 6px 0 #000;padding:2rem;width:90%;max-width:400px;display:flex;flex-direction:column;gap:12px;font-family:Poppins,sans-serif;">
                <div style="font-size:1.1rem;font-weight:800;">${title}</div>
                <div style="font-size:0.85rem;color:#64748b;">${message}</div>
                <input type="text" id="promptInput" placeholder="Type here..." style="width:100%;padding:10px 12px;border:2px solid #000;border-radius:10px;font-size:0.9rem;outline:none;box-sizing:border-box;">
                <div style="display:flex;gap:10px;justify-content:flex-end;">
                    <button id="promptCancel" style="padding:8px 18px;border:2px solid #000;border-radius:10px;background:#fff;font-weight:700;cursor:pointer;">Cancel</button>
                    <button id="promptConfirm" style="padding:8px 18px;border:2px solid #000;border-radius:10px;background:#000;color:#fff;font-weight:700;cursor:pointer;">Confirm</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        const input = overlay.querySelector("#promptInput");
        input.focus();
        const close = (value = null) => { overlay.remove(); resolve(value); };
        overlay.querySelector("#promptCancel").onclick = () => close(null);
        overlay.querySelector("#promptConfirm").onclick = () => close(input.value.trim());
        input.onkeydown = (e) => { if (e.key === "Enter") close(input.value.trim()); if (e.key === "Escape") close(null); };
        overlay.onclick = (e) => { if (e.target === overlay) close(null); };
    });
}

// Global exposure for non-module scripts
window.showToast = showToast;
window.showConfirm = showConfirm;
window.showPrompt = showPrompt;
