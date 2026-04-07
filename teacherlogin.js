import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { getFirestore, doc, updateDoc, getDoc } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { showToast, showConfirm } from "./js/utils/ui-utils.js";

const firebaseConfig = {
    apiKey: "AIzaSyBrtJocBlfkPciYO7f8-7FwREE1tSF3VXU",
    authDomain: "schedsync-e60d0.firebaseapp.com",
    projectId: "schedsync-e60d0",
    storageBucket: "schedsync-e60d0.firebasestorage.app",
    messagingSenderId: "334140247575",
    appId: "1:334140247575:web:930b0c12e024e4defc5652",
    measurementId: "G-S59GL1W5Y2"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Data: Subjects by Forte
const SUBJECT_DATA = {
    MATH: [
        "General Mathematics (Gen Math)",
        "Statistics and Probability",
        "Pre-Calculus",
        "Basic Calculus"
    ],
    ENGLISH: [
        "Oral Communication in Context",
        "Reading and Writing Skills",
        "English for Academic and Professional Purposes (EAPP)"
    ],
    PHILOSOPHY: [
        "Introduction to the Philosophy of the Human Person",
        "Understanding Culture, Society, and Politics (UCSP)",
        "Trends, Networks, and Critical Thinking in the 21st Century",
        "Personal Development (PerDev)"
    ],
    SCIENCE: [
        "Earth and Life Science",
        "Physical Science",
        "General Biology 1",
        "General Biology 2",
        "General Chemistry 1",
        "General Chemistry 2",
        "General Physics 1",
        "General Physics 2"
    ],
    FILIPINO: [
        "Komunikasyon at Pananaliksik sa Wika at Kulturang Pilipino",
        "Pagbasa at Pagsusuri ng Iba’t Ibang Teksto",
        "Contemporary Philippine Arts from the Regions"
    ],
    PE: [
        "Physical Education and Health 1",
        "Physical Education and Health 2",
        "Physical Education and Health 3",
        "Physical Education and Health 4"
    ],
    ICT: [
        "Empowerment Technologies (E-Tech)",
        "Computer Programming 1",
        "Computer Programming 2",
        "Web Development",
        "Animation / Multimedia",
        "Technical Drafting"
    ],
    ABM: [
        "Applied Economics",
        "Fundamentals of Accountancy, Business, and Management 1",
        "Fundamentals of Accountancy, Business, and Management 2",
        "Business Finance",
        "Organization and Management",
        "Principles of Marketing"
    ],
    STEM: [
        "Research 1",
        "Research 2"
    ],
    HUMSS: [
        "Creative Writing",
        "Creative Nonfiction",
        "Disciplines and Ideas in the Social Sciences",
        "Disciplines and Ideas in the Applied Social Sciences"
    ],
    RESEARCH: [
        "Practical Research 1 (Qualitative)",
        "Practical Research 2 (Quantitative)",
        "Inquiries, Investigations, and Immersion"
    ],
    IMMERSION: [
        "Work Immersion"
    ]
};

// DOM Elements
const form = document.getElementById("teacherSetupForm");
const specializationSelect = document.getElementById("specialization");
const errorMsg = document.getElementById("form-error");
// Note: Other elements are selected dynamically inside functions or updated in the main block

// State
let currentUser = null;
const selectedSubjectsSet = new Set(); // Track selected subjects

// Check Auth State
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        // Optional: Check if user is actually a teacher by fetching doc
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists()) {
            const userData = userDoc.data();
            if (userData.role !== 'teacher') {
                showToast("Not authorized. Redirecting.", "error");
                window.location.href = "homepage.html";
            }
        }
    } else {
        // Redirect to landing if not authenticated
        window.location.href = "index.html";
    }
});

// Custom Dropdown Logic
const customSelectWrapper = document.getElementById("customForteSelect");
const customSelectTrigger = customSelectWrapper.querySelector(".custom-select-trigger");
const customOptions = customSelectWrapper.querySelectorAll(".custom-option");
const hiddenSelect = document.getElementById("specialization");

customSelectTrigger.addEventListener("click", () => {
    customSelectWrapper.classList.toggle("open");
});

customOptions.forEach(option => {
    option.addEventListener("click", () => {
        const value = option.dataset.value;
        const text = option.textContent;

        // Update UI
        customSelectTrigger.querySelector('span').textContent = text;
        customSelectWrapper.classList.remove("open");

        // Update Selected State
        customOptions.forEach(opt => opt.classList.remove('selected'));
        option.classList.add('selected');

        // Update Hidden Value & Trigger Event
        hiddenSelect.value = value;
        hiddenSelect.dispatchEvent(new Event('change'));
    });
});

// Close when clicking outside
window.addEventListener('click', (e) => {
    if (!customSelectWrapper.contains(e.target)) {
        customSelectWrapper.classList.remove('open');
    }
});

hiddenSelect.addEventListener('change', () => {
    renderSubjects();
    // We don't clear selectedSubjectsSet here to allow cross-specialization selection if desired, 
    // OR we can clear it if the user wants fresh start. Let's keep them for flexibility but refresh the view.
});

// New DOM Elements (based on updated HTML)
const subjectGrid = document.getElementById("subjectGrid");
const selectedSubjectsContainer = document.getElementById("selectedSubjectsContainer");

function renderSubjects() {
    const selectedForte = specializationSelect.value;
    if (!selectedForte) return;

    subjectGrid.innerHTML = ''; // Clear scroll list

    // 1. Recommended Subjects (Matching Forte) logic
    if (SUBJECT_DATA[selectedForte]) {
        addSubjectGroup(`Recommended for ${selectedForte}`, SUBJECT_DATA[selectedForte]);
    }

    // 2. Other Subjects logic
    const otherSubjects = [];
    Object.keys(SUBJECT_DATA).forEach(key => {
        if (key !== selectedForte) {
            SUBJECT_DATA[key].forEach(subj => {
                // Prevent duplicates in "Others" and ensure unique list
                if (!SUBJECT_DATA[selectedForte].includes(subj) && !otherSubjects.includes(subj)) {
                    otherSubjects.push(subj);
                }
            });
        }
    });

    if (otherSubjects.length > 0) {
        addSubjectGroup('Other Subjects', otherSubjects);
    }
}

function addSubjectGroup(titleText, subjects) {
    const title = document.createElement('div');
    title.className = 'subject-group-title';
    title.textContent = titleText;
    title.style.gridColumn = "1 / -1"; // Span full width
    subjectGrid.appendChild(title);

    subjects.forEach(subject => {
        const item = createSubjectItem(subject);
        subjectGrid.appendChild(item);
    });
}

function createSubjectItem(subjectName) {
    const id = `subj - ${subjectName.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '')} `;

    const wrapper = document.createElement('div');
    // We'll use the existing CSS classes but slightly modified behavior
    // Actually, let's use the .subject-checkbox-label style but as a dict/button
    // To match the previous "lively" look

    const label = document.createElement('div');
    label.className = 'subject-checkbox-label';
    label.textContent = subjectName;
    label.style.width = '100%';
    label.style.textAlign = 'center';
    label.style.justifyContent = 'center';

    // Check if already selected
    if (selectedSubjectsSet.has(subjectName)) {
        label.style.backgroundColor = '#ede9fe';
        label.style.borderColor = '#8b5cf6';
        label.style.color = '#5b21b6';
        label.style.fontWeight = 'bold';
    }

    label.onclick = () => toggleSubject(subjectName, label);

    return label;
}

function toggleSubject(subjectName, element) {
    if (selectedSubjectsSet.has(subjectName)) {
        // Remove
        selectedSubjectsSet.delete(subjectName);
        // Reset styles
        element.style.backgroundColor = 'white';
        element.style.borderColor = '#d4d4d4';
        element.style.color = 'black';
        element.style.fontWeight = '500';
    } else {
        // Add
        selectedSubjectsSet.add(subjectName);
        // Set Active styles
        element.style.backgroundColor = '#ede9fe';
        element.style.borderColor = '#8b5cf6';
        element.style.color = '#5b21b6';
        element.style.fontWeight = 'bold';
    }
    renderChips();
}

function renderChips() {
    selectedSubjectsContainer.innerHTML = '';

    if (selectedSubjectsSet.size === 0) {
        selectedSubjectsContainer.style.display = 'none';
        return;
    }
    selectedSubjectsContainer.style.display = 'contents';

    selectedSubjectsSet.forEach(subject => {
        const chip = document.createElement('div');
        chip.className = 'subject-chip';

        const text = document.createElement('span');
        text.textContent = subject;
        chip.appendChild(text);

        const removeBtn = document.createElement('span');
        removeBtn.className = 'remove-chip';
        removeBtn.innerHTML = '&#10005;'; // X symbol
        removeBtn.onclick = () => {
            selectedSubjectsSet.delete(subject);
            renderChips();
            // Also need to update the grid item if it's currently visible
            renderSubjects(); // Re-render grid to update selection state
        };
        chip.appendChild(removeBtn);

        selectedSubjectsContainer.appendChild(chip);
    });
}


form.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!currentUser) return;

    const employmentStatus = document.querySelector('input[name="employmentStatus"]:checked')?.value;
    const forte = specializationSelect.value;
    const selectedSubjects = Array.from(selectedSubjectsSet);

    if (!employmentStatus) {
        showError("Please select your employment status.");
        return;
    }
    if (!forte) {
        showError("Please select your specialization.");
        return;
    }
    if (selectedSubjects.length === 0) {
        showError("Please select at least one subject.");
        return;
    }

    try {
        const saveButton = form.querySelector('.save-button');
        saveButton.textContent = "Saving...";
        saveButton.disabled = true;

        await updateDoc(doc(db, "users", currentUser.uid), {
            employmentStatus: employmentStatus,
            forte: forte,
            subjects: selectedSubjects,
            isProfileComplete: true
        });

        window.location.href = "homepage.html";

    } catch (error) {
        console.error("Error saving profile:", error);
        showError("Failed to save profile. Please try again.");
        const saveButton = form.querySelector('.save-button');
        saveButton.textContent = "Save & Continue";
        saveButton.disabled = false;
    }
});

function showError(msg) {
    errorMsg.textContent = msg;
    errorMsg.style.display = 'block';
}
