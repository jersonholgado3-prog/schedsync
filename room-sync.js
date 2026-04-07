import { collection, addDoc, getDocs, serverTimestamp, deleteDoc, doc } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { DEFAULT_ROOMS } from "./js/data/default-rooms.js";

export async function syncStaticRooms(db) {
    console.log("Starting Room Sync (from defaults)...");

    try {
        const existingRoomsSnap = await getDocs(collection(db, "rooms"));
        const roomCount = existingRoomsSnap.size;

        // --- CLEANUP PHASE ---
        // Delete generic "Computer Laboratory" rooms that were added without numbers.
        for (const roomDoc of existingRoomsSnap.docs) {
            const rData = roomDoc.data();
            const rName = String(rData.name || "").toLowerCase().trim();
            const isLegacyLab = /^(computer laboratory|laboratory|computer lab)$/i.test(rName);

            if (isLegacyLab) {
                console.log(`🧼 SchedSync CLEANUP: Deleting legacy duplicate -> ${rData.name}`);
                try {
                    await deleteDoc(doc(db, "rooms", roomDoc.id));
                } catch (err) {
                    console.error("Cleanup failed for doc:", roomDoc.id, err);
                }
            }
        }

        // --- SMART BOOTSTRAP ---
        // Only auto-add defaults if the database is EMPTY or barely has rooms
        // This prevents re-adding rooms that an admin manually deleted.
        if (roomCount > 5) {
            console.log("SchedSync: Database already has rooms. Skipping auto-bootstrap to respect deletions");
            return 0;
        }

        console.log("SchedSync: Bootstrapping default rooms...");
        const updatedSnap = await getDocs(collection(db, "rooms"));
        const existingNames = new Set();
        updatedSnap.forEach(d => {
            const name = String(d.data().name || "").toLowerCase().trim();
            if (name) existingNames.add(name);
        });

        let addedCount = 0;
        for (const room of DEFAULT_ROOMS) {
            const targetName = room.name.toLowerCase().trim();
            if (!existingNames.has(targetName)) {
                try {
                    await addDoc(collection(db, "rooms"), {
                        name: room.name,
                        type: room.type,
                        floor: room.floor,
                        createdAt: serverTimestamp(),
                        isSystemGenerated: true
                    });
                    existingNames.add(targetName);
                    addedCount++;
                    console.log(`Synced: ${room.name}`);
                } catch (err) {
                    console.error(`Failed to sync ${room.name}:`, err);
                }
            }
        }
        return addedCount;
    } catch (err) {
        console.error("Sync failed:", err);
        return 0;
    }
}
