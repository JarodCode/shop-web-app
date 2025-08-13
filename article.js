// article.js - Fixed version with proper admin delete functionality

class ArticleDetailsApp {
    constructor() {
        this.articleId = null;
        this.article = null;
        this.currentUserId = null;
        this.currentUsername = null;
        this.init();
    }

    init() {
        this.getArticleIdFromUrl();
        this.getCurrentUser();
        this.setupEventListeners();
        if (this.articleId) {
            this.loadArticleDetails();
        } else {
            this.showError('No article ID provided');
        }
    }

    async getCurrentUser() {
        try {
            const response = await fetch('http://localhost:8000/test_cookie', {
                credentials: 'include'
            });

            if (response.ok) {
                const data = await response.json();
                this.currentUserId = data.token_data.userId;
                this.currentUsername = data.token_data.username;
            } else {
                console.log('User not authenticated');
            }
        } catch (error) {
            console.error('Error getting current user:', error);
        }
    }

    getArticleIdFromUrl() {
        const urlParams = new URLSearchParams(window.location.search);
        this.articleId = urlParams.get('id');
    }

    setupEventListeners() {
        const retryBtn = document.getElementById('retryBtn');
        if (retryBtn) {
            retryBtn.addEventListener('click', () => this.loadArticleDetails());
        }

        const contactSellerBtn = document.getElementById('contactSellerBtn');
        if (contactSellerBtn) {
            contactSellerBtn.addEventListener('click', () => this.handleContactButtonClick());
        }

        const shareArticleBtn = document.getElementById('shareArticleBtn');
        if (shareArticleBtn) {
            shareArticleBtn.addEventListener('click', () => this.handleShareButtonClick());
        }

        const reportArticleBtn = document.getElementById('reportArticleBtn');
        if (reportArticleBtn) {
            reportArticleBtn.addEventListener('click', () => this.reportArticle());
        }

        this.setupModalControls('shareModal', 'closeShareModal', 'closeShareModalBtn');

        const copyUrlBtn = document.getElementById('copyUrlBtn');
        if (copyUrlBtn) {
            copyUrlBtn.addEventListener('click', () => this.copyShareUrl());
        }

        const shareEmailBtn = document.getElementById('shareEmailBtn');
        const shareTwitterBtn = document.getElementById('shareTwitterBtn');
        const shareFacebookBtn = document.getElementById('shareFacebookBtn');

        if (shareEmailBtn) {
            shareEmailBtn.addEventListener('click', () => this.shareViaEmail());
        }
        if (shareTwitterBtn) {
            shareTwitterBtn.addEventListener('click', () => this.shareViaTwitter());
        }
        if (shareFacebookBtn) {
            shareFacebookBtn.addEventListener('click', () => this.shareViaFacebook());
        }
    }

    setupModalControls(modalId, closeButtonId, closeButtonId2) {
        const modal = document.getElementById(modalId);
        const closeBtn1 = document.getElementById(closeButtonId);
        const closeBtn2 = document.getElementById(closeButtonId2);

        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.closeModal(modalId);
                }
            });
        }

        if (closeBtn1) {
            closeBtn1.addEventListener('click', () => this.closeModal(modalId));
        }

        if (closeBtn2) {
            closeBtn2.addEventListener('click', () => this.closeModal(modalId));
        }
    }

    async loadArticleDetails() {
        this.showLoading();
        this.hideError();
        this.hideArticleDetails();

        try {
            const response = await fetch(`http://localhost:8000/api/articles`);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            const articles = data.articles || [];
            
            this.article = articles.find(article => article.id == this.articleId);
            
            if (!this.article) {
                throw new Error('Article not found');
            }
            
            this.displayArticleDetails();
            
        } catch (error) {
            console.error('Error loading article details:', error);
            this.showError('Failed to load article details. Please check your connection and try again.');
        } finally {
            this.hideLoading();
        }
    }

    displayArticleDetails() {
        if (!this.article) return;

        const itemInfo = this.article.book_info || this.article.dvd_info || this.article.cd_info || this.article.item_info;
        const title = itemInfo?.title || itemInfo?.author || 'Untitled';
        const subtitle = this.getSubtitle(this.article, itemInfo);

        document.title = `${title} - Marketplace`;
        const pageTitle = document.getElementById('pageTitle');
        if (pageTitle) {
            pageTitle.textContent = `${this.getItemTypeEmoji(this.article.item_type)} ${title}`;
        }

        const articleImage = document.getElementById('articleImage');
        if (articleImage) {
            articleImage.src = this.article.picture_url || this.getDefaultImage(this.article.item_type);
            articleImage.alt = title;
        }

        const soldBadge = document.getElementById('soldBadge');
        if (soldBadge) {
            soldBadge.style.display = this.article.is_sold ? 'block' : 'none';
        }

        const typeBadge = document.getElementById('articleTypeBadge');
        if (typeBadge) {
            typeBadge.textContent = this.article.item_type.toUpperCase();
            typeBadge.className = `article-type-badge ${this.article.item_type}`;
        }

        const articleTitle = document.getElementById('articleTitle');
        const articleSubtitle = document.getElementById('articleSubtitle');
        if (articleTitle) articleTitle.textContent = title;
        if (articleSubtitle) articleSubtitle.textContent = subtitle;

        const articlePrice = document.getElementById('articlePrice');
        const articleStatus = document.getElementById('articleStatus');
        if (articlePrice) {
            articlePrice.textContent = `$${this.article.price.toFixed(2)}`;
        }
        if (articleStatus) {
            articleStatus.textContent = this.article.is_sold ? 'SOLD' : 'Available';
            articleStatus.className = `article-status ${this.article.is_sold ? 'sold' : 'available'}`;
        }

        const articleDescription = document.getElementById('articleDescription');
        if (articleDescription) {
            articleDescription.textContent = this.article.description || 'No description provided.';
        }

        this.displayArticleDetailsGrid(itemInfo);
        this.displaySellerInfo();
        this.displayArticleMetadata();
        this.updateContactButton();

        const shareUrl = document.getElementById('shareUrl');
        if (shareUrl) {
            shareUrl.value = window.location.href;
        }

        this.showArticleDetails();
    }

    updateContactButton() {
        const contactBtn = document.getElementById('contactSellerBtn');
        const shareBtn = document.getElementById('shareArticleBtn');
        
        if (!contactBtn) return;

        const isOwnArticle = this.currentUserId && this.article.user_id === this.currentUserId;
        const isLoggedIn = this.currentUserId !== null;
        const isSold = this.article.is_sold;

        if (isOwnArticle) {
            // Owner sees delete button
            contactBtn.textContent = '🗑️ Delete Article';
            contactBtn.title = 'Delete this article';
            contactBtn.className = 'btn-primary btn-delete';
            contactBtn.disabled = false;
            contactBtn.dataset.action = 'delete';
            
            // Change share button to toggle sold status
            if (shareBtn) {
                shareBtn.textContent = isSold ? '✅ Mark Available' : '💰 Mark as Sold';
                shareBtn.title = isSold ? 'Mark this item as available' : 'Mark this item as sold';
                shareBtn.dataset.action = 'toggle-sold';
            }
        } else if (!isLoggedIn) {
            contactBtn.disabled = true;
            contactBtn.textContent = '🔒 Login to Contact';
            contactBtn.title = 'Please log in to contact the seller';
            contactBtn.dataset.action = 'login-required';
        } else if (isSold) {
            contactBtn.disabled = true;
            contactBtn.textContent = '❌ Item Sold';
            contactBtn.title = 'This item has been sold';
            contactBtn.dataset.action = 'item-sold';
        } else {
            contactBtn.disabled = false;
            contactBtn.textContent = '💬 Chat with Seller';
            contactBtn.title = 'Start a chat with the seller';
            contactBtn.dataset.action = 'chat';
        }
    }

    handleContactButtonClick() {
        const contactBtn = document.getElementById('contactSellerBtn');
        const action = contactBtn?.dataset.action;

        switch (action) {
            case 'delete':
                this.deleteArticle();
                break;
            case 'chat':
                this.openChat();
                break;
            case 'login-required':
                alert('Please log in to contact the seller.');
                break;
            case 'item-sold':
                alert('This item has been sold.');
                break;
            default:
                console.log('Unknown action:', action);
        }
    }

    handleShareButtonClick() {
        const shareBtn = document.getElementById('shareArticleBtn');
        const action = shareBtn?.dataset.action;

        if (action === 'toggle-sold') {
            this.toggleSoldStatus();
        } else {
            this.showShareModal();
        }
    }

    async deleteArticle() {
        const title = this.article.book_info?.title || 
                     this.article.dvd_info?.title || 
                     this.article.cd_info?.author || 
                     this.article.item_info?.title || 
                     this.article.item_info?.author || 
                     'this article';
                     
        if (!confirm(`Are you sure you want to delete "${title}"?\n\nThis action cannot be undone and will also delete all related chat messages.`)) {
            return;
        }

        try {
            console.log(`Attempting to delete article ${this.articleId}`);
            
            const response = await fetch(`http://localhost:8000/api/articles/${this.articleId}`, {
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

            console.log('Article deleted successfully');
            alert('Article deleted successfully!');
            
            // Redirect to marketplace instead of my-articles
            window.location.href = 'marketplace.html';

        } catch (error) {
            console.error('Error deleting article:', error);
            alert(`Failed to delete article: ${error.message}`);
        }
    }

    async toggleSoldStatus() {
        try {
            const response = await fetch(`http://localhost:8000/api/articles/${this.articleId}/sold`, {
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
            this.article.is_sold = data.article.is_sold;
            
            // Refresh the display
            this.displayArticleDetails();
            
            const status = data.article.is_sold ? 'sold' : 'available';
            alert(`Article marked as ${status}!`);

        } catch (error) {
            console.error('Error updating article status:', error);
            alert('Failed to update article status. Please try again.');
        }
    }

    openChat() {
        if (!this.currentUserId) {
            alert('Please log in to contact the seller.');
            return;
        }

        if (this.article.is_sold) {
            alert('This item has been sold.');
            return;
        }

        if (this.article.user_id === this.currentUserId) {
            alert('You cannot chat with yourself about your own item.');
            return;
        }

        // Navigate to chat page
        const chatUrl = `chat.html?user=${encodeURIComponent(this.article.seller_username)}&articleId=${this.articleId}`;
        window.location.href = chatUrl;
    }

    displayArticleDetailsGrid(itemInfo) {
        const detailsContent = document.getElementById('articleDetailsContent');
        if (!detailsContent || !itemInfo) return;

        const details = [];

        if (itemInfo.genre) {
            details.push(['Genre', itemInfo.genre.charAt(0).toUpperCase() + itemInfo.genre.slice(1)]);
        }
        if (itemInfo.publication_date) {
            details.push(['Publication Date', this.formatDate(itemInfo.publication_date)]);
        }

        switch (this.article.item_type) {
            case 'book':
                if (itemInfo.author) details.push(['Author', itemInfo.author]);
                if (itemInfo.title) details.push(['Title', itemInfo.title]);
                break;
            case 'dvd':
                if (itemInfo.director) details.push(['Director', itemInfo.director]);
                if (itemInfo.title) details.push(['Title', itemInfo.title]);
                break;
            case 'cd':
                if (itemInfo.author) details.push(['Artist', itemInfo.author]);
                break;
        }

        detailsContent.innerHTML = details.map(([label, value]) => `
            <div class="detail-item">
                <span class="detail-label">${label}:</span>
                <span class="detail-value">${value}</span>
            </div>
        `).join('');
    }

    displaySellerInfo() {
        const sellerUsername = document.getElementById('sellerUsername');
        const sellerInitial = document.getElementById('sellerInitial');
        const sellerJoinDate = document.getElementById('sellerJoinDate');

        if (sellerUsername) {
            sellerUsername.textContent = this.article.seller_username;
        }
        if (sellerInitial) {
            sellerInitial.textContent = this.article.seller_username.charAt(0).toUpperCase();
        }
        if (sellerJoinDate) {
            sellerJoinDate.textContent = this.formatDate(this.article.created_at);
        }
    }

    displayArticleMetadata() {
        const articleDate = document.getElementById('articleDate');
        const articleUpdated = document.getElementById('articleUpdated');
        const articleIdElement = document.getElementById('articleId');

        if (articleDate) {
            articleDate.textContent = this.formatDate(this.article.created_at);
        }
        if (articleUpdated) {
            articleUpdated.textContent = this.formatDate(this.article.updated_at);
        }
        if (articleIdElement) {
            articleIdElement.textContent = this.article.id;
        }
    }

    getSubtitle(article, itemInfo) {
        switch (article.item_type) {
            case 'book':
                return `by ${itemInfo?.author || 'Unknown Author'}`;
            case 'dvd':
                return `directed by ${itemInfo?.director || 'Unknown Director'}`;
            case 'cd':
                return `by ${itemInfo?.author || 'Unknown Artist'}`;
            default:
                return '';
        }
    }

    getItemTypeEmoji(itemType) {
        switch (itemType) {
            case 'book': return '📚';
            case 'dvd': return '🎬';
            case 'cd': return '💿';
            default: return '📦';
        }
    }

    getDefaultImage(itemType) {
        switch (itemType) {
            case 'book':
                return 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600" viewBox="0 0 400 600"><rect width="400" height="600" fill="%23f0f0f0"/><text x="200" y="300" text-anchor="middle" font-family="Arial, sans-serif" font-size="48" fill="%23666">📚</text></svg>';
            case 'dvd':
                return 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600" viewBox="0 0 400 600"><rect width="400" height="600" fill="%23f0f0f0"/><text x="200" y="300" text-anchor="middle" font-family="Arial, sans-serif" font-size="48" fill="%23666">🎬</text></svg>';
            case 'cd':
                return 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600" viewBox="0 0 400 600"><rect width="400" height="600" fill="%23f0f0f0"/><text x="200" y="300" text-anchor="middle" font-family="Arial, sans-serif" font-size="48" fill="%23666">💿</text></svg>';
            default:
                return 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600" viewBox="0 0 400 600"><rect width="400" height="600" fill="%23f0f0f0"/><text x="200" y="300" text-anchor="middle" font-family="Arial, sans-serif" font-size="32" fill="%23666">No Image</text></svg>';
        }
    }

    formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }

    showShareModal() {
        this.showModal('shareModal');
    }

    showModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.style.display = 'flex';
        }
    }

    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.style.display = 'none';
        }
    }

    reportArticle() {
        alert('Report functionality coming soon!\nThis will allow you to report inappropriate content.');
    }

    copyShareUrl() {
        const shareUrl = document.getElementById('shareUrl');
        if (shareUrl) {
            shareUrl.select();
            shareUrl.setSelectionRange(0, 99999);
            document.execCommand('copy');
            
            const copyBtn = document.getElementById('copyUrlBtn');
            if (copyBtn) {
                const originalText = copyBtn.textContent;
                copyBtn.textContent = 'Copied!';
                setTimeout(() => {
                    copyBtn.textContent = originalText;
                }, 2000);
            }
        }
    }

    shareViaEmail() {
        if (!this.article) return;
        
        const itemInfo = this.article.book_info || this.article.dvd_info || this.article.cd_info || this.article.item_info;
        const title = itemInfo?.title || itemInfo?.author || 'Untitled';
        const subject = encodeURIComponent(`Check out this ${this.article.item_type}: ${title}`);
        const body = encodeURIComponent(`I found this interesting ${this.article.item_type} on the marketplace:\n\n${title}\nPrice: $${this.article.price.toFixed(2)}\n\n${window.location.href}`);
        
        window.open(`mailto:?subject=${subject}&body=${body}`);
    }

    shareViaTwitter() {
        if (!this.article) return;
        
        const itemInfo = this.article.book_info || this.article.dvd_info || this.article.cd_info || this.article.item_info;
        const title = itemInfo?.title || itemInfo?.author || 'Untitled';
        const text = encodeURIComponent(`Check out this ${this.article.item_type}: ${title} for $${this.article.price.toFixed(2)}`);
        const url = encodeURIComponent(window.location.href);
        
        window.open(`https://twitter.com/intent/tweet?text=${text}&url=${url}`, '_blank');
    }

    shareViaFacebook() {
        const url = encodeURIComponent(window.location.href);
        window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}`, '_blank');
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

    showArticleDetails() {
        const articleSection = document.getElementById('articleDetailsSection');
        if (articleSection) {
            articleSection.style.display = 'block';
        }
    }

    hideArticleDetails() {
        const articleSection = document.getElementById('articleDetailsSection');
        if (articleSection) {
            articleSection.style.display = 'none';
        }
    }
}

// Initialize the application when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new ArticleDetailsApp();
});