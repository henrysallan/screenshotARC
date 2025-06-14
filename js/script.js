// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyAYPMUjJDf5cInkMY40erfhq6_Idwi2AHs",
    authDomain: "prism-8158b.firebaseapp.com",
    projectId: "prism-8158b",
    storageBucket: "prism-8158b.firebasestorage.app",
    messagingSenderId: "720887543116",
    appId: "1:720887543116:web:e577efa6e8cd9abe9bcbe9",
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

let allEntries = [];
let filteredEntries = [];
let hasAnimated = false;
let entryToDelete = null;
let activeSwipeElement = null; // Variable for tracking active swipe

// Initialize the app
async function init() {
    try {
        await loadDatabase();
        setupSearch();
        setupEventListeners();
        setupSwipeGestures(); // <-- Re-added swipe setup
        renderEntries();
        setupRealtimeUpdates();
    } catch (error) {
        showError('Failed to load screenshots. Please check your configuration.');
        console.error('Initialization error:', error);
    }
}

// Setup Event Listeners for dialog buttons
function setupEventListeners() {
    const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
    const confirmCancelBtn = document.getElementById('confirmCancelBtn');
    if (confirmDeleteBtn) {
        confirmDeleteBtn.addEventListener('click', confirmDelete);
    }
    if (confirmCancelBtn) {
        confirmCancelBtn.addEventListener('click', cancelDelete);
    }
}

// --- ADD THIS ENTIRE FUNCTION BACK ---
// Setup swipe gestures for mobile
function setupSwipeGestures() {
    let startX = 0;
    let currentX = 0;
    let isSwiping = false;
    let cardElement = null;
    let deleteBackground = null;

    document.getElementById('feed').addEventListener('touchstart', (e) => {
        const swipeContainer = e.target.closest('.entry-swipe-container');
        if (!swipeContainer || window.innerWidth > 767) return;

        // Reset any other swiped cards
        if (activeSwipeElement && activeSwipeElement !== swipeContainer) {
            activeSwipeElement.style.transform = 'translateX(0)';
            const oldDeleteBg = activeSwipeElement.parentElement.querySelector('.delete-background');
            if (oldDeleteBg) oldDeleteBg.classList.remove('visible');
        }

        cardElement = swipeContainer;
        deleteBackground = cardElement.parentElement.querySelector('.delete-background');
        startX = e.touches[0].pageX;
        isSwiping = true;
    }, { passive: true });

    document.getElementById('feed').addEventListener('touchmove', (e) => {
        if (!isSwiping || !cardElement) return;

        currentX = e.touches[0].pageX;
        const diffX = currentX - startX;

        // Only allow left swipe
        if (diffX < 0) {
            // e.preventDefault(); // This can sometimes interfere with scrolling
            const translateX = Math.max(diffX, -80); // Limit swipe distance
            cardElement.style.transform = `translateX(${translateX}px)`;
            
            if (Math.abs(translateX) > 40) {
                if(deleteBackground) deleteBackground.classList.add('visible');
            } else {
                if(deleteBackground) deleteBackground.classList.remove('visible');
            }
        }
    }, { passive: true }); // passive:false if preventDefault is needed

    document.getElementById('feed').addEventListener('touchend', (e) => {
        if (!isSwiping || !cardElement) return;

        const diffX = currentX - startX;
        if (diffX < -40) {
            // Snap to show delete button
            cardElement.style.transform = 'translateX(-80px)';
            if(deleteBackground) deleteBackground.classList.add('visible');
            activeSwipeElement = cardElement;
        } else {
            // Snap back
            cardElement.style.transform = 'translateX(0)';
            if(deleteBackground) deleteBackground.classList.remove('visible');
            activeSwipeElement = null;
        }

        isSwiping = false;
        cardElement = null;
        deleteBackground = null;
        startX = 0;
        currentX = 0;
    });
}


// Load all entries from Firebase
async function loadDatabase() {
    try {
        const snapshot = await db.collection('entries').orderBy('timestamp', 'desc').get();
        allEntries = snapshot.docs.map(doc => {
            const data = doc.data();
            const entryData = (data.data && typeof data.data === 'string') ? JSON.parse(data.data) : data;
            const timestamp = data.timestamp || data.createdAt;
            return {
                ...entryData,
                firebaseTimestamp: timestamp,
                id: doc.id
            };
        }).filter(entry => entry && entry.id);
        filteredEntries = [...allEntries];
    } catch (error) {
        console.error("Database load error:", error);
        allEntries = [];
        filteredEntries = [];
        showError("Failed to load data from the database.");
    }
}

// Render entries to the DOM
function renderEntries() {
    const feed = document.getElementById('feed');
    const stats = document.getElementById('stats');
    stats.textContent = `${filteredEntries.length} of ${allEntries.length} screenshots`;

    if (filteredEntries.length === 0) {
        feed.innerHTML = '<div class="no-results">No screenshots found</div>';
        return;
    }

    // --- RENDERENTRIES IS UPDATED TO USE THE WRAPPER STRUCTURE ---
    feed.innerHTML = filteredEntries.map(entry => {
        let tags = [];
        if (entry.tags) {
            if (typeof entry.tags === 'string') {
                tags = entry.tags.replace(/^\[|\]$/g, '').split(',').map(t => t.trim()).filter(t => t);
            } else if (Array.isArray(entry.tags)) {
                tags = entry.tags;
            }
        }
        
        return `
            <div class="entry-wrapper${!hasAnimated ? ' animate-in' : ''}">
                <div class="delete-background" onclick="requestDelete('${entry.id}')">Delete</div>
                <div class="entry-swipe-container">
                    <div class="entry">
                        <div class="delete-icon" onclick="requestDelete('${entry.id}')">×</div>
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

    setTimeout(applyMasonryLayout, 50);

    if (!hasAnimated) {
        hasAnimated = true;
    }
}

// --- MASONRY LAYOUT IS UPDATED TO TARGET THE WRAPPER ---
function applyMasonryLayout() {
    if (window.innerWidth < 768) return;

    const feed = document.getElementById('feed');
    const items = Array.from(feed.querySelectorAll('.entry-wrapper')); // <-- TARGETS WRAPPER
    if (items.length === 0) return;

    let columns = 2;
    if (window.innerWidth >= 1400) columns = 4;
    else if (window.innerWidth >= 1024) columns = 3;
    
    const gap = 20;
    const containerWidth = feed.offsetWidth;
    const columnWidth = (containerWidth - (gap * (columns - 1))) / columns;
    const columnHeights = new Array(columns).fill(0);

    items.forEach(item => { // <-- USES 'item' instead of 'entry'
        item.style.width = columnWidth + 'px';
        
        let shortestColumnIndex = 0;
        for (let i = 1; i < columns; i++) {
            if (columnHeights[i] < columnHeights[shortestColumnIndex]) {
                shortestColumnIndex = i;
            }
        }

        const left = shortestColumnIndex * (columnWidth + gap);
        const top = columnHeights[shortestColumnIndex];

        item.style.left = left + 'px';
        item.style.top = top + 'px';
        
        columnHeights[shortestColumnIndex] += item.offsetHeight + gap;
    });

    const maxHeight = Math.max(...columnHeights);
    feed.style.height = maxHeight + 'px';
}


// --- Other functions (no changes needed below) ---
function setupSearch() {
    const searchInput = document.getElementById('searchInput');
    let searchTimeout;
    searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            performSearch(e.target.value);
        }, 300);
    });
}

function performSearch(query) {
    query = query.toLowerCase().trim();
    if (!query) {
        filteredEntries = [...allEntries];
    } else {
        filteredEntries = allEntries.filter(entry => {
            let tags = [];
            if (entry.tags) {
                if (typeof entry.tags === 'string') {
                    tags = entry.tags.replace(/^\[|\]$/g, '').split(',').map(t => t.trim());
                } else if (Array.isArray(entry.tags)) {
                    tags = entry.tags;
                }
            }
            const searchableText = [entry.title || '', entry.summary || '', entry.content || '', ...tags].join(' ').toLowerCase();
            return searchableText.includes(query);
        });
    }
    renderEntries();
}

function requestDelete(entryId) {
    // If a card is swiped open, close it before showing dialog
    if (activeSwipeElement) {
        activeSwipeElement.style.transform = 'translateX(0)';
        const oldDeleteBg = activeSwipeElement.parentElement.querySelector('.delete-background');
        if (oldDeleteBg) oldDeleteBg.classList.remove('visible');
        activeSwipeElement = null;
    }
    entryToDelete = entryId;
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
        // No need to manually filter, just reload for simplicity or filter if preferred
        await loadDatabase();
        renderEntries();
    } catch (error) {
        console.error('Error deleting entry:', error);
        showError('Failed to delete the screenshot. Please try again.');
    }
    cancelDelete(); // Hide dialog
}

function searchByTag(tag) {
    document.getElementById('searchInput').value = tag;
    performSearch(tag);
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
    p.textContent = str;
    return p.innerHTML;
}

function showError(message) {
    const errorDiv = document.getElementById('error');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
    setTimeout(() => { errorDiv.style.display = 'none'; }, 5000);
}

function setupRealtimeUpdates() { /* ... function content as before ... */ }

let resizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(applyMasonryLayout, 250);
});
