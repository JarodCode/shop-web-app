let selectedItemType = null;
let createdItemId = null; 

// Références DOM des sections principales
const itemCreationSection = document.getElementById('itemCreationSection');
const articleCreationSection = document.getElementById('articleCreationSection');
const itemPreview = document.getElementById('itemPreview');
const loadingOverlay = document.getElementById('loadingOverlay');
const successMessage = document.getElementById('successMessage');
const errorMessage = document.getElementById('errorMessage');

// Boutons de sélection de type d'article
const bookTypeBtn = document.getElementById('bookTypeBtn');
const dvdTypeBtn = document.getElementById('dvdTypeBtn');
const cdTypeBtn = document.getElementById('cdTypeBtn');

// Formulaires de création
const itemForm = document.getElementById('itemForm');
const articleForm = document.getElementById('articleForm');

// Démarrage de l'application
document.addEventListener('DOMContentLoaded', function() {
    setupEventListeners();
});

// Configure tous les écouteurs d'événements de l'interface
function setupEventListeners() {
    // Gestion des clics sur les boutons de type d'article
    bookTypeBtn.addEventListener('click', () => selectItemType('book'));
    dvdTypeBtn.addEventListener('click', () => selectItemType('dvd'));
    cdTypeBtn.addEventListener('click', () => selectItemType('cd'));

    // Interception des soumissions de formulaires
    itemForm.addEventListener('submit', handleItemSubmit);
    articleForm.addEventListener('submit', handleArticleSubmit);

    // Boutons d'annulation
    document.getElementById('cancelItemBtn').addEventListener('click', () => {
        itemCreationSection.style.display = 'none';
        resetItemForm();
    });

    document.getElementById('cancelArticleBtn').addEventListener('click', () => {
        articleCreationSection.style.display = 'none';
        itemCreationSection.style.display = 'block';
    });

    // Navigation
    document.getElementById('backBtn').addEventListener('click', () => {
        window.location.href = 'profile.html';
    });

    // Déconnexion avec confirmation
    document.getElementById('logoutBtn').addEventListener('click', () => {
        if (confirm('Are you sure you want to logout?')) {
            logout();
        }
    });

    // Actions après création réussie
    document.getElementById('createAnotherBtn').addEventListener('click', () => {
        successMessage.style.display = 'none';
        resetAllForms();
    });

    document.getElementById('backToProfileBtn').addEventListener('click', () => {
        window.location.href = 'profile.html';
    });

    // Gestion des messages d'erreur
    document.getElementById('retryBtn').addEventListener('click', () => {
        errorMessage.style.display = 'none';
    });

    document.getElementById('dismissErrorBtn').addEventListener('click', () => {
        errorMessage.style.display = 'none';
    });
}

// Sélectionne le type d'article et génère le formulaire correspondant
function selectItemType(type) {
    selectedItemType = type;
    
    // Mise à jour visuelle des boutons
    document.querySelectorAll('.type-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`${type}TypeBtn`).classList.add('active');
    
    itemCreationSection.style.display = 'block';
    createFormForType(type);
}

// Génère dynamiquement le formulaire selon le type d'article
function createFormForType(type) {
    const formContainer = itemForm.querySelector('.form-container') || itemForm;
    
    // Supprime les formulaires précédents
    const existingForms = formContainer.querySelectorAll('.item-form');
    existingForms.forEach(form => form.remove());
    
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
                    <label for="cdGenre">Genre</label>
                    <input type="text" id="cdGenre" name="genre" placeholder="e.g., Rock, Pop, Jazz">
                </div>
            </div>
        `;
    }
    
    // Insertion du formulaire avant les boutons d'action
    const formActions = itemForm.querySelector('.form-actions');
    if (formActions) {
        formActions.insertAdjacentHTML('beforebegin', formHtml);
    } else {
        itemForm.insertAdjacentHTML('beforeend', formHtml);
    }
}

// Traite la soumission du formulaire d'article via requête API
async function handleItemSubmit(e) {
    e.preventDefault();
    showLoading('Creating item...');
    
    try {
        const formData = new FormData(e.target);
        const itemData = Object.fromEntries(formData);
        
        // Supprime les champs vides
        Object.keys(itemData).forEach(key => {
            if (!itemData[key]) {
                delete itemData[key];
            }
        });
        
        const response = await fetch(`https://localhost:8000/api/${selectedItemType}s`, {
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
        showArticleCreation(result[selectedItemType]);
        
    } catch (error) {
        console.error('Item creation error:', error);
        showError(error.message || 'Failed to create item. Please try again.');
    } finally {
        hideLoading();
    }
}

// Affiche la section création d'annonce avec résumé de l'article créé
function showArticleCreation(itemData) {
    itemCreationSection.style.display = 'none';
    articleCreationSection.style.display = 'block';
    
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

// Traite la soumission du formulaire d'annonce avec validation
async function handleArticleSubmit(e) {
    e.preventDefault();
    showLoading('Creating article...');
    
    try {
        const articleData = {
            item_type: selectedItemType,
            item_id: createdItemId,
            description: document.getElementById('articleDescription').value || '',
            price: parseFloat(document.getElementById('articlePrice').value)
        };
        
        // Validation côté client
        if (!articleData.item_type || !articleData.item_id || !articleData.price) {
            throw new Error("Item type, item ID, and price are required");
        }

        if (articleData.price <= 0) {
            throw new Error("Price must be greater than 0");
        }
        
        const response = await fetch('https://localhost:8000/api/articles', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            credentials: 'include',
            body: JSON.stringify(articleData)
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
            console.error('Server error response:', errorData);
            throw new Error(errorData.error || `Server error: ${response.status}`);
        }
        
        const result = await response.json();
        showSuccess('Article created successfully!');
        
        // Configure le bouton de visualisation de l'annonce
        const viewArticleBtn = document.getElementById('viewArticleBtn');
        if (viewArticleBtn && result.article) {
            viewArticleBtn.onclick = () => {
                window.location.href = `article.html?id=${result.article.id}`;
            };
        }
        
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

// Remet à zéro le formulaire d'article et supprime les formulaires dynamiques
function resetItemForm() {
    itemForm.reset();
    selectedItemType = null;
    createdItemId = null;
    document.querySelectorAll('.type-btn').forEach(btn => btn.classList.remove('active'));
    
    const existingForms = itemForm.querySelectorAll('.item-form');
    existingForms.forEach(form => form.remove());
}

// Remet à zéro tous les formulaires et masque les sections
function resetAllForms() {
    resetItemForm();
    articleForm.reset();
    itemCreationSection.style.display = 'none';
    articleCreationSection.style.display = 'none';
}

// Déconnecte l'utilisateur via API et redirige vers login
async function logout() {
    try {
        await fetch('https://localhost:8000/api/auth/logout', {
            method: 'POST',
            credentials: 'include'
        });
        window.location.href = 'login.html';
    } catch (error) {
        console.error('Logout error:', error);
        window.location.href = 'login.html';
    }
}