// Archive Confirmation Modal
export function showArchiveModal(itemCount, itemType) {
  return new Promise((resolve) => {
    const modal = document.createElement('div');
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9999;';

    modal.innerHTML = `
      <div style="background:white;border-radius:16px;padding:28px;max-width:400px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.3);border:2px solid #000;text-align:center;">
        <div style="font-size:2.5rem;margin-bottom:12px;">📦</div>
        <h3 style="margin:0 0 8px 0;font-size:1.2rem;font-weight:700;color:#1e293b;">Archive ${itemCount} ${itemType}?</h3>
        <p style="margin:0 0 24px 0;color:#64748b;font-size:0.9rem;">This will move the item(s) to Archives.<br>You can restore them anytime.</p>
        <div style="display:flex;gap:12px;">
          <button id="archiveCancelBtn" style="flex:1;padding:12px;border:2px solid #000;border-radius:8px;background:#f1f5f9;font-weight:700;cursor:pointer;font-size:0.95rem;">Cancel</button>
          <button id="archiveConfirmBtn" style="flex:1;padding:12px;border:2px solid #000;border-radius:8px;background:#f97316;color:white;font-weight:700;cursor:pointer;font-size:0.95rem;">Archive</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    modal.querySelector('#archiveCancelBtn').onclick = () => { modal.remove(); resolve(null); };
    modal.querySelector('#archiveConfirmBtn').onclick = () => { modal.remove(); resolve(''); };
    modal.onclick = (e) => { if (e.target === modal) { modal.remove(); resolve(null); } };
  });
}
