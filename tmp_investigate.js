
import { db } from "./js/config/firebase-config.js";
import { collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

async function investigate() {
  const roomName = "Room 101";
  console.log("Investigating published schedules for:", roomName);

  const q = query(collection(db, "schedules"), where("status", "==", "published"));
  const snap = await getDocs(q);

  snap.forEach(doc => {
    const data = doc.data();
    const hasRoom = (data.classes || []).some(c => 
      c.room && c.room.toLowerCase().includes(roomName.toLowerCase())
    );

    if (hasRoom) {
      console.log("--- Schedule Found ---");
      console.log("ID:", doc.id);
      console.log("Name:", data.scheduleName);
      console.log("Section:", data.section);
      console.log("Classes for Room 101:");
      data.classes.filter(c => c.room && c.room.toLowerCase().includes(roomName.toLowerCase()))
        .forEach(c => console.log(`  ${c.day} ${c.timeBlock} - ${c.subject}`));
    }
  });
}

investigate();
