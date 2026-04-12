importScripts('https://www.gstatic.com/firebasejs/11.0.1/firebase-app-bw.js');
importScripts('https://www.gstatic.com/firebasejs/11.0.1/firebase-messaging-bw.js');

// ⚓ Initialize the Firebase app in the service worker
// Note: This must match your firebase-config.js credentials po! 🚀
firebase.initializeApp({
    apiKey: "AIzaSyBrtJocBlfkPciYO7f8-7FwREE1tSF3VXU",
    authDomain: "schedsync-e60d0.firebaseapp.com",
    projectId: "schedsync-e60d0",
    storageBucket: "schedsync-e60d0.firebasestorage.app",
    messagingSenderId: "334140247575",
    appId: "1:334140247575:web:930b0c12e024e4defc5652"
});

const messaging = firebase.messaging();

// Background Message Handler 🔔
messaging.onBackgroundMessage((payload) => {
  console.log('[SchedSync SW] Received background message po: ', payload);
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: './images/LOGO.png',
    badge: './images/LOGO.png',
    tag: 'schedsync-notification'
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
