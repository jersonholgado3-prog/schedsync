import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { 
  getFirestore, 
  initializeFirestore, 
  persistentLocalCache, 
  persistentMultipleTabManager 
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-analytics.js";

const firebaseConfig = {
    apiKey: "AIzaSyBrtJocBlfkPciYO7f8-7FwREE1tSF3VXU",
    authDomain: "schedsync-e60d0.firebaseapp.com",
    projectId: "schedsync-e60d0",
    storageBucket: "schedsync-e60d0.firebasestorage.app",
    messagingSenderId: "334140247575",
    appId: "1:334140247575:web:930b0c12e024e4defc5652",
    measurementId: "G-S59GL1W5Y2"
};

// Initialize Firebase once 🚀⚓
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// 🛡️ CACHING ENGINE: Initialize Firestore with Offline Persistence (IndexedDB)
// This reduces Read quota usage by serving data from cache when it hasn't changed.
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
});

const auth = getAuth(app);
const analytics = typeof window !== 'undefined' ? getAnalytics(app) : null;

export { app, db, auth, analytics };
