const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");

initializeApp();

exports.sendPushOnNotification = onDocumentCreated("notifications/{notifId}", async (event) => {
  const data = event.data.data();
  const title = data.title || "SchedSync";
  const body = data.message || "";

  const db = getFirestore();
  const tokensSnap = await db.collection("fcmTokens").get();
  if (tokensSnap.empty) return;

  const tokens = tokensSnap.docs.map(d => d.data().token).filter(Boolean);
  if (!tokens.length) return;

  // Send in batches of 500 (FCM limit)
  const chunks = [];
  for (let i = 0; i < tokens.length; i += 500) chunks.push(tokens.slice(i, i + 500));

  for (const chunk of chunks) {
    await getMessaging().sendEachForMulticast({
      tokens: chunk,
      notification: { title, body },
      webpush: { notification: { icon: "/images/LOGO.png", badge: "/images/LOGO.png" } }
    });
  }
});
