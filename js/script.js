// =================================================================
// SCRIPT.JS - A CLEAN, FULL REWRITE
// This script is designed to be robust and combines all features:
// - Fetches and displays data from Firebase
// - Masonry layout on desktop
// - Swipe-to-delete on mobile
// - Persistent deletion using the correct Firestore Document ID
// - Search and filter functionality
// =================================================================


// --- 1. CONFIGURATION AND GLOBAL STATE ---

const firebaseConfig = {
    apiKey: "AIzaSyAYPMUjJDf5cInkMY40erfhq6_Idwi2AHs",
    authDomain: "prism-8158b.firebaseapp.com",
    projectId: "prism-8158b",
    storageBucket: "prism-8158b.firebasestorage.app",
    messagingSenderId: "720887543116",
    appId: "1:720887543116:web:e577efa6e8cd9abe9bcbe9",
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// Global variables to hold state
let allEntries = [];
let filteredEntries = [];
let entryToDelete = null;
let activeSwipeElement = null;
let hasAnimated = false;


// --- 2. INITIALIZATION ---

// Main function to start the application
document.addEventListener('DOMContentLoaded', () => {
    init();
});

async function init() {
    try {
        setupEventListeners();
        setupResizeListener();
        await loadAndRender(); // Load initial data and display it
        setupRealtimeUpdates(); // Listen for new entries
    } catch (error) {
        showError('Failed to initialize the application.');
        console.error('Initialization error:', error);
    }
}

// Helper to combine loading and rendering for a clean startup
async function loadAndRender() {
    await loadDatabase();
    renderEntries();
    setupSwipeGestures(); // Setup swipe after initial entries are rendered
}


// --- 3. DATA HANDLING (FIREBASE) ---

// Fetches all entries from Firestore and stores them in the `allEntries` array
async function loadDatabase() {
    try {
        const snapshot = await db.collection('entries').orderBy('timestamp', 'desc').get();
        allEntries = snapshot.docs.map(doc => {
            const data = doc.data();
            const entryData = (data.data && typeof data.data === 'string') ? JSON.parse(data.data) : data;
            const timestamp = data.timestamp || data.createdAt;

            // ===== THE DEFINITIVE ID FIX =====
            // The real Firestore ID is stored in `docId` to prevent any collision
            // with an `id` field from the document's data.
            return {
                ...entryData,
                firebaseTimestamp: timestamp,
                docId: doc.id
            };
        }).filter(entry => entry && entry.docId); // Ensure only valid entries are kept

        filteredEntries = [...allEntries]; // Initially, all entries are shown

    } catch (error) {
        console.error("Database load error:", error);
        showError("Failed to load data from the database.");
    }
}

// Listens for new entries in real-time
function setupRealtimeUpdates() {
    db.collection('entries')
      .orderBy('timestamp', 'desc')
      .limit(1)
      .onSnapshot((snapshot) => {
        snapshot.docChanges().forEach((change) => {
            if (change.type === 'added') {
                const newDoc = change.doc;
                const exists = allEntries.some(entry => entry.docId === newDoc.id);
                if (!exists) {
                    // A new entry was added, let's reload to keep things simple and robust
                    loadAndRender();
                }
            }
            if (change.type === 'removed') {
                // An entry was removed elsewhere, let's update our view
                loadAndRender();
            }
        });
    });
}


// --- 4. RENDERING AND LAYOUT ---

// Renders the `filteredEntries` array to the DOM
function renderEntries() {
    const feed = document.getElementById('feed');
    const stats = document.getElementById('stats');
    stats.textContent = `${filteredEntries.length} of ${allEntries.length} screenshots`;

    if (filteredEntries.length === 0) {
        feed.innerHTML = '<div class="no-results">No screenshots found</div>';
        return;
    }

    feed.innerHTML = filteredEntries.map(entry => {
        const tags = parseTags(entry.tags);

        // This HTML structure supports both swipe-to-delete and masonry layout.
        // It critically uses `entry.docId` for all delete actions.
        return `
            <div class="entry-wrapper${!hasAnimated ? ' animate-in' : ''}">
                <div class="delete-background" onclick="requestDelete('${entry.docId}')">Delete</div>
                <div class="entry-swipe-container">
                    <div class="entry">
                        <div class="delete-icon" onclick="requestDelete('${entry.docId}')">×</div>
                        <div class="entry-header">
                            <h2 class="entry-title">${escapeHtml(entry.title || '')}</h2>
                            <time class="entry-date">${formatDate(entry.firebaseTimestamp)}</time>
                        </div>
                        ${entry.summary ? `<p class="entry-summary">${escapeHtml(entry.summary)}</p>` : ''}
                        ${(entry.calendar_link || entry.address) ? `
                            <div class="action-links">
                                ${entry.calendar_link ? `<a href="${escapeHtml(entry.calendar_link)}" class="calendar-link" target="_blank">Add to Calendar</a>` : ''}
                                ${entry.address ? `<a href="${generateMapsLink(entry.address)}" class="address-link" target="_blank">View on Maps</a>` : ''}
                            </div>
                        ` : ''}
                        ${entry.content ? `<div class="entry-content">${formatContent(entry.content)}</div>` : ''}
                        ${tags.length > 0 ? `
                            <div class="tags">
                                ${tags.map(tag => `<span class="tag" onclick="searchByTag('${escapeHtml(tag)}')">${escapeHtml(tag)}</span>`).join('')}
                            </div>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');

    // Use a short timeout to allow the browser to render the elements before calculating layout
    setTimeout(applyMasonryLayout, 50);

    if (!hasAnimated) {
        hasAnimated = true;
    }
}

// Applies the masonry layout on desktop
function applyMasonryLayout() {
    if (window.innerWidth < 768) {
        // On mobile, ensure feed height is automatic
        document.getElementById('feed').style.height = 'auto';
        return;
    }

    const feed = document.getElementById('feed');
    // The layout logic now correctly targets the `.entry-wrapper`
    const items = Array.from(feed.querySelectorAll('.entry-wrapper'));
    if (items.length === 0) return;

    let columns = 2;
    if (window.innerWidth >= 1400) columns = 4;
    else if (window.innerWidth >= 1024) columns = 3;
    
    const gap = 20;
    const containerWidth = feed.offsetWidth;
    const columnWidth = (containerWidth - (gap * (columns - 1))) / columns;
    const columnHeights = new Array(columns).fill(0);

    items.forEach(item => {
        item.style.width = `${columnWidth}px`;
        const shortestColumnIndex = columnHeights.indexOf(Math.min(...columnHeights));
        const left = shortestColumnIndex * (columnWidth + gap);
        const top = columnHeights[shortestColumnIndex];
        item.style.left = `${left}px`;
        item.style.top = `${top}px`;
        columnHeights[shortestColumnIndex] += item.offsetHeight + gap;
    });

    feed.style.height = `${Math.max(...columnHeights)}px`;
}


// --- 5. EVENT LISTENERS AND HANDLERS ---

// Sets up listeners for static elements like dialog buttons and search bar
function setupEventListeners() {
    document.getElementById('confirmDeleteBtn')?.addEventListener('click', confirmDelete);
    document.getElementById('confirmCancelBtn')?.addEventListener('click', cancelDelete);

    const searchInput = document.getElementById('searchInput');
    let searchTimeout;
    searchInput?.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            performSearch(e.target.value);
        }, 300);
    });
}

// Sets up the swipe-to-delete functionality for mobile
function setupSwipeGestures() {
    const feed = document.getElementById('feed');
    let startX = 0, currentX = 0, cardElement = null;

    feed.addEventListener('touchstart', (e) => {
        if (window.innerWidth > 767) return;
        const swipeContainer = e.target.closest('.entry-swipe-container');
        if (swipeContainer) {
            // Reset any other swiped card
            if (activeSwipeElement && activeSwipeElement !== swipeContainer) {
                activeSwipeElement.style.transform = 'translateX(0)';
            }
            cardElement = swipeContainer;
            startX = e.touches[0].pageX;
            currentX = startX;
        }
    }, { passive: true });

    feed.addEventListener('touchmove', (e) => {
        if (!cardElement || window.innerWidth > 767) return;
        currentX = e.touches[0].pageX;
        const diffX = currentX - startX;
        if (diffX < 0) { // Only allow left swipe
            cardElement.style.transform = `translateX(${Math.max(diffX, -80)}px)`;
        }
    }, { passive: true });

    feed.addEventListener('touchend', () => {
        if (!cardElement || window.innerWidth > 767) return;
        const diffX = currentX - startX;
        if (diffX < -50) { // If swiped far enough
            cardElement.style.transform = 'translateX(-80px)';
            activeSwipeElement = cardElement;
        } else {
            cardElement.style.transform = 'translateX(0)';
            activeSwipeElement = null;
        }
        cardElement = null;
    });
}

// Re-applies masonry layout on window resize, with a debounce
function setupResizeListener() {
    let resizeTimeout;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(applyMasonryLayout, 250);
    });
}


// --- 6. CORE ACTIONS (DELETE, SEARCH) ---

function requestDelete(docId) {
    if (activeSwipeElement) {
        activeSwipeElement.style.transform = 'translateX(0)';
        activeSwipeElement = null;
    }
    entryToDelete = docId;
    document.getElementById('confirmationDialog').classList.add('show');
}

function cancelDelete() {
    entryToDelete = null;
    document.getElementById('confirmationDialog').classList.remove('show');
}

async function confirmDelete() {
    if (!entryToDelete) return;
    try {
        await db.collection('entries').doc(entryToDelete).delete();
        // After successful deletion, update the local data and re-render
        allEntries = allEntries.filter(entry => entry.docId !== entryToDelete);
        performSearch(document.getElementById('searchInput').value); // Re-applies current search/filter
    } catch (error) {
        console.error('Error deleting entry:', error);
        showError('Failed to delete the screenshot. Please try again.');
    }
    cancelDelete(); // Close the dialog
}

function performSearch(query) {
    const lowerCaseQuery = query.toLowerCase().trim();
    if (!lowerCaseQuery) {
        filteredEntries = [...allEntries];
    } else {
        filteredEntries = allEntries.filter(entry => {
            const tags = parseTags(entry.tags);
            const searchableText = [entry.title, entry.summary, entry.content, ...tags]
                .join(' ')
                .toLowerCase();
            return searchableText.includes(lowerCaseQuery);
        });
    }
    renderEntries();
}

window.searchByTag = function(tag) {
    document.getElementById('searchInput').value = tag;
    performSearch(tag);
}


// --- 7. HELPER FUNCTIONS ---

function parseTags(tagsData) {
    if (!tagsData) return [];
    if (Array.isArray(tagsData)) return tagsData;
    if (typeof tagsData === 'string') {
        return tagsData.replace(/^\[|\]$/g, '').split(',').map(t => t.trim()).filter(t => t);
    }
    return [];
}

function formatDate(timestamp) {
    if (!timestamp) return 'No date';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function formatContent(content) {
    if (typeof content !== 'string' || !content.trim()) return '';
    const items = content.split(',').map(item => item.trim()).filter(item => item);
    if (items.length > 0) {
        return `<ul>${items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
    }
    return `<p>${escapeHtml(content)}</p>`;
}

function generateMapsLink(address) {
    return `https://maps.google.com/?q=${encodeURIComponent(address.trim())}`;
}

function escapeHtml(str) {
    const p = document.createElement('p');
    p.textContent = str || '';
    return p.innerHTML;
}

function showError(message) {
    const errorDiv = document.getElementById('error');
    if (errorDiv) {
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
        setTimeout(() => { errorDiv.style.display = 'none'; }, 5000);
    }
}
