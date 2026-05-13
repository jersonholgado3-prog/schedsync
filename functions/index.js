const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const https = require("https");

initializeApp();

const ONESIGNAL_APP_ID = "ef82a79a-5e7a-4a5f-83a6-e2b90b8302c9";
const ONESIGNAL_API_KEY = "os_v2_app_56bkpgs6pjff7a5g4k4qxayczfelnogxafiuaye5gz47agi4llpb6xjskn2rcvrg7rwkve3fv3byvtgvcq2dhczfvzey3kujaixlfhy";

exports.sendPushOnNotification = onDocumentCreated("notifications/{notifId}", async (event) => {
  const data = event.data.data();
  const title = data.title || "SchedSync";
  const body = data.message || "";

  const db = getFirestore();
  const playersSnap = await db.collection("oneSignalPlayers").get();
  if (playersSnap.empty) return;

  const playerIds = playersSnap.docs.map(d => d.data().playerId).filter(Boolean);
  if (!playerIds.length) return;

  const payload = JSON.stringify({
    app_id: ONESIGNAL_APP_ID,
    include_player_ids: playerIds,
    headings: { en: title },
    contents: { en: body },
    chrome_web_icon: "/images/LOGO.png"
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: "onesignal.com",
      path: "/api/v1/notifications",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Basic ${ONESIGNAL_API_KEY}`
      }
    }, (res) => {
      res.on("data", () => {});
      res.on("end", resolve);
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
});
