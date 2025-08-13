// conversations.js - Updated to show all conversations with users

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
            
            // Get all messages involving the current user
            const response = await fetch(`http://localhost:8000/api/users/${this.currentUserId}/conversations`, {
                credentials: 'include'
            });
            
            if (!response.ok) {
                // If endpoint doesn't exist, fall back to the old method
                await this.loadConversationsOldMethod();
                return;
            }
            
            const data = await response.json();
            this.conversations = data.conversations || [];
            
            // Sort by last message time
            this.conversations.sort((a, b) => new Date(b.lastMessageTime) - new Date(a.lastMessageTime));
            
            this.displayConversations();
            this.hideLoading();
            
        } catch (error) {
            console.error('Error loading conversations:', error);
            // Fall back to old method
            await this.loadConversationsOldMethod();
        }
    }

    async loadConversationsOldMethod() {
        try {
            // Get all articles
            const articlesResponse = await fetch('http://localhost:8000/api/articles');
            if (!articlesResponse.ok) throw new Error('Failed to load articles');
            
            const articlesData = await articlesResponse.json();
            const articles = articlesData.articles;
            
            // Create a map to store conversations by user
            const conversationMap = new Map();
            
            // Process each article
            for (const article of articles) {
                const messages = await this.getArticleMessages(article.id);
                if (!messages || messages.length === 0) continue;
                
                // Group messages by conversation partner
                for (const message of messages) {
                    let otherUser = null;
                    let role = null;
                    
                    // Determine the other user and role
                    if (article.user_id === this.currentUserId) {
                        // Current user is the seller
                        if (message.user_id !== this.currentUserId) {
                            otherUser = {
                                id: message.user_id,
                                username: message.username
                            };
                            role = 'seller';
                        }
                    } else if (message.user_id === this.currentUserId) {
                        // Current user sent a message to this article (as buyer)
                        otherUser = {
                            id: article.user_id,
                            username: article.seller_username
                        };
                        role = 'buyer';
                    }
                    
                    if (otherUser) {
                        const conversationKey = `${otherUser.username}_${article.id}`;
                        
                        if (!conversationMap.has(conversationKey)) {
                            conversationMap.set(conversationKey, {
                                otherUser: otherUser,
                                articleId: article.id,
                                articleTitle: this.getArticleTitle(article),
                                articlePrice: article.price,
                                articleImage: article.picture_url,
                                itemType: article.item_type,
                                role: role,
                                messages: [],
                                lastMessage: null,
                                lastMessageTime: null,
                                unreadCount: 0
                            });
                        }
                        
                        const conv = conversationMap.get(conversationKey);
                        conv.messages.push(message);
                    }
                }
            }
            
            // Process conversations to get last message and unread count
            this.conversations = [];
            for (const [key, conv] of conversationMap) {
                if (conv.messages.length > 0) {
                    // Sort messages by time
                    conv.messages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
                    
                    // Get last message
                    conv.lastMessage = conv.messages[conv.messages.length - 1];
                    conv.lastMessageTime = conv.lastMessage.timestamp;
                    
                    // Count unread messages
                    let lastUserMessageIndex = -1;
                    for (let i = conv.messages.length - 1; i >= 0; i--) {
                        if (conv.messages[i].user_id === this.currentUserId) {
                            lastUserMessageIndex = i;
                            break;
                        }
                    }
                    
                    if (lastUserMessageIndex >= 0) {
                        for (let i = lastUserMessageIndex + 1; i < conv.messages.length; i++) {
                            if (conv.messages[i].user_id !== this.currentUserId) {
                                conv.unreadCount++;
                            }
                        }
                    } else {
                        conv.unreadCount = conv.messages.filter(m => m.user_id !== this.currentUserId).length;
                    }
                    
                    this.conversations.push(conv);
                }
            }
            
            // Sort by last message time
            this.conversations.sort((a, b) => new Date(b.lastMessageTime) - new Date(a.lastMessageTime));
            
            this.displayConversations();
            this.hideLoading();
            
        } catch (error) {
            console.error('Error loading conversations:', error);
            this.showError('Failed to load conversations. Please try again.');
        }
    }

    async getArticleMessages(articleId) {
        try {
            const response = await fetch(`http://localhost:8000/api/articles/${articleId}/messages`, {
                credentials: 'include'
            });
            
            if (!response.ok) return null;
            
            const data = await response.json();
            return data.messages || [];
            
        } catch (error) {
            console.error(`Error getting messages for article ${articleId}:`, error);
            return null;
        }
    }

    getArticleTitle(article) {
        const itemInfo = article.book_info || article.dvd_info || article.cd_info || article.item_info;
        return itemInfo?.title || itemInfo?.author || 'Untitled';
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
        
        // Group conversations by user (combine multiple article conversations with same user)
        const userConversations = new Map();
        
        for (const conv of this.conversations) {
            const userKey = conv.otherUser.username;
            
            if (!userConversations.has(userKey)) {
                userConversations.set(userKey, {
                    otherUser: conv.otherUser,
                    conversations: [],
                    lastMessage: null,
                    lastMessageTime: null,
                    totalUnread: 0
                });
            }
            
            const userConv = userConversations.get(userKey);
            userConv.conversations.push(conv);
            
            // Update last message if this conversation is more recent
            if (!userConv.lastMessageTime || new Date(conv.lastMessageTime) > new Date(userConv.lastMessageTime)) {
                userConv.lastMessage = conv.lastMessage;
                userConv.lastMessageTime = conv.lastMessageTime;
                userConv.lastArticle = {
                    id: conv.articleId,
                    title: conv.articleTitle,
                    price: conv.articlePrice,
                    itemType: conv.itemType,
                    role: conv.role
                };
            }
            
            userConv.totalUnread += conv.unreadCount;
        }
        
        // Convert map to array and sort
        const sortedUserConversations = Array.from(userConversations.values())
            .sort((a, b) => new Date(b.lastMessageTime) - new Date(a.lastMessageTime));
        
        // Display user conversations
        sortedUserConversations.forEach(userConv => {
            const conversationElement = this.createUserConversationElement(userConv);
            conversationsList.appendChild(conversationElement);
        });
    }

    createUserConversationElement(userConv) {
        const element = document.createElement('div');
        element.className = `conversation-item ${userConv.totalUnread > 0 ? 'unread' : ''}`;
        element.addEventListener('click', () => this.openChatWithUser(userConv));
        
        const lastMessageText = userConv.lastMessage.message.length > 50 
            ? userConv.lastMessage.message.substring(0, 50) + '...'
            : userConv.lastMessage.message;
            
        const isLastMessageFromUser = userConv.lastMessage.user_id === this.currentUserId;
        const lastMessagePrefix = isLastMessageFromUser ? 'You: ' : '';
        
        // Show article count if multiple
        const articleCount = userConv.conversations.length;
        const articleInfo = articleCount > 1 
            ? `${articleCount} items` 
            : userConv.lastArticle.title;
            
        const roleInfo = userConv.conversations.map(c => c.role).includes('seller') 
            ? 'Selling' 
            : 'Buying';
        
        element.innerHTML = `
            <div class="conversation-avatar">
                ${userConv.otherUser.username.charAt(0).toUpperCase()}
            </div>
            
            <div class="conversation-content">
                <div class="conversation-header">
                    <div class="conversation-title">
                        <span class="participant-name">${userConv.otherUser.username}</span>
                        <span class="conversation-count">${articleCount > 1 ? `(${articleCount} items)` : ''}</span>
                    </div>
                    <div class="conversation-time">
                        ${this.formatTime(userConv.lastMessageTime)}
                    </div>
                </div>
                
                <div class="conversation-item-info">
                    <span class="item-emoji">${this.getItemEmoji(userConv.lastArticle.itemType)}</span>
                    <div class="item-details">
                        <div class="item-title">${articleInfo}</div>
                        ${userConv.lastArticle ? `<div class="item-price">$${userConv.lastArticle.price.toFixed(2)}</div>` : ''}
                    </div>
                </div>
                
                <div class="conversation-preview">
                    <span class="last-message">${lastMessagePrefix}${lastMessageText}</span>
                    ${userConv.totalUnread > 0 ? `<span class="unread-badge">${userConv.totalUnread}</span>` : ''}
                </div>
            </div>
        `;
        
        return element;
    }

    openChatWithUser(userConv) {
        // Open chat with the most recent article conversation
        // Or you could show a list of articles to choose from if multiple
        if (userConv.conversations.length === 1) {
            // Single article conversation - open directly
            const conv = userConv.conversations[0];
            const chatUrl = `chat.html?user=${encodeURIComponent(userConv.otherUser.username)}&articleId=${conv.articleId}`;
            window.location.href = chatUrl;
        } else {
            // Multiple articles - open with the most recent one
            // You could enhance this to show a selection dialog
            const mostRecent = userConv.conversations.reduce((a, b) => 
                new Date(a.lastMessageTime) > new Date(b.lastMessageTime) ? a : b
            );
            const chatUrl = `chat.html?user=${encodeURIComponent(userConv.otherUser.username)}&articleId=${mostRecent.articleId}`;
            window.location.href = chatUrl;
        }
    }

    getItemEmoji(itemType) {
        const emojis = {
            book: '📚',
            dvd: '🎬',
            cd: '💿'
        };
        return emojis[itemType] || '📦';
    }

    formatTime(timestamp) {
        const date = new Date(timestamp);
        const now = new Date();
        const diffMs = now - date;
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        
        if (diffDays === 0) {
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } else if (diffDays === 1) {
            return 'Yesterday';
        } else if (diffDays < 7) {
            return date.toLocaleDateString([], { weekday: 'short' });
        } else {
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