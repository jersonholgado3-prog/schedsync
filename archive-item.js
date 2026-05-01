import { db, auth } from "./js/config/firebase-config.js";
import { doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

export async function archiveItem(type, itemId, originalData, reason = '', academicYear = '') {
  try {
    await setDoc(doc(db, 'archives', type, 'items', itemId), {
      originalData,
      archivedAt: serverTimestamp(),
      archivedBy: auth.currentUser?.email || 'Unknown',
      reason,
      academicYear,
      type
    });
    return true;
  } catch (error) {
    console.error('Error archiving:', error);
    return false;
  }
}
