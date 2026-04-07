export const SUBJECT_DATA = {
    CORE: [
        "Oral Communication in Context", "Reading and Writing Skills", "English for Academic and Professional Purposes (EAPP)",
        "Introduction to the Philosophy of the Human Person", "Understanding Culture, Society, and Politics (UCSP)",
        "Personal Development (PerDev)", "Contemporary Philippine Arts from the Regions",
        "General Mathematics", "Statistics and Probability",
        "Earth and Life Science", "Physical Science",
        "Komunikasyon at Pananaliksik sa Wika at Kulturang Pilipino",
        "Pagbasa at Pagsusuri ng Iba’t Ibang Teksto tungo sa Pananaliksik",
        "Physical Education and Health 1", "Physical Education and Health 2", "Physical Education and Health 3", "Physical Education and Health 4"
    ],
    APPLIED: [
        "Empowerment Technologies (E-Tech)",
        "Practical Research 1 (Qualitative)", "Practical Research 2 (Quantitative)", "Inquiries, Investigations, and Immersion",
        "Entrepreneurship", "Work Immersion"
    ],
    ICT: [
        "Computer Programming 1", "Computer Programming 2", "Web Development",
        "Animation / Multimedia Systems", "Technical Drafting / Digital Design",
        "Systems Analysis and Design", "Mobile App Development"
    ],
    ABM: [
        "Applied Economics", "Fundamentals of Accountancy, Business and Management 1 (FABM 1)",
        "Fundamentals of Accountancy, Business and Management 2 (FABM 2)", "Business Finance",
        "Principles of Marketing", "Organization and Management", "Business Ethics and Social Responsibility"
    ],
    STEM: [
        "Pre-Calculus", "Basic Calculus",
        "General Biology 1", "General Biology 2", "General Chemistry 1", "General Chemistry 2",
        "General Physics 1", "General Physics 2"
    ],
    HUMSS: [
        "Creative Writing", "Creative Nonfiction", "Philippine Politics and Governance",
        "Disciplines and Ideas in the Social Sciences", "Disciplines and Ideas in the Applied Social Sciences",
        "Community Engagement, Solidarity, and Citizenship", "Trends, Networks, and Critical Thinking in the 21st Century"
    ]
};

export const GENERAL_KEYS = ['MATH', 'ENGLISH', 'PHILOSOPHY', 'SCIENCE', 'FILIPINO', 'PE', 'RESEARCH', 'IMMERSION'];

export function getStrandFromSection(section) {
    if (!section) return null;
    const s = section.toUpperCase();
    if (s.includes("ITM") || s.includes("ICT") || s.includes("TVL")) return "ICT";
    if (s.includes("ABM")) return "ABM";
    if (s.includes("STEM")) return "STEM";
    if (s.includes("HUMSS")) return "HUMSS";
    if (s.includes("GAS")) return "GAS";
    if (s.includes("HE") || s.includes("HOME")) return "HE";
    return null;
}
