/**
 * SchedSync UI Theme Manager 🌗⚓
 */
export const initTheme = () => {
    const theme = localStorage.getItem("theme");
    if (theme === "dark" || (!theme && window.matchMedia("(prefers-color-scheme: dark)").matches)) {
        document.documentElement.classList.add("dark");
    } else {
        document.documentElement.classList.remove("dark");
    }
};

export const toggleTheme = () => {
    const html = document.documentElement;
    const isDark = html.classList.toggle('dark');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');

    // Update Atmospheric Effects if they exist
    if (window.updateAtmosphere) window.updateAtmosphere();
};

// Auto-init theme if in browser 🚀
if (typeof window !== 'undefined') {
    initTheme();

    // Global Keyboard Shortcut: Ctrl/Cmd + M 🌗
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'm') {
            e.preventDefault();
            toggleTheme();
        }
    });
}
