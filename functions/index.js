const { onRequest, onCall } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");

initializeApp();

exports.deleteUserAccount = onCall({ enforceAppCheck: false, cors: true }, async (request) => {
  const callerUid = request.auth?.uid;
  if (!callerUid) throw new Error("Unauthenticated");

  const { uid } = request.data;
  if (!uid) throw new Error("Missing uid");

  // Verify caller is admin or academic_head via Firestore
  const { getFirestore } = require("firebase-admin/firestore");
  const callerDoc = await getFirestore().collection('users').doc(callerUid).get();
  const callerRole = callerDoc.data()?.role || '';
  if (callerRole !== 'admin' && callerRole !== 'academic_head') throw new Error("Unauthorized");

  await getAuth().deleteUser(uid);
  return { success: true };
});

// TODO: sendPushOnNotification — finding replacement for OneSignal
// exports.sendPushOnNotification = ...

exports.resetUserPassword = onCall({ enforceAppCheck: false, cors: true }, async (request) => {
  if (!request.auth?.uid) throw new Error("Unauthenticated");
  const { uid, password } = request.data;
  if (!uid || !password) throw new Error("Missing uid or password");
  await getAuth().updateUser(uid, { password });
  return { success: true };
});

exports.createUserAccount = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");
  try {
    // Verify Firebase Auth ID token
    const authHeader = req.headers.authorization || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!idToken) return res.status(401).json({ error: "Unauthenticated" });
    await getAuth().verifyIdToken(idToken);

    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Missing email or password" });

    const adminAuth = getAuth();
    try {
      const user = await adminAuth.createUser({ email, password });
      return res.json({ uid: user.uid });
    } catch (err) {
      if (err.code === 'auth/email-already-exists') {
        const existing = await adminAuth.getUserByEmail(email);
        await adminAuth.updateUser(existing.uid, { password });
        return res.json({ uid: existing.uid });
      }
      throw err;
    }
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
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
