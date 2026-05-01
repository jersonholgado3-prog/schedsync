# ✅ Curriculum Archive - Fixed (Archive Whole Course)

## What Changed

Now archives the **entire course/program** (like "BSIT", "ITM") instead of individual subjects. When you archive a course, all its subjects are preserved and can be viewed in the archives.

---

## How It Works Now

### Archive a Course:
```
1. Go to Curriculum page
2. See course folders (BSIT, ITM, etc.)
3. Click 📦 button next to course name
4. Enter reason in popup modal
5. Entire course archived with ALL subjects
```

### View Archived Course:
```
1. Go to Archives → Curriculum tab
2. See: "BSIT (45 subjects)"
3. Click "View" to see all subjects in JSON
4. All terms and subjects preserved
```

### Restore Course:
```
1. Archives → Curriculum tab
2. Find course
3. Click "Restore"
4. Entire course restored with all subjects
```

---

## Archive Structure

```javascript
{
  originalData: {
    id: "BSIT_2024",
    name: "BSIT",
    terms: {
      "First Year - First Term": [
        "Introduction to Programming",
        "Computer Fundamentals",
        ...
      ],
      "First Year - Second Term": [
        "Data Structures",
        "Web Development",
        ...
      ],
      ...
    }
  },
  archivedAt: timestamp,
  archivedBy: "admin@schedsync.com",
  reason: "Old curriculum, replaced with 2025 version",
  type: "curriculum"
}
```

---

## UI Changes

### Curriculum Page:
```
┌─────────────────────────────────────┐
│ BSIT                          [📦]  │  ← Archive button here
│   ├─ First Year - First Term       │
│   │   ├─ Intro to Programming      │
│   │   └─ Computer Fundamentals     │
│   └─ First Year - Second Term      │
│       ├─ Data Structures           │
│       └─ Web Development           │
└─────────────────────────────────────┘
```

### Archives Page:
```
┌─────────────────────────────────────┐
│ 📦 BSIT (45 subjects)               │
│    Archived: Apr 29, 2026           │
│    By: admin@schedsync.com          │
│    Reason: Old curriculum           │
│    [View] [Restore] [🗑️]            │
└─────────────────────────────────────┘
```

---

## Files Modified

1. **curriculumpage.js**
   - Added 📦 button to course header (not modal)
   - Archives entire course with all terms/subjects
   - Uses custom archive modal

2. **archives.js**
   - Updated `getItemTitle()` to show subject count
   - Updated `restoreArchive()` to restore full course
   - Displays as "Course Name (X subjects)"

3. **curriculumpage.html**
   - Removed archive button from subject modal
   - (Archive is now at course level only)

---

## Benefits

✅ **Archive Whole Programs** - Archive "BSIT 2024" when new curriculum comes  
✅ **Preserve All Subjects** - All terms and subjects saved together  
✅ **Easy Restore** - One click restores entire course  
✅ **Subject Count** - See how many subjects in archived course  
✅ **View Details** - Click "View" to see all subjects in JSON  
✅ **Clean Organization** - Archive by program, not individual subjects  

---

## Use Cases

1. **Curriculum Update**
   - Archive "BSIT 2024" when "BSIT 2025" is released
   - All old subjects preserved together

2. **Program Discontinuation**
   - Archive "ITM" if program is discontinued
   - Can restore if program comes back

3. **Backup Before Changes**
   - Archive current version before major edits
   - Restore if changes don't work out

---

## Testing Checklist

- [ ] Go to Curriculum → See 📦 button on course header
- [ ] Click 📦 → Enter reason → Verify course archived
- [ ] Archives → Curriculum → See "Course (X subjects)"
- [ ] Click "View" → See all subjects in JSON
- [ ] Click "Restore" → Verify course back with all subjects
- [ ] Verify subject count is correct

---

**Status:** ✅ COMPLETE  
**Archives whole courses:** ✅ YES  
**Preserves all subjects:** ✅ YES

Tapos na! Now archives the whole folder/course! 🎉
