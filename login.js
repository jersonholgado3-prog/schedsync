// login.js — handles both login.html and forgotpass.html

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { getFirestore, doc, getDoc, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

// ✅ Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBrtJocBlfkPciYO7f8-7FwREE1tSF3VXU",
  authDomain: "schedsync-e60d0.firebaseapp.com",
  projectId: "schedsync-e60d0",
  storageBucket: "schedsync-e60d0.firebasestorage.app",
  messagingSenderId: "334140247575",
  appId: "1:334140247575:web:930b0c12e024e4defc5652",
  measurementId: "G-S59GL1W5Y2"
};

// ✅ Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

document.addEventListener('DOMContentLoaded', () => {
  const notif = document.getElementById('notification');

  const showNotification = (message, type = 'success') => {
    if (!notif) return;
    notif.textContent = message;
    notif.className = `notification ${type}`;
    notif.style.display = 'block';
  };

  // =====================================================
  // ✅ LOGIN PAGE LOGIC
  // =====================================================
  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const userInput = document.getElementById('username').value.trim();
      const password = document.getElementById('password').value;

      if (!userInput || !password) {
        showNotification('Please fill in both fields.', 'error');
        return;
      }

      let email = userInput;

      // Check if input is a username (not an email)
      if (!userInput.includes('@')) {
        try {
          const q = query(collection(db, "users"), where("username", "==", userInput));
          const querySnapshot = await getDocs(q);

          if (querySnapshot.empty) {
            showNotification('No user found with that username.', 'error');
            return;
          }

          // Get the email from the first matching user document
          email = querySnapshot.docs[0].data().email;
        } catch (error) {
          console.error("Username lookup failed:", error);
          showNotification('Could not verify username. Try email login.', 'error');
          return;
        }
      }

      try {
        // Attempt Firebase sign-in
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // Fetch and cache role
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          localStorage.setItem('userRole', userData.role || 'student');
          if (userData.section) {
            localStorage.setItem('userSection', userData.section);
          } else {
            localStorage.removeItem('userSection');
          }
        } else {
          localStorage.setItem('userRole', 'student');
          localStorage.removeItem('userSection');
        }

        showNotification('✅ Login successful! Redirecting...', 'success');

        // Redirect to homepage after a short delay
        setTimeout(() => {
          window.location.href = 'homepage.html';
        }, 1500);

      } catch (error) {
        console.error(error);
        let msg = 'Login failed. Please check your credentials.';
        if (error.code === 'auth/user-not-found') msg = 'No account found with this email.';
        if (error.code === 'auth/wrong-password') msg = 'Incorrect password.';
        if (error.code === 'auth/invalid-email') msg = 'Invalid email address.';
        if (error.code === 'auth/invalid-credential') msg = 'Invalid login credentials.';
        showNotification(msg, 'error');
      }
    });
  }

  // =====================================================
  // ✅ FORGOT PASSWORD PAGE LOGIC
  // =====================================================
  const forgotForm = document.getElementById('forgotPasswordForm');
  if (forgotForm) {
    forgotForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const email = document.getElementById('email').value.trim();

      if (!email) {
        showNotification('Please enter your email address.', 'error');
        return;
      }

      try {
        // Send reset email
        await sendPasswordResetEmail(auth, email);
        showNotification('📩 Password reset email sent! Check your inbox.', 'success');

        // Redirect back to landing after 3 seconds
        setTimeout(() => {
          window.location.href = 'sync-1.html';
        }, 3000);

      } catch (error) {
        console.error(error);
        let msg = 'Something went wrong. Please try again.';
        if (error.code === 'auth/user-not-found') msg = 'No account found with this email.';
        if (error.code === 'auth/invalid-email') msg = 'Invalid email format.';
        showNotification(msg, 'error');
      }
    });
  }
});
