import { db, auth, app } from "./js/config/firebase-config.js";
import { createUserWithEmailAndPassword, updateProfile } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

// DOM Elements
const form = document.getElementById("signupForm");
const roleRadios = document.querySelectorAll('input[name="role"]');
const sectionGroup = document.getElementById("sectionGroup");
const firstNameInput = document.getElementById("firstName");
const lastNameInput = document.getElementById("lastName");
const idNumberInput = document.getElementById("idNumber");
const usernameInput = document.getElementById("username");
const emailInput = document.getElementById("email");
const emailError = document.getElementById("email-error");

// Event Listeners for Dynamic Logic
roleRadios.forEach(radio => {
  radio.addEventListener('change', () => {
    handleRoleChange();
    generateEmail();
  });
});

[firstNameInput, lastNameInput, idNumberInput].forEach(input => {
  input.addEventListener('input', generateEmail);
});

// Run once on load to ensure correct state 🎬
document.addEventListener('DOMContentLoaded', () => {
  handleRoleChange();
  generateEmail();
});

// Also run immediately since modules are deferred anyway
handleRoleChange();
generateEmail();

function handleRoleChange() {
  const selectedRole = document.querySelector('input[name="role"]:checked')?.value;
  const idLabel = document.querySelector('label[for="idNumber"]');

  if (!sectionGroup) return; // Safety check 🛡️

  if (selectedRole === 'student') {
    sectionGroup.style.display = 'block';
    const sectionInput = document.getElementById('section');
    if (sectionInput) sectionInput.required = true;
    if (idLabel) idLabel.textContent = "Student Number";
  } else {
    sectionGroup.style.display = 'none';
    const sectionInput = document.getElementById('section');
    if (sectionInput) {
      sectionInput.required = false;
      sectionInput.value = ''; // Clear section if not student
    }
    if (idLabel) idLabel.textContent = "ID Number";
  }
}

function generateEmail() {
  const firstName = firstNameInput.value.trim().toLowerCase().replace(/\s+/g, '');
  const lastName = lastNameInput.value.trim().toLowerCase().replace(/\s+/g, '');
  const idNumber = idNumberInput.value.trim();
  const selectedRole = document.querySelector('input[name="role"]:checked')?.value;

  if (lastName && idNumber && selectedRole) {
    let domain = "@stamaria.sti.edu"; // Default for teacher/admin
    if (selectedRole === 'student') {
      domain = "@stamaria.sti.com";
    }
    const firstInitial = firstName.charAt(0);
    emailInput.value = `${firstInitial}${lastName}${idNumber}${domain}`;
  } else {
    emailInput.value = "";
  }
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const email = emailInput.value.trim();
  const firstName = firstNameInput.value.trim();
  const lastName = lastNameInput.value.trim();
  const idNumber = idNumberInput.value.trim();
  const username = usernameInput.value.trim();
  const section = document.getElementById("section").value.trim();
  const password = document.getElementById("password").value;
  const confirmPassword = document.getElementById("confirmPassword").value;
  const role = document.querySelector('input[name="role"]:checked')?.value;
  const successMsg = document.getElementById("form-success");

  // Reset errors
  emailError.style.display = "none";
  document.getElementById("confirm-password-error").style.display = "none";

  if (!email) {
    showToast("Email could not be generated. Please fill in all fields.", "error");
    return;
  }

  if (password !== confirmPassword) {
    const confirmError = document.getElementById("confirm-password-error");
    confirmError.textContent = "Passwords do not match";
    confirmError.style.display = "block";
    return;
  }

  try {
    // 1. Create Auth User
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // 2. Update Profile with Username
    await updateProfile(user, { displayName: username });

    // 3. Save User Details to Firestore
    const userData = {
      uid: user.uid,
      email: email,
      username: username,
      firstName: firstName,
      lastName: lastName,
      role: role,
      idNumber: idNumber,
      createdAt: new Date().toISOString()
    };

    if (role === 'student') {
      userData.section = section;
    }

    await setDoc(doc(db, "users", user.uid), userData);

    // Cache role to eliminate flicker on first load
    localStorage.setItem('userRole', role);
    if (role === 'student' && section) {
      localStorage.setItem('userSection', section);
    }

    successMsg.style.display = "block";
    setTimeout(() => {
      // Redirect based on role
      if (role === 'teacher') {
        window.location.href = "teacherlogin.html";
      } else {
        window.location.href = "homepage.html";
      }
    }, 2000);

  } catch (error) {
    console.error("Signup Error:", error);
    let message = "Signup failed. Please try again.";
    if (error.message.includes("email-already-in-use")) message = "Email is already in use.";
    if (error.message.includes("invalid-email")) message = "Invalid email address.";
    showToast(message, "info");

  }
});