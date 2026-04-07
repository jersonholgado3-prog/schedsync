/**
 * LEGACY TOAST SYSTEM
 * Consolidated into js/utils/ui-utils.js
 * This file is kept for backward compatibility with pages still loading it via <script> tags.
 */

// If ui-utils.js is already loaded (via module), it will have defined these.
// If not, we check for window.showToast from other sources.
// But as of our refactor, ui-utils.js is the source of truth.

if (!window.showToast) {
    console.warn("toast.js: window.showToast not found, please ensure ui-utils.js is loaded.");
}

/* TOAST SYSTEM */

// Create container on load
document.addEventListener("DOMContentLoaded", () => {
    if (!document.getElementById("toast-container")) {
        const container = document.createElement("div");
        container.id = "toast-container";
        document.body.appendChild(container);
    }
});

function showToast(message, type = "info") {
    const container = document.getElementById("toast-container");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = `toast - message ${type} `;

    // Icon based on type
    let icon = "";
    if (type === "success") icon = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1 -5.93 -9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`;
    else if (type === "error") icon = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;
    else icon = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;

    toast.innerHTML = `${icon} <span>${message}</span>`;

    container.appendChild(toast);

    // Remove after 3s
    setTimeout(() => {
        toast.style.animation = "toastSlideOut 0.3s forwards";
        toast.addEventListener("animationend", () => {
            toast.remove();
        });
    }, 3000);
}

/* CONFIRM MODAL */
function showConfirm(message, subMessage = "") {
    return new Promise((resolve) => {
        const overlay = document.createElement("div");
        overlay.className = "confirm-overlay";

        overlay.innerHTML = `
    < div class="confirm-box" >
                <div style="margin-bottom: 20px;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                        <line x1="12" y1="9" x2="12" y2="13"></line>
                        <line x1="12" y1="17" x2="12.01" y2="17"></line>
                    </svg>
                </div>
                <div class="confirm-title">${message}</div>
                ${subMessage ? `<div class="confirm-text">${subMessage}</div>` : ''}
<div class="confirm-buttons">
    <button class="confirm-btn cancel">Cancel</button>
    <button class="confirm-btn confirm">Confirm</button>
</div>
            </div >
    `;

        document.body.appendChild(overlay);

        const cancelBtn = overlay.querySelector(".cancel");
        const confirmBtn = overlay.querySelector(".confirm");

        function close(result) {
            overlay.style.animation = "fadeOut 0.2s forwards";
            const box = overlay.querySelector(".confirm-box");
            if (box) box.style.animation = "fadeOutModal 0.2s forwards";

            const doClose = () => {
                overlay.remove();
                resolve(result);
            };

            // Safety timeout in case animation fails
            const safety = setTimeout(doClose, 300);

            overlay.addEventListener("animationend", () => {
                clearTimeout(safety);
                doClose();
            }, { once: true });
        }

        cancelBtn.onclick = () => close(false);
        confirmBtn.onclick = () => close(true);
    });
}

// Expose to window
window.showToast = showToast;
window.showConfirm = showConfirm;
