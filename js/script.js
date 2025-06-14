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
let activeSwipeElement = null;

// Initialize the app
async function init() {
    try {
        await loadDatabase();
        setupSearch();
        setupEventListeners();
        setupSwipeGestures();
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

// Setup swipe gestures for mobile
function setupSwipeGestures() {
    let startX = 0, currentX = 0, isSwiping = false, cardElement = null, deleteBackground = null;

    document.getElementById('feed').addEventListener('touchstart', (e) => {
        const swipeContainer = e.target.closest('.entry-swipe-container');
        if (!swipeContainer || window.innerWidth > 767) return;

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
        if (diffX < 0) {
            const translateX = Math.max(diffX, -80);
            cardElement.style.transform = `translateX(${translateX}px)`;
            if (deleteBackground) {
                deleteBackground.classList.toggle('visible', Math.abs(translateX) > 40);
            }
        }
    }, { passive: true });

    document.getElementById('feed').addEventListener('touchend', () => {
        if (!isSwiping || !cardElement) return;
        const diffX = currentX - startX;
        if (diffX < -40) {
            cardElement.style.transform = 'translateX(-80px)';
            if (deleteBackground) deleteBackground.classList.add('visible');
            activeSwipeElement = cardElement;
        } else {
            cardElement.style.transform = 'translateX(0)';
            if (deleteBackground) deleteBackground.classList.remove('visible');
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

            // ===== THE CORE FIX IS HERE =====
            // We store the real ID in `docId` to prevent collision with any `id` field in the data.
            return {
                ...entryData,
                firebaseTimestamp: timestamp,
                docId: doc.id 
            };
        // We also update the filter to look for the new `docId` property.
        }).filter(entry => entry && entry.docId);

        filteredEntries = [...allEntries];
    } catch (error) {
        console.error("Database load error:", error);
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

    feed.innerHTML = filteredEntries.map(entry => {
        let tags = [];
        if (entry.tags) {
            if (typeof entry.tags === 'string') {
                tags = entry.tags.replace(/^\[|\]$/g, '').split(',').map(t => t.trim()).filter(t => t);
            } else if (Array.isArray(entry.tags)) {
                tags = entry.tags;
            }
        }
        
        // ===== THE SECOND FIX IS HERE =====
        // All calls to requestDelete now use `entry.docId` instead of `entry.id`.
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

    setTimeout(applyMasonryLayout, 50);

    if (!hasAnimated) {
        hasAnimated = true;
    }
}

// Masonry layout function (targets the wrapper)
function applyMasonryLayout() {
    if (window.innerWidth < 768) return;
    const feed = document.getElementById('feed');
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
        let shortestColumnIndex = columnHeights.indexOf(Math.min(...columnHeights));
        const left = shortestColumnIndex * (columnWidth + gap);
        const top = columnHeights[shortestColumnIndex];
        item.style.left = `${left}px`;
        item.style.top = `${top}px`;
        columnHeights[shortestColumnIndex] += item.offsetHeight + gap;
    });
    feed.style.height = `${Math.max(...columnHeights)}px`;
}

// Delete functions
async function confirmDelete() {
    if (!entryToDelete) return;
    try {
        await db.collection('entries').doc(entryToDelete).delete();
        // Upon successful deletion, remove the entry from the local arrays and re-render.
        allEntries = allEntries.filter(entry => entry.docId !== entryToDelete);
        performSearch(document.getElementById('searchInput').value); // Re-run search/filter
    } catch (error) {
        console.error('Error deleting entry:', error);
        showError('Failed to delete the screenshot. Please try again.');
    }
    cancelDelete();
}

function requestDelete(docId) {
    if (activeSwipeElement) {
        activeSwipeElement.style.transform = 'translateX(0)';
        const oldDeleteBg = activeSwipeElement.parentElement.querySelector('.delete-background');
        if (oldDeleteBg) oldDeleteBg.classList.remove('visible');
        activeSwipeElement = null;
    }
    entryToDelete = docId;
    document.getElementById('confirmationDialog').classList.add('show');
}

function cancelDelete() {
    entryToDelete = null;
    document.getElementById('confirmationDialog').classList.remove('show');
}


// Other functions (no changes needed below)
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
    const lowerCaseQuery = query.toLowerCase().trim();
    if (!lowerCaseQuery) {
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
            return searchableText.includes(lowerCaseQuery);
        });
    }
    renderEntries();
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

// Run the app
init();
