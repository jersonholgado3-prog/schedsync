import { db, auth } from "../config/firebase-config.js";
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

/**
 * Logs an administrative action to the 'audit_logs' collection.
 * @param {string} action - The action performed (e.g., 'SAVE_SCHEDULE', 'DELETE_ANNUNCIATION').
 * @param {string} details - Detailed description of the action.
 * @param {object} metadata - Additional context (e.g., schedule name, section).
 */
export async function logAction(action, details, metadata = {}) {
    try {
        const user = auth.currentUser;
        const logEntry = {
            action: action || "UNKNOWN_ACTION",
            details: details || "",
            metadata: metadata,
            userId: user ? user.uid : "SYSTEM",
            userEmail: user ? user.email : "system@schedsync.com",
            userName: user ? (user.displayName || user.email.split('@')[0]) : "System/Guest",
            timestamp: serverTimestamp()
        };

        await addDoc(collection(db, "audit_logs"), logEntry);
        console.log(`[Audit] Action logged: ${action}`);
    } catch (error) {
        console.error("[Audit] Failed to log action:", error);
    }
}
