
import { db } from "./js/config/firebase-config.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

async function huntGhostData() {
  const snap = await getDocs(collection(db, "schedules"));
  console.log(`Total schedules: ${snap.size}`);
  snap.forEach(doc => {
    const data = doc.data();
    console.log(`ID: ${doc.id}, Section: ${data.section}, Status: ${data.status}`);
    (data.classes || []).forEach(c => {
       console.log(`  - ${c.day} ${c.timeBlock} Subject: ${c.subject} Room: ${c.room}`);
    });
  });
}

huntGhostData();
