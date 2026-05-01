# ✅ Clear All Curriculum - Archive or Delete Choice

## What Changed

The "Clear All" button in curriculum page now shows a choice modal: **Move to Archive** or **Delete Permanently** instead of immediately deleting everything.

---

## New Flow

### Before (Dangerous):
```
Click "Clear All" → Confirm → Everything deleted forever ❌
```

### After (Safe):
```
Click "Clear All" → Choose action:
  📦 Move to Archive (can restore later) ✅
  🗑️ Delete Permanently (cannot undo) ⚠️
  Cancel
```

---

## Modal UI

```
┌─────────────────────────────────────────┐
│ ⚠️ Clear All courses?                   │
│ Choose what to do with 5 courses:      │
│                                         │
│  ┌───────────────────────────────────┐ │
│  │  📦  Move to Archive              │ │
│  └───────────────────────────────────┘ │
│                                         │
│  ┌───────────────────────────────────┐ │
│  │  🗑️  Delete Permanently           │ │
│  └───────────────────────────────────┘ │
│                                         │
│  [Cancel]                               │
│                                         │
│  💡 Archived items can be restored     │
└─────────────────────────────────────────┘
```

---

## User Flow

### Option 1: Move to Archive
```
1. Click "Clear All"
2. Modal appears with 2 choices
3. Click "📦 Move to Archive"
4. Enter reason (optional)
5. All courses archived
6. Can restore later from Archives page
```

### Option 2: Delete Permanently
```
1. Click "Clear All"
2. Modal appears with 2 choices
3. Click "🗑️ Delete Permanently"
4. Extra confirmation: "This CANNOT be undone!"
5. All courses deleted forever
6. Cannot restore
```

---

## Files Created

### **archive-or-delete-modal.js**
- Custom modal with 3 buttons
- Archive (orange), Delete (red), Cancel (gray)
- Returns: 'archive', 'delete', or null
- Clean, modern design

---

## Files Modified

### **curriculumpage.js**
- Updated `clearAllBtn` handler
- Shows archive/delete choice modal
- If archive: prompts for reason, archives all courses
- If delete: extra confirmation, deletes permanently
- Shows progress toasts

---

## Benefits

✅ **Safer Default** - Archive instead of delete  
✅ **User Choice** - Let admin decide  
✅ **Can Restore** - Archived courses recoverable  
✅ **Extra Confirmation** - Double-check for permanent delete  
✅ **Bulk Archive** - Archive all courses at once  
✅ **Progress Feedback** - Shows "Archiving..." toast  

---

## Use Cases

### 1. End of Academic Year
```
Clear All → Archive → Reason: "SY 2024-2025 ended"
All old curriculum archived, can restore if needed
```

### 2. Major Curriculum Overhaul
```
Clear All → Archive → Reason: "Backup before new curriculum"
Safe backup before uploading new PDFs
```

### 3. Testing/Development
```
Clear All → Delete Permanently
Quick cleanup during testing
```

---

## Code Flow

```javascript
clearAllBtn.click()
  ↓
showArchiveOrDeleteModal(5, 'courses')
  ↓
User chooses:
  ├─ Archive → showArchiveModal() → archiveItem() × 5
  ├─ Delete → confirm() → deleteDoc() × 5
  └─ Cancel → return
```

---

## Testing Checklist

- [ ] Click "Clear All" → See choice modal
- [ ] Click "Move to Archive" → Enter reason → Verify all archived
- [ ] Archives page → See all courses
- [ ] Restore one course → Verify it's back
- [ ] Click "Delete Permanently" → Confirm → Verify all deleted
- [ ] Try cancel → Verify nothing happens

---

**Status:** ✅ COMPLETE  
**Safer clear all:** ✅ YES  
**Archive option:** ✅ YES

Tapos na! Now "Clear All" has archive option! 🎉
