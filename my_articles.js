// my-articles.js - Manage user's own articles

class MyArticlesApp {
    constructor() {
        this.articles = [];
        this.articleToDelete = null;
        this.API_BASE_URL = 'http://localhost:8000';
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadMyArticles();
    }

    setupEventListeners() {
        // Back button
        const backButton = document.getElementById('backButton');
        if (backButton) {
            backButton.addEventListener('click', () => {
                window.location.href = 'profile.html';
            });
        }

        // Delete modal
        const cancelDelete = document.getElementById('cancelDelete');
        const confirmDelete = document.getElementById('confirmDelete');
        const deleteModal = document.getElementById('deleteModal');

        if (cancelDelete) {
            cancelDelete.addEventListener('click', () => this.closeDeleteModal());
        }

        if (confirmDelete) {
            confirmDelete.addEventListener('click', () => this.confirmDelete());
        }

        if (deleteModal) {
            deleteModal.addEventListener('click', (e) => {
                if (e.target === deleteModal) {
                    this.closeDeleteModal();
                }
            });
        }
    }

    async loadMyArticles() {
        this.showLoading();

        try {
            const response = await fetch(`${this.API_BASE_URL}/api/users/me/articles`, {
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (response.status === 401) {
                alert('Please log in to view your articles');
                window.location.href = 'login.html';
                return;
            }

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            this.articles = data.articles || [];
            
            this.displayArticles();
            this.updateArticleCount();

        } catch (error) {
            console.error('Error loading articles:', error);
            alert('Failed to load your articles. Please try again.');
        } finally {
            this.hideLoading();
        }
    }

    displayArticles() {
        const articlesGrid = document.getElementById('articlesGrid');
        const emptyState = document.getElementById('emptyState');

        if (this.articles.length === 0) {
            articlesGrid.style.display = 'none';
            emptyState.style.display = 'block';
            return;
        }

        articlesGrid.style.display = 'grid';
        emptyState.style.display = 'none';
        articlesGrid.innerHTML = '';

        this.articles.forEach(article => {
            const articleElement = this.createArticleElement(article);
            articlesGrid.appendChild(articleElement);
        });
    }

    createArticleElement(article) {
        const articleDiv = document.createElement('div');
        articleDiv.className = `article-card ${article.is_sold ? 'sold' : ''}`;
        articleDiv.dataset.articleId = article.id;

        const title = article.item_name || 'Untitled';
        const subtitle = this.getSubtitle(article);
        const imageEmoji = this.getItemTypeEmoji(article.item_type);

        articleDiv.innerHTML = `
            ${article.is_sold ? '<div class="sold-badge">SOLD</div>' : ''}
            <div class="article-image">
                ${article.picture_url 
                    ? `<img src="${article.picture_url}" alt="${title}" onerror="this.parentElement.innerHTML='${imageEmoji}'">`
                    : imageEmoji
                }
            </div>
            <div class="article-content">
                <div class="article-title">${title}</div>
                <div class="article-subtitle">${subtitle}</div>
                <div class="article-info">
                    <div class="article-price">$${article.price.toFixed(2)}</div>
                    <div class="article-stats">
                        <div class="stat-item">
                            💬 ${article.message_count || 0}
                        </div>
                        <div class="stat-item">
                            📅 ${this.formatDate(article.created_at)}
                        </div>
                    </div>
                </div>
                <div class="article-actions">
                    <button class="action-btn btn-view" onclick="window.location.href='article.html?id=${article.id}'">
                        View
                    </button>
                    <button class="action-btn btn-sold ${article.is_sold ? 'mark-available' : ''}" 
                            data-article-id="${article.id}">
                        ${article.is_sold ? 'Mark Available' : 'Mark Sold'}
                    </button>
                    <button class="action-btn btn-delete" data-article-id="${article.id}">
                        Delete
                    </button>
                </div>
            </div>
        `;

        // Add event listeners to buttons
        const soldBtn = articleDiv.querySelector('.btn-sold');
        const deleteBtn = articleDiv.querySelector('.btn-delete');

        if (soldBtn) {
            soldBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleSoldStatus(article.id);
            });
        }

        if (deleteBtn) {
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.showDeleteModal(article);
            });
        }

        return articleDiv;
    }

    getSubtitle(article) {
        if (article.item_type === 'book') {
            return `by ${article.item_creator || 'Unknown Author'}`;
        } else if (article.item_type === 'dvd') {
            return `directed by ${article.item_creator || 'Unknown Director'}`;
        } else if (article.item_type === 'cd') {
            return `CD Album${article.item_genre ? ' - ' + article.item_genre : ''}`;
        }
        return article.item_type;
    }

    getItemTypeEmoji(itemType) {
        const emojis = {
            book: '📚',
            dvd: '🎬',
            cd: '💿'
        };
        return emojis[itemType] || '📦';
    }

    formatDate(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));

        if (diffDays === 0) {
            return 'Today';
        } else if (diffDays === 1) {
            return 'Yesterday';
        } else if (diffDays < 7) {
            return `${diffDays} days ago`;
        } else if (diffDays < 30) {
            const weeks = Math.floor(diffDays / 7);
            return `${weeks} week${weeks > 1 ? 's' : ''} ago`;
        } else {
            return date.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
            });
        }
    }

    async toggleSoldStatus(articleId) {
        try {
            const response = await fetch(`${this.API_BASE_URL}/api/articles/${articleId}/sold`, {
                method: 'PATCH',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            
            // Update the article in our local array
            const article = this.articles.find(a => a.id === articleId);
            if (article) {
                article.is_sold = data.article.is_sold;
            }

            // Refresh the display
            this.displayArticles();
            
            // Show success message
            const status = data.article.is_sold ? 'sold' : 'available';
            this.showNotification(`Article marked as ${status}!`, 'success');

        } catch (error) {
            console.error('Error updating article status:', error);
            alert('Failed to update article status. Please try again.');
        }
    }

    showDeleteModal(article) {
        this.articleToDelete = article;
        
        const modal = document.getElementById('deleteModal');
        const titleElement = document.getElementById('deleteArticleTitle');
        
        if (modal && titleElement) {
            titleElement.textContent = article.item_name || 'Untitled';
            modal.style.display = 'flex';
        }
    }

    closeDeleteModal() {
        const modal = document.getElementById('deleteModal');
        if (modal) {
            modal.style.display = 'none';
        }
        this.articleToDelete = null;
    }

    async confirmDelete() {
        if (!this.articleToDelete) return;

        const articleId = this.articleToDelete.id;
        
        try {
            const response = await fetch(`${this.API_BASE_URL}/api/articles/${articleId}`, {
                method: 'DELETE',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
            }

            // Remove the article from our local array
            this.articles = this.articles.filter(a => a.id !== articleId);
            
            // Close modal and refresh display
            this.closeDeleteModal();
            this.displayArticles();
            this.updateArticleCount();
            
            // Show success message
            this.showNotification('Article deleted successfully!', 'success');

        } catch (error) {
            console.error('Error deleting article:', error);
            alert(`Failed to delete article: ${error.message}`);
        }
    }

    updateArticleCount() {
        const countElement = document.getElementById('articleCount');
        if (countElement) {
            const count = this.articles.length;
            countElement.textContent = `${count} article${count !== 1 ? 's' : ''}`;
        }
    }

    showNotification(message, type = 'info') {
        // Create a simple notification (you can enhance this with better styling)
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 20px;
            background: ${type === 'success' ? '#10b981' : '#ef4444'};
            color: white;
            border-radius: 5px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
            z-index: 2000;
            animation: slideIn 0.3s ease;
        `;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => {
                document.body.removeChild(notification);
            }, 300);
        }, 3000);
    }

    showLoading() {
        const loadingOverlay = document.getElementById('loadingOverlay');
        if (loadingOverlay) {
            loadingOverlay.style.display = 'flex';
        }
    }

    hideLoading() {
        const loadingOverlay = document.getElementById('loadingOverlay');
        if (loadingOverlay) {
            loadingOverlay.style.display = 'none';
        }
    }
}

// Add CSS animation styles
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new MyArticlesApp();
});