# Archives Feature Implementation Plan

## Overview
Add an Archives system for admins to store and manage old/inactive schedules, faculty records, sections, and events.

---

## 1. Database Structure (Firestore)

### New Collection: `archives`
```
archives/
  ├── schedules/          # Archived schedules
  │   └── {scheduleId}
  │       ├── archivedAt: timestamp
  │       ├── archivedBy: userId
  │       ├── originalData: {...}
  │       ├── reason: string
  │       └── academicYear: string
  │
  ├── faculty/            # Archived faculty
  │   └── {facultyId}
  │       ├── archivedAt: timestamp
  │       ├── archivedBy: userId
  │       ├── originalData: {...}
  │       └── reason: string
  │
  ├── sections/           # Archived sections
  │   └── {sectionId}
  │       ├── archivedAt: timestamp
  │       ├── archivedBy: userId
  │       ├── originalData: {...}
  │       └── academicYear: string
  │
  └── events/             # Archived events
      └── {eventId}
          ├── archivedAt: timestamp
          ├── archivedBy: userId
          ├── originalData: {...}
          └── reason: string
```

---

## 2. UI Components

### A. New Page: `archives.html`
**Location:** Root directory  
**Access:** Admin only (role-restriction.js)

**Layout:**
```
┌─────────────────────────────────────────┐
│  Header + Sidebar (existing)            │
├─────────────────────────────────────────┤
│  ARCHIVES                               │
│  ┌───────────────────────────────────┐  │
│  │ [Schedules] [Faculty] [Sections]  │  │
│  │ [Events]                          │  │
│  └───────────────────────────────────┘  │
│                                         │
│  Search: [____________] 🔍              │
│  Filter: [Academic Year ▼] [Type ▼]    │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │ 📦 BSIT 3A - SY 2024-2025       │   │
│  │    Archived: Jan 15, 2025       │   │
│  │    By: Admin User               │   │
│  │    [View] [Restore] [Delete]    │   │
│  ├─────────────────────────────────┤   │
│  │ 📦 Prof. Juan Dela Cruz         │   │
│  │    Archived: Dec 10, 2024       │   │
│  │    Reason: Retired              │   │
│  │    [View] [Restore] [Delete]    │   │
│  └─────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

### B. Add Archive Button to Existing Pages
- **sectionspage.html** → "Archive" button on each section card
- **facultypage.html** → "Archive" button on each faculty card  
- **homepage.html** → "Archive" button on draft schedules
- **event.html** → "Archive" button on event details

---

## 3. Core Functions

### `archives.js` (new file)
```javascript
// Archive item
async function archiveItem(type, itemId, reason) {
  // type: 'schedule', 'faculty', 'section', 'event'
  // 1. Get original data from main collection
  // 2. Move to archives/{type}/{itemId}
  // 3. Delete from main collection
  // 4. Log audit trail
  // 5. Send notification to relevant users
}

// Restore item
async function restoreItem(type, itemId) {
  // 1. Get data from archives
  // 2. Move back to main collection
  // 3. Delete from archives
  // 4. Log audit trail
}

// Permanent delete
async function permanentDelete(type, itemId) {
  // 1. Confirm with admin
  // 2. Delete from archives
  // 3. Log audit trail
}

// Search/filter archives
async function searchArchives(filters) {
  // filters: { type, academicYear, dateRange, keyword }
}
```

---

## 4. Implementation Steps

### Phase 1: Backend Setup
1. ✅ Create Firestore security rules for `archives` collection (admin-only)
2. ✅ Create `archives.js` with core functions
3. ✅ Add archive/restore functions to existing modules

### Phase 2: UI Development
1. ✅ Create `archives.html` + `archives.css`
2. ✅ Add "Archive" buttons to:
   - Section cards (sectionspage.html)
   - Faculty cards (facultypage.html)
   - Draft schedules (homepage.html)
   - Events (event.html)
3. ✅ Add "Archives" link to sidebar navigation (admin only)

### Phase 3: Integration
1. ✅ Connect archive buttons to `archiveItem()` function
2. ✅ Add confirmation modals ("Are you sure?")
3. ✅ Add reason input for archiving
4. ✅ Update audit logs to track archive/restore actions

### Phase 4: Testing
1. ✅ Test archive → restore flow
2. ✅ Test permanent delete
3. ✅ Test search/filter functionality
4. ✅ Test role restrictions (admin-only access)

---

## 5. File Structure

```
Schedsync-main/
├── archives.html          (NEW)
├── archives.js            (NEW)
├── archives_styles.css    (NEW)
├── sectionspage.html      (MODIFY - add archive button)
├── facultypage.html       (MODIFY - add archive button)
├── homepage.html          (MODIFY - add archive button)
├── event.html             (MODIFY - add archive button)
└── role-restriction.js    (MODIFY - add archives page to admin-only)
```

---

## 6. Security Rules (Firestore)

```javascript
match /archives/{type}/{itemId} {
  allow read, write: if request.auth != null && 
                        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
}
```

---

## 7. Features Summary

✅ **Archive** - Move old data to archives  
✅ **Restore** - Bring back archived data  
✅ **Permanent Delete** - Remove from archives forever  
✅ **Search/Filter** - Find archived items by year, type, keyword  
✅ **Audit Trail** - Track who archived/restored what and when  
✅ **Admin-Only** - Only admins can access archives  
✅ **Reason Logging** - Record why items were archived  

---

## 8. Next Steps

**Ready to implement?** I can start with:
1. Creating `archives.html` + `archives.js` + `archives_styles.css`
2. Adding archive buttons to existing pages
3. Setting up the Firestore structure

**Gusto mo bang simulan na?**
