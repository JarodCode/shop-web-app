let selectedItemType = null;
let createdItemId = null;

// DOM elements
const itemCreationSection = document.getElementById('itemCreationSection');
const articleCreationSection = document.getElementById('articleCreationSection');
const itemPreview = document.getElementById('itemPreview');
const loadingOverlay = document.getElementById('loadingOverlay');
const successMessage = document.getElementById('successMessage');
const errorMessage = document.getElementById('errorMessage');

// Type selection buttons
const bookTypeBtn = document.getElementById('bookTypeBtn');
const dvdTypeBtn = document.getElementById('dvdTypeBtn');
const cdTypeBtn = document.getElementById('cdTypeBtn');

// Forms
const itemForm = document.getElementById('itemForm');
const articleForm = document.getElementById('articleForm');

// Initialize event listeners
document.addEventListener('DOMContentLoaded', function() {
    setupEventListeners();
});

function setupEventListeners() {
    // Type selection buttons
    bookTypeBtn.addEventListener('click', () => selectItemType('book'));
    dvdTypeBtn.addEventListener('click', () => selectItemType('dvd'));
    cdTypeBtn.addEventListener('click', () => selectItemType('cd'));

    // Form submissions
    itemForm.addEventListener('submit', handleItemSubmit);
    articleForm.addEventListener('submit', handleArticleSubmit);

    // Cancel buttons
    document.getElementById('cancelItemBtn').addEventListener('click', () => {
        itemCreationSection.style.display = 'none';
        resetItemForm();
    });

    document.getElementById('cancelArticleBtn').addEventListener('click', () => {
        articleCreationSection.style.display = 'none';
        itemCreationSection.style.display = 'block';
    });

    // Header buttons
    document.getElementById('backBtn').addEventListener('click', () => {
        window.location.href = 'profile.html';
    });

    document.getElementById('logoutBtn').addEventListener('click', () => {
        if (confirm('Are you sure you want to logout?')) {
            logout();
        }
    });

    // Success/Error message buttons
    document.getElementById('createAnotherBtn').addEventListener('click', () => {
        successMessage.style.display = 'none';
        resetAllForms();
    });

    document.getElementById('backToProfileBtn').addEventListener('click', () => {
        window.location.href = 'profile.html';
    });

    document.getElementById('retryBtn').addEventListener('click', () => {
        errorMessage.style.display = 'none';
    });

    document.getElementById('dismissErrorBtn').addEventListener('click', () => {
        errorMessage.style.display = 'none';
    });
}

function selectItemType(type) {
    selectedItemType = type;
    
    // Update button states
    document.querySelectorAll('.type-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`${type}TypeBtn`).classList.add('active');
    
    // Show item creation section
    itemCreationSection.style.display = 'block';
    
    // Create and show only the selected form
    createFormForType(type);
}

function createFormForType(type) {
    // Clear existing form content
    const formContainer = itemForm.querySelector('.form-container') || itemForm;
    
    // Remove any existing item forms
    const existingForms = formContainer.querySelectorAll('.item-form');
    existingForms.forEach(form => form.remove());
    
    // Create the appropriate form based on type
    let formHtml = '';
    
    if (type === 'book') {
        formHtml = `
            <div class="item-form active">
                <h3>Book Information</h3>
                <div class="form-group">
                    <label for="bookTitle">Title *</label>
                    <input type="text" id="bookTitle" name="title" required>
                </div>
                <div class="form-group">
                    <label for="bookAuthor">Author *</label>
                    <input type="text" id="bookAuthor" name="author" required>
                </div>
                <div class="form-group">
                    <label for="bookPublicationDate">Publication Date</label>
                    <input type="date" id="bookPublicationDate" name="publication_date">
                </div>
                <div class="form-group">
                    <label for="bookGenre">Genre</label>
                    <input type="text" id="bookGenre" name="genre" placeholder="e.g., Fiction, Mystery, Science Fiction">
                </div>
            </div>
        `;
    } else if (type === 'dvd') {
        formHtml = `
            <div class="item-form active">
                <h3>DVD Information</h3>
                <div class="form-group">
                    <label for="dvdTitle">Title *</label>
                    <input type="text" id="dvdTitle" name="title" required>
                </div>
                <div class="form-group">
                    <label for="dvdDirector">Director *</label>
                    <input type="text" id="dvdDirector" name="director" required>
                </div>
                <div class="form-group">
                    <label for="dvdPublicationDate">Release Date</label>
                    <input type="date" id="dvdPublicationDate" name="publication_date">
                </div>
                <div class="form-group">
                    <label for="dvdGenre">Genre</label>
                    <input type="text" id="dvdGenre" name="genre" placeholder="e.g., Action, Comedy, Drama">
                </div>
            </div>
        `;
    } else if (type === 'cd') {
        formHtml = `
            <div class="item-form active">
                <h3>CD Information</h3>
                <div class="form-group">
                    <label for="cdAuthor">Artist/Author *</label>
                    <input type="text" id="cdAuthor" name="author" required>
                </div>
                <div class="form-group">
                    <label for="cdPublicationDate">Release Date</label>
                    <input type="date" id="cdPublicationDate" name="publication_date">
                </div>
                <div class="form-group">
                    <label for="cdGenre">Genre</label>
                    <input type="text" id="cdGenre" name="genre" placeholder="e.g., Rock, Pop, Jazz">
                </div>
            </div>
        `;
    }
    
    // Insert the form HTML before the form actions
    const formActions = itemForm.querySelector('.form-actions');
    if (formActions) {
        formActions.insertAdjacentHTML('beforebegin', formHtml);
    } else {
        itemForm.insertAdjacentHTML('beforeend', formHtml);
    }
}

async function handleItemSubmit(e) {
    e.preventDefault();
    
    showLoading('Creating item...');
    
    try {
        const formData = new FormData(e.target);
        const itemData = Object.fromEntries(formData);
        
        // Remove empty fields
        Object.keys(itemData).forEach(key => {
            if (!itemData[key]) {
                delete itemData[key];
            }
        });
        
        const response = await fetch(`http://localhost:8000/api/${selectedItemType}s`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            credentials: 'include',
            body: JSON.stringify(itemData)
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to create item');
        }
        
        const result = await response.json();
        createdItemId = result[selectedItemType].id;
        
        // Show article creation section
        showArticleCreation(result[selectedItemType]);
        
    } catch (error) {
        console.error('Item creation error:', error);
        showError(error.message || 'Failed to create item. Please try again.');
    } finally {
        hideLoading();
    }
}

function showArticleCreation(itemData) {
    // Hide item creation section
    itemCreationSection.style.display = 'none';
    
    // Show article creation section
    articleCreationSection.style.display = 'block';
    
    // Update item preview
    let previewHtml = `<h4>Item Created Successfully!</h4>`;
    
    if (selectedItemType === 'book') {
        previewHtml += `
            <p><strong>Title:</strong> ${itemData.title}</p>
            <p><strong>Author:</strong> ${itemData.author}</p>
            ${itemData.genre ? `<p><strong>Genre:</strong> ${itemData.genre}</p>` : ''}
            ${itemData.publication_date ? `<p><strong>Publication Date:</strong> ${itemData.publication_date}</p>` : ''}
        `;
    } else if (selectedItemType === 'dvd') {
        previewHtml += `
            <p><strong>Title:</strong> ${itemData.title}</p>
            <p><strong>Director:</strong> ${itemData.director}</p>
            ${itemData.genre ? `<p><strong>Genre:</strong> ${itemData.genre}</p>` : ''}
            ${itemData.publication_date ? `<p><strong>Release Date:</strong> ${itemData.publication_date}</p>` : ''}
        `;
    } else if (selectedItemType === 'cd') {
        previewHtml += `
            <p><strong>Artist/Author:</strong> ${itemData.author}</p>
            ${itemData.genre ? `<p><strong>Genre:</strong> ${itemData.genre}</p>` : ''}
            ${itemData.publication_date ? `<p><strong>Release Date:</strong> ${itemData.publication_date}</p>` : ''}
        `;
    }
    
    itemPreview.innerHTML = previewHtml;
}

async function handleArticleSubmit(e) {
    e.preventDefault();
    
    showLoading('Creating article...');
    
    try {
        const formData = new FormData(e.target);
        const articleData = Object.fromEntries(formData);
        
        // Add item information
        articleData.item_type = selectedItemType;
        articleData.item_id = createdItemId;
        
        // Remove empty fields
        Object.keys(articleData).forEach(key => {
            if (!articleData[key]) {
                delete articleData[key];
            }
        });
        
        const response = await fetch('http://localhost:8000/api/articles', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            credentials: 'include',
            body: JSON.stringify(articleData)
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to create article');
        }
        
        const result = await response.json();
        showSuccess('Article created successfully!');
        
    } catch (error) {
        console.error('Article creation error:', error);
        showError(error.message || 'Failed to create article. Please try again.');
    } finally {
        hideLoading();
    }
}

function showLoading(text = 'Loading...') {
    document.getElementById('loadingText').textContent = text;
    loadingOverlay.style.display = 'flex';
}

function hideLoading() {
    loadingOverlay.style.display = 'none';
}

function showSuccess(text) {
    document.getElementById('successText').textContent = text;
    successMessage.style.display = 'flex';
}

function showError(text) {
    document.getElementById('errorText').textContent = text;
    errorMessage.style.display = 'flex';
}

function resetItemForm() {
    itemForm.reset();
    selectedItemType = null;
    createdItemId = null;
    document.querySelectorAll('.type-btn').forEach(btn => btn.classList.remove('active'));
    
    // Remove any dynamically created forms
    const existingForms = itemForm.querySelectorAll('.item-form');
    existingForms.forEach(form => form.remove());
}

function resetAllForms() {
    resetItemForm();
    articleForm.reset();
    itemCreationSection.style.display = 'none';
    articleCreationSection.style.display = 'none';
}

async function logout() {
    try {
        await fetch('http://localhost:8000/api/auth/logout', {
            method: 'POST',
            credentials: 'include'
        });
        window.location.href = 'login.html';
    } catch (error) {
        console.error('Logout error:', error);
        window.location.href = 'login.html';
    }
}