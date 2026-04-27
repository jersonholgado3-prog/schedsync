# 📋 Program Head Feature - Implementation Summary

## Overview
Added support for **4 specific Program Head types** in SchedSync, allowing admins to assign faculty members to specialized program leadership roles.

## 🎯 Program Head Types

1. **💻 ICT/IT Program Head** - Head of Information and Communications Technology / Information Technology programs
2. **📚 GE (General Education) Program Head** - Head of General Education subjects
3. **💼 BM (Business Management) Program Head** - Head of Business Management programs
4. **🎓 Assistant Principal (Senior High)** - Assistant Principal for Senior High School

## 📁 Files Modified

### 1. `facultyprofile.js`
- ✅ Added program head specialization modal with 4 program options
- ✅ Updated role display to show specific program head type
- ✅ Added program field display in faculty profile
- ✅ Admins can now change faculty role to specific program head type
- ✅ Admins can revert program head back to teacher role

### 2. `facultyprofile.html`
- ✅ Added program display field to show which program the faculty heads

### 3. `facultypage.js`
- ✅ Updated faculty cards to show program head specialization
- ✅ Displays emoji + program name for program heads (e.g., "💻 ICT/IT Program Head")
- ✅ Shows role badge on faculty cards for non-teacher roles

### 4. `role-restriction.js`
- ✅ Program Heads now have same edit permissions as Teachers/Admins
- ✅ Program Heads can access schedule editing features
- ✅ Program Heads can create/edit schedules
- ✅ Only Admins can access admin-only features (Audit Logs, Permissions)

### 5. `login.js`
- ✅ Added program field caching on login
- ✅ Stores `userProgram` in localStorage for quick access

## 🔐 Permissions Matrix

| Feature | Student | Teacher | Program Head | Admin |
|---------|---------|---------|--------------|-------|
| View Schedule | ✅ | ✅ | ✅ | ✅ |
| Edit Schedule | ❌ | ✅ | ✅ | ✅ |
| Create Events | ❌ | ✅ | ✅ | ✅ |
| Manage Faculty | ❌ | ✅ | ✅ | ✅ |
| Audit Logs | ❌ | ❌ | ❌ | ✅ |
| Manage Permissions | ❌ | ❌ | ❌ | ✅ |

## 🛠️ How to Use (For Admins)

### Setting a Faculty Member as Program Head:

1. **Go to Faculty Page** (`facultypage.html`)
2. **Click on a faculty card** to open their profile
3. **Click "Change Role" button** (visible only to admins)
4. **Select the program** from the modal:
   - 💻 ICT/IT Program Head
   - 📚 GE Program Head
   - 💼 BM Program Head
   - 🎓 Asst. Principal (SHS)
5. **Confirm** the role change

### Reverting Program Head to Teacher:

1. Open the faculty member's profile
2. Click "Change Role" button
3. Confirm to change from Program Head to Teacher

## 💾 Firestore Data Structure

Program Head information is stored in the `users` collection:

```javascript
{
  // ... other fields
  role: "program head",
  program: "ICT/IT"  // or "GE", "BM", "SHS"
}
```

## 🎨 UI Features

### Program Selection Modal
- Beautiful card-based selection interface
- Hover effects with shadows
- Color-coded by program:
  - ICT/IT: Blue (💻)
  - GE: Yellow (📚)
  - BM: Green (💼)
  - SHS: Pink (🎓)

### Faculty Card Display
- Shows program head specialization with emoji
- Role badge visible on cards
- Easy to identify program heads at a glance

### Faculty Profile Page
- Displays full program name
- Shows program field only for program heads
- Change Role button for admins

## 📝 Notes

- **Backwards Compatible**: Existing "program head" roles without a program field will display as "Program Head"
- **Multiple Program Heads**: You can have multiple faculty members as Program Heads for the same program
- **Program Head Permissions**: Same as teachers - can edit schedules, manage faculty, create events
- **Admin Exclusive**: Only admins can assign/change program head roles

## 🚀 Future Enhancements (Optional)

- Filter faculty by program head type
- Program-specific dashboard views
- Program head assignment validation (prevent duplicate program heads if needed)
- Program head reporting/analytics

---

**Implemented**: April 24, 2026  
**Version**: SchedSync v1.0 - Program Head Update
