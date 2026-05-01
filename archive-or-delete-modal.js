// Archive or Delete Choice Modal
export function showArchiveOrDeleteModal(itemCount, itemType) {
  return new Promise((resolve) => {
    const modal = document.createElement('div');
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9999;';
    
    modal.innerHTML = `
      <div style="background:white;border-radius:16px;padding:24px;max-width:500px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.3);border:2px solid #000;">
        <h3 style="margin:0 0 8px 0;font-size:1.25rem;font-weight:700;color:#1e293b;">⚠️ Clear All ${itemType}?</h3>
        <p style="margin:0 0 20px 0;color:#64748b;font-size:0.9rem;">Choose what to do with ${itemCount} ${itemType}:</p>
        
        <div style="display:flex;flex-direction:column;gap:12px;">
          <button id="archiveAllBtn" style="width:100%;padding:16px;border:2px solid #000;border-radius:12px;background:#3b82f6;color:white;font-weight:700;cursor:pointer;font-size:1rem;display:flex;align-items:center;justify-content:center;gap:8px;">
            <span style="font-size:1.2rem;">📦</span>
            <span>Move to Archive</span>
          </button>
          
          <button id="deleteAllBtn" style="width:100%;padding:16px;border:2px solid #000;border-radius:12px;background:#ef4444;color:white;font-weight:700;cursor:pointer;font-size:1rem;display:flex;align-items:center;justify-content:center;gap:8px;">
            <span style="font-size:1.2rem;">🗑️</span>
            <span>Delete Permanently</span>
          </button>
          
          <button id="cancelAllBtn" style="width:100%;padding:12px;border:2px solid #000;border-radius:12px;background:#f1f5f9;font-weight:700;cursor:pointer;font-size:0.95rem;">Cancel</button>
        </div>
        
        <p style="margin:16px 0 0 0;font-size:0.8rem;color:#94a3b8;text-align:center;">💡 Archived items can be restored later</p>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    const archiveBtn = modal.querySelector('#archiveAllBtn');
    const deleteBtn = modal.querySelector('#deleteAllBtn');
    const cancelBtn = modal.querySelector('#cancelAllBtn');
    
    archiveBtn.onclick = () => {
      modal.remove();
      resolve('archive');
    };
    
    deleteBtn.onclick = () => {
      modal.remove();
      resolve('delete');
    };
    
    cancelBtn.onclick = () => {
      modal.remove();
      resolve(null);
    };
    
    modal.onclick = (e) => {
      if (e.target === modal) {
        modal.remove();
        resolve(null);
      }
    };
  });
}
