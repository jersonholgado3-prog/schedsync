// login.js — handles both login.html and forgotpass.html

import { auth, db, app } from "./js/config/firebase-config.js";
import {
  signInWithEmailAndPassword,
  sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { doc, getDoc, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {
  const notif = document.getElementById('notification');

  const showNotification = (message, type = 'success') => {
    if (!notif) return;
    notif.textContent = message;
    notif.className = `notification ${type}`;
    notif.style.display = 'block';
  };

  // Password toggle logic is now handled globally by ui-effects.js ⚓

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
          const rolePriority = ['admin', 'academic_head', 'teacher', 'student'];
          const derivedRole = userData.role || (Array.isArray(userData.roles) && rolePriority.find(r => userData.roles.includes(r))) || 'student';
          localStorage.setItem('userRole', derivedRole);
          localStorage.setItem('userProgram', userData.program || '');
          const name = userData.username || userData.fullName || userData.name || userData.lastName || user.displayName || user.email.split('@')[0];
          if (name) localStorage.setItem('displayName', name);
          if (userData.section) {
            localStorage.setItem('userSection', userData.section);
          } else {
            localStorage.removeItem('userSection');
          }
        } else {
          // Auto-seed admin doc for fallback account
          if (user.email === 'jersonpierceeee@gmail.com') {
            const { setDoc } = await import("https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js");
            await setDoc(doc(db, "users", user.uid), {
              username: 'Admin',
              email: user.email,
              role: 'admin',
              authUid: user.uid,
              createdAt: new Date().toISOString()
            });
            localStorage.setItem('userRole', 'admin');
          } else {
            localStorage.setItem('userRole', 'student');
          }
          localStorage.setItem('userProgram', '');
          localStorage.removeItem('userSection');
        }

        // Set defaults for new users (only if not already set)
        if (!localStorage.getItem('uiMode')) localStorage.setItem('uiMode', 'professional');

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
  // ✅ ADMIN PASSWORD-ONLY LOGIN
  // =====================================================
  const adminLoginForm = document.getElementById('adminLoginForm');
  if (adminLoginForm) {
    const showAdminNotif = (msg, type) => {
      const el = document.getElementById('adminNotif');
      if (!el) return;
      el.textContent = msg;
      el.style.display = 'block';
      el.style.background = type === 'error' ? '#fee2e2' : '#dcfce7';
      el.style.color = type === 'error' ? '#dc2626' : '#16a34a';
    };
    adminLoginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const password = document.getElementById('adminPassword').value;
      if (!password) { showAdminNotif('Please enter your password.', 'error'); return; }

      try {
        const snap = await getDocs(query(collection(db, 'users'),
          where('role', 'in', ['admin', 'academic_head'])
        ));
        const match = snap.docs.find(d => d.data().password === password);
        if (!match) { showAdminNotif('Incorrect password.', 'error'); return; }

        const userData = match.data();
        const userCred = await signInWithEmailAndPassword(auth, userData.email, password);

        localStorage.setItem('userRole', userData.role || 'admin');
        localStorage.setItem('userRoles', JSON.stringify(Array.isArray(userData.roles) ? userData.roles : [userData.role]));
        localStorage.setItem('userProgram', userData.program || '');
        const name = userData.username || userData.displayName || userCred.user.email.split('@')[0];
        if (name) localStorage.setItem('displayName', name);
        if (!localStorage.getItem('uiMode')) localStorage.setItem('uiMode', 'professional');

        showAdminNotif('✅ Redirecting...', 'success');
        setTimeout(() => { window.location.href = 'homepage.html'; }, 1200);
      } catch (error) {
        console.error(error);
        showAdminNotif('Login failed. Please try again.', 'error');
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
          window.location.href = 'index.html';
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
