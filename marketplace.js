class MarketplaceApp {
    constructor() {
        this.currentFilter = '';
        this.currentSort = 'newest';
        this.currentView = 'grid';
        this.currentItemType = 'all';
        this.searchTerm = '';
        this.articles = [];
        this.genres = [];
        this.API_BASE_URL = 'http://localhost:8000';
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.setupItemTypeNavigation();
        this.checkCurrentItemType();
        this.loadArticles();
    }

    // Configure tous les écouteurs d'événements
    setupEventListeners() {
        // Fonctionnalité de recherche
        const searchInput = document.getElementById('searchInput');
        const searchBtn = document.getElementById('searchBtn');
        if (searchInput && searchBtn) {
            searchInput.addEventListener('input', (e) => {
                this.searchTerm = e.target.value.toLowerCase();
                this.filterAndDisplayArticles();
            });
            searchBtn.addEventListener('click', () => this.filterAndDisplayArticles());
        }

        // Contrôles de filtre
        const genreFilter = document.getElementById('genreFilter');
        const sortBy = document.getElementById('sortBy');
        if (genreFilter) {
            genreFilter.addEventListener('change', (e) => {
                this.currentFilter = e.target.value;
                this.filterAndDisplayArticles();
            });
        }
        if (sortBy) {
            sortBy.addEventListener('change', (e) => {
                this.currentSort = e.target.value;
                this.filterAndDisplayArticles();
            });
        }

        // Effacer les filtres
        const clearFiltersBtn = document.getElementById('clearFiltersBtn');
        const clearSearchBtn = document.getElementById('clearSearchBtn');
        if (clearFiltersBtn) {
            clearFiltersBtn.addEventListener('click', () => this.clearFilters());
        }
        if (clearSearchBtn) {
            clearSearchBtn.addEventListener('click', () => this.clearSearch());
        }

        // Basculement de vue
        const gridViewBtn = document.getElementById('gridViewBtn');
        const listViewBtn = document.getElementById('listViewBtn');
        if (gridViewBtn) {
            gridViewBtn.addEventListener('click', () => this.setView('grid'));
        }
        if (listViewBtn) {
            listViewBtn.addEventListener('click', () => this.setView('list'));
        }

        // Bouton d'ajout d'article
        const addItemBtn = document.getElementById('addItemBtn');
        if (addItemBtn) {
            addItemBtn.addEventListener('click', () => {
                window.location.href = 'create_article.html';
            });
        }

        // Contrôles de modal
        const modalOverlay = document.getElementById('modalOverlay');
        const closeModal = document.getElementById('closeModal');
        const closeModalBtn = document.getElementById('closeModalBtn');
        if (modalOverlay) {
            modalOverlay.addEventListener('click', (e) => {
                if (e.target === modalOverlay) this.closeModal();
            });
        }
        if (closeModal) {
            closeModal.addEventListener('click', () => this.closeModal());
        }
        if (closeModalBtn) {
            closeModalBtn.addEventListener('click', () => this.closeModal());
        }

        // Bouton de réessai
        const retryBtn = document.getElementById('retryBtn');
        if (retryBtn) {
            retryBtn.addEventListener('click', () => this.loadArticles());
        }
    }

    // Configure la navigation par type d'article avec gestion de l'URL
    setupItemTypeNavigation() {
        const navButtons = document.querySelectorAll('.nav-btn');
        navButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const href = btn.getAttribute('href');
                const urlParams = new URLSearchParams(href.substring(1));
                const type = urlParams.get('type');
                this.setItemType(type || 'all');
                
                // Met à jour l'URL sans recharger la page
                window.history.pushState({}, '', href);
            });
        });
    }

    // Vérifie le type d'article actuel depuis l'URL
    checkCurrentItemType() {
        const urlParams = new URLSearchParams(window.location.search);
        const type = urlParams.get('type') || 'all';
        this.setItemType(type);
    }

    // Change le type d'article affiché et met à jour l'interface
    setItemType(type) {
        this.currentItemType = type;
        
        // Met à jour la navigation active
        const navButtons = document.querySelectorAll('.nav-btn');
        navButtons.forEach(btn => {
            const href = btn.getAttribute('href');
            const urlParams = new URLSearchParams(href.substring(1));
            const btnType = urlParams.get('type') || 'all';
            if (btnType === type) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        // Met à jour le titre de la page
        const pageTitle = document.getElementById('pageTitle');
        const sectionTitle = document.getElementById('sectionTitle');
        if (pageTitle && sectionTitle) {
            switch(type) {
                case 'books':
                    pageTitle.textContent = 'Livres Marketplace';
                    sectionTitle.textContent = 'Livres disponibles';
                    break;
                case 'dvds':
                    pageTitle.textContent = 'DVDs Marketplace';
                    sectionTitle.textContent = 'DVDs disponibles';
                    break;
                case 'cds':
                    pageTitle.textContent = 'CDs Marketplace';
                    sectionTitle.textContent = 'CDs disponibles';
                    break;
                default:
                    pageTitle.textContent = 'Marketplace';
                    sectionTitle.textContent = 'Items disponibles';
            }
        }

        this.loadArticles();
    }

    // Charge les articles depuis l'API en fonction du type sélectionné
    async loadArticles() {
        this.showLoading();
        this.hideError();
        this.hideNoResults();

        try {
            let endpoint = '/api/articles';
            if (this.currentItemType && this.currentItemType !== 'all') {
                const typeMapping = {
                    'books': 'book',
                    'dvds': 'dvd', 
                    'cds': 'cd'
                };
                const backendType = typeMapping[this.currentItemType];
                if (backendType) {
                    endpoint = `/api/articles/${backendType}`;
                }
            }

            const response = await fetch(`${this.API_BASE_URL}${endpoint}`, {
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            
            this.articles = data.articles || [];
            
            this.extractGenres();
            this.populateGenreFilter();
            this.filterAndDisplayArticles();
            
        } catch (error) {
            console.error('Error loading articles:', error);
            this.showError('Failed to load articles. Please check your connection and try again.');
        } finally {
            this.hideLoading();
        }
    }

    // Extrait tous les genres uniques des articles chargés
    extractGenres() {
        const genresSet = new Set();
        this.articles.forEach(article => {
            let genre = null;
            
            if (article.book_info && article.book_info.genre) {
                genre = article.book_info.genre;
            } else if (article.dvd_info && article.dvd_info.genre) {
                genre = article.dvd_info.genre;
            } else if (article.cd_info && article.cd_info.genre) {
                genre = article.cd_info.genre;
            } else if (article.item_info && article.item_info.genre) {
                genre = article.item_info.genre;
            }
            
            if (genre) {
                genresSet.add(genre);
            }
        });
        this.genres = Array.from(genresSet).sort();
    }

    // Remplit le sélecteur de filtre de genre
    populateGenreFilter() {
        const genreFilter = document.getElementById('genreFilter');
        if (!genreFilter) return;

        genreFilter.innerHTML = '<option value="">All Genres</option>';
        this.genres.forEach(genre => {
            const option = document.createElement('option');
            option.value = genre;
            option.textContent = genre.charAt(0).toUpperCase() + genre.slice(1);
            genreFilter.appendChild(option);
        });
    }

    // Applique les filtres de recherche et de genre, puis affiche les résultats
    filterAndDisplayArticles() {
        let filteredArticles = [...this.articles];

        // Applique le filtre de recherche
        if (this.searchTerm) {
            filteredArticles = filteredArticles.filter(article => {
                const searchTermLower = this.searchTerm.toLowerCase();
                
                let title = '';
                let author = '';
                let director = '';
                
                if (article.book_info) {
                    title = article.book_info.title || '';
                    author = article.book_info.author || '';
                } else if (article.dvd_info) {
                    title = article.dvd_info.title || '';
                    director = article.dvd_info.director || '';
                } else if (article.cd_info) {
                    author = article.cd_info.author || '';
                } else if (article.item_info) {
                    title = article.item_info.title || '';
                    author = article.item_info.author || '';
                    director = article.item_info.director || '';
                }
                
                const description = article.description || '';
                const seller = article.seller_username || '';

                return title.toLowerCase().includes(searchTermLower) ||
                       author.toLowerCase().includes(searchTermLower) ||
                       director.toLowerCase().includes(searchTermLower) ||
                       description.toLowerCase().includes(searchTermLower) ||
                       seller.toLowerCase().includes(searchTermLower);
            });
        }

        // Applique le filtre de genre
        if (this.currentFilter) {
            filteredArticles = filteredArticles.filter(article => {
                let genre = null;
                
                if (article.book_info && article.book_info.genre) {
                    genre = article.book_info.genre;
                } else if (article.dvd_info && article.dvd_info.genre) {
                    genre = article.dvd_info.genre;
                } else if (article.cd_info && article.cd_info.genre) {
                    genre = article.cd_info.genre;
                } else if (article.item_info && article.item_info.genre) {
                    genre = article.item_info.genre;
                }
                
                return genre === this.currentFilter;
            });
        }

        this.sortArticles(filteredArticles);

        if (filteredArticles.length === 0) {
            this.showNoResults();
        } else {
            this.hideNoResults();
            this.displayArticles(filteredArticles);
        }
    }

    // Trie les articles selon le critère sélectionné
    sortArticles(articles) {
        articles.sort((a, b) => {
            switch (this.currentSort) {
                case 'newest':
                    return new Date(b.created_at) - new Date(a.created_at);
                case 'oldest':
                    return new Date(a.created_at) - new Date(b.created_at);
                case 'price-low':
                    return a.price - b.price;
                case 'price-high':
                    return b.price - a.price;
                case 'title':
                    const aTitle = this.getItemTitle(a).toLowerCase();
                    const bTitle = this.getItemTitle(b).toLowerCase();
                    return aTitle.localeCompare(bTitle);
                default:
                    return 0;
            }
        });
    }

    // Extrait le titre d'un article selon son type
    getItemTitle(article) {
        if (article.book_info && article.book_info.title) {
            return article.book_info.title;
        } else if (article.dvd_info && article.dvd_info.title) {
            return article.dvd_info.title;
        } else if (article.cd_info && article.cd_info.author) {
            return article.cd_info.author;
        } else if (article.item_info) {
            return article.item_info.title || article.item_info.author || 'Untitled';
        }
        return 'Untitled';
    }

    // Affiche les articles dans la grille ou liste
    displayArticles(articles) {
        const articlesGrid = document.getElementById('articlesGrid');
        if (!articlesGrid) return;

        articlesGrid.className = this.currentView === 'grid' ? 'articles-grid' : 'articles-list';
        articlesGrid.innerHTML = '';

        articles.forEach(article => {
            const articleElement = this.createArticleElement(article);
            articlesGrid.appendChild(articleElement);
        });
    }

    // Crée l'élément DOM pour un article avec ses informations et boutons
    createArticleElement(article) {
        let title = 'Untitled';
        let subtitle = '';
        
        if (article.book_info) {
            title = article.book_info.title || 'Untitled';
            subtitle = `écrit par ${article.book_info.author || 'Unknown Author'}`;
        } else if (article.dvd_info) {
            title = article.dvd_info.title || 'Untitled';
            subtitle = `réalisé par ${article.dvd_info.director || 'Unknown Director'}`;
        } else if (article.cd_info) {
            title = article.cd_info.author || 'Unknown Artist';
        } 
        
        const articleDiv = document.createElement('div');
        articleDiv.className = 'article-card';
        articleDiv.innerHTML = `
            <div class="article-content">
                <h3 class="article-title clickable-title" data-article-id="${article.id}">${title}</h3>
                <p class="article-subtitle">${subtitle}</p>
                <p class="article-description">${article.description || 'No description available'}</p>
                <div class="article-meta">
                    <span class="article-price">${parseFloat(article.price).toFixed(2)} €</span>
                    <span class="article-seller">Vendeur : ${article.seller_username}</span>
                    <span class="article-date">${this.formatDate(article.created_at)}</span>
                </div>
                <div class="article-actions">
                    <button class="btn-primary view-details" data-article-id="${article.id}">Détails de l'article</button>
                    ${!article.is_sold ? '<button class="btn-secondary contact-seller" data-seller="' + article.seller_username + '" data-article-id="' + article.id + '">Contacter le vendeur</button>' : ''}
                </div>
            </div>
        `;

        // Ajout des écouteurs d'événements sur les éléments interactifs
        const titleElement = articleDiv.querySelector('.clickable-title');
        const viewDetailsBtn = articleDiv.querySelector('.view-details');
        const contactSellerBtn = articleDiv.querySelector('.contact-seller');

        if (titleElement) {
            titleElement.addEventListener('click', () => this.navigateToArticle(article.id));
        }

        if (viewDetailsBtn) {
            viewDetailsBtn.addEventListener('click', () => this.navigateToArticle(article.id));
        }

        if (contactSellerBtn) {
            contactSellerBtn.addEventListener('click', () => {
                const sellerUsername = contactSellerBtn.getAttribute('data-seller');
                const articleId = contactSellerBtn.getAttribute('data-article-id');
                this.contactSeller(sellerUsername, articleId);
            });
        }

        return articleDiv;
    }

    navigateToArticle(articleId) {
        window.location.href = `article.html?id=${articleId}`;
    }

    formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    }

    // Redirige vers la page de chat avec le vendeur
    contactSeller(sellerUsername, articleId) {
        if (sellerUsername && articleId) {
            window.location.href = `chat.html?user=${encodeURIComponent(sellerUsername)}&articleId=${articleId}`;
        } else {
            alert('Unable to start chat. Missing seller information.');
        }
    }

    // Change la vue entre grille et liste
    setView(view) {
        this.currentView = view;
        const gridBtn = document.getElementById('gridViewBtn');
        const listBtn = document.getElementById('listViewBtn');
        
        if (gridBtn && listBtn) {
            gridBtn.classList.toggle('active', view === 'grid');
            listBtn.classList.toggle('active', view === 'list');
        }
        
        this.filterAndDisplayArticles();
    }

    // Remet à zéro tous les filtres
    clearFilters() {
        this.currentFilter = '';
        this.currentSort = 'newest';
        const genreFilter = document.getElementById('genreFilter');
        const sortBy = document.getElementById('sortBy');
        if (genreFilter) genreFilter.value = '';
        if (sortBy) sortBy.value = 'newest';
        this.filterAndDisplayArticles();
    }

    // Efface le terme de recherche
    clearSearch() {
        this.searchTerm = '';
        const searchInput = document.getElementById('searchInput');
        if (searchInput) searchInput.value = '';
        this.filterAndDisplayArticles();
    }

    // Méthodes de gestion des états d'interface
    showModal(title, content) {
        const modal = document.getElementById('modalOverlay');
        const modalTitle = document.getElementById('modalTitle');
        const modalBody = document.getElementById('modalBody');
        
        if (modal && modalTitle && modalBody) {
            modalTitle.textContent = title;
            modalBody.innerHTML = content;
            modal.style.display = 'flex';
        }
    }

    closeModal() {
        const modal = document.getElementById('modalOverlay');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    showLoading() {
        const loadingContainer = document.getElementById('loadingContainer');
        if (loadingContainer) {
            loadingContainer.style.display = 'flex';
        }
    }

    hideLoading() {
        const loadingContainer = document.getElementById('loadingContainer');
        if (loadingContainer) {
            loadingContainer.style.display = 'none';
        }
    }

    showError(message) {
        const errorContainer = document.getElementById('errorContainer');
        const errorText = document.getElementById('errorText');
        if (errorContainer && errorText) {
            errorText.textContent = message;
            errorContainer.style.display = 'block';
        }
    }

    hideError() {
        const errorContainer = document.getElementById('errorContainer');
        if (errorContainer) {
            errorContainer.style.display = 'none';
        }
    }

    showNoResults() {
        const noResults = document.getElementById('noResults');
        if (noResults) {
            noResults.style.display = 'block';
        }
    }

    hideNoResults() {
        const noResults = document.getElementById('noResults');
        if (noResults) {
            noResults.style.display = 'none';
        }
    }
}

// CSS pour l'affichage des icônes de type d'article
const style = document.createElement('style');
style.textContent = `
    .article-image {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        height: 200px;
        background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
        border-radius: 8px 8px 0 0;
    }
    
    .item-type-icon {
        font-size: 64px;
        opacity: 0.8;
    }
    
    .sold-badge {
        position: absolute;
        top: 10px;
        right: 10px;
        background: #ef4444;
        color: white;
        padding: 4px 8px;
        border-radius: 4px;
        font-weight: bold;
        font-size: 12px;
    }
`;
document.head.appendChild(style);

// Initialise l'application au chargement du DOM
document.addEventListener('DOMContentLoaded', () => {
    new MarketplaceApp();
});