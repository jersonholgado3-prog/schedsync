export function initMobileNav() {
    const hamburger = document.querySelector('.hamburger-btn');
    const sidebar = document.querySelector('.sidebar');
    let overlay = document.querySelector('.mobile-overlay');

    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'mobile-overlay';
        document.body.appendChild(overlay);
    }

    if (hamburger && sidebar) {
        // Toggle drawer
        hamburger.onclick = (e) => {
            e.stopPropagation(); // 🛡️ Prevent accidental clicks
            const isOpen = sidebar.classList.toggle('open');
            overlay.classList.toggle('active');

            if (isOpen) {
                document.body.style.overflow = 'hidden';
                sidebar.classList.remove('collapsed'); // Force expand 🛡️
            } else {
                document.body.style.overflow = '';
            }
        };

        // Close on overlay click
        overlay.onclick = () => {
            sidebar.classList.remove('open');
            overlay.classList.remove('active');
            document.body.style.overflow = '';
        };

        // Close drawer on link click with a tiny delay 🦈
        sidebar.querySelectorAll('.sidebar-link').forEach(link => {
            link.onclick = () => {
                setTimeout(() => {
                    sidebar.classList.remove('open');
                    overlay.classList.remove('active');
                    document.body.style.overflow = '';
                }, 150);
            };
        });
    }
}
