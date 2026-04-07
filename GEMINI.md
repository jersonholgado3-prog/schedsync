# SchedSync Project Overview

SchedSync is a comprehensive multi-page web application designed for campus scheduling and management. It enables administrators, teachers, and students to manage and view schedules, campus rooms, faculty profiles, and events in real-time.

## Tech Stack

- **Frontend:** Vanilla JavaScript (ES Modules), HTML5, CSS3.
- **Backend-as-a-Service:** Firebase
  - **Firestore:** NoSQL database for schedules, users, rooms, and notifications.
  - **Authentication:** Email/Password and Username-based login.
  - **Analytics:** Application usage tracking.
- **Dev Tools:** Builder.io Dev Tools (via `builder.config.json`).

## Architecture & Project Structure

The project follows a modular structure using ES modules for logic while maintaining a traditional multi-page HTML structure.

### Root Directory
- **HTML Pages:** Each major feature has its own HTML file (e.g., `homepage.html`, `newschedule.html`, `campuspage.html`).
- **CSS Files:** Feature-specific styling (e.g., `homepage.css`, `campuspage_styles.css`).
- **Core JS Files:** Feature-specific logic (e.g., `homepage.js`, `role-restriction.js`).

### `js/` Directory
- `config/`: Contains `firebase-config.js` for backend initialization.
- `data/`: Static data and defaults (e.g., `default-rooms.js`).
- `ui/`: UI components like `mobile-nav.js` and `theme-manager.js`.
- `utils/`: Shared utility functions:
  - `audit-logger.js`: Handles logging of user actions.
  - `time-utils.js`: Helpers for schedule timing.
  - `ui-utils.js`: Centralized Toast notifications and Confirmation modals.

## Key Features

- **Role-Based Access Control (RBAC):**
  - **Admin:** Full access to create, edit, and delete schedules, rooms, and faculty.
  - **Teacher:** Can view schedules, request edit permissions, and leave comments in read-only mode.
  - **Student:** Read-only access to schedules and campus information.
  - Logic is centralized in `role-restriction.js`.
- **Scheduling System:**
  - Creation of new schedules with conflict detection.
  - Interactive grid for editing schedules (`editpage.html`).
  - "My Schedule" view for personalized timetables.
- **Campus & Room Management:**
  - Manage rooms across different floors and buildings.
  - Room synchronization features.
- **Real-time Notifications:** Real-time alerts for schedule updates and permission requests.
- **Audit Logs:** Tracking of administrative changes for accountability.

## Development Conventions

- **Modularity:** Prefer ES modules. Import shared utilities from `js/utils/`.
- **UI Consistency:** Use `showToast`, `showConfirm`, and `showPrompt` from `js/utils/ui-utils.js` for user feedback.
- **Firebase Usage:** Initialize Firebase using the shared config in `js/config/firebase-config.js`.
- **State Management:** User roles and basic permissions are cached in `localStorage` for immediate UI response, then "hardened" via Firestore checks in `role-restriction.js`.
- **Styling:** Follow the existing naming convention `[page]page_styles.css` or `[page].css`.

## Building and Running

The project is a static site that can be served using any local web server.
- **Local Development:**
  - The `builder.config.json` suggests using `npx "$builder.io/dev-tools@latest" launch`.
  - Alternatively, use `Live Server` in VS Code or any static file server (e.g., `python -m http.server`).
- **Testing:** No formal testing framework is currently visible. Manual testing via browser is the primary method.
