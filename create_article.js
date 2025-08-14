let selectedItemType = null;
let createdItemId = null;
let selectedFile = null;

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

// Picture upload elements
const fileUploadArea = document.getElementById('fileUploadArea');
const pictureFile = document.getElementById('pictureFile');
const uploadPlaceholder = document.getElementById('uploadPlaceholder');
const uploadPreview = document.getElementById('uploadPreview');
const previewImage = document.getElementById('previewImage');
const fileName = document.getElementById('fileName');
const fileSize = document.getElementById('fileSize');
const removeImage = document.getElementById('removeImage');

// Initialize event listeners
document.addEventListener('DOMContentLoaded', function() {
    setupEventListeners();
    setupPictureUpload();
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

function setupPictureUpload() {
    // Upload method tabs
    const uploadTabs = document.querySelectorAll('.upload-tab');
    const fileUploadSection = document.getElementById('fileUploadSection');
    const urlUploadSection = document.getElementById('urlUploadSection');
    const articlePictureUrl = document.getElementById('articlePictureUrl');
    const urlPreview = document.getElementById('urlPreview');
    const urlPreviewImage = document.getElementById('urlPreviewImage');

    uploadTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const method = tab.dataset.tab;
            
            // Update active tab
            uploadTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            // Show/hide sections
            if (method === 'file') {
                fileUploadSection.style.display = 'block';
                urlUploadSection.style.display = 'none';
            } else {
                fileUploadSection.style.display = 'none';
                urlUploadSection.style.display = 'block';
            }
        });
    });

    // File upload handling
    fileUploadArea.addEventListener('click', () => {
        pictureFile.click();
    });

    fileUploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        fileUploadArea.classList.add('dragover');
    });

    fileUploadArea.addEventListener('dragleave', (e) => {
        e.preventDefault();
        fileUploadArea.classList.remove('dragover');
    });

    fileUploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        fileUploadArea.classList.remove('dragover');
        
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleFileSelect(files[0]);
        }
    });

    pictureFile.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFileSelect(e.target.files[0]);
        }
    });

    removeImage.addEventListener('click', (e) => {
        e.stopPropagation();
        clearFileSelection();
    });

    // URL preview handling
    articlePictureUrl.addEventListener('input', (e) => {
        const url = e.target.value.trim();
        if (url && isValidImageUrl(url)) {
            urlPreviewImage.src = url;
            urlPreview.style.display = 'block';
            
            urlPreviewImage.onerror = () => {
                urlPreview.style.display = 'none';
            };
        } else {
            urlPreview.style.display = 'none';
        }
    });
}

function handleFileSelect(file) {
    console.log('📁 File selected:', file.name, file.type, file.size);
    
    // Check file type
    if (!file.type.startsWith('image/')) {
        alert('Please select an image file (JPG, PNG, GIF, WebP)');
        return;
    }

    // Check file size (5MB limit)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
        alert('File size must be less than 5MB');
        return;
    }

    selectedFile = file;
    console.log('✅ File accepted:', file.name);
    
    // Show preview
    const reader = new FileReader();
    reader.onload = (e) => {
        const previewImg = document.getElementById('previewImg');
        const fileName = document.getElementById('fileName');
        const filePreview = document.getElementById('filePreview');
        
        if (previewImg && fileName && filePreview) {
            previewImg.src = e.target.result;
            fileName.textContent = file.name;
            filePreview.style.display = 'block';
            console.log('✅ Preview displayed');
        }
    };
    reader.onerror = (e) => {
        console.error('❌ FileReader error:', e);
    };
    reader.readAsDataURL(file);
}

function clearFileSelection() {
    console.log('🗑️ Clearing file selection');
    selectedFile = null;
    
    const pictureFile = document.getElementById('pictureFile');
    const filePreview = document.getElementById('filePreview');
    
    if (pictureFile) {
        pictureFile.value = '';
    }
    if (filePreview) {
        filePreview.style.display = 'none';
    }
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function isValidImageUrl(url) {
    try {
        new URL(url);
        return /\.(jpg|jpeg|png|gif|webp)$/i.test(url);
    } catch {
        return false;
    }
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
        // Check which upload method is selected
        const uploadMethodRadio = document.querySelector('input[name="pictureMethod"]:checked');
        const uploadMethod = uploadMethodRadio ? uploadMethodRadio.value : 'url';
        
        console.log('📝 Upload method:', uploadMethod);
        console.log('📁 Selected file:', selectedFile);
        
        if (uploadMethod === 'file' && selectedFile) {
            console.log('📁 Using file upload method');
            
            // Use FormData for file upload
            const formData = new FormData();
            
            // Add all the required fields
            formData.append('item_type', selectedItemType);
            formData.append('item_id', createdItemId.toString());
            formData.append('description', document.getElementById('articleDescription').value || '');
            formData.append('price', document.getElementById('articlePrice').value);
            formData.append('picture', selectedFile);
            
            console.log('📝 FormData contents:');
            for (let [key, value] of formData.entries()) {
                console.log(`  ${key}:`, value);
            }
            
            const response = await fetch('http://localhost:8000/api/articles', {
                method: 'POST',
                credentials: 'include',
                body: formData
                // Don't set Content-Type header - let browser set it for FormData
            });
            
            console.log('📡 Response status:', response.status);
            
            if (!response.ok) {
                const errorData = await response.json();
                console.error('❌ Server error response:', errorData);
                throw new Error(errorData.error || 'Failed to create article');
            }
            
            const result = await response.json();
            console.log('✅ Success response:', result);
            showSuccess('Article created successfully with uploaded image!');
            
        } else {
            console.log('📄 Using URL/JSON method');
            
            // Use JSON for URL method (original code)
            const articleData = {
                item_type: selectedItemType,
                item_id: createdItemId,
                description: document.getElementById('articleDescription').value || '',
                price: parseFloat(document.getElementById('articlePrice').value)
            };
            
            // Add picture URL if provided
            if (uploadMethod === 'url') {
                const pictureUrl = document.getElementById('articlePictureUrl')?.value;
                if (pictureUrl && pictureUrl.trim()) {
                    articleData.picture_url = pictureUrl.trim();
                }
            }
            
            console.log('📝 JSON data:', articleData);
            
            const response = await fetch('http://localhost:8000/api/articles', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include',
                body: JSON.stringify(articleData)
            });
            
            console.log('📡 Response status:', response.status);
            
            if (!response.ok) {
                const errorData = await response.json();
                console.error('❌ Server error response:', errorData);
                throw new Error(errorData.error || 'Failed to create article');
            }
            
            const result = await response.json();
            console.log('✅ Success response:', result);
            showSuccess('Article created successfully!');
        }
        
    } catch (error) {
        console.error('❌ Article creation error:', error);
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
    clearFileSelection();
    selectedFile = null;
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