$jsPath = 'C:\Users\User\Documents\vscode\newnewnew\Schedsync-main\facultypage.js'
$js = [System.IO.File]::ReadAllText($jsPath)

# 1. Add lockImportUI() function before window.addFaculty
$insertBefore = 'window.addFaculty = function () {'
$newFn = @'
function lockImportUI(message) {
  const msg = message || 'Account generation unavailable. Try again later.';
  localStorage.setItem('importLocked', msg);

  ['uploadDocBtn', 'genEmailsBtn'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.disabled = true; el.title = msg; el.style.opacity = '0.45'; el.style.cursor = 'not-allowed'; }
  });

  if (!document.getElementById('import-lock-banner')) {
    const banner = document.createElement('div');
    banner.id = 'import-lock-banner';
    banner.style.cssText = 'background:#fef2f2;border:2px solid #ef4444;border-radius:10px;padding:10px 14px;margin-bottom:12px;font-size:13px;font-weight:700;color:#b91c1c;display:flex;align-items:center;gap:8px;';
    banner.innerHTML = '<span>🚫</span><span>' + msg + '</span>';
    const toolbar = document.querySelector('.import-toolbar');
    if (toolbar) toolbar.insertAdjacentElement('beforebegin', banner);
  }
}

function restoreImportUI() {
  localStorage.removeItem('importLocked');
  ['uploadDocBtn', 'genEmailsBtn'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.disabled = false; el.title = ''; el.style.opacity = ''; el.style.cursor = ''; }
  });
  document.getElementById('import-lock-banner')?.remove();
}

'@
$js = $js.Replace($insertBefore, $newFn + $insertBefore)

# 2. Call lockImportUI on quota error (replace the existing quota block)
$oldQuota = 'if (isQuota) {
          showToast(`⚠️ Firebase quota exceeded. Import stopped at ${succeeded}/${items.length}. Try again tomorrow or upgrade your Firebase plan.`, "error");
          clearImportProgress();
          loadTeachers();
          return;'
$newQuota = 'if (isQuota) {
          const qMsg = `⚠️ Quota exceeded. Import stopped at ${succeeded}/${items.length}. Try again tomorrow or upgrade your Firebase plan.`;
          showToast(qMsg, "error");
          lockImportUI(qMsg);
          clearImportProgress();
          loadTeachers();
          return;'

if ($js.Contains($oldQuota)) {
    $js = $js.Replace($oldQuota, $newQuota)
    Write-Host "Quota block updated"
} else {
    Write-Host "WARNING: quota block not found"
}

# 3. On DOMContentLoaded, restore lock state from localStorage if previously locked
$oldInit = 'document.addEventListener("DOMContentLoaded", () => {
  initUserProfile("#userProfile");
  initUniversalSearch(db);
  initMobileNav();
  initDragAndDrop();
  initSelectionUI();
  loadTeachers();
});'
$newInit = 'document.addEventListener("DOMContentLoaded", () => {
  initUserProfile("#userProfile");
  initUniversalSearch(db);
  initMobileNav();
  initDragAndDrop();
  initSelectionUI();
  loadTeachers();
  const locked = localStorage.getItem(''importLocked'');
  if (locked) lockImportUI(locked);
});'

if ($js.Contains($oldInit)) {
    $js = $js.Replace($oldInit, $newInit)
    Write-Host "DOMContentLoaded updated"
} else {
    Write-Host "WARNING: DOMContentLoaded block not found"
}

[System.IO.File]::WriteAllText($jsPath, $js)
Write-Host "Done."
