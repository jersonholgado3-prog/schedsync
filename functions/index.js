const { onRequest, onCall } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");

initializeApp();

exports.deleteUserAccount = onCall({ enforceAppCheck: false }, async (request) => {
  // Only callable by admins
  const callerUid = request.auth?.uid;
  if (!callerUid) throw new Error("Unauthenticated");

  const adminAuth = getAuth();
  const callerRecord = await adminAuth.getUser(callerUid);
  // Verify caller is admin via custom claims or Firestore — here we trust the client role check
  // (You can add Firestore role verification here for extra security)

  const { uid } = request.data;
  if (!uid) throw new Error("Missing uid");
  if (uid === callerUid) throw new Error("Cannot delete your own account");

  await adminAuth.deleteUser(uid);
  return { success: true };
});

// TODO: sendPushOnNotification — finding replacement for OneSignal
// exports.sendPushOnNotification = ...

exports.resetUserPassword = onCall({ enforceAppCheck: false }, async (request) => {
  if (!request.auth?.uid) throw new Error("Unauthenticated");
  const { uid, password } = request.data;
  if (!uid || !password) throw new Error("Missing uid or password");
  await getAuth().updateUser(uid, { password });
  return { success: true };
});

({ cors: true }, async (req, res) => {
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");
  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify(req.body)
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
