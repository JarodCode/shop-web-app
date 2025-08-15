// chat.js - Fixed version with proper message ownership handling

class ChatApp {
    constructor() {
        this.ws = null;
        this.otherUserId = null;
        this.otherUsername = null;
        this.currentUserId = null;
        this.currentUsername = null;
        this.articleId = null;
        this.messages = [];
        this.typingTimeout = null;
        this.isTyping = false;
        this.chatRoomId = null;
        
        this.init();
    }

    init() {
        this.getParametersFromUrl();
        this.setupEventListeners();
        this.getCurrentUser();
    }

    getParametersFromUrl() {
        const urlParams = new URLSearchParams(window.location.search);
        this.otherUsername = urlParams.get('user');
        this.articleId = urlParams.get('articleId');
        
        console.log('URL parameters:', {
            user: this.otherUsername,
            articleId: this.articleId
        });
        
        if (!this.otherUsername) {
            alert('Invalid chat parameters - missing user. Please return to the marketplace and try again.');
            this.goBack();
        }
    }

    setupEventListeners() {
        const messageInput = document.getElementById('messageInput');
        const sendButton = document.getElementById('sendButton');
        const backButton = document.getElementById('backButton');

        sendButton.addEventListener('click', () => this.sendMessage());

        messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        messageInput.addEventListener('input', (e) => {
            this.autoResizeTextarea(e.target);
            this.toggleSendButton();
            this.handleTyping();
        });

        backButton.addEventListener('click', () => this.goBack());

        window.addEventListener('beforeunload', () => {
            if (this.ws) {
                this.ws.close();
            }
        });
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
                
                console.log(`✅ Current user identified: ${this.currentUsername} (ID: ${this.currentUserId})`);
                console.log(`📞 Chat with: ${this.otherUsername}${this.articleId ? ` for article: ${this.articleId}` : ''}`);
                
                // ✅ FIXED: Get other user's ID for proper message comparison
                await this.getOtherUserInfo();
                
                this.displayChatInfo();
                this.connectWebSocket();
            } else {
                alert('You must be logged in to use chat');
                this.goBack();
            }
        } catch (error) {
            console.error('Error getting current user:', error);
            alert('Error connecting to chat. Please try again.');
            this.goBack();
        }
    }

    // ✅ NEW: Get the other user's information for proper message comparison
    async getOtherUserInfo() {
        try {
            // We don't have a direct endpoint to get user by username, 
            // but we can infer it from the article if available
            if (this.articleId) {
                console.log(`🔍 Getting article info to determine other user ID...`);
                const response = await fetch(`http://localhost:8000/api/articles`, {
                    credentials: 'include'
                });
                
                if (response.ok) {
                    const data = await response.json();
                    const article = data.articles.find(a => a.id == this.articleId);
                    
                    if (article) {
                        // If current user is the seller, other user is a buyer (we'll get their ID from messages)
                        // If current user is not the seller, other user is the seller
                        if (article.user_id === this.currentUserId) {
                            console.log(`📊 Current user is the seller of article ${this.articleId}`);
                            // We'll determine buyer ID from messages when they arrive
                        } else {
                            this.otherUserId = article.user_id;
                            console.log(`📊 Other user (seller) ID: ${this.otherUserId}`);
                        }
                    }
                }
            }
            
            console.log(`📊 Chat participants: Current=${this.currentUsername}(${this.currentUserId}), Other=${this.otherUsername}(${this.otherUserId || 'TBD'})`);
        } catch (error) {
            console.error('Error getting other user info:', error);
            // Continue anyway, we'll determine it from messages
        }
    }

    displayChatInfo() {
        document.getElementById('chatPartnerName').textContent = this.otherUsername;
        document.getElementById('chatPartnerAvatar').textContent = this.otherUsername.charAt(0).toUpperCase();
        
        const subtitle = this.articleId 
            ? `Chat about Article #${this.articleId}` 
            : `Direct chat with ${this.otherUsername}`;
        document.getElementById('chatSubtitle').textContent = subtitle;
    }

    connectWebSocket() {
        try {
            // Determine chat room ID
            if (this.articleId) {
                // Article-based chat - use article ID as room
                this.chatRoomId = this.articleId;
            } else {
                // Direct chat - create consistent room ID
                const userIds = [this.currentUsername, this.otherUsername].sort();
                this.chatRoomId = `direct_${userIds.join('_')}`;
            }
            
            const wsUrl = `ws://localhost:8000/ws/chat/${this.chatRoomId}?userId=${this.currentUserId}`;
            console.log('Connecting to WebSocket:', wsUrl);
            
            this.ws = new WebSocket(wsUrl);
            this.updateConnectionStatus('connecting');

            this.ws.onopen = () => {
                this.updateConnectionStatus('connected');
                console.log('Connected to chat server');
                
                // Send join message
                const joinMessage = {
                    type: 'join',
                    userId: this.currentUserId,
                    username: this.currentUsername,
                    targetUser: this.otherUsername,
                    chatRoomId: this.chatRoomId
                };
                
                if (this.articleId) {
                    joinMessage.articleId = parseInt(this.articleId);
                }
                
                this.sendWebSocketMessage(joinMessage);
            };

            this.ws.onmessage = (event) => {
                const data = JSON.parse(event.data);
                this.handleWebSocketMessage(data);
            };

            this.ws.onclose = (event) => {
                this.updateConnectionStatus('disconnected');
                console.log('Disconnected from chat server. Code:', event.code, 'Reason:', event.reason);
                
                if (event.code !== 1000 && event.code !== 1001) {
                    setTimeout(() => {
                        if (!this.ws || this.ws.readyState === WebSocket.CLOSED) {
                            console.log('Attempting to reconnect...');
                            this.connectWebSocket();
                        }
                    }, 3000);
                }
            };

            this.ws.onerror = (error) => {
                console.error('WebSocket error:', error);
                this.updateConnectionStatus('disconnected');
            };

        } catch (error) {
            console.error('Error connecting to WebSocket:', error);
            this.updateConnectionStatus('disconnected');
        }
    }

    handleWebSocketMessage(data) {
        console.log('Received message:', data);
        
        switch (data.type) {
            case 'message':
                this.addMessage(data);
                break;
            case 'typing':
                if (data.username !== this.currentUsername) {
                    this.showTypingIndicator(data.username);
                }
                break;
            case 'stop_typing':
                this.hideTypingIndicator();
                break;
            case 'user_joined':
                if (data.username !== this.currentUsername) {
                    console.log(`${data.username} joined the chat`);
                    this.showSystemMessage(`${data.username} joined the chat`);
                }
                break;
            case 'user_left':
                if (data.username !== this.currentUsername) {
                    console.log(`${data.username} left the chat`);
                    this.showSystemMessage(`${data.username} left the chat`);
                }
                break;
            case 'history':
                this.loadMessageHistory(data.messages);
                break;
            case 'error':
                console.error('Chat error:', data.message);
                alert('Chat error: ' + data.message);
                break;
            case 'connected':
            case 'joined':
                console.log('Connection confirmed:', data.message);
                if (data.isDirectChat) {
                    console.log('Connected to direct chat');
                } else {
                    console.log('Connected to article chat');
                }
                break;
            default:
                console.log('Unknown message type:', data.type);
        }
    }

    sendWebSocketMessage(data) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            console.log('Sending message:', data);
            this.ws.send(JSON.stringify(data));
            return true;
        } else {
            console.log('WebSocket not ready. State:', this.ws ? this.ws.readyState : 'null');
            return false;
        }
    }

    sendMessage() {
        const messageInput = document.getElementById('messageInput');
        const message = messageInput.value.trim();

        if (!message) {
            return;
        }

        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            alert('Not connected to chat server. Please wait...');
            return;
        }

        const messageData = {
            type: 'message',
            userId: this.currentUserId,
            username: this.currentUsername,
            targetUser: this.otherUsername,
            message: message,
            timestamp: new Date().toISOString(),
            chatRoomId: this.chatRoomId
        };

        if (this.articleId) {
            messageData.articleId = parseInt(this.articleId);
        }

        const success = this.sendWebSocketMessage(messageData);

        if (success) {
            messageInput.value = '';
            this.autoResizeTextarea(messageInput);
            this.toggleSendButton();
            this.stopTyping();
        }
    }

    // ✅ FIXED: Proper message ownership detection
    addMessage(messageData) {
        const messagesContainer = document.getElementById('messagesContainer');
        const emptyChat = document.getElementById('emptyChat');
        
        if (emptyChat) {
            emptyChat.style.display = 'none';
        }

        const messageElement = document.createElement('div');
        
        // ✅ FIXED: Determine if message is from current user
        let isOwn = false;
        
        // Method 1: Check by userId (most reliable)
        if (messageData.userId !== undefined && this.currentUserId !== undefined) {
            isOwn = messageData.userId === this.currentUserId;
            console.log(`💬 Message ownership by userId: ${messageData.userId} === ${this.currentUserId} = ${isOwn}`);
        }
        // Method 2: Check by user_id (for database messages)
        else if (messageData.user_id !== undefined && this.currentUserId !== undefined) {
            isOwn = messageData.user_id === this.currentUserId;
            console.log(`💬 Message ownership by user_id: ${messageData.user_id} === ${this.currentUserId} = ${isOwn}`);
        }
        // Method 3: Check by username (fallback)
        else if (messageData.username && this.currentUsername) {
            isOwn = messageData.username === this.currentUsername;
            console.log(`💬 Message ownership by username: "${messageData.username}" === "${this.currentUsername}" = ${isOwn}`);
        }
        
        // ✅ FIXED: If we still don't have other user ID, try to determine it from this message
        if (!this.otherUserId && !isOwn) {
            if (messageData.userId) {
                this.otherUserId = messageData.userId;
            } else if (messageData.user_id) {
                this.otherUserId = messageData.user_id;
            }
            console.log(`📊 Determined other user ID from message: ${this.otherUserId}`);
        }
        
        messageElement.className = `message ${isOwn ? 'own' : ''}`;

        // Get the correct username and avatar
        const senderUsername = messageData.username || 'Unknown';
        const avatar = senderUsername.charAt(0).toUpperCase();
        
        console.log(`💬 Adding message: "${messageData.message}" by ${senderUsername} (isOwn: ${isOwn})`);
        
        messageElement.innerHTML = `
            <div class="message-avatar">${avatar}</div>
            <div class="message-content">
                <div class="message-text">${this.escapeHtml(messageData.message)}</div>
                <div class="message-time">${this.formatTime(messageData.timestamp)}</div>
            </div>
        `;

        messagesContainer.appendChild(messageElement);
        this.scrollToBottom();
    }

    showSystemMessage(text) {
        const messagesContainer = document.getElementById('messagesContainer');
        const messageElement = document.createElement('div');
        messageElement.className = 'system-message';
        messageElement.innerHTML = `<div class="system-text">${this.escapeHtml(text)}</div>`;
        messagesContainer.appendChild(messageElement);
        this.scrollToBottom();
    }

    loadMessageHistory(messages) {
        const messagesContainer = document.getElementById('messagesContainer');
        const emptyChat = document.getElementById('emptyChat');

        messagesContainer.innerHTML = '';

        console.log(`📚 Loading message history: ${messages.length} messages`);
        console.log(`👤 Current user: ${this.currentUsername} (ID: ${this.currentUserId})`);

        if (messages.length === 0) {
            if (emptyChat) {
                emptyChat.style.display = 'block';
            }
        } else {
            if (emptyChat) {
                emptyChat.style.display = 'none';
            }
            
            // ✅ FIXED: Process each message with proper ownership detection
            messages.forEach((message, index) => {
                console.log(`📚 Processing history message ${index + 1}: user_id=${message.user_id}, username="${message.username}"`);
                this.addMessage(message);
            });
        }
    }

    handleTyping() {
        if (!this.isTyping) {
            this.isTyping = true;
            
            const typingData = {
                type: 'typing',
                userId: this.currentUserId,
                username: this.currentUsername,
                targetUser: this.otherUsername,
                chatRoomId: this.chatRoomId
            };
            
            if (this.articleId) {
                typingData.articleId = parseInt(this.articleId);
            }
            
            this.sendWebSocketMessage(typingData);
        }

        if (this.typingTimeout) {
            clearTimeout(this.typingTimeout);
        }

        this.typingTimeout = setTimeout(() => {
            this.stopTyping();
        }, 2000);
    }

    stopTyping() {
        if (this.isTyping) {
            this.isTyping = false;
            
            const stopTypingData = {
                type: 'stop_typing',
                userId: this.currentUserId,
                username: this.currentUsername,
                targetUser: this.otherUsername,
                chatRoomId: this.chatRoomId
            };
            
            if (this.articleId) {
                stopTypingData.articleId = parseInt(this.articleId);
            }
            
            this.sendWebSocketMessage(stopTypingData);
        }

        if (this.typingTimeout) {
            clearTimeout(this.typingTimeout);
            this.typingTimeout = null;
        }
    }

    showTypingIndicator(username) {
        const typingIndicator = document.getElementById('typingIndicator');
        const typingUser = document.getElementById('typingUser');
        
        if (username !== this.currentUsername) {
            typingUser.textContent = username;
            typingIndicator.style.display = 'flex';
        }
    }

    hideTypingIndicator() {
        const typingIndicator = document.getElementById('typingIndicator');
        typingIndicator.style.display = 'none';
    }

    updateConnectionStatus(status) {
        const statusElement = document.getElementById('connectionStatus');
        const sendButton = document.getElementById('sendButton');
        
        statusElement.className = `connection-status ${status}`;
        
        switch (status) {
            case 'connected':
                statusElement.textContent = 'Connected';
                statusElement.style.display = 'none';
                this.toggleSendButton();
                break;
            case 'connecting':
                statusElement.textContent = 'Connecting...';
                statusElement.style.display = 'block';
                sendButton.disabled = true;
                break;
            case 'disconnected':
                statusElement.textContent = 'Disconnected - Reconnecting...';
                statusElement.style.display = 'block';
                sendButton.disabled = true;
                break;
        }
    }

    autoResizeTextarea(textarea) {
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
    }

    toggleSendButton() {
        const messageInput = document.getElementById('messageInput');
        const sendButton = document.getElementById('sendButton');
        const hasText = messageInput.value.trim().length > 0;
        const isConnected = this.ws && this.ws.readyState === WebSocket.OPEN;
        
        sendButton.disabled = !hasText || !isConnected;
    }

    scrollToBottom() {
        const messagesContainer = document.getElementById('messagesContainer');
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    formatTime(timestamp) {
        const date = new Date(timestamp);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    goBack() {
        // Go back to previous page or marketplace
        if (document.referrer && document.referrer.includes('article.html')) {
            window.history.back();
        } else {
            window.location.href = 'marketplace.html';
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new ChatApp();
});