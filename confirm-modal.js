export function showConfirm(title, message, onConfirm, onCancel = null) {
    // 1. Check if modal exists, if not create it
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

        // Inject CSS if not present (though we should link it in HTML ideally, this is a fallback)
        if (!document.querySelector('link[href="confirm-modal.css"]')) {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = 'confirm-modal.css';
            document.head.appendChild(link);
        }
    }

    // 2. Set Content
    document.getElementById('confirmTitle').textContent = title;
    document.getElementById('confirmMessage').textContent = message;

    const cancelBtn = document.getElementById('confirmCancelBtn');
    const okBtn = document.getElementById('confirmOkBtn');

    // 3. Handle Events (Cleanup old listeners to avoid duplicates)
    // Clone nodes to remove listeners is a quick hack
    const newCancel = cancelBtn.cloneNode(true);
    const newOk = okBtn.cloneNode(true);

    cancelBtn.parentNode.replaceChild(newCancel, cancelBtn);
    okBtn.parentNode.replaceChild(newOk, okBtn);

    const close = () => {
        overlay.classList.remove('open');
        document.removeEventListener('keydown', handleKeydown); // Clean up
        setTimeout(() => {
            overlay.style.visibility = 'hidden'; // Ensure it's hidden after transition
        }, 200);
    };

    const handleKeydown = (e) => {
        if (!overlay.classList.contains('open')) return;

        if (e.key === 'Enter') {
            e.preventDefault();
            close();
            onConfirm();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            close();
            if (onCancel) onCancel();
        }
    };

    // Add global keydown for Enter/Escape 🎹🛡️
    document.addEventListener('keydown', handleKeydown);

    newCancel.addEventListener('click', () => {
        close();
        if (onCancel) onCancel();
    });

    newOk.addEventListener('click', () => {
        close();
        onConfirm();
    });

    // 4. Show Modal
    // Force reflow
    overlay.style.visibility = 'visible';
    // Small timeout to allow transition
    requestAnimationFrame(() => {
        overlay.classList.add('open');
    });
}

// Make it globally available
window.showMaangasConfirm = showConfirm;
