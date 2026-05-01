// DEBUG: Check admin status
console.log('=== ADMIN DEBUG ===');
console.log('userRole:', localStorage.getItem('userRole'));
console.log('editPermission:', localStorage.getItem('editPermission'));

const adminLinks = document.getElementById('adminSidebarLinks');
console.log('adminSidebarLinks element:', adminLinks);
console.log('adminSidebarLinks display:', adminLinks?.style.display);

// Force show for testing
if (adminLinks) {
    adminLinks.style.display = 'block';
    console.log('✅ Forced adminSidebarLinks to show');
}
