// Updated article.js - Remove picture handling

// In the displayArticleDetails method, replace the image section:

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

    // Replace image section with icon display
    const articleImage = document.getElementById('articleImage');
    if (articleImage) {
        // Clear any existing content and add large emoji icon
        articleImage.parentElement.innerHTML = `
            <div class="article-main-image">
                <div class="item-type-display">
                    <div class="large-icon">${this.getItemTypeEmoji(this.article.item_type)}</div>
                    <div class="item-type-label">${this.article.item_type.toUpperCase()}</div>
                </div>
                ${this.article.is_sold ? '<div class="sold-badge">SOLD</div>' : ''}
            </div>
        `;
    }

    // ... rest of the method stays the same ...

    const typeBadge = document.getElementById('articleTypeBadge');
    if (typeBadge) {
        typeBadge.textContent = this.article.item_type.toUpperCase();
        typeBadge.className = `article-type-badge ${this.article.item_type}`;
    }

    // ... continue with existing code for title, price, description, etc. ...
}

// Add CSS for the new display
const style = document.createElement('style');
style.textContent = `
    .article-main-image {
        position: relative;
        width: 100%;
        height: 400px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        border-radius: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        margin-bottom: 20px;
    }
    
    .item-type-display {
        text-align: center;
        color: white;
    }
    
    .large-icon {
        font-size: 120px;
        margin-bottom: 10px;
        filter: drop-shadow(0 4px 8px rgba(0,0,0,0.3));
    }
    
    .item-type-label {
        font-size: 18px;
        font-weight: bold;
        letter-spacing: 2px;
        opacity: 0.9;
    }
    
    .sold-badge {
        position: absolute;
        top: 20px;
        right: 20px;
        background: #ef4444;
        color: white;
        padding: 8px 16px;
        border-radius: 6px;
        font-weight: bold;
        font-size: 14px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.2);
    }
`;
document.head.appendChild(style);