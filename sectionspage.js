import { db, auth } from "./js/config/firebase-config.js";
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, onSnapshot, orderBy } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { initUserProfile } from "./userprofile.js";
import { initMobileNav } from "./js/ui/mobile-nav.js";

document.addEventListener("DOMContentLoaded", () => {
    initUserProfile("#userProfile");
    initMobileNav();

    const sectionsGrid = document.getElementById("sections-grid");
    const sectionModal = document.getElementById("sectionModal");
    const addSectionBtn = document.getElementById("addSectionBtn");
    const closeModal = document.getElementById("closeModal");
    const sectionForm = document.getElementById("sectionForm");
    const sectionSearch = document.getElementById("sectionSearch");
    const deleteSectionBtn = document.getElementById("deleteSectionBtn");

    let allSections = [];
    let isAdmin = false;

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            const userDoc = await getDocs(query(collection(db, "users")));
            const currentUserDoc = userDoc.docs.find(d => d.id === user.uid);
            if (currentUserDoc && currentUserDoc.data().role === 'admin') {
                isAdmin = true;
                document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'block');
            }
            listenForSections();
        }
    });

    function listenForSections() {
        const q = query(collection(db, "sections"), orderBy("name"));
        onSnapshot(q, (snapshot) => {
            allSections = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            renderSections(allSections);
        });
    }

    function renderSections(sections) {
        sectionsGrid.innerHTML = "";
        if (sections.length === 0) {
            sectionsGrid.innerHTML = '<div class="col-span-full text-center py-10 opacity-50">No sections found.</div>';
            return;
        }

        sections.forEach(section => {
            const card = document.createElement("div");
            card.className = "section-card";
            card.innerHTML = `
                <div class="section-name">${section.name}</div>
                <div class="section-strand">${section.strand}</div>
                <div class="text-xs opacity-70">${section.gradeLevel || ""}</div>
            `;
            
            card.onclick = () => {
                if (isAdmin) {
                    openEditModal(section);
                } else {
                    // Navigate to section profile (to be created)
                    window.location.href = `sectionprofile.html?id=${section.id}`;
                }
            };

            // Add long press or right click for admin to view profile vs edit
            if (isAdmin) {
                card.oncontextmenu = (e) => {
                    e.preventDefault();
                    window.location.href = `sectionprofile.html?id=${section.id}`;
                };
                // Small info icon for profile
                const infoBtn = document.createElement('div');
                infoBtn.innerHTML = 'ℹ️';
                infoBtn.style.position = 'absolute';
                infoBtn.style.top = '5px';
                infoBtn.style.right = '5px';
                infoBtn.style.fontSize = '12px';
                infoBtn.onclick = (e) => {
                    e.stopPropagation();
                    window.location.href = `sectionprofile.html?id=${section.id}`;
                };
                card.style.position = 'relative';
                card.appendChild(infoBtn);
            }

            sectionsGrid.appendChild(card);
        });
    }

    function openEditModal(section = null) {
        if (section) {
            document.getElementById("modalTitle").textContent = "Edit Section";
            document.getElementById("sectionId").value = section.id;
            document.getElementById("sectionName").value = section.name;
            document.getElementById("sectionStrand").value = section.strand;
            document.getElementById("sectionGrade").value = section.gradeLevel || "11";
            deleteSectionBtn.classList.remove("hidden");
        } else {
            document.getElementById("modalTitle").textContent = "Add New Section";
            document.getElementById("sectionId").value = "";
            sectionForm.reset();
            deleteSectionBtn.classList.add("hidden");
        }
        sectionModal.classList.remove("hidden");
        sectionModal.classList.add("flex");
    }

    addSectionBtn.onclick = () => openEditModal();
    closeModal.onclick = () => {
        sectionModal.classList.add("hidden");
        sectionModal.classList.remove("flex");
    };

    sectionForm.onsubmit = async (e) => {
        e.preventDefault();
        const id = document.getElementById("sectionId").value;
        const name = document.getElementById("sectionName").value.trim();
        const strand = document.getElementById("sectionStrand").value;
        const gradeLevel = document.getElementById("sectionGrade").value;

        const sectionData = { name, strand, gradeLevel, updatedAt: new Date().toISOString() };

        try {
            if (id) {
                await updateDoc(doc(db, "sections", id), sectionData);
            } else {
                await addDoc(collection(db, "sections"), { ...sectionData, createdAt: new Date().toISOString() });
            }
            sectionModal.classList.add("hidden");
            sectionModal.classList.remove("flex");
        } catch (error) {
            console.error("Error saving section:", error);
            alert("Error saving section.");
        }
    };

    deleteSectionBtn.onclick = async () => {
        const id = document.getElementById("sectionId").value;
        if (confirm("Are you sure you want to delete this section?")) {
            try {
                await deleteDoc(doc(db, "sections", id));
                sectionModal.classList.add("hidden");
                sectionModal.classList.remove("flex");
            } catch (error) {
                console.error("Error deleting section:", error);
            }
        }
    };

    sectionSearch.oninput = (e) => {
        const query = e.target.value.toLowerCase();
        const filtered = allSections.filter(s => 
            s.name.toLowerCase().includes(query) || 
            s.strand.toLowerCase().includes(query)
        );
        renderSections(filtered);
    };
});