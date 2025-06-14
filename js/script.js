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

// Initialize the app
async function init() {
    try {
        await loadDatabase();
        setupSearch();
        setupEventListeners(); // <-- ADD THIS LINE
        renderEntries();
        setupRealtimeUpdates();
    } catch (error) {
        showError('Failed to load screenshots. Please check your configuration.');
        console.error('Initialization error:', error);
    }
}

// Load all entries from Firebase
// IN SCRIPT.JS - REPLACE THE OLD loadDatabase FUNCTION WITH THIS

async function loadDatabase() {
    try {
        const snapshot = await db.collection('entries')
            .orderBy('timestamp', 'desc')
            .get();

        allEntries = snapshot.docs.map(doc => {
            const data = doc.data();
            const entryData = (data.data && typeof data.data === 'string') ? JSON.parse(data.data) : data;
            const timestamp = data.timestamp || data.createdAt;

            // THE FIX IS HERE: We move `id: doc.id` to the end to ensure
            // it can never be overwritten by a field in the document.
            return {
                ...entryData,
                firebaseTimestamp: timestamp,
                id: doc.id // The REAL document ID is now the last property assigned.
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

// Setup real-time updates
function setupRealtimeUpdates() {
    db.collection('entries')
        .orderBy('timestamp', 'desc')
        .limit(1)
        .onSnapshot((snapshot) => {
            snapshot.docChanges().forEach((change) => {
                if (change.type === 'added' && allEntries.length > 0) {
                    const newDoc = change.doc;
                    const exists = allEntries.some(entry => entry.id === newDoc.id);

                    if (!exists) {
                        const data = newDoc.data();
                        let newEntry;

                        if (data.data && typeof data.data === 'string') {
                            try {
                                const parsedData = JSON.parse(data.data);
                                newEntry = { id: newDoc.id, ...parsedData, firebaseTimestamp: data.timestamp || data.createdAt };
                            } catch (e) {
                                console.error('Error parsing real-time data:', e);
                                return;
                            }
                        } else {
                            newEntry = { id: newDoc.id, ...data };
                        }

                        allEntries.unshift(newEntry);
                        filteredEntries.unshift(newEntry);
                        renderEntries();
                    }
                }
            });
        });
}

// Setup search functionality
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

// Perform search
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

            const searchableText = [
                entry.title || '',
                entry.summary || '',
                entry.content || '',
                ...tags
            ].join(' ').toLowerCase();

            return searchableText.includes(query);
        });
    }
    renderEntries();
}

// Masonry layout function
function applyMasonryLayout() {
    if (window.innerWidth < 768) return;

    const feed = document.getElementById('feed');
    // **CORRECTION: Select .entry directly**
    const entries = Array.from(feed.querySelectorAll('.entry')); 
    if (entries.length === 0) return;

    let columns = 2;
    if (window.innerWidth >= 1400) columns = 4;
    else if (window.innerWidth >= 1024) columns = 3;

    const gap = 20;
    const containerWidth = feed.offsetWidth;
    const columnWidth = (containerWidth - (gap * (columns - 1))) / columns;

    const columnHeights = new Array(columns).fill(0);

    entries.forEach((entry, index) => {
        entry.style.width = columnWidth + 'px';
        
        // Find the shortest column to place the next item
        let shortestColumnIndex = 0;
        for (let i = 1; i < columns; i++) {
            if (columnHeights[i] < columnHeights[shortestColumnIndex]) {
                shortestColumnIndex = i;
            }
        }

        const left = shortestColumnIndex * (columnWidth + gap);
        const top = columnHeights[shortestColumnIndex];

        entry.style.left = left + 'px';
        entry.style.top = top + 'px';

        columnHeights[shortestColumnIndex] += entry.offsetHeight + gap;
    });

    const maxHeight = Math.max(...columnHeights);
    feed.style.height = maxHeight + 'px';
}


// Delete entry functions
function requestDelete(entryId) {
    entryToDelete = entryId;
    document.getElementById('confirmationDialog').classList.add('show');
}

function cancelDelete() {
    entryToDelete = null;
    document.getElementById('confirmationDialog').classList.remove('show');
}

async function confirmDelete() {
    if (!entryToDelete) return;
    console.log("Attempting to delete document with ID:", entryToDelete);
    try {
        await db.collection('entries').doc(entryToDelete).delete();
        
        allEntries = allEntries.filter(entry => entry.id !== entryToDelete);
        filteredEntries = filteredEntries.filter(entry => entry.id !== entryToDelete);
        
        document.getElementById('confirmationDialog').classList.remove('show');
        entryToDelete = null;
        
        renderEntries();
    } catch (error) {
        console.error('Error deleting entry:', error);
        showError('Failed to delete the screenshot. Please try again.');
    }
}

// Search by tag
function searchByTag(tag) {
    document.getElementById('searchInput').value = tag;
    performSearch(tag);
}

// Render entries
function renderEntries() {
    const feed = document.getElementById('feed');
    const stats = document.getElementById('stats');

    stats.textContent = `${filteredEntries.length} of ${allEntries.length} screenshots`;

    if (filteredEntries.length === 0) {
        feed.innerHTML = '<div class="no-results">No screenshots found</div>';
        return;
    }

    // **CORRECTION: Generate .entry elements directly without the wrapper**
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
            <div class="entry${!hasAnimated ? ' animate-in' : ''}" id="entry-${entry.id}">
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
        `;
    }).join('');

    setTimeout(applyMasonryLayout, 50);

    if (!hasAnimated) {
        hasAnimated = true;
    }
}

// Helper functions
function generateMapsLink(address) {
    const cleanAddress = address.trim();
    const encodedAddress = encodeURIComponent(cleanAddress);
    return `https://www.google.com/maps/search/?api=1&query=${encodedAddress}`;
}

function formatContent(content) {
    if (typeof content !== 'string' || !content.trim()) return '';
    const items = content.split(',').map(item => item.trim()).filter(item => item);
    if (items.length > 0) {
        return `<ul>${items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
    }
    return `<p>${escapeHtml(content)}</p>`;
}

function formatDate(timestamp) {
    if (!timestamp) return 'No date';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

function escapeHtml(text) {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return (text || '').toString().replace(/[&<>"']/g, m => map[m]);
}

function showError(message) {
    const errorDiv = document.getElementById('error');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
}

// Start the app
init();

// Reapply masonry on window resize
let resizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(applyMasonryLayout, 250);
});
