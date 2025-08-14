// marketplace.js - Complete clean version without pictures

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

    setupEventListeners() {
        // Search functionality
        const searchInput = document.getElementById('searchInput');
        const searchBtn = document.getElementById('searchBtn');
        if (searchInput && searchBtn) {
            searchInput.addEventListener('input', (e) => {
                this.searchTerm = e.target.value.toLowerCase();
                this.filterAndDisplayArticles();
            });
            searchBtn.addEventListener('click', () => this.filterAndDisplayArticles());
        }

        // Filter controls
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

        // Clear filters
        const clearFiltersBtn = document.getElementById('clearFiltersBtn');
        const clearSearchBtn = document.getElementById('clearSearchBtn');
        if (clearFiltersBtn) {
            clearFiltersBtn.addEventListener('click', () => this.clearFilters());
        }
        if (clearSearchBtn) {
            clearSearchBtn.addEventListener('click', () => this.clearSearch());
        }

        // View toggle
        const gridViewBtn = document.getElementById('gridViewBtn');
        const listViewBtn = document.getElementById('listViewBtn');
        if (gridViewBtn) {
            gridViewBtn.addEventListener('click', () => this.setView('grid'));
        }
        if (listViewBtn) {
            listViewBtn.addEventListener('click', () => this.setView('list'));
        }

        // Add item button
        const addItemBtn = document.getElementById('addItemBtn');
        if (addItemBtn) {
            addItemBtn.addEventListener('click', () => {
                window.location.href = 'create_article.html';
            });
        }

        // Modal controls
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

        // Retry button
        const retryBtn = document.getElementById('retryBtn');
        if (retryBtn) {
            retryBtn.addEventListener('click', () => this.loadArticles());
        }
    }

    setupItemTypeNavigation() {
        const navButtons = document.querySelectorAll('.nav-btn');
        navButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const href = btn.getAttribute('href');
                const urlParams = new URLSearchParams(href.substring(1));
                const type = urlParams.get('type');
                this.setItemType(type || 'all');
                
                // Update URL without reloading page
                window.history.pushState({}, '', href);
            });
        });
    }

    checkCurrentItemType() {
        const urlParams = new URLSearchParams(window.location.search);
        const type = urlParams.get('type') || 'all';
        this.setItemType(type);
    }

    setItemType(type) {
        this.currentItemType = type;
        
        // Update active navigation
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

        // Update page title
        const pageTitle = document.getElementById('pageTitle');
        const sectionTitle = document.getElementById('sectionTitle');
        if (pageTitle && sectionTitle) {
            switch(type) {
                case 'books':
                    pageTitle.textContent = '📚 Books Marketplace';
                    sectionTitle.textContent = 'Available Books';
                    break;
                case 'dvds':
                    pageTitle.textContent = '🎬 DVDs Marketplace';
                    sectionTitle.textContent = 'Available DVDs';
                    break;
                case 'cds':
                    pageTitle.textContent = '💿 CDs Marketplace';
                    sectionTitle.textContent = 'Available CDs';
                    break;
                default:
                    pageTitle.textContent = '📚 Marketplace';
                    sectionTitle.textContent = 'Available Items';
            }
        }

        this.loadArticles();
    }

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

            console.log('Fetching from endpoint:', `${this.API_BASE_URL}${endpoint}`);

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
            console.log('API Response:', data);
            
            this.articles = data.articles || [];
            console.log('Loaded articles:', this.articles);
            
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
        console.log('Extracted genres:', this.genres);
    }

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

    filterAndDisplayArticles() {
        let filteredArticles = [...this.articles];
        console.log('Starting with articles:', filteredArticles.length);

        // Apply search filter
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
            console.log('After search filter:', filteredArticles.length);
        }

        // Apply genre filter
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
            console.log('After genre filter:', filteredArticles.length);
        }

        // Apply sorting
        this.sortArticles(filteredArticles);

        // Display results
        if (filteredArticles.length === 0) {
            console.log('No results to show');
            this.showNoResults();
        } else {
            console.log('Displaying', filteredArticles.length, 'articles');
            this.hideNoResults();
            this.displayArticles(filteredArticles);
        }
    }

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

    createArticleElement(article) {
        let title = 'Untitled';
        let subtitle = '';
        
        if (article.book_info) {
            title = article.book_info.title || 'Untitled';
            subtitle = `by ${article.book_info.author || 'Unknown Author'}`;
        } else if (article.dvd_info) {
            title = article.dvd_info.title || 'Untitled';
            subtitle = `directed by ${article.dvd_info.director || 'Unknown Director'}`;
        } else if (article.cd_info) {
            title = article.cd_info.author || 'Unknown Artist';
            subtitle = 'CD Album';
        } else if (article.item_info) {
            title = article.item_info.title || article.item_info.author || 'Untitled';
            if (article.item_type === 'book') {
                subtitle = `by ${article.item_info.author || 'Unknown Author'}`;
            } else if (article.item_type === 'dvd') {
                subtitle = `directed by ${article.item_info.director || 'Unknown Director'}`;
            } else if (article.item_type === 'cd') {
                subtitle = 'CD Album';
            }
        }
        
        const articleDiv = document.createElement('div');
        articleDiv.className = 'article-card';
        articleDiv.innerHTML = `
            <div class="article-image">
                <div class="item-type-icon">${this.getItemTypeEmoji(article.item_type)}</div>
                ${article.is_sold ? '<div class="sold-badge">SOLD</div>' : ''}
            </div>
            <div class="article-content">
                <h3 class="article-title clickable-title" data-article-id="${article.id}">${title}</h3>
                <p class="article-subtitle">${subtitle}</p>
                <p class="article-description">${article.description || 'No description available'}</p>
                <div class="article-meta">
                    <span class="article-price">$${parseFloat(article.price).toFixed(2)}</span>
                    <span class="article-seller">by ${article.seller_username}</span>
                    <span class="article-date">${this.formatDate(article.created_at)}</span>
                </div>
                <div class="article-actions">
                    <button class="btn-primary view-details" data-article-id="${article.id}">View Details</button>
                    ${!article.is_sold ? '<button class="btn-secondary contact-seller" data-seller="' + article.seller_username + '" data-article-id="' + article.id + '">Contact Seller</button>' : ''}
                </div>
            </div>
        `;

        // Add click event listeners
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

    getItemTypeEmoji(itemType) {
        switch (itemType) {
            case 'book': return '📚';
            case 'dvd': return '🎬';
            case 'cd': return '💿';
            default: return '📦';
        }
    }

    formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    }

    contactSeller(sellerUsername, articleId) {
        if (sellerUsername && articleId) {
            window.location.href = `chat.html?user=${encodeURIComponent(sellerUsername)}&articleId=${articleId}`;
        } else {
            alert('Unable to start chat. Missing seller information.');
        }
    }

    // View and filter controls
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

    clearFilters() {
        this.currentFilter = '';
        this.currentSort = 'newest';
        const genreFilter = document.getElementById('genreFilter');
        const sortBy = document.getElementById('sortBy');
        if (genreFilter) genreFilter.value = '';
        if (sortBy) sortBy.value = 'newest';
        this.filterAndDisplayArticles();
    }

    clearSearch() {
        this.searchTerm = '';
        const searchInput = document.getElementById('searchInput');
        if (searchInput) searchInput.value = '';
        this.filterAndDisplayArticles();
    }

    // Modal and UI state management
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

// Add CSS for the new item type icon display
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

// Initialize the application when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new MarketplaceApp();
});