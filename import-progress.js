// import-progress.js
const KEY = 'importProgress';
const CANCEL_KEY = 'importCancelled';

function getState() {
  try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; }
}
function setState(state) {
  if (state) localStorage.setItem(KEY, JSON.stringify(state));
  else localStorage.removeItem(KEY);
}

export function isCancelled() {
  return localStorage.getItem(CANCEL_KEY) === '1';
}

function getOrCreateBar() {
  let bar = document.getElementById('import-progress-bar');
  if (bar) return bar;

  bar = document.createElement('div');
  bar.id = 'import-progress-bar';
  bar.innerHTML = `
    <div class="ipb-label">
      <span class="ipb-icon">⚙️</span>
      <span class="ipb-text">Importing faculty...</span>
      <button class="ipb-cancel" title="Cancel import">✕</button>
    </div>
    <div class="ipb-track"><div class="ipb-fill"></div></div>
    <div class="ipb-count"></div>
  `;
  document.body.appendChild(bar);

  bar.querySelector('.ipb-cancel').addEventListener('click', () => {
    // Set cancel flag — loop will see this and stop calling tick/setState
    localStorage.setItem(CANCEL_KEY, '1');
    setState(null);
    bar.querySelector('.ipb-text').textContent = 'Cancelling...';
    bar.querySelector('.ipb-icon').style.animation = 'none';
    bar.querySelector('.ipb-icon').textContent = '🛑';
    bar.querySelector('.ipb-cancel').disabled = true;
    // Hide after short delay
    setTimeout(() => bar.classList.remove('visible'), 2000);
  });

  if (!document.getElementById('ipb-style')) {
    const style = document.createElement('style');
    style.id = 'ipb-style';
    style.textContent = `
      #import-progress-bar {
        position: fixed; bottom: 80px; right: 24px; width: 260px;
        background: #fff; border: 3px solid #000; border-radius: 16px;
        box-shadow: 5px 5px 0 #000; padding: 12px 16px; z-index: 9999;
        font-family: 'Inter', system-ui, sans-serif;
        display: none; flex-direction: column; gap: 8px;
        animation: ipbSlideIn 0.3s cubic-bezier(0.34,1.56,0.64,1) forwards;
      }
      #import-progress-bar.visible { display: flex; }
      .dark #import-progress-bar { background: #1e293b; border-color: #334155; color: #f1f5f9; }
      .ipb-label { display: flex; align-items: center; gap: 8px; font-weight: 800; font-size: 13px; }
      .ipb-text { flex: 1; }
      .ipb-icon { animation: ipbSpin 1.2s linear infinite; display: inline-block; }
      .ipb-cancel {
        background: none; border: 2px solid #000; border-radius: 6px;
        font-size: 11px; font-weight: 900; cursor: pointer; padding: 1px 5px; color: #000;
      }
      .ipb-cancel:hover { background: #ef4444; color: #fff; border-color: #ef4444; }
      .ipb-cancel:disabled { opacity: 0.4; cursor: not-allowed; }
      .dark .ipb-cancel { border-color: #475569; color: #f1f5f9; }
      .ipb-track { height: 10px; background: #e2e8f0; border-radius: 99px; border: 2px solid #000; overflow: hidden; }
      .dark .ipb-track { background: #334155; border-color: #475569; }
      .ipb-fill { height: 100%; background: #3b82f6; border-radius: 99px; transition: width 0.4s ease; width: 0%; }
      .ipb-count { font-size: 12px; font-weight: 700; color: #64748b; text-align: right; }
      .dark .ipb-count { color: #94a3b8; }
      @keyframes ipbSpin { to { transform: rotate(360deg); } }
      @keyframes ipbSlideIn { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
    `;
    document.head.appendChild(style);
  }
  return bar;
}

function render(state) {
  const bar = getOrCreateBar();
  if (!state) { bar.classList.remove('visible'); return; }
  const pct = state.total > 0 ? Math.round((state.done / state.total) * 100) : 0;
  bar.querySelector('.ipb-fill').style.width = pct + '%';
  bar.querySelector('.ipb-count').textContent = `${state.done} / ${state.total} (${pct}%)`;
  bar.querySelector('.ipb-text').textContent =
    state.done >= state.total ? 'Import complete!' : 'Importing faculty...';
  if (state.done >= state.total) {
    bar.querySelector('.ipb-icon').style.animation = 'none';
    bar.querySelector('.ipb-icon').textContent = '✅';
    bar.querySelector('.ipb-fill').style.background = '#22c55e';
  }
  bar.classList.add('visible');
}

export function startImportProgress(total) {
  localStorage.removeItem(CANCEL_KEY); // clear any previous cancel
  setState({ total, done: 0 });
  render(getState());
}

export function tickImportProgress() {
  if (isCancelled()) return; // don't update if cancelled
  const s = getState();
  if (!s) return;
  s.done = Math.min(s.done + 1, s.total);
  setState(s);
  render(s);
  if (s.done >= s.total) {
    setTimeout(() => { setState(null); render(null); }, 3000);
  }
}

export function clearImportProgress() {
  setState(null);
  render(null);
}

document.addEventListener('DOMContentLoaded', () => {
  // Don't restore bar if cancelled
  if (isCancelled()) { setState(null); return; }
  const s = getState();
  if (s) render(s);
});
