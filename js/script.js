// =================================================================
// SCRIPT.JS - FINAL VERSION 2.3
// Added inline editing functionality for desktop view
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
let entryInEditMode = null; // Track the docId of the entry being edited

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
    // If a card is being edited, cancel it before re-rendering
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
                tags = entry.tags.replace(/^\[|\]$/g, '').split(',').map(t => t.trim().replace(/^'|'$/g, '')).filter(t => t); //
            } else if (Array.isArray(entry.tags)) {
                tags = entry.tags.map(t => typeof t === 'string' ? t.replace(/^'|'$/g, '') : t); //
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
                    tags = entry.tags.replace(/^\[|\]$/g, '').split(',').map(t => t.trim().replace(/^'|'$/g, '')).filter(t => t); //
                } else if (Array.isArray(entry.tags)) {
                    tags = entry.tags.map(t => typeof t === 'string' ? t.replace(/^'|'$/g, '') : t); //
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


function applyMasonryLayout() {
    if (currentView !== 'masonry') return;
    const feed = document.getElementById('feed');
    const items = Array.from(feed.querySelectorAll('.entry-wrapper'));

    if (window.innerWidth >= 768) {
        // --- Desktop Masonry Logic ---
        if (items.length === 0) return;
        const columns = window.innerWidth >= 1400 ? 4 : (window.innerWidth >= 1024 ? 3 : 2);
        const gap = 20;
        const columnWidth = (feed.offsetWidth - (gap * (columns - 1))) / columns;
        const columnHeights = Array(columns).fill(0);

        items.forEach(item => {
            item.style.position = 'absolute';
            item.style.width = `${columnWidth}px`;
            const shortestColumnIndex = columnHeights.indexOf(Math.min(...columnHeights));
            const left = shortestColumnIndex * (columnWidth + gap);
            const top = columnHeights[shortestColumnIndex];
            item.style.left = `${left}px`;
            item.style.top = `${top}px`;
            columnHeights[shortestColumnIndex] += item.offsetHeight + gap;
        });
        feed.style.height = `${Math.max(...columnHeights)}px`;
    } else {
        // --- Mobile Logic: Clear inline styles ---
        feed.style.height = 'auto';
        items.forEach(item => {
            item.style.position = '';
            item.style.left = '';
            item.style.top = '';
            item.style.width = '';
        });
    }
}


function toggleViewDropdown() {
    const dropdown = document.getElementById('viewDropdown');
    dropdown.classList.toggle('show');
}

function switchView(view) {
    currentView = view;
    const dropdown = document.getElementById('viewDropdown');
    const feed = document.getElementById('feed');
    const currentIcon = document.getElementById('currentViewIcon');
    
    document.querySelectorAll('.view-option').forEach(option => {
        option.classList.toggle('active', option.dataset.view === view);
    });
    
    currentIcon.textContent = view === 'masonry' ? '⊞' : '☰';
    dropdown.classList.remove('show');
    feed.classList.toggle('database-view', view === 'database');
    renderEntries();
}

function toggleDatabaseRow(docId) {
    if (currentView !== 'database') return;
    const wrapper = document.querySelector(`.entry-wrapper[data-entry-id="${docId}"]`);
    if (wrapper) {
        // If we are opening an entry that is in edit mode, cancel the edit first
        if (entryInEditMode && entryInEditMode !== docId) {
             cancelEdit(entryInEditMode);
        }
        wrapper.classList.toggle('expanded');
        // Recalculate layout if needed, though this view is typically not masonry
    }
}


window.toggleViewDropdown = toggleViewDropdown;
window.switchView = switchView;
window.toggleDatabaseRow = toggleDatabaseRow;

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

function setupDynamicEventListeners() {
    const feed = document.getElementById('feed');
    let startX = 0, currentX = 0, cardElement = null;

    feed.addEventListener('touchstart', (e) => {
        if (window.innerWidth > 767) return;
        const swipeContainer = e.target.closest('.entry-swipe-container');
        if (swipeContainer) {
            if (activeSwipeElement && activeSwipeElement !== swipeContainer) {
                activeSwipeElement.style.transform = 'translateX(0)';
            }
            cardElement = swipeContainer;
            startX = e.touches[0].pageX;
        }
    }, { passive: true });

    feed.addEventListener('touchmove', (e) => {
        if (!cardElement || window.innerWidth > 767) return;
        currentX = e.touches[0].pageX;
        const diffX = currentX - startX;
        if (diffX < 0) {
            cardElement.style.transform = `translateX(${Math.max(diffX, -80)}px)`;
        }
    }, { passive: true });

    feed.addEventListener('touchend', (e) => {
        if (!cardElement || window.innerWidth > 767) return;
        const diffX = e.changedTouches[0].pageX - startX;
        if (diffX < -50) {
            cardElement.style.transform = 'translateX(-80px)';
            activeSwipeElement = cardElement;
        } else {
            cardElement.style.transform = 'translateX(0)';
            if (activeSwipeElement === cardElement) activeSwipeElement = null;
        }
        cardElement = null;
    });
}

// --- 6. CORE ACTIONS (DELETE, SEARCH, EDIT) ---
function requestDelete(docId) {
    // If a card is in edit mode, cancel the edit before deleting
    if(entryInEditMode) {
        cancelEdit(entryInEditMode);
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
        await loadAndRender(); // Reload all data and re-render
    } catch (error) {
        showError('Failed to delete the shard.');
        console.error("Delete error:", error);
    }
    cancelDelete();
}

function performSearch(query) {
    const lowerCaseQuery = query.toLowerCase().trim();
    filteredEntries = lowerCaseQuery ? allEntries.filter(entry => {
        let tags = [];
        if (entry.tags) {
            if (typeof entry.tags === 'string') {
                tags = entry.tags.replace(/^\[|\]$/g, '').split(',').map(t => t.trim().replace(/^'|'$/g, '')).filter(t => t); //
            } else if (Array.isArray(entry.tags)) {
                tags = entry.tags.map(t => typeof t === 'string' ? t.replace(/^'|'$/g, '') : t); //
            }
        }
        
        const productName = entry.product_name || '';
        return [entry.title, entry.summary, entry.content, productName, ...tags].join(' ').toLowerCase().includes(lowerCaseQuery);
    }) : [...allEntries];
    renderEntries();
}

window.searchByTag = (tag) => {
    const searchInput = document.getElementById('searchInput');
    searchInput.value = tag;
    performSearch(tag);
};

// --- EDIT FUNCTIONS ---
function toggleEditMode(docId) {
    // If another card is already in edit mode, cancel it first.
    if (entryInEditMode && entryInEditMode !== docId) {
        cancelEdit(entryInEditMode);
    }

    const card = document.querySelector(`.entry[data-doc-id="${docId}"]`);
    if (!card) return;
    
    card.classList.add('edit-mode');
    entryInEditMode = docId;

    // After switching to edit mode, we may need to recalculate masonry layout
    if (currentView === 'masonry') {
        applyMasonryLayout();
    }
    // For database view, if the item is not expanded, expand it.
    if(currentView === 'database'){
        const wrapper = card.closest('.entry-wrapper');
        if(wrapper && !wrapper.classList.contains('expanded')){
            wrapper.classList.add('expanded');
        }
    }
}

function cancelEdit(docId) {
    const card = document.querySelector(`.entry[data-doc-id="${docId}"]`);
    if (card) {
        card.classList.remove('edit-mode');
    }
    entryInEditMode = null;
    
    // Recalculate layout after canceling edit
    if (currentView === 'masonry') {
        applyMasonryLayout();
    }
}

async function saveChanges(docId) {
    const saveButton = document.querySelector(`.entry[data-doc-id="${docId}"] .edit-save`);
    saveButton.textContent = 'Saving...';
    saveButton.disabled = true;

    const title = document.getElementById(`title-${docId}`).value;
    const summary = document.getElementById(`summary-${docId}`).value;
    const content = document.getElementById(`content-${docId}`).value;
    const tags = document.getElementById(`tags-${docId}`).value;

    const updatedData = {
        title: title,
        summary: summary,
        content: content,
        tags: tags,
    };

    try {
        await db.collection('entries').doc(docId).update(updatedData);
        // Once saved, exit edit mode and refresh data
        await loadAndRender();
    } catch (error) {
        showError('Failed to save changes.');
        console.error("Save error:", error);
        saveButton.textContent = 'Save';
        saveButton.disabled = false;
    }
}

window.toggleEditMode = toggleEditMode;
window.cancelEdit = cancelEdit;
window.saveChanges = saveChanges;


// --- 7. HELPER FUNCTIONS ---
function formatDate(timestamp) {
    if (!timestamp) return 'No date';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function formatContent(content) {
    if (typeof content !== 'string' || !content.trim()) return '';
    // The content is expected to be a comma-separated string which is then turned into a list
    const items = content.split(',').map(item => item.trim()).filter(item => item);
    if (items.length > 0) {
        return `<ul>${items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
    }
    return ''; // Return empty string if no valid content items
}

function generateMapsLink(address) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address.trim())}`;
}

function escapeHtml(str = '') {
    if (str === null || typeof str === 'undefined') {
        return '';
    }
    const p = document.createElement('p');
    p.textContent = str;
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
