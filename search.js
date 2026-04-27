import {
  collection,
  query,
  where,
  getDocs,
  limit
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

/**
 * Universal Search System with History
 * @param {object} db - Firestore instance
 * @param {object} options - Configuration options
 */
export function initUniversalSearch(db, options = {}) {
  const {
    inputSelector = ".search-button",
    wrapperSelector = ".search-wrapper",
    historyKey = "schedsync_v3_history"
  } = options;

  const input = document.querySelector(inputSelector);
  const wrapper = document.querySelector(wrapperSelector);
  if (!input || !wrapper) return;

  // Prevent Multiple Initialization
  if (input.dataset.searchInitialized) return;
  input.dataset.searchInitialized = "true";

  // Create Results Dropdown
  const resultsDropdown = document.createElement("div");
  resultsDropdown.className = "search-results-dropdown hidden";
  wrapper.appendChild(resultsDropdown);

  // Search Pool Cache
  let searchPool = null;
  let isFetchingPool = false;

  const fetchSearchPool = async () => {
    if (searchPool || isFetchingPool) return;
    isFetchingPool = true;

    try {
      const results = [];

      // 1. Fetch Teachers
      try {
        const teacherSnap = await getDocs(query(collection(db, "users"), where("role", "==", "teacher"), limit(50)));
        teacherSnap.forEach(doc => {
          const data = doc.data();
          const teacherName = String(data.username || data.name || "Unnamed Teacher");
          results.push({
            id: doc.id,
            type: 'teacher',
            name: teacherName,
            image: data.photoURL,
            url: `facultyprofile.html?id=${doc.id}`,
            meta: (data.subjects || []).join(", ")
          });
        });
      } catch (e) { console.warn("Teacher fetch failed:", e); }

      // 2. Fetch Rooms
      try {
        const roomSnap = await getDocs(collection(db, "rooms"));
        roomSnap.forEach(doc => {
          const data = doc.data();
          const roomName = String(data.name || data.room || "Unnamed Room");
          results.push({
            id: doc.id,
            type: 'room',
            name: roomName,
            url: `roomprofile.html?room=${encodeURIComponent(roomName)}`,
            meta: `${data.floor ? 'Floor ' + data.floor : ''} ${data.type || 'Room'}`
          });
        });
      } catch (e) { console.warn("Room fetch failed:", e); }

      // 3. Fetch Schedules (Published Only 🛡️)
      try {
        const schedSnap = await getDocs(query(
          collection(db, "schedules"), 
          where("status", "==", "published"),
          limit(50)
        ));
        schedSnap.forEach(doc => {
          const data = doc.data();
          const schedName = String(data.scheduleName || "Untitled Schedule");
          results.push({
            id: doc.id,
            type: 'schedule',
            name: schedName,
            url: `editpage.html?id=${doc.id}`,
            meta: data.section || ""
          });
        });
      } catch (e) { console.warn("Schedule fetch failed:", e); }

      // 4. Final De-duplication 🛡️⚓
      const uniqueResults = [];
      const seen = new Set();
      results.forEach(item => {
        const key = `${item.type}:${String(item.name).toLowerCase().trim()}:${String(item.meta).toLowerCase().trim()}`;
        if (!seen.has(key)) {
          seen.add(key);
          uniqueResults.push(item);
        }
      });

      searchPool = uniqueResults;
      indexLocalElements(); // Merge local ones
    } catch (err) {
      console.error("Pool fetch error:", err);
      indexLocalElements(); // Still try local ones if DB fails
    } finally {
      isFetchingPool = false;
    }
  };

  const indexLocalElements = () => {
    const localResults = [];

    // 1. Index Room Pills
    document.querySelectorAll(".room-pill").forEach(pill => {
      let name = pill.textContent.trim();
      if (!name || name.toLowerCase().includes("loading")) return;

      // Normalize: if it's "101", make it "Room 101" for consistency
      const displayName = /^\d+$/.test(name) ? "Room " + name : name;

      localResults.push({
        id: 'local-room-' + name,
        type: 'room',
        name: displayName,
        url: `roomprofile.html?room=${encodeURIComponent(displayName)}`,
        meta: 'Campus Room'
      });
    });

    // 2. Index Faculty Cards
    document.querySelectorAll(".faculty-card").forEach(card => {
      const name = card.dataset.title || card.querySelector(".faculty-name")?.textContent.trim();
      if (!name) return;
      localResults.push({
        id: 'local-teacher-' + name,
        type: 'teacher',
        name: name,
        image: card.querySelector("img")?.src,
        url: `facultyprofile.html?name=${encodeURIComponent(name)}`, // Use name as fallback param
        meta: card.dataset.description || 'Faculty Member'
      });
    });

    // Merge into searchPool (avoiding duplicates)
    if (!searchPool) searchPool = [];
    localResults.forEach(local => {
      const exists = searchPool.some(p =>
        String(p.name).toLowerCase().replace(/\s+/g, '') === String(local.name).toLowerCase().replace(/\s+/g, '') &&
        p.type === local.type
      );
      if (!exists) {
        searchPool.push(local);
      }
    });
  };

  let lastActionTime = 0;

  const getHistory = () => {
    try {
      const data = localStorage.getItem(historyKey);
      const history = data ? JSON.parse(data) : [];
      // Sanitize: ensure it's an array and items have IDs
      return Array.isArray(history) ? history.filter(h => h && (h.id || h.name)) : [];
    } catch (e) {
      console.error("SchedSync DEBUG: History Parse Error:", e);
      return [];
    }
  };

  const saveHistory = (newHistory) => {
    try {
      lastActionTime = Date.now();
      const sanitized = Array.isArray(newHistory) ? newHistory.filter(h => h && (h.id || h.name)) : [];
      console.info("SchedSync DEBUG: Saving History. New count:", sanitized.length);

      if (sanitized.length === 0) {
        localStorage.removeItem(historyKey);
      } else {
        localStorage.setItem(historyKey, JSON.stringify(sanitized));
      }

      // Immediate verification
      const verify = localStorage.getItem(historyKey);
      console.info("SchedSync DEBUG: Storage verified:", verify ? "exists" : "empty");
    } catch (e) {
      console.error("SchedSync DEBUG: History Save Error:", e);
    }
  };

  const addToHistory = (item) => {
    if (!item) return;
    const itemTarget = String(item.id || item.name || "").trim().toLowerCase();
    if (!itemTarget) return;

    console.info("SchedSync DEBUG: Adding to history:", item.name);
    let currentHistory = getHistory();
    // Aggressive matching for addition
    currentHistory = currentHistory.filter(h => {
      const hId = String(h.id || "").trim().toLowerCase();
      const hName = String(h.name || "").trim().toLowerCase();
      return hId !== itemTarget && hName !== itemTarget;
    });
    currentHistory.unshift(item);
    if (currentHistory.length > 15) currentHistory.pop();
    saveHistory(currentHistory);
  };

  const clearAllHistory = () => {
    console.info("SchedSync DEBUG: CLEAR ALL triggered");
    saveHistory([]);
    renderHistory();
  };

  const removeFromHistory = (id, name) => {
    const targetId = String(id || "").trim().toLowerCase();
    const targetName = String(name || "").trim().toLowerCase();
    console.info("SchedSync DEBUG: Removing item (Deep Match):", { targetId, targetName });

    let currentHistory = getHistory();
    const originalLength = currentHistory.length;

    // Deep Match: Match by ID OR Name (handles "Jim" issue)
    currentHistory = currentHistory.filter(h => {
      const hId = String(h.id || "").trim().toLowerCase();
      const hName = String(h.name || "").trim().toLowerCase();

      const matchId = targetId && (hId === targetId || hName === targetId);
      const matchName = targetName && (hName === targetName || hId === targetName);

      return !(matchId || matchName);
    });

    if (currentHistory.length !== originalLength) {
      console.info("SchedSync DEBUG: Deletion successful. Items remaining:", currentHistory.length);
      saveHistory(currentHistory);
      // Re-render immediately
      renderHistory();
    } else {
      console.warn("SchedSync DEBUG: Item not found in history array.");
    }
  };

  const renderHistory = () => {
    if (input.value.trim() !== "") return;
    const currentHistory = getHistory();
    console.info("SchedSync DEBUG: Rendering items count:", currentHistory.length);

    resultsDropdown.innerHTML = "";

    if (currentHistory.length === 0) {
      resultsDropdown.innerHTML = `<div class="search-empty">No recent searches</div>`;
      return;
    }

    const header = document.createElement("div");
    header.className = "search-history-header";
    header.innerHTML = `
      <span class="search-section-title">Recent Searches</span>
      <button type="button" class="clear-all-btn">Clear All</button>
    `;

    resultsDropdown.appendChild(header);

    currentHistory.forEach(item => {
      const div = document.createElement("div");
      div.className = "search-result-item history-item";
      const itemId = String(item.id || "").trim();
      const itemName = String(item.name || "").trim();

      div.dataset.id = itemId;
      div.dataset.name = itemName;

      div.innerHTML = `
        <div class="result-icon">
          ${item.type === 'teacher' ? `<img src="${item.image || 'images/PROFILE.png'}" class="result-pfp">` : getIconForType(item.type)}
        </div>
        <div class="result-info">
          <div class="result-name">${item.name}</div>
          <div class="result-meta">${item.type.charAt(0).toUpperCase() + item.type.slice(1)}</div>
        </div>
        <button type="button" class="remove-history" title="Remove">&times;</button>
      `;

      // Set data on remove button
      const removeBtn = div.querySelector(".remove-history");
      removeBtn.dataset.id = itemId;
      removeBtn.dataset.name = itemName;

      resultsDropdown.appendChild(div);
    });
  };

  // Ultimate Nuclear Strategy: mousedown + capturing
  resultsDropdown.addEventListener("mousedown", (e) => {
    // Determine if it's a history item, clear button, or remove button
    const clearBtn = e.target.closest(".clear-all-btn");
    const removeBtn = e.target.closest(".remove-history");
    const historyItem = e.target.closest(".history-item");

    if (clearBtn || removeBtn || historyItem) {
      lastActionTime = Date.now();
      e.stopPropagation();

      // Prevent focus loss when clicking buttons (Clear All / Remove)
      if (clearBtn || removeBtn) {
        e.preventDefault();
      }
    }

    if (clearBtn) {
      clearAllHistory();
      return;
    }

    if (removeBtn) {
      const id = removeBtn.dataset.id;
      const name = removeBtn.dataset.name;
      removeFromHistory(id, name);
      return;
    }

    if (historyItem) {
      const id = historyItem.dataset.id;
      const name = historyItem.dataset.name;
      const item = getHistory().find(h => {
        const hId = String(h.id || h.name || "").trim().toLowerCase();
        const hName = String(h.name || "").trim().toLowerCase();
        const tId = String(id || "").trim().toLowerCase();
        const tName = String(name || "").trim().toLowerCase();
        return (tId && hId === tId) || (tName && hName === tName);
      });
      if (item) {
        addToHistory(item);
        window.location.href = item.url;
      }
    }
  }, true); // Use capturing phase to be first!

  const getIconForType = (type) => {
    switch (type) {
      case 'room': return '🏫';
      case 'schedule': return '📅';
      default: return '🔍';
    }
  };

  const performSearch = async (queryStr) => {
    const term = queryStr.toLowerCase().trim();
    if (term === "") {
      renderHistory();
      return;
    }

    // Ensure pool is ready
    if (!searchPool) {
      if (!isFetchingPool) fetchSearchPool();
      resultsDropdown.innerHTML = `<div class="search-loading">Searching items...</div>`;

      // Check again after a shorter delay
      setTimeout(() => {
        if (input.value.trim() === queryStr.trim()) performSearch(queryStr);
      }, 300);
      return;
    }

    // Fuse.js fuzzy search
    const fuse = new Fuse(searchPool, { keys: ['name', 'meta'], threshold: 0.4, includeScore: true, minMatchCharLength: 1 });
    const results = fuse.search(term).map(r => r.item);
    renderResults(results.slice(0, 15), term);
  };

  const renderResults = (results, term) => {
    if (results.length === 0) {
      resultsDropdown.innerHTML = `<div class="search-empty">No results found for "${term}"</div>`;
      return;
    }

    resultsDropdown.innerHTML = "";
    results.forEach(item => {
      const div = document.createElement("div");
      div.className = "search-result-item";
      div.innerHTML = `
        <div class="result-icon">
          ${item.type === 'teacher' ? `<img src="${item.image || 'images/default_shark.jpg'}" class="result-pfp" onerror="this.src='images/default_shark.jpg'">` : getIconForType(item.type)}
        </div>
        <div class="result-info">
          <div class="result-name">${item.name}</div>
          <div class="result-meta">${item.meta || (item.type.charAt(0).toUpperCase() + item.type.slice(1))}</div>
        </div>
      `;
      div.addEventListener("click", () => {
        addToHistory(item);
        window.location.href = item.url;
      });
      resultsDropdown.appendChild(div);
    });
  };

  // Consolidated Input Listeners
  input.addEventListener("input", (e) => performSearch(e.target.value));

  input.addEventListener("focus", () => {
    lastActionTime = Date.now();
    wrapper.classList.add("expanded");
    resultsDropdown.classList.remove("hidden");
    indexLocalElements();
    if (input.value === "") {
      renderHistory();
    } else {
      performSearch(input.value);
    }
    fetchSearchPool();
  });

  input.addEventListener("blur", () => {
    // Wait for potential result clicks
    setTimeout(() => {
      const isRecentAction = (Date.now() - lastActionTime) < 800;
      if (input.value === "" && !isRecentAction) {
        wrapper.classList.remove("expanded");
        resultsDropdown.classList.add("hidden");
      }
    }, 250);
  });

  // Consolidated Wrapper/Outside Click logic
  // Consolidated Wrapper/Outside Click logic
  wrapper.addEventListener("click", (e) => {
    if (e.target.closest(".search-results-dropdown")) return; // Click inside dropdown, do nothing

    // If clicking the input, ensure it stays open/focused
    if (e.target === input) {
      lastActionTime = Date.now();
      wrapper.classList.add("expanded");
      return;
    }

    // Toggle logic for Icon/Wrapper click
    if (wrapper.classList.contains("expanded")) {
      // Close it
      wrapper.classList.remove("expanded");
      resultsDropdown.classList.add("hidden");
      input.blur();
    } else {
      // Open it
      lastActionTime = Date.now();
      wrapper.classList.add("expanded");
      input.focus();
    }
  });

  // Escape to Close ⌨️
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation(); // Prevent global panel closing
      input.value = ""; // Clear text too? Maybe just close.
      input.blur();
      wrapper.classList.remove("expanded");
      resultsDropdown.classList.add("hidden");
    }
  });

  document.addEventListener("click", (e) => {
    const isSearchTarget = wrapper.contains(e.target) || e.composedPath().includes(wrapper);
    const isRecentAction = (Date.now() - lastActionTime) < 1000;

    if (!isSearchTarget && !isRecentAction) {
      resultsDropdown.classList.add("hidden");
      if (input.value === "") {
        wrapper.classList.remove("expanded");
      }
    }
  }, true);

  // Inject Styles
  if (!document.getElementById("universal-search-styles")) {
    const style = document.createElement("style");
    style.id = "universal-search-styles";
    style.textContent = `
      .search-wrapper.expanded {
        overflow: visible !important;
        position: relative !important;
        z-index: 10001 !important; /* Ensure wrapper stays on top */
      }
      .search-results-dropdown.hidden {
        display: none !important;
      }
      .search-results-dropdown {
        position: absolute;
        top: calc(100% + 10px);
        left: 0;
        right: 0;
        background: white;
        border: 3px solid black;
        border-radius: 20px;
        box-shadow: 8px 8px 0px black;
        z-index: 10000 !important; /* Extremely high to beat sticky headers */
        max-height: 480px;
        overflow-y: auto;
        overflow-x: hidden;
        padding: 0.5rem;
      }
      .dark .search-results-dropdown {
        background: #1e293b;
        border-color: #334155;
        box-shadow: 8px 8px 0px #000;
      }
      .search-history-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0.5rem 0.75rem;
        border-bottom: 2px solid #e2e8f0;
        margin-bottom: 0.5rem;
      }
      .dark .search-history-header {
        border-bottom-color: #334155;
      }
      .clear-all-btn {
        background: #fee2e2;
        color: #ef4444;
        border: 2px solid #fecaca;
        font-size: 0.75rem;
        font-weight: 800;
        cursor: pointer;
        padding: 4px 10px;
        border-radius: 8px;
        transition: all 0.2s;
        text-transform: uppercase;
      }
      .clear-all-btn:hover {
        background: #ef4444;
        color: white;
        border-color: #ef4444;
        transform: scale(1.05);
      }
      .dark .clear-all-btn {
        background: rgba(239, 68, 68, 0.1);
        border-color: rgba(239, 68, 68, 0.2);
      }
      .dark .clear-all-btn:hover {
        background: #ef4444;
        border-color: #ef4444;
      }
      .search-section-title {
        font-size: 0.85rem;
        font-weight: 800;
        color: #64748b;
        padding: 0.5rem 0.75rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }
      .search-result-item {
        display: flex;
        align-items: center;
        padding: 0.75rem;
        border-radius: 12px;
        cursor: pointer;
        transition: all 0.2s;
        gap: 0.75rem;
      }
      .search-result-item:hover {
        background-color: #f1f5f9;
        transform: translateX(4px);
      }
      .dark .search-result-item:hover {
        background-color: #334155;
      }
      .result-icon {
        width: 40px;
        height: 40px;
        background: #e2e8f0;
        border: 2px solid black;
        border-radius: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.2rem;
        flex-shrink: 0;
        overflow: hidden;
      }
      .dark .result-icon {
        background: #475569;
        border-color: #334155;
      }
      .result-pfp {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .result-info {
        flex: 1;
        min-width: 0;
      }
      .result-name {
        font-weight: 700;
        font-size: 1rem;
        color: black;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .dark .result-name {
        color: #f8fafc;
      }
      .result-meta {
        font-size: 0.8rem;
        color: #64748b;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .history-item .remove-history {
        background: none;
        border: none;
        font-size: 1.5rem;
        color: #94a3b8;
        cursor: pointer;
        padding: 8px;
        line-height: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        transition: all 0.2s;
        width: 32px;
        height: 32px;
      }
      .history-item .remove-history:hover {
        color: #ef4444;
        background-color: rgba(239, 68, 68, 0.1);
      }
      .search-loading, .search-empty, .search-error {
        padding: 2rem;
        text-align: center;
        font-weight: 600;
        color: #64748b;
        word-break: break-word;
        background-color: white; /* Ensure white background in light mode */
      }
      .dark .search-loading, .dark .search-empty, .dark .search-error {
        background-color: transparent; /* Let container bg show in dark mode */
        color: #94a3b8;
      }
      .search-result-item {
        display: flex;
        align-items: center;
        padding: 0.75rem;
        border-radius: 12px;
        cursor: pointer;
        transition: all 0.2s;
        gap: 0.75rem;
        background-color: white; /* Explicit white for light mode */
        border: 2px solid transparent; /* Prevent jump on hover */
      }
      .search-result-item:hover {
        background-color: #f1f5f9;
        transform: translateX(4px);
        border-color: #000; /* Maangas border on hover */
        box-shadow: 2px 2px 0px #000;
      }
      .dark .search-result-item {
        background-color: transparent;
        border-color: transparent;
      }
      .dark .search-result-item:hover {
        background-color: #334155;
        border-color: #94a3b8;
        box-shadow: 2px 2px 0px #000;
      }
    `;
    document.head.appendChild(style);
  }

  // Pre-fetch pool immediately
  fetchSearchPool();
}

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Legacy Card Search (Kept for compatibility during migration)
 */
export function initCardSearch(
  cardSelector = ".card",
  searchSelector = ".search-button",
  dataAttrs = ["title", "description"]
) {
  const search = document.querySelector(searchSelector);
  if (!search) return;

  const cards = document.querySelectorAll(cardSelector);

  const cardData = Array.from(cards).map(card => {
    const obj = { _el: card };
    dataAttrs.forEach(attr => { obj[attr] = card.dataset[attr] || ''; });
    return obj;
  });
  const cardFuse = new Fuse(cardData, { keys: dataAttrs, threshold: 0.4, minMatchCharLength: 1 });

  const filterCards = () => {
    const queryStr = search.value.trim();
    if (!queryStr) { cards.forEach(card => (card.style.display = 'flex')); return; }
    const matched = new Set(cardFuse.search(queryStr).map(r => r.item._el));
    cards.forEach(card => (card.style.display = matched.has(card) ? 'flex' : 'none'));
  };

  search.addEventListener("input", filterCards);
  search.addEventListener("focus", () => {
    search.placeholder = "Search...";
  });

  document.addEventListener("click", e => {
    if (!search.contains(e.target) && search.value === "") {
      search.placeholder = "";
      cards.forEach(card => (card.style.display = "flex"));
    }
  });

  return { filterCards };
}
