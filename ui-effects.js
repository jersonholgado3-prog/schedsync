// 0. UI Mode Helpers 🎮👔
export const getUIMode = () => {
    const saved = localStorage.getItem('uiMode');
    if (saved) return saved;

    // Default based on role
    const role = localStorage.getItem('userRole') || 'student';
    return (role === 'teacher' || role === 'admin') ? 'professional' : 'student';
};

export const setUIMode = (mode) => {
    localStorage.setItem('uiMode', mode);
    const isProfessional = mode === 'professional';
    document.documentElement.classList.toggle('professional-mode', isProfessional);

    // ✅ REFRESH UI ELEMENTS
    if (isProfessional) {
        // Remove student mode elements
        document.getElementById('shark-container')?.remove();
        document.getElementById('turtle-container')?.remove();
        console.log("👔 Professional Mode Activated");
    } else {
        // Re-inject student mode elements if not on auth page
        const path = window.location.pathname;
        const isAuthPage = path.includes('login.html') || 
                          path.includes('signup.html') || 
                          path.includes('forgotpass.html') || 
                          path.includes('teacherlogin.html') || 
                          path.includes('index.html') ||
                          path.endsWith('/');
        
        if (!isAuthPage) {
            injectSecretShark();
            injectTurtles();
        }
        console.log("🦈 Student Mode Activated");
    }

    // Dispatch global event for other components to react (e.g., userprofile.js text)
    window.dispatchEvent(new CustomEvent('uimodechange', { detail: { mode } }));
};

const injectPoppinsFont = () => {
    if (document.getElementById('poppins-font-link')) return;
    const link = document.createElement('link');
    link.id = 'poppins-font-link';
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700;800;900&display=swap';
    document.head.appendChild(link);
};

// 1. Inject Global Transitions 🌊
const injectGlobalTransitions = () => {
    if (document.getElementById('schedsync-ui-transitions')) return;

    const style = document.createElement('style');
    style.id = 'schedsync-ui-transitions';
    style.textContent = `
        @keyframes fadeInUp {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }

        @keyframes toastSlideOut {
            from { opacity: 1; transform: translateY(0); }
            to { opacity: 0; transform: translateY(-20px); }
        }

        /* Professional Mode Overrides 👔 (Cleaner & Modern) */
        .professional-mode .blob {
            opacity: 0.15;
            filter: blur(150px);
        }
        
        .professional-mode .container, 
        .professional-mode .card,
        .professional-mode .header,
        .professional-mode .logo-container,
        .professional-mode .user-profile,
        .professional-mode .user-profile-btn,
        .professional-mode .notification-icon-wrapper,
        .professional-mode .search-wrapper,
        .professional-mode .faculty-card,
        .professional-mode .faculty-photo,
        .professional-mode .schedule-item,
        .professional-mode .content-box,
        .professional-mode .widget-card,
        .professional-mode .announcement-icon,
        .professional-mode .hamburger-btn,
        .professional-mode .login-container,
        .professional-mode .signup-form-container,
        .professional-mode .welcome-hero,
        .professional-mode .draft-item,
        .professional-mode .event-item,
        .professional-mode .help-button,
        .professional-mode .widget-action-btn-icon,
        .professional-mode .circle-checkbox,
        .professional-mode .announcement-item,
        .professional-mode .card-container,
        .professional-mode .section-input,
        .professional-mode .form-input,
        .professional-mode .days-row,
        .professional-mode .days-row-2,
        .professional-mode .schedule-folder,
        .professional-mode .folder-header,
        .professional-mode .menu-dropdown,
        .professional-mode .request-permission-btn,
        .professional-mode .user-dropdown,
        .professional-mode .dropdown-item,
        .professional-mode .campus-card,
        .professional-mode .room-pill,
        .professional-mode .user-profile-menu,
        .professional-mode .profile-dropdown,
        .professional-mode .user-dropdown-container,
        .professional-mode .notification-icon,
        .professional-mode .user-profile,
        .professional-mode .user-profile-btn,
        .professional-mode .event-card,
        .professional-mode .load-more-btn,
        .professional-mode .create-event-plus-circle,
        .professional-mode .dg-modal,
        .professional-mode .event-modal-content,
        .professional-mode .schedule-type-toggle,
        .professional-mode .panel,
        .professional-mode .table-scroll,
        .professional-mode .pill,
        .professional-mode .comment-entry {
            box-shadow: none !important;
            border-radius: 12px !important;
            border: 1px solid black !important;
            background-color: rgba(255, 255, 255, 0.95) !important;
            backdrop-filter: blur(8px);
            transform: none !important;
        }

        /* Color-Sensitive Professional Elements (Buttons/Toasts) 🎨 */
        .professional-mode .action-button,
        .professional-mode .control-btn,
        .professional-mode .edit-button,
        .professional-mode .save-button,
        .professional-mode .status-badge,
        .professional-mode .selected-day,
        .professional-mode .confirm-btn-cancel,
        .professional-mode .confirm-btn-yes,
        .professional-mode .footer-btn,
        .professional-mode .toast,
        .professional-mode .toggle-slider,
        .professional-mode .section-item,
        .professional-mode .maangas-confirm-box,
        .professional-mode .btn,
        .professional-mode .save,
        .professional-mode .delete,
        .professional-mode .vacant-btn,
        .professional-mode .cancel {
            box-shadow: none !important;
            border: 1px solid black !important;
            border-radius: 12px !important;
        }

        /* Specific Dropdown Logout Fix 🚪⚓ */
        .professional-mode #drop-logout {
            background-color: #ef4444 !important;
            color: white !important;
            border: 1px solid #dc2626 !important;
        }

        .dark.professional-mode #drop-logout {
            background-color: #ef4444 !important;
            color: white !important;
            border: 1px solid #f87171 !important;
        }

        /* Maangas Confirmation Modal Styles 🏗️⚓ */
        .maangas-confirm-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background: rgba(0, 0, 0, 0.5);
            backdrop-filter: blur(4px);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 99999;
            opacity: 0;
            visibility: hidden;
            transition: all 0.2s ease;
        }

        .maangas-confirm-overlay.open {
            opacity: 1;
            visibility: visible;
        }

        .maangas-confirm-box {
            background: #fff;
            border: 3px solid #000;
            border-radius: 24px;
            box-shadow: 8px 8px 0px #000;
            padding: 30px;
            width: 90%;
            max-width: 400px;
            text-align: center;
            transform: scale(0.9);
            transition: transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            display: flex;
            flex-direction: column;
            gap: 20px;
        }

        .maangas-confirm-overlay.open .maangas-confirm-box {
            transform: scale(1);
        }

        .maangas-confirm-title {
            font-size: 24px;
            font-weight: 900;
            text-transform: uppercase;
            color: #000;
            line-height: 1.2;
        }

        .maangas-confirm-message {
            font-size: 16px;
            color: #334155;
            line-height: 1.5;
            font-weight: 500;
        }

        .maangas-confirm-actions {
            display: flex;
            gap: 15px;
            justify-content: center;
            margin-top: 10px;
        }

        .maangas-btn {
            flex: 1;
            padding: 12px 20px;
            border: 2px solid #000;
            border-radius: 12px;
            font-weight: 800;
            font-size: 14px;
            text-transform: uppercase;
            cursor: pointer;
            transition: all 0.1s;
            box-shadow: 3px 3px 0px #000;
            outline: none;
        }

        .maangas-btn:active {
            transform: translate(2px, 2px);
            box-shadow: 1px 1px 0px #000;
        }

        .btn-cancel {
            background: #f1f5f9;
            color: #000;
        }

        .btn-confirm {
            background: #000 !important;
            color: #fff !important;
        }

        .dark .maangas-confirm-box {
            background: #1e293b !important;
            border-color: #000 !important;
            box-shadow: 8px 8px 0px #000 !important;
        }

        .dark .maangas-confirm-title { color: #fff !important; }
        .dark .maangas-confirm-message { color: #cbd5e1 !important; }
        .dark .btn-cancel { background: #334155 !important; color: #fff !important; }
        .dark .btn-confirm { background: #fff !important; color: #000 !important; }

        /* Hover/Active states cleanup */
        .professional-mode .action-button:hover,
        .professional-mode .control-btn:hover,
        .professional-mode .edit-button:hover,
        .professional-mode .save-button:hover,
        .professional-mode .section-item:hover,
        .professional-mode .section-item.selected,
        .professional-mode .form-input:focus-within,
        .professional-mode .add-section:hover,
        .professional-mode .schedule-item:hover,
        .professional-mode .faculty-card:hover,
        .professional-mode .draft-item:hover,
        .professional-mode .event-item:hover,
        .professional-mode .help-button:hover,
        .professional-mode .dropdown-item:hover,
        .professional-mode .room-pill:hover,
        .professional-mode .campus-card:hover,
        .professional-mode .user-profile:hover,
        .professional-mode .notification-icon:hover,
        .professional-mode .user-profile-btn:hover,
        .professional-mode .event-card:hover,
        .professional-mode .load-more-btn:hover,
        .professional-mode .schedule-type-toggle:hover,
        .professional-mode .add-section:hover,
        .professional-mode .confirm-btn-cancel:hover,
        .professional-mode .confirm-btn-yes:hover,
        .professional-mode .footer-btn:hover {
            box-shadow: none !important;
            transform: none !important;
            border-color: black !important;
        }

        .dark.professional-mode .container, 
        .dark.professional-mode .card,
        .dark.professional-mode .header,
        .dark.professional-mode .logo-container,
        .dark.professional-mode .user-profile,
        .dark.professional-mode .user-profile-btn,
        .dark.professional-mode .notification-icon-wrapper,
        .dark.professional-mode .search-wrapper,
        .dark.professional-mode .faculty-card,
        .dark.professional-mode .faculty-photo,
        .dark.professional-mode .schedule-item,
        .dark.professional-mode .content-box,
        .dark.professional-mode .widget-card,
        .dark.professional-mode .announcement-icon,
        .dark.professional-mode .hamburger-btn,
        .dark.professional-mode .login-container,
        .dark.professional-mode .signup-form-container,
        .dark.professional-mode .welcome-hero,
        .dark.professional-mode .draft-item,
        .dark.professional-mode .event-item,
        .dark.professional-mode .help-button,
        .dark.professional-mode .widget-action-btn-icon,
        .dark.professional-mode .circle-checkbox,
        .dark.professional-mode .announcement-item,
        .dark.professional-mode .card-container,
        .dark.professional-mode .section-input,
        .dark.professional-mode .form-input,
        .dark.professional-mode .days-row,
        .dark.professional-mode .days-row-2,
        .dark.professional-mode .schedule-folder,
        .dark.professional-mode .folder-header,
        .dark.professional-mode .menu-dropdown,
        .dark.professional-mode .request-permission-btn,
        .dark.professional-mode .user-dropdown,
        .dark.professional-mode .dropdown-item,
        .dark.professional-mode .campus-card,
        .dark.professional-mode .room-pill,
        .dark.professional-mode .user-profile-menu,
        .dark.professional-mode .profile-dropdown,
        .dark.professional-mode .user-dropdown-container,
        .dark.professional-mode .notification-icon,
        .dark.professional-mode .event-card,
        .dark.professional-mode .load-more-btn,
        .dark.professional-mode .create-event-plus-circle,
        .dark.professional-mode .dg-modal,
        .dark.professional-mode .event-modal-content,
        .dark.professional-mode .schedule-type-toggle,
        .dark.professional-mode .panel,
        .dark.professional-mode .table-scroll,
        .dark.professional-mode .pill,
        .dark.professional-mode .comment-entry {
            box-shadow: none !important;
            border: 1px solid rgba(255, 255, 255, 0.4) !important;
            background-color: rgba(30, 41, 59, 0.8) !important;
            transform: none !important;
        }

        /* Color-Sensitive Dark Elements 🌙🎨 */
        .dark.professional-mode .action-button,
        .dark.professional-mode .control-btn,
        .dark.professional-mode .edit-button,
        .dark.professional-mode .save-button,
        .dark.professional-mode .status-badge,
        .dark.professional-mode .selected-day,
        .dark.professional-mode .confirm-btn-cancel,
        .dark.professional-mode .confirm-btn-yes,
        .dark.professional-mode .footer-btn,
        .dark.professional-mode .toast,
        .dark.professional-mode .toggle-slider,
        .dark.professional-mode .section-item,
        .dark.professional-mode .btn,
        .dark.professional-mode .save,
        .dark.professional-mode .delete,
        .dark.professional-mode .vacant-btn,
        .dark.professional-mode .cancel {
            box-shadow: none !important;
            border: 1px solid rgba(255, 255, 255, 0.4) !important;
        }

        .dark.professional-mode .action-button:hover,
        .dark.professional-mode .control-btn:hover,
        .dark.professional-mode .edit-button:hover,
        .dark.professional-mode .save-button:hover,
        .dark.professional-mode .section-item:hover,
        .dark.professional-mode .section-item.selected,
        .dark.professional-mode .form-input:focus-within,
        .dark.professional-mode .add-section:hover,
        .dark.professional-mode .schedule-item:hover,
        .dark.professional-mode .faculty-card:hover,
        .dark.professional-mode .draft-item:hover,
        .dark.professional-mode .event-item:hover,
        .dark.professional-mode .help-button:hover,
        .dark.professional-mode .dropdown-item:hover,
        .dark.professional-mode .room-pill:hover,
        .dark.professional-mode .campus-card:hover,
        .dark.professional-mode .user-profile:hover,
        .dark.professional-mode .notification-icon:hover,
        .dark.professional-mode .event-card:hover,
        .dark.professional-mode .load-more-btn:hover,
        .dark.professional-mode .schedule-type-toggle:hover,
        .dark.professional-mode .add-section:hover,
        .dark.professional-mode .confirm-btn-cancel:hover,
        .dark.professional-mode .confirm-btn-yes:hover,
        .dark.professional-mode .footer-btn:hover {
            box-shadow: none !important;
            transform: none !important;
            border-color: rgba(255, 255, 255, 0.6) !important;
        }
        
        .professional-mode .notification-icon {
            box-shadow: none !important;
            border: 1px solid rgba(0, 0, 0, 0.1) !important;
        }

        .dark.professional-mode .notification-icon {
            border: 1px solid rgba(255, 255, 255, 0.1) !important;
        }
        
        .professional-mode .tilt-card:hover {
            transform: scale3d(1.01, 1.01, 1.01) !important; /* Subtle scale */
        }

        /* ──── AUTO-COLLAPSING SIDEBAR 📏 ──── */
        .sidebar {
            transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1), background-color 0.3s ease !important;
            border-top-right-radius: 40px !important;
            overflow: hidden !important;
            background: linear-gradient(to bottom, #FFD200 115px, #002044 115px) !important;
        }

        .sidebar.collapsed {
            width: 80px !important;
            border-top-right-radius: 40px !important;
            background: linear-gradient(to bottom, #FFD200 100px, #002044 100px) !important;
        }

        .sidebar.collapsed .sidebar-link span {
            display: none;
        }

        .sidebar.collapsed .sidebar-link {
            justify-content: center;
            padding: 1.25rem !important;
            margin-left: 0 !important;
            border-radius: 0 !important;
        }

        .sidebar.collapsed .sidebar-header {
            padding: 1.5rem 1rem !important;
            margin-bottom: 12px !important;
            border-top-right-radius: 40px !important;
        }

        /* Resume Edit Link Styling ⚓ */
        .resume-edit-container {
            position: relative;
            margin-top: auto;
            margin-bottom: 2rem;
            display: flex;
            align-items: center;
            transition: all 0.3s ease;
        }
        
        .resume-edit-link {
            flex: 1;
            background: rgba(255, 255, 255, 0.05) !important;
            border-left: 3px solid #FFD200 !important;
        }

        .resume-edit-link:hover {
            background: rgba(255, 255, 255, 0.1) !important;
            color: white !important;
        }
        
        .resume-edit-dismiss {
            position: absolute;
            right: 15px;
            background: none;
            border: none;
            color: rgba(255, 255, 255, 0.4);
            font-size: 20px;
            font-weight: 700;
            cursor: pointer;
            padding: 5px;
            line-height: 1;
            transition: all 0.2s;
            z-index: 10;
        }

        .resume-edit-dismiss:hover {
            color: #ef4444;
            transform: scale(1.2);
        }

        .sidebar.collapsed .resume-edit-dismiss {
            display: none;
        }
        
        .sidebar.collapsed .sidebar-header img {
            width: 40px !important;
            height: 40px !important;
        }

        /* ENSURE MAANGAS SIDEBAR STYLE GLOBALLY ⚓⚓⚓ */
        .sidebar {
            background: linear-gradient(to bottom, #FFD200 115px, #002044 115px) !important;
            border-right: none !important;
        }

        .sidebar-header {
            background-color: #FFD200 !important;
        }

        .sidebar-link {
            color: rgba(255, 255, 255, 0.8) !important;
            border: none !important;
            box-shadow: none !important;
        }

        .sidebar-link img {
            filter: brightness(0) invert(1) opacity(0.8) !important;
        }

        .sidebar-link:hover {
            background-color: rgba(255, 255, 255, 0.1) !important;
            color: #ffffff !important;
        }

        .sidebar-link.active {
            background-color: white !important;
            color: #002044 !important;
            border-radius: 35px 0 0 35px !important;
            box-shadow: 0 4px 15px rgba(255, 210, 0, 0.3) !important;
        }

        .sidebar-link.active span {
            color: #002044 !important;
            font-weight: 700 !important;
        }

        .sidebar-link.active img {
            filter: brightness(0) saturate(100%) invert(8%) sepia(35%) saturate(4681%) hue-rotate(193deg) brightness(97%) contrast(106%) !important;
            opacity: 1 !important;
        }

        .sidebar.collapsed .sidebar-link span {
            display: none;
        }

        @keyframes moveBlob {
            0% { transform: translate(0, 0) scale(1); }
            33% { transform: translate(30px, -50px) scale(1.1); }
            66% { transform: translate(-20px, 20px) scale(0.9); }
            100% { transform: translate(0, 0) scale(1); }
        }

        @keyframes sharkSwim {
            0% { transform: translate(-300px, 150px) rotate(10deg) scaleX(1); opacity: 0; }
            5% { opacity: 0.15; }
            40% { transform: translate(50vw, -50px) rotate(-5deg) scaleX(1); }
            50% { transform: translate(110vw, 250px) rotate(5deg) scaleX(1); }
            51% { transform: translate(110vw, 250px) rotate(5deg) scaleX(-1); }
            95% { opacity: 0.15; }
            100% { transform: translate(-300px, 150px) rotate(-10deg) scaleX(-1); opacity: 0; }
        }

        @keyframes fishSwim {
            0% { transform: translate(-100px, 100px) rotate(20deg) scaleX(1); opacity: 0; }
            5% { opacity: 0.3; }
            40% { transform: translate(60vw, -150px) rotate(-10deg) scaleX(1); }
            50% { transform: translate(120vw, 150px) rotate(10deg) scaleX(1); }
            51% { transform: translate(120vw, 150px) rotate(10deg) scaleX(-1); }
            95% { opacity: 0.3; }
            100% { transform: translate(-100px, 100px) rotate(-20deg) scaleX(-1); opacity: 0; }
        }

        /* Font Modes 🖋️ */
        body {
            background: #f8fafc;
            /* transition: background 0.3s ease; REMOVED to fix FOUC */
            font-family: 'Poppins', sans-serif !important;
        }

        body.theme-transition {
            transition: background 0.3s ease, color 0.3s ease;
        }

        .professional-mode body {
            font-family: 'Poppins', sans-serif !important;
        }

        .dark body {
            background: #0f172a;
        }

        /* Global Dark Mode Master Overrides 🌙 */
        .dark body {
            color-scheme: dark;
            background: #0f172a !important;
            color: #f8fafc !important;
        }

        .dark .header, 
        .dark .card, 
        .dark .content-box, 
        .dark .faculty-card, 
        .dark .logo-container,
        .dark .user-profile,
        .dark .notification-icon,
        .dark .table-scroll,
        .dark #user-dropdown-menu,
        .dark .login-container,
        .dark .signup-form-container,
        .dark .schedule-item,
        .dark .schedule-folder,
        .dark .notification-card-item,
        .dark .profile-image-container,
        .dark .profile-info-box,
        .dark .campus-card,
        .dark .faculty-card {
            background-color: #1e293b !important;
            border-color: rgba(255, 255, 255, 0.2) !important;
            color: #f1f5f9 !important;
            box-shadow: 4px 4px 0px rgba(0, 0, 0, 0.4) !important;
        }

        .dark .search-wrapper {
            background-color: transparent !important;
            border: 3px solid rgba(255, 255, 255, 0.2) !important;
            border-radius: 20px !important;
            box-shadow: 4px 4px 0px rgba(0, 0, 0, 0.4) !important;
        }

        .dark .search-button {
            color: #f1f5f9 !important;
        }

        .dark .folder-header, .dark .notification-list-header {
            background-color: #0f172a !important;
            color: #f8fafc !important;
            border-bottom-color: #334155 !important;
        }

        .dark .container, .dark .main-layout, .dark .page-content, .dark .main {
            background-color: transparent !important;
            border-color: transparent !important;
            box-shadow: none !important;
        }

        .dark .greeting,
        .dark .page-title,
        .dark .section-title,
        .dark .card-title,
        .dark .user-name,
        .dark .profile-name,
        .dark .folder-title,
        .dark .schedule-details h3,
        .dark h1, .dark h2, .dark h3, .dark h4, .dark h5, .dark h6 {
            color: #f8fafc !important;
        }

        .dark input, 
        .dark select, 
        .dark textarea {
            background-color: transparent !important;
            border: 2px solid rgba(255, 255, 255, 0.2) !important;
            border-radius: 12px !important;
            color: #f8fafc !important;
            box-shadow: none !important;
        }
        
        .dark .pill {
            border-radius: 50px !important;
        }

        .dark .form-input input,
        .dark .form-input select {
            background-color: transparent !important;
            border: none !important;
            box-shadow: none !important;
            color: #f8fafc !important;
            outline: none !important;
        }

        .dark .form-input input:focus,
        .dark .form-input select:focus {
            background-color: transparent !important;
            box-shadow: none !important;
        }

        /* Fix for Chrome Aggrasive Autofill Background */
        .dark input:-webkit-autofill,
        .dark input:-webkit-autofill:hover, 
        .dark input:-webkit-autofill:focus, 
        .dark input:-webkit-autofill:active{
            -webkit-box-shadow: 0 0 0 30px #0f172a inset !important;
            -webkit-text-fill-color: #f8fafc !important;
            transition: background-color 5000s ease-in-out 0s;
        }

        .dark .form-input {
            background-color: transparent !important;
            border: 2px solid rgba(255, 255, 255, 0.2) !important;
            border-radius: 12px !important;
        }
        .dark h1, .dark h2, .dark h3 {
            color: #f8fafc !important;
        }

        .dark .card-description,
        .dark .profile-info-line span,
        .dark .schedule-meta,
        .dark .folder-count {
            color: #f1f5f9 !important;
        }


        /* ──── MAANGAS SIDEBAR DARK MODE ──── */
        .dark .sidebar {
            backdrop-filter: blur(10px);
            border-right: 1px solid rgba(255, 255, 255, 0.1) !important;
        }

        .dark th {
            background: #374151 !important;
            color: #f8fafc !important;
        }

        .dark td {
            background: #1e293b !important;
            border-color: #374151 !important;
        }

        .dark .divider, .dark .divider-2 {
            background-color: #334155 !important;
            border-color: #334155 !important;
        }


        .dark .blob {
            background: radial-gradient(circle, rgba(30, 64, 175, 0.2) 0%, rgba(15, 23, 42, 0) 70%);
        }

        /* ───────── DARK MODE TIME PICKER ───────── */
        .dark .time-picker-modal {
            background-color: #1e293b !important;
            border: 2px solid #334155 !important;
            color: #f8fafc !important;
        }

        .dark .header-label {
            color: #94a3b8 !important;
        }

        .dark .time-box {
            background-color: #0f172a !important;
            color: #f8fafc !important;
            border: 1px solid #334155 !important;
        }

        .dark .time-box.active {
            background-color: #312e81 !important;
            color: #818cf8 !important;
            border-color: #4338ca !important;
        }

        .dark .time-colon {
            color: #f8fafc !important;
        }

        .dark .period-selector {
            background-color: #0f172a !important;
            border-color: #334155 !important;
        }

        .dark .period-option {
            color: #94a3b8 !important;
        }

        .dark .period-option.active {
            background-color: #312e81 !important;
            color: #818cf8 !important;
        }

        .dark .clock-dial-container {
            background-color: #334155 !important;
        }

        .dark .dial-number {
            color: #94a3b8 !important;
        }

        .dark .dial-number.active {
            color: #f8fafc !important;
        }

        .dark .dial-hand {
            background-color: #6366f1 !important;
        }

        .dark .dial-hand-indicator {
            background-color: #6366f1 !important;
            color: white !important;
        }

        .dark .dial-center {
            background-color: #6366f1 !important;
        }

        .dark .footer-btn {
            color: #818cf8 !important;
        }
        
        .dark .footer-btn:hover {
            background-color: rgba(99, 102, 241, 0.1) !important;
        }

        .container, .main-layout, .page-content, .main {
            opacity: 1 !important;
            position: relative;
            z-index: 10;
            background-color: transparent !important; /* Forces transparency for swimswim animations 🦈 */
        }

        #atmospheric-bg {
            position: fixed;
            top: 0; left: 0; width: 100vw; height: 100vh;
            z-index: -1; overflow: hidden; pointer-events: none;
        }

        .blob {
            position: absolute; width: 600px; height: 600px;
            background: radial-gradient(circle, rgba(0, 91, 171, 0.15) 0%, rgba(255, 255, 255, 0) 70%);
            filter: blur(80px); border-radius: 50%;
            animation: moveBlob 20s infinite ease-in-out;
        }

        .dark .blob {
            background: radial-gradient(circle, rgba(30, 64, 175, 0.2) 0%, rgba(15, 23, 42, 0) 70%);
        }

        .blob-1 { top: -100px; left: -100px; animation-duration: 25s; }
        .blob-2 { bottom: -150px; right: -100px; animation-duration: 30s; animation-delay: -5s; background: radial-gradient(circle, rgba(255, 210, 0, 0.1) 0%, rgba(255, 255, 255, 0) 70%); }
        .dark .blob-2 { background: radial-gradient(circle, rgba(168, 85, 247, 0.1) 0%, rgba(15, 23, 42, 0) 70%); }
        .blob-3 { top: 40%; left: 30%; animation-duration: 22s; animation-delay: -10s; width: 400px; height: 400px; opacity: 0.5; }

        .shark-container {
            position: fixed;
            top: 0; left: 0; width: 100vw; height: 100vh;
            z-index: 0; pointer-events: none; overflow: hidden;
        }

        .shark {
            position: absolute;
            width: 320px;
            opacity: 0;
            filter: blur(1px);
            animation: sharkSwim 25s infinite linear;
            color: rgba(0, 91, 171, 0.5);
        }

        .fish {
            position: absolute;
            width: 60px;
            opacity: 0;
            filter: blur(0px);
            animation: fishSwim 25s infinite linear;
            color: rgba(255, 210, 0, 0.7);
        }

        .dark .shark {
            filter: blur(2px) brightness(1.5) saturate(1.2);
            color: rgba(59, 130, 246, 0.5);
        }
        
        .dark .fish {
            filter: brightness(1.3) saturate(1.5);
            color: rgba(255, 210, 0, 0.7);
        }

        .tilt-card {
            transition: transform 0.2s cubic-bezier(0.03, 0.98, 0.52, 0.99), 
                        box-shadow 0.2s ease;
            transform-style: preserve-3d;
            will-change: transform;
        }
    `;
    document.head.appendChild(style);
};

const injectAtmosphericBackground = () => {
    if (document.getElementById('atmospheric-bg')) return;
    const bg = document.createElement('div');
    bg.id = 'atmospheric-bg';
    bg.innerHTML = `
        <div class="blob blob-1"></div>
        <div class="blob blob-2"></div>
        <div class="blob blob-3"></div>
    `;
    document.body.prepend(bg);
};

const injectSecretShark = () => {
    if (document.getElementById('shark-container')) return;

    // 1. Inject Styles
    const style = document.createElement('style');
    style.innerHTML = `
        /* Shark Patrol & Flip Animations 🦈🔄 */
        
        /* Top Shark: Swims Right -> Flips -> Swims Left */
        @keyframes swimPatrolTop {
            0% { transform: translate(-200px, 50px) scale(0.8) scaleX(1); opacity: 0; }
            5% { opacity: 0.8; }
            45% { transform: translate(90vw, -20px) scale(0.8) scaleX(1); }
            50% { transform: translate(90vw, -20px) scale(0.8) scaleX(-1); } /* FLIP! */
            95% { transform: translate(-200px, 50px) scale(0.8) scaleX(-1); opacity: 0.8; }
            100% { transform: translate(-200px, 50px) scale(0.8) scaleX(1); opacity: 0; }
        }

        /* Middle Shark: Swims Right -> Flips -> Swims Left (slower) */
        @keyframes swimPatrolMid {
            0% { transform: translate(-200px, 35vh) scale(1) scaleX(1); opacity: 0; }
            10% { opacity: 0.8; }
            40% { transform: translate(80vw, 40vh) scale(1) scaleX(1) rotate(5deg); }
            50% { transform: translate(80vw, 40vh) scale(1) scaleX(-1) rotate(0deg); } /* FLIP! */
            90% { transform: translate(-200px, 30vh) scale(1) scaleX(-1) rotate(-5deg); opacity: 0.8; }
            100% { transform: translate(-200px, 30vh) scale(1) scaleX(1); opacity: 0; }
        }

        /* Bottom Shark: Swims Right -> Flips -> Swims Left */
        @keyframes swimPatrolBot {
            0% { transform: translate(-200px, 75vh) scale(0.9) scaleX(1); opacity: 0; }
            5% { opacity: 0.8; }
            45% { transform: translate(85vw, 65vh) scale(0.9) scaleX(1) rotate(-5deg); }
            55% { transform: translate(85vw, 65vh) scale(0.9) scaleX(-1) rotate(0deg); } /* FLIP! */
            95% { transform: translate(-200px, 70vh) scale(0.9) scaleX(-1); opacity: 0.8; }
            100% { transform: translate(-200px, 70vh) scale(0.9) scaleX(1); opacity: 0; }
        }

        /* Fast Shark: Just zooms across but with a flip at the start/end loop */
        @keyframes swimFastLoop {
            0% { transform: translate(-300px, 20vh) scale(0.6) scaleX(1); opacity: 0; }
            10% { opacity: 0.8; }
            45% { transform: translate(110vw, 60vh) scale(0.6) scaleX(1); opacity: 0.8; }
            50% { transform: translate(110vw, 60vh) scale(0.6) scaleX(-1); opacity: 0; } /* Quick Flip Reset */
            55% { transform: translate(110vw, 80vh) scale(0.6) scaleX(-1); opacity: 0; }
            60% { transform: translate(110vw, 80vh) scale(0.6) scaleX(-1); opacity: 0.8; }
            95% { transform: translate(-300px, 40vh) scale(0.6) scaleX(-1); opacity: 0.8; }
            100% { transform: translate(-300px, 40vh) scale(0.6) scaleX(1); opacity: 0; }
        }
        
        /* Fish Fleeing - Also turns around! */
        @keyframes fishFleeLoop {
             0% { transform: translate(10vw, 40vh) scaleX(-1); opacity: 0; }
             10% { opacity: 1; }
             40% { transform: translate(80vw, 20vh) scaleX(-1) rotate(15deg); }
             50% { transform: translate(90vw, 30vh) scaleX(1) rotate(0deg); } /* FLIP to face left */
             90% { transform: translate(0vw, 60vh) scaleX(1) rotate(-10deg); opacity: 1; }
             100% { transform: translate(-200px, 50vh) scaleX(1); opacity: 0; }
        }

        .shark-top { animation: swimPatrolTop 40s linear infinite; }
        .shark-mid { animation: swimPatrolMid 50s linear infinite; animation-delay: 2s; }
        .shark-bot { animation: swimPatrolBot 45s linear infinite; animation-delay: 5s; }
        .shark-fast { animation: swimFastLoop 35s linear infinite; animation-delay: 10s; }
        .fish-prey { animation: fishFleeLoop 30s linear infinite; position: absolute; width: 60px; pointer-events: none; z-index: -1; }
    `;
    document.head.appendChild(style);

    // 2. Inject Elements
    const container = document.createElement('div');
    container.className = 'shark-container';
    container.id = 'shark-container';

    container.innerHTML = `
        <!-- The Prey Fish (New Image) -->
        <div class="fish-prey">
             <img src="images/fish_prey.png" style="width: 100%; height: 100%; object-fit: contain;">
        </div>

        <!-- Shark 1 (Original) - Top Route -->
        <div class="shark shark-top">
            <img src="images/shark_swimming.png" style="width: 100%; height: 100%; object-fit: contain;">
        </div>

        <!-- Shark 2 (New) - Middle Route -->
        <div class="shark shark-mid">
            <img src="images/shark_swimming_2.png" style="width: 100%; height: 100%; object-fit: contain;">
        </div>

        <!-- Shark 3 (Latest) - Bottom Route -->
        <div class="shark shark-bot">
            <img src="images/shark_swimming_3.png" style="width: 100%; height: 100%; object-fit: contain;">
        </div>
        
        <!-- Shark 4 (Clone) - Fast Diagonal -->
        <div class="shark shark-fast">
             <img src="images/shark_swimming_2.png" style="width: 100%; height: 100%; object-fit: contain;">
        </div>
    `;
    document.body.prepend(container);
};

// 2. 3D Tilt Logic 🧊🖱️
export const init3DTilt = (selector = '.faculty-card, .schedule-item, .card') => {
    const elements = document.querySelectorAll(selector);

    elements.forEach(el => {
        el.classList.add('tilt-card');

        el.addEventListener('mousemove', (e) => {
            const rect = el.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            const centerX = rect.width / 2;
            const centerY = rect.height / 2;

            // Mode dependent intensity 🧊
            const isPro = document.documentElement.classList.contains('professional-mode');
            const factor = isPro ? 40 : 15; // Higher number = Less tilt

            const rotateX = (y - centerY) / factor;
            const rotateY = (centerX - x) / factor;

            const scale = isPro ? 1.01 : 1.02;

            el.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(${scale}, ${scale}, ${scale})`;
        });

        el.addEventListener('mouseleave', () => {
            el.style.transform = `perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)`;
        });
    });
};

const injectTurtles = () => {
    if (document.getElementById('turtle-container')) return;

    // 1. Inject Styles for Turtles
    const style = document.createElement('style');
    style.innerHTML = `
        /* Turtle Animations 🐢✨ */
        @keyframes turtleSwim1 {
            0% { transform: translate(-100px, 80vh) rotate(5deg) scale(0.6); opacity: 0; }
            10% { opacity: 0.9; }
            50% { transform: translate(50vw, 85vh) rotate(0deg) scale(0.6); }
            100% { transform: translate(110vw, 80vh) rotate(-5deg) scale(0.6); opacity: 0; }
        }

        @keyframes turtleSwim2 {
            0% { transform: translate(110vw, 20vh) rotate(-5deg) scaleX(-1) scale(0.5); opacity: 0; } /* Starting from right */
            10% { opacity: 0.9; }
            50% { transform: translate(50vw, 25vh) rotate(0deg) scaleX(-1) scale(0.5); }
            100% { transform: translate(-100px, 20vh) rotate(5deg) scaleX(-1) scale(0.5); opacity: 0; }
        }

        @keyframes turtleSwim3 {
            0% { transform: translate(-100px, 50vh) rotate(10deg) scale(0.4); opacity: 0; }
            10% { opacity: 0.8; }
            40% { transform: translate(60vw, 40vh) rotate(0deg) scale(0.4); }
            60% { transform: translate(60vw, 40vh) rotate(180deg) scale(0.4) scaleY(-1); } /* Fun flip! */
            100% { transform: translate(110vw, 60vh) rotate(180deg) scale(0.4) scaleY(-1); opacity: 0; }
        }

        .turtle { position: absolute; width: 250px; pointer-events: none; z-index: -1; filter: sepia(0.3) hue-rotate(180deg) saturate(0.5); } /* Slight filter to blend */
        .turtle img { width: 100%; height: 100%; object-fit: contain; }

        .turtle-1 { animation: turtleSwim1 60s linear infinite; opacity: 0; }
        .turtle-2 { animation: turtleSwim2 75s linear infinite; animation-delay: 5s; opacity: 0; }
        .turtle-3 { animation: turtleSwim3 90s linear infinite; animation-delay: 10s; opacity: 0; }
    `;
    document.head.appendChild(style);

    // 2. Inject Elements
    const container = document.createElement('div');
    container.className = 'turtle-container';
    container.id = 'turtle-container';
    container.style.cssText = "position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; pointer-events: none; z-index: -1; overflow: hidden;";

    container.innerHTML = `
        <!-- Turtle 1 🐢 -->
        <div class="turtle turtle-1">
            <img src="images/turtle_1.png">
        </div>

        <!-- Turtle 2 🐢 -->
        <div class="turtle turtle-2">
            <img src="images/turtle_2.png">
        </div>

        <!-- Turtle 3 🐢 -->
        <div class="turtle turtle-3">
            <img src="images/turtle_3.png">
        </div>
    `;
    document.body.prepend(container);
};

// 3. Password Visibility Toggle Logic 👁️
export const initPasswordVisibilityToggles = () => {
    const toggles = document.querySelectorAll('.password-toggle');
    console.log(`[UI Effects] Found ${toggles.length} password toggles`);

    toggles.forEach(toggle => {
        // First try sibling, then parent's input
        const input = toggle.parentElement.querySelector('input');
        if (!input) {
            console.warn("[UI Effects] No input found for toggle", toggle);
            return;
        }

        // Avoid double-attaching
        if (toggle.dataset.initialized) return;
        toggle.dataset.initialized = "true";

        toggle.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();

            const isPassword = input.type === 'password';
            input.type = isPassword ? 'text' : 'password';

            // Toggle the visibility class
            toggle.classList.toggle('visible');

            // Explicitly handle SVGs for browsers that might ignore CSS transitions/classes
            const eyeOn = toggle.querySelector('.eye-on');
            const eyeOff = toggle.querySelector('.eye-off');
            if (eyeOn && eyeOff) {
                eyeOn.style.display = isPassword ? 'none' : 'block';
                eyeOff.style.display = isPassword ? 'block' : 'none';
            }

            // Maangas feedback 👁️
            console.log(isPassword ? "👁️ Password revealed" : "🙈 Password hidden");
        });
    });
};

export const initPageTransitions = () => {
    // Transitions removed for instant responsive feel ⚡🚄
};

// --- 🚀 AUTO-RUN IMMEDIATELY (Prevent FOUC/Flash) ⚡ ---
injectPoppinsFont();
injectGlobalTransitions();
injectAtmosphericBackground();

// Determine state immediately 🌗
const path = window.location.pathname;
const isAuthPage = path.includes('login.html') ||
    path.includes('signup.html') ||
    path.includes('forgotpass.html') ||
    path.includes('teacherlogin.html') ||
    path.includes('index.html') ||
    path.endsWith('/');

const uiMode = getUIMode();
document.documentElement.classList.toggle('professional-mode', uiMode === 'professional');

// Initialize Transitions IMMEDIATELY 🎭
initPageTransitions();

// Inject Animals IMMEDIATELY if in Student Mode 🦈🐢
if (!isAuthPage && uiMode === 'student') {
    injectSecretShark();
    injectTurtles();
}

// Global Keyboard Shortcuts Logic 🎹
const setupGlobalShortcuts = () => {
    document.addEventListener('keydown', (e) => {
        // Ctrl/Cmd + M for Theme Mode 🌗
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'm') {
            e.preventDefault();
            const html = document.documentElement;
            const isDark = html.classList.toggle('dark');
            localStorage.setItem('theme', isDark ? 'dark' : 'light');

            // Edit Page specific update
            if (window.updateAtmosphere) window.updateAtmosphere();

            // Show cute toast if available, or just console log maangas style
            console.log(isDark ? "🌙 Night Mode Activated" : "☀️ Day Mode Activated");
        }
    });
};

// Global Shortcuts anywhere ⌨️
setupGlobalShortcuts();

// Wait for DOM only for interactive/secondary logic 🐢
document.addEventListener('DOMContentLoaded', () => {
    init3DTilt();
    initPasswordVisibilityToggles();
    initAutoCollapseSidebar();
    initResumeEditLink();

    // Enable theme transitions after a tiny delay 🚀
    setTimeout(() => {
        document.body.classList.add('theme-transition');
    }, 50);
});

// 4. Auto-Collapse Sidebar Logic 📏🦈
let collapseTimeout;
export const initAutoCollapseSidebar = () => {
    const sidebar = document.querySelector('.sidebar');
    if (!sidebar) return;

    // Skip if on homepage as requested 🏠🚫
    const path = window.location.pathname;
    if (path.includes('homepage.html') || path.endsWith('/')) {
        console.log("Sidebar auto-collapse disabled for Homepage");
        return;
    }

    const startTimer = () => {
        clearTimeout(collapseTimeout);
        collapseTimeout = setTimeout(() => {
            // SHARK GUARD: Don't collapse if it's already open (mobile) or if screen is small 🛡️
            if (window.innerWidth <= 768 || sidebar.classList.contains('open')) return;

            if (!sidebar.matches(':hover')) {
                sidebar.classList.add('collapsed');
                console.log("Sidebar collapsed 📏");
            }
        }, 2000);
    };

    const expandSidebar = () => {
        clearTimeout(collapseTimeout);
        sidebar.classList.remove('collapsed');
        console.log("Sidebar expanded 🛡️");
    };

    const collapseImmediately = () => {
        // SHARK GUARD 🛡️
        if (window.innerWidth <= 768 || sidebar.classList.contains('open')) return;

        clearTimeout(collapseTimeout);
        sidebar.classList.add('collapsed');
        console.log("Sidebar collapsed immediately 📏");
    };

    sidebar.addEventListener('mouseenter', expandSidebar);
    sidebar.addEventListener('mouseleave', collapseImmediately);

    // Initial check
    if (window.innerWidth > 768) {
        startTimer();
    }
};

// 5. Resume Edit Link Logic
export const initResumeEditLink = () => {
    const activeSession = localStorage.getItem('activeEditSession');
    const sidebarMenu = document.querySelector('.sidebar-menu');
    const isEditPage = window.location.pathname.includes('editpage.html');

    if (activeSession && sidebarMenu && !isEditPage) {
        // Remove existing one if any
        document.querySelector('.resume-edit-container')?.remove();

        const container = document.createElement('div');
        container.className = 'resume-edit-container';

        const resumeLink = document.createElement('a');
        resumeLink.href = `editpage.html?${activeSession}`;
        resumeLink.className = 'sidebar-link resume-edit-link';
        resumeLink.innerHTML = `
            <img src="images/EDIT.png" alt="Edit">
            <span>Resume Edit</span>
        `;

        const dismissBtn = document.createElement('button');
        dismissBtn.innerHTML = '×';
        dismissBtn.className = 'resume-edit-dismiss';
        dismissBtn.title = "Clear Edit Session";
        dismissBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            localStorage.removeItem('activeEditSession');
            container.remove();
            console.log("Edit session cleared by user");
        };

        container.appendChild(resumeLink);
        container.appendChild(dismissBtn);
        sidebarMenu.appendChild(container);
        console.log("Resume Edit link (uniform style) injected! ⚓");
    }
};

// For dynamic content 🪄
export const refreshUIEffects = () => {
    init3DTilt();
    initResumeEditLink();
};
