// =================================================================
// SCRIPT.JS - FINAL VERSION 2.5
// Added clear button to search bar
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

let allEntries = [];
let currentView = 'masonry';
let filteredEntries = [];
let entryToDelete = null;
let activeSwipeElement = null;
let entryInEditMode = null; 

// --- 2. INITIALIZATION ---
document.addEventListener('DOMContentLoaded', init);

async function init() {
    try {
        setupStaticEventListeners();
        await loadAndRender();
    } catch (error) {
        showError('Failed to initialize the application.');
        console.error('Initialization error:', error);
    }
}

async function loadAndRender() {
    if (entryInEditMode) {
        entryInEditMode = null;
    }
    await loadDatabase();
    renderEntries();
}

// --- 3. DATA HANDLING (FIREBASE) ---
async function loadDatabase() {
    try {
        const snapshot = await db.collection('entries').orderBy('timestamp', 'desc').get();
        allEntries = snapshot.docs.map(doc => {
            const data = doc.data();
            const entryData = (data.data && typeof data.data === 'string') ? JSON.parse(data.data) : data;
            return {
                ...entryData,
                firebaseTimestamp: data.timestamp || data.createdAt,
                docId: doc.id
            };
        }).filter(entry => entry && entry.docId);
        filteredEntries = [...allEntries];
    } catch (error) {
        console.error("Database load error:", error);
        showError("Failed to load data from the database.");
    }
}

// --- 4. RENDERING AND LAYOUT ---
// This section remains unchanged from the previous version.
// ... renderEntries(), applyMasonryLayout(), etc.
function renderEntries() {
    const feed = document.getElementById('feed');
    const stats = document.getElementById('stats');
    stats.textContent = `${filteredEntries.length} of ${allEntries.length} shards`;

    if (filteredEntries.length === 0) {
        feed.innerHTML = '<div class="no-results">No shards found</div>';
        return;
    }

    const renderLogic = (entry) => {
        // Parse tags properly from different formats and clean single quotes
        let tags = [];
        if (entry.tags) {
            if (typeof entry.tags === 'string') {
                tags = entry.tags.replace(/^\[|\]$/g, '').split(',').map(t => t.trim().replace(/^'|'$/g, '')).filter(t => t);
            } else if (Array.isArray(entry.tags)) {
                tags = entry.tags.map(t => typeof t === 'string' ? t.replace(/^'|'$/g, '') : t);
            }
        }
        const tagsAsString = tags.join(', ');

        const actionLinksHTML = (entry.calendar_link || entry.address || entry.amazon_search_url) ? `
            <div class="action-links">
                ${entry.calendar_link ? `<a href="${escapeHtml(entry.calendar_link)}" class="calendar-link" target="_blank">Add to Calendar</a>` : ''}
                ${entry.address ? `<a href="${generateMapsLink(entry.address)}" class="address-link" target="_blank">View on Maps</a>` : ''}
                ${entry.amazon_search_url ? `<a href="${escapeHtml(entry.amazon_search_url)}" class="product-link" target="_blank">Find on Amazon</a>` : ''}
            </div>
        ` : '';

        // The content is a comma-separated string, convert it to bullet points for display
        const contentAsList = formatContent(entry.content);

        return `
            <div class="entry" data-doc-id="${entry.docId}">
                <div class="edit-icon" onclick="toggleEditMode('${entry.docId}')">✎</div>
                <div class="delete-icon" onclick="requestDelete('${entry.docId}')">×</div>
                
                <div class="entry-display-content">
                    <div class="entry-header">
                        <h2 class="entry-title">${escapeHtml(entry.title)}</h2>
                        <time class="entry-date">${formatDate(entry.firebaseTimestamp)}</time>
                    </div>
                    ${entry.summary ? `<p class="entry-summary">${escapeHtml(entry.summary)}</p>` : ''}
                    ${actionLinksHTML}
                    ${contentAsList ? `<div class="entry-content">${contentAsList}</div>` : ''}
                    ${tags.length > 0 ? `
                        <div class="tags">
                            ${tags.map(tag => `<span class="tag" onclick="searchByTag('${escapeHtml(tag)}')">${escapeHtml(tag)}</span>`).join('')}
                        </div>
                    ` : ''}
                </div>

                <div class="edit-form-container">
                    <label class="edit-label" for="title-${entry.docId}">Title</label>
                    <input type="text" id="title-${entry.docId}" class="edit-field" value="${escapeHtml(entry.title || '')}">
                    
                    <label class="edit-label" for="summary-${entry.docId}">Summary</label>
                    <textarea id="summary-${entry.docId}" class="edit-field">${escapeHtml(entry.summary || '')}</textarea>
                    
                    <label class="edit-label" for="content-${entry.docId}">Content (comma-separated)</label>
                    <textarea id="content-${entry.docId}" class="edit-field">${escapeHtml(entry.content || '')}</textarea>
                    
                    <label class="edit-label" for="tags-${entry.docId}">Tags (comma-separated)</label>
                    <input type="text" id="tags-${entry.docId}" class="edit-field" value="${escapeHtml(tagsAsString)}">
                    
                    <div class="edit-actions">
                        <button class="edit-button edit-cancel" onclick="cancelEdit('${entry.docId}')">Cancel</button>
                        <button class="edit-button edit-save" onclick="saveChanges('${entry.docId}')">Save</button>
                    </div>
                </div>
            </div>
        `;
    };

    if (currentView === 'database') {
        feed.innerHTML = filteredEntries.map(entry => {
            let tags = [];
            if (entry.tags) {
                if (typeof entry.tags === 'string') {
                    tags = entry.tags.replace(/^\[|\]$/g, '').split(',').map(t => t.trim().replace(/^'|'$/g, '')).filter(t => t);
                } else if (Array.isArray(entry.tags)) {
                    tags = entry.tags.map(t => typeof t === 'string' ? t.replace(/^'|'$/g, '') : t);
                }
            }
            return `
                <div class="entry-wrapper" data-entry-id="${entry.docId}">
                    <div class="database-row" onclick="toggleDatabaseRow('${entry.docId}')">
                        <div class="database-row-title">${escapeHtml(entry.title || 'Untitled')}</div>
                        <div class="database-row-tags">
                            ${tags.slice(0, 3).map(tag => `<span class="tag" onclick="event.stopPropagation(); searchByTag('${escapeHtml(tag)}')">${escapeHtml(tag)}</span>`).join('')}
                            ${tags.length > 3 ? `<span class="tag">+${tags.length - 3}</span>` : ''}
                        </div>
                        <time class="database-row-date">${formatDate(entry.firebaseTimestamp)}</time>
                        <span class="database-expand-icon">▼</span>
                    </div>
                    <div class="database-content">
                        ${renderLogic(entry)}
                    </div>
                </div>
            `;
        }).join('');
    } else {
        feed.innerHTML = filteredEntries.map(entry => `
            <div class="entry-wrapper">
                <div class="delete-background" onclick="requestDelete('${entry.docId}')">Delete</div>
                <div class="entry-swipe-container">
                    ${renderLogic(entry)}
                </div>
            </div>
        `).join('');
    }

    setTimeout(() => {
        if (currentView === 'masonry') {
            applyMasonryLayout();
        }
        setupDynamicEventListeners();
    }, 50);
}

// ... other rendering functions ...

// --- 5. EVENT LISTENERS AND HANDLERS ---
function setupStaticEventListeners() {
    document.getElementById('confirmDeleteBtn')?.addEventListener('click', confirmDelete);
    document.getElementById('confirmCancelBtn')?.addEventListener('click', cancelDelete);
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.view-switcher')) {
            document.getElementById('viewDropdown').classList.remove('show');
        }
    });

    const searchInput = document.getElementById('searchInput');
    const searchClearBtn = document.getElementById('searchClearBtn'); // Get the clear button
    let searchTimeout;

    // UPDATED: Event listener for the search input
    searchInput?.addEventListener('input', (e) => {
        const query = e.target.value;

        // Show or hide the clear button based on input content
        if (query.length > 0) {
            searchClearBtn.classList.add('visible');
        } else {
            searchClearBtn.classList.remove('visible');
        }
        
        // Debounce the search
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => performSearch(query), 300);
    });

    // NEW: Event listener for the clear button
    searchClearBtn?.addEventListener('click', () => {
        searchInput.value = ''; // Clear the input field
        performSearch('');      // Rerun the search with an empty query to show all results
        searchClearBtn.classList.remove('visible'); // Hide the button
        searchInput.focus();    // Return focus to the search bar
    });


    let resizeTimeout;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            if (entryInEditMode) {
                cancelEdit(entryInEditMode);
            }
            applyMasonryLayout();
        }, 250);
    });
}

// ... rest of the script is unchanged ...
