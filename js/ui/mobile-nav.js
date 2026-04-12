export function initMobileNav() {
  // Set active tab based on current page filename
  const page = location.pathname.split('/').pop().replace('.html','');
  document.querySelectorAll('.mob-nav-item').forEach(el => {
    if (el.dataset.page === page) el.classList.add('active');
  });

  // Show admin-only tabs if user is admin
  const role = localStorage.getItem('userRole');
  if (role === 'admin') {
    document.querySelectorAll('.mob-nav-item.admin-only')
      .forEach(el => el.style.display = 'flex');
  }
}
