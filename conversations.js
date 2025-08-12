// conversations.js - Conversations list functionality

class ConversationsApp {
    constructor() {
        this.currentUserId = null;
        this.currentUsername = null;
        this.conversations = [];
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.getCurrentUser();
    }

    setupEventListeners() {
        const backButton = document.getElementById('backButton');
        const retryBtn = document.getElementById('retryBtn');

        backButton.addEventListener('click', () => this.goBack());
        retryBtn.addEventListener('click', () => this.loadConversations());
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
                
                await this.loadConversations();
            } else {
                // User not authenticated
                alert('You must be logged in to view conversations');
                window.location.href = 'login.html';
            }
        } catch (error) {
            console.error('Error getting current user:', error);
            this.showError('Error connecting to server. Please try again.');
        }
    }

    async loadConversations() {
        try {
            this.showLoading();
            
            // Get all articles to build conversation list
            const articlesResponse = await fetch('http://localhost:8000/api/articles');
            if (!articlesResponse.ok) throw new Error('Failed to load articles');
            
            const articlesData = await articlesResponse.json();
            const articles = articlesData.articles;
            
            // Get conversations for each article the user is involved in
            const conversationPromises = [];
            const userArticles = articles.filter(article => article.user_id === this.currentUserId);
            
            // For articles owned by current user, check if there are any messages
            for (const article of userArticles) {
                conversationPromises.push(this.getArticleConversation(article, 'seller'));
            }
            
            // For articles not owned by current user, check if current user has sent messages
            const otherArticles = articles.filter(article => article.user_id !== this.currentUserId);
            for (const article of otherArticles) {
                conversationPromises.push(this.getArticleConversation(article, 'buyer'));
            }
            
            const conversationResults = await Promise.all(conversationPromises);
            this.conversations = conversationResults.filter(conv => conv !== null);
            
            // Sort conversations by last message time
            this.conversations.sort((a, b) => new Date(b.lastMessageTime) - new Date(a.lastMessageTime));
            
            this.displayConversations();
            this.hideLoading();
            
        } catch (error) {
            console.error('Error loading conversations:', error);
            this.showError('Failed to load conversations. Please try again.');
        }
    }

    async getArticleConversation(article, role) {
        try {
            const response = await fetch(`http://localhost:8000/api/articles/${article.id}/messages`, {
                credentials: 'include'
            });
            
            if (!response.ok) return null;
            
            const data = await response.json();
            const messages = data.messages || [];
            
            // If no messages, return null
            if (messages.length === 0) return null;
            
            // If user is seller, check if there are messages from other users
            // If user is buyer, check if user has sent messages
            let hasUserMessages = false;
            let otherParticipants = new Set();
            
            for (const message of messages) {
                if (role === 'seller' && message.user_id !== this.currentUserId) {
                    hasUserMessages = true;
                    otherParticipants.add(message.username);
                } else if (role === 'buyer' && message.user_id === this.currentUserId) {
                    hasUserMessages = true;
                }
                
                if (message.user_id !== this.currentUserId) {
                    otherParticipants.add(message.username);
                }
            }
            
            if (!hasUserMessages) return null;
            
            const lastMessage = messages[messages.length - 1];
            const itemInfo = article.book_info || article.dvd_info || article.cd_info || article.item_info;
            const title = itemInfo?.title || itemInfo?.author || 'Untitled';
            
            // Count unread messages (messages from others after user's last message)
            let unreadCount = 0;
            let userLastMessageIndex = -1;
            
            // Find user's last message
            for (let i = messages.length - 1; i >= 0; i--) {
                if (messages[i].user_id === this.currentUserId) {
                    userLastMessageIndex = i;
                    break;
                }
            }
            
            // Count messages from others after user's last message
            if (userLastMessageIndex >= 0) {
                for (let i = userLastMessageIndex + 1; i < messages.length; i++) {
                    if (messages[i].user_id !== this.currentUserId) {
                        unreadCount++;
                    }
                }
            } else {
                // User hasn't sent any messages, count all messages from others
                unreadCount = messages.filter(m => m.user_id !== this.currentUserId).length;
            }
            
            return {
                articleId: article.id,
                articleTitle: title,
                articlePrice: article.price,
                articleImage: article.picture_url,
                itemType: article.item_type,
                role: role, // 'seller' or 'buyer'
                otherParticipants: Array.from(otherParticipants),
                lastMessage: lastMessage,
                lastMessageTime: lastMessage.timestamp,
                messageCount: messages.length,
                unreadCount: unreadCount,
                sellerId: article.user_id,
                sellerUsername: article.seller_username
            };
            
        } catch (error) {
            console.error(`Error getting conversation for article ${article.id}:`, error);
            return null;
        }
    }

    displayConversations() {
        const conversationsList = document.getElementById('conversationsList');
        const emptyConversations = document.getElementById('emptyConversations');
        const conversationCount = document.getElementById('conversationCount');
        
        if (this.conversations.length === 0) {
            conversationsList.style.display = 'none';
            emptyConversations.style.display = 'block';
            conversationCount.textContent = '0 conversations';
            return;
        }
        
        conversationsList.style.display = 'block';
        emptyConversations.style.display = 'none';
        conversationCount.textContent = `${this.conversations.length} conversation${this.conversations.length !== 1 ? 's' : ''}`;
        
        conversationsList.innerHTML = '';
        
        this.conversations.forEach(conversation => {
            const conversationElement = this.createConversationElement(conversation);
            conversationsList.appendChild(conversationElement);
        });
    }

    createConversationElement(conversation) {
        const element = document.createElement('div');
        element.className = `conversation-item ${conversation.unreadCount > 0 ? 'unread' : ''}`;
        element.addEventListener('click', () => this.openChat(conversation));
        
        const otherParticipantsText = conversation.role === 'seller' 
            ? (conversation.otherParticipants.length > 0 ? conversation.otherParticipants[0] : 'Unknown User')
            : conversation.sellerUsername;
            
        const roleLabel = conversation.role === 'seller' ? 'Selling to' : 'Buying from';
        
        const lastMessageText = conversation.lastMessage.message.length > 50 
            ? conversation.lastMessage.message.substring(0, 50) + '...'
            : conversation.lastMessage.message;
            
        const isLastMessageFromUser = conversation.lastMessage.user_id === this.currentUserId;
        const lastMessagePrefix = isLastMessageFromUser ? 'You: ' : '';
        
        element.innerHTML = `
            <div class="conversation-avatar">
                ${otherParticipantsText.charAt(0).toUpperCase()}
            </div>
            
            <div class="conversation-content">
                <div class="conversation-header">
                    <div class="conversation-title">
                        <span class="participant-name">${otherParticipantsText}</span>
                        <span class="role-badge">${roleLabel}</span>
                    </div>
                    <div class="conversation-time">
                        ${this.formatTime(conversation.lastMessageTime)}
                    </div>
                </div>
                
                <div class="conversation-item-info">
                    <img src="${this.getItemImage(conversation)}" alt="Item" class="conversation-item-image">
                    <div class="item-details">
                        <div class="item-title">${conversation.articleTitle}</div>
                        <div class="item-price">$${conversation.articlePrice.toFixed(2)}</div>
                    </div>
                </div>
                
                <div class="conversation-preview">
                    <span class="last-message">${lastMessagePrefix}${lastMessageText}</span>
                    ${conversation.unreadCount > 0 ? `<span class="unread-badge">${conversation.unreadCount}</span>` : ''}
                </div>
            </div>
        `;
        
        return element;
    }

    getItemImage(conversation) {
        if (conversation.articleImage) {
            return conversation.articleImage;
        }
        
        const emojis = {
            book: '📚',
            dvd: '🎬',
            cd: '💿'
        };
        const emoji = emojis[conversation.itemType] || '📦';
        return `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40"><rect width="40" height="40" fill="%23f0f0f0"/><text x="20" y="25" text-anchor="middle" font-family="Arial, sans-serif" font-size="16" fill="%23666">${emoji}</text></svg>`;
    }

    openChat(conversation) {
        // Navigate to chat page with appropriate parameters
        const chatUrl = `chat.html?article=${conversation.articleId}&seller=${conversation.sellerId}`;
        window.location.href = chatUrl;
    }

    formatTime(timestamp) {
        const date = new Date(timestamp);
        const now = new Date();
        const diffMs = now - date;
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        
        if (diffDays === 0) {
            // Today - show time
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } else if (diffDays === 1) {
            // Yesterday
            return 'Yesterday';
        } else if (diffDays < 7) {
            // This week - show day
            return date.toLocaleDateString([], { weekday: 'short' });
        } else {
            // Older - show date
            return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
        }
    }

    showLoading() {
        document.getElementById('loadingOverlay').style.display = 'flex';
        document.getElementById('errorMessage').style.display = 'none';
        document.getElementById('conversationsList').style.display = 'none';
        document.getElementById('emptyConversations').style.display = 'none';
    }

    hideLoading() {
        document.getElementById('loadingOverlay').style.display = 'none';
    }

    showError(message) {
        this.hideLoading();
        document.getElementById('errorText').textContent = message;
        document.getElementById('errorMessage').style.display = 'block';
        document.getElementById('conversationsList').style.display = 'none';
        document.getElementById('emptyConversations').style.display = 'none';
    }

    goBack() {
        window.location.href = 'profile.html';
    }
}

// Initialize the conversations app when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new ConversationsApp();
});