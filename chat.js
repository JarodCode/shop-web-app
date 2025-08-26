class ChatApp {
    constructor() {
        this.ws = null;
        this.otherUserId = null;
        this.otherUsername = null;
        this.currentUserId = null;
        this.currentUsername = null;
        this.articleId = null;
        this.chatRoomId = null;
        
        this.init();
    }

    init() {
        this.getParametersFromUrl();
        this.setupEventListeners();
        this.getCurrentUser();
    }

    // Extrait les paramètres de l'URL pour déterminer avec qui communiquer et à propos de quoi
    getParametersFromUrl() {
        const urlParams = new URLSearchParams(window.location.search);
        this.otherUsername = urlParams.get('user');
        this.articleId = urlParams.get('articleId');
        
        // Vérifie que l'utilisateur cible est spécifié, sinon impossible de chatter
        if (!this.otherUsername) {
            alert('Paramètres de chat invalides - utilisateur manquant. Veuillez retourner à la marketplace et réessayer.');
            this.goBack();
        }
    }

    // Gère l'envoi de messages, la saisie et la navigation
    setupEventListeners() {
        const messageInput = document.getElementById('messageInput');
        const sendButton = document.getElementById('sendButton');
        const backButton = document.getElementById('backButton');

        sendButton.addEventListener('click', () => this.sendMessage());

        // Permet d'envoyer un message avec Entrée (mais pas Shift+Entrée pour les sauts de ligne)
        messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        // Gère le redimensionnement automatique de la zone de texte et du boutton d'envoi
        messageInput.addEventListener('input', (e) => {
            this.autoResizeTextarea(e.target);
            this.toggleSendButton();
        });

        backButton.addEventListener('click', () => this.goBack());

        // Ferme proprement la connexion WebSocket quand l'utilisateur quitte la page
        window.addEventListener('beforeunload', () => {
            if (this.ws) {
                this.ws.close();
            }
        });
    }

    // Vérifie l'authentification de l'utilisateur et récupère ses informations
    // Nécessaire pour déterminer la propriété des messages et s'authentifier au WebSocket
    async getCurrentUser() {
        try {
            const response = await fetch('https://localhost:8000/test_cookie', {
                credentials: 'include'
            });

            if (response.ok) {
                const data = await response.json();
                this.currentUserId = data.token_data.userId;
                this.currentUsername = data.token_data.username;
                
                // Récupère les informations de l'interlocuteur pour comparer les messages
                await this.getOtherUserInfo();
                
                this.displayChatInfo();
                this.connectWebSocket();
            } else {
                alert('Vous devez être connecté pour utiliser le chat');
                this.goBack();
            }
        } catch (error) {
            console.error('Erreur lors de la récupération de l\'utilisateur actuel:', error);
            alert('Erreur de connexion au chat. Veuillez réessayer.');
            this.goBack();
        }
    }

    // Détermine l'ID  de l'interlocuteur
    // Permet d'identifier correctement qui a envoyé chaque message
    async getOtherUserInfo() {
        try {
            if (this.articleId) {
                const response = await fetch(`https://localhost:8000/api/articles`, {
                    credentials: 'include'
                });
                
                if (response.ok) {
                    const data = await response.json();
                    const article = data.articles.find(a => a.id == this.articleId);
                    
                    if (article) {
                        // Si l'utilisateur actuel est le vendeur, l'autre est un acheteur
                        // Si l'utilisateur actuel n'est pas le vendeur, l'autre est le vendeur
                        if (article.user_id !== this.currentUserId) {
                            this.otherUserId = article.user_id;
                        }
                    }
                }
            }
            
        } catch (error) {
            console.error('Erreur lors de la récupération des infos de l\'autre utilisateur:', error);
            // Continue quand même, on déterminera l'ID depuis les messages
        }
    }

    // Met à jour l'interface avec les informations de l'interlocuteur
    // Affiche le nom, l'avatar et le contexte du chat
    displayChatInfo() {
        document.getElementById('chatPartnerName').textContent = this.otherUsername;
        document.getElementById('chatPartnerAvatar').textContent = this.otherUsername.charAt(0).toUpperCase();
    }

    // Établit la connexion WebSocket avec le serveur de chat
    // Détermine la salle de chat et gère la reconnexion automatique
    connectWebSocket() {
    try {
        // Détermine l'ID de la salle de chat selon le contexte
        if (this.articleId) {
            // Chat basé sur un article - utilise l'ID de l'article comme salle
            this.chatRoomId = this.articleId;
        } else {
            // Chat direct - crée un ID de salle cohérent basé sur les noms d'utilisateur
            const userIds = [this.currentUsername, this.otherUsername].sort();
            this.chatRoomId = `direct_${userIds.join('_')}`;
        }
        
        // 🔧 CORRECTION : Utiliser wss:// pour HTTPS ou ws:// pour HTTP
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//localhost:8000/ws/chat/${this.chatRoomId}?userId=${this.currentUserId}`;

        this.ws = new WebSocket(wsUrl);
        this.updateConnectionStatus('connecting');

        // Événement déclenché quand la connexion WebSocket s'établit
        this.ws.onopen = () => {
            this.updateConnectionStatus('connected');
            
            // Envoie un message de connexion pour rejoindre la salle
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

        // Traite tous les messages reçus du serveur WebSocket
        this.ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            this.handleWebSocketMessage(data);
        };

        // Gère la déconnexion et tente une reconnexion automatique si nécessaire
        this.ws.onclose = (event) => {
            this.updateConnectionStatus('disconnected');
            
            // Reconnexion automatique sauf si la fermeture est intentionnelle
            if (event.code !== 1000 && event.code !== 1001) {
                setTimeout(() => {
                    if (!this.ws || this.ws.readyState === WebSocket.CLOSED) {
                        this.connectWebSocket();
                    }
                }, 3000);
            }
        };

        this.ws.onerror = (error) => {
            console.error('Erreur WebSocket:', error);
            this.updateConnectionStatus('disconnected');
        };

    } catch (error) {
        console.error('Erreur de connexion au WebSocket:', error);
        this.updateConnectionStatus('disconnected');
    }
}

    // Distribue les messages WebSocket selon leur type vers les bonnes fonctions
    handleWebSocketMessage(data) {
        
        switch (data.type) {
            case 'message':
                this.addMessage(data);
                break;
            case 'user_joined':
                if (data.username !== this.currentUsername) {
                    this.showSystemMessage(`${data.username} a rejoint le chat`);
                }
                break;
            case 'user_left':
                if (data.username !== this.currentUsername) {
                    this.showSystemMessage(`${data.username} a quitté le chat`);
                }
                break;
            case 'history':
                this.loadMessageHistory(data.messages);
                break;
            case 'error':
                console.error('Erreur de chat:', data.message);
                alert('Erreur de chat: ' + data.message);
                break;
            case 'connected':
            case 'joined':
                break;
            default:
        }
    }

    // Envoie un message au serveur WebSocket avec vérification de l'état de connexion
    // Retourne true si l'envoi a réussi, false sinon
    sendWebSocketMessage(data) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(data));
            return true;
        } else {
            return false;
        }
    }

    // Traite l'envoi d'un nouveau message depuis l'interface utilisateur
    // Valide le contenu et l'envoie via WebSocket
    sendMessage() {
        const messageInput = document.getElementById('messageInput');
        const message = messageInput.value.trim();

        if (!message) {
            return;
        }

        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            alert('Non connecté au serveur de chat. Veuillez patienter...');
            return;
        }

        // Construit l'objet message avec toutes les métadonnées nécessaires
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

        // Nettoie l'interface après envoi réussi
        if (success) {
            messageInput.value = '';
            this.autoResizeTextarea(messageInput);
            this.toggleSendButton();
        }
    }

    // Affichage d'un nouveau message
    // Détermine de qui provient le message
    addMessage(messageData) {
        const messagesContainer = document.getElementById('messagesContainer');
        const emptyChat = document.getElementById('emptyChat');
        
        if (emptyChat) {
            emptyChat.style.display = 'none';
        }

        const messageElement = document.createElement('div');
        
        // Détermine si le message vient de l'utilisateur actuel (plusieurs méthodes de vérification)
        let isOwn = false;
        
        if (messageData.userId !== undefined && this.currentUserId !== undefined) {
            isOwn = messageData.userId === this.currentUserId;
        }
        else if (messageData.user_id !== undefined && this.currentUserId !== undefined) {
            isOwn = messageData.user_id === this.currentUserId;
        }
        
        // Si on n'a toujours pas l'ID de l'autre utilisateur, on l'extrait de ce message
        if (!this.otherUserId && !isOwn) {
            if (messageData.userId) {
                this.otherUserId = messageData.userId;
            } else if (messageData.user_id) {
                this.otherUserId = messageData.user_id;
            }
        }
        
        // Applique la classe CSS appropriée pour l'alignement (droite pour ses messages, gauche pour les autres)
        messageElement.className = `message ${isOwn ? 'own' : ''}`;

        // Récupère le nom d'utilisateur et crée un avatar avec l'initial
        const senderUsername = messageData.username || 'Inconnu';
        const avatar = senderUsername.charAt(0).toUpperCase();
        
        
        // Construit le HTML du message avec avatar, contenu et horodatage
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

    // Affiche un message système (connexion, déconnexion, etc.) avec un style différent
    showSystemMessage(text) {
        const messagesContainer = document.getElementById('messagesContainer');
        const messageElement = document.createElement('div');
        messageElement.className = 'system-message';
        messageElement.innerHTML = `<div class="system-text">${this.escapeHtml(text)}</div>`;
        messagesContainer.appendChild(messageElement);
        this.scrollToBottom();
    }

    // Charge et affiche l'historique des messages depuis la base de données
    // Appelé automatiquement quand on rejoint une salle de chat
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
            
            // Traite chaque message historique avec détection de propriété
            messages.forEach((message, index) => {
                this.addMessage(message);
            });
        }
    }

    // Met à jour l'indicateur visuel de l'état de connexion WebSocket
    // Active/désactive le bouton d'envoi selon l'état
    updateConnectionStatus(status) {
        const statusElement = document.getElementById('connectionStatus');
        const sendButton = document.getElementById('sendButton');
        
        statusElement.className = `connection-status ${status}`;
        
        switch (status) {
            case 'connected':
                statusElement.textContent = 'Connecté';
                statusElement.style.display = 'none';
                this.toggleSendButton();
                break;
            case 'connecting':
                statusElement.textContent = 'Connexion...';
                statusElement.style.display = 'block';
                sendButton.disabled = true;
                break;
            case 'disconnected':
                statusElement.textContent = 'Déconnecté - Reconnexion...';
                statusElement.style.display = 'block';
                sendButton.disabled = true;
                break;
        }
    }

    // Redimensionne automatiquement la zone de texte selon son contenu
    autoResizeTextarea(textarea) {
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
    }

    // Active/désactive le bouton d'envoi selon le contenu de la zone de texte
    toggleSendButton() {
        const messageInput = document.getElementById('messageInput');
        const sendButton = document.getElementById('sendButton');
        const hasText = messageInput.value.trim().length > 0;
        const isConnected = this.ws && this.ws.readyState === WebSocket.OPEN;
        
        sendButton.disabled = !hasText || !isConnected;
    }

    // Force le défilement vers le bas pour voir les nouveaux messages
    // Appelé après chaque ajout de message
    scrollToBottom() {
        const messagesContainer = document.getElementById('messagesContainer');
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    // Transforme ISO en date lisible
    formatTime(timestamp) {
        const date = new Date(timestamp);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    // Traite le texte comme du texte pur, pas du HTML, pour éviter les attaques XSS dans les messages
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Gère la navigation de retour selon le contexte d'arrivée
    // Retourne à l'article ou à la liste des conversations
    goBack() {
        if (document.referrer && document.referrer.includes('article.html')) {
            window.history.back();  // Retour à l'article
        } else {
            window.location.href = 'conversations.html';
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new ChatApp();
});