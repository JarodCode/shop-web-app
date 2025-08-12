// chat.js - Fixed version with proper WebSocket handling

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
                
                console.log(`Current user: ${this.currentUsername} (ID: ${this.currentUserId})`);
                console.log(`Chat with: ${this.otherUsername}${this.articleId ? ` for article: ${this.articleId}` : ''}`);
                
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

    addMessage(messageData) {
        const messagesContainer = document.getElementById('messagesContainer');
        const emptyChat = document.getElementById('emptyChat');
        
        if (emptyChat) {
            emptyChat.style.display = 'none';
        }

        const messageElement = document.createElement('div');
        messageElement.className = `message ${messageData.userId === this.currentUserId ? 'own' : ''}`;

        const isOwn = messageData.userId === this.currentUserId;
        const avatar = isOwn ? this.currentUsername.charAt(0).toUpperCase() : messageData.username.charAt(0).toUpperCase();
        
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

        if (messages.length === 0) {
            if (emptyChat) {
                emptyChat.style.display = 'block';
            }
        } else {
            if (emptyChat) {
                emptyChat.style.display = 'none';
            }
            messages.forEach(message => {
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