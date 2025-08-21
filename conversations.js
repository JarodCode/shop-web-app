class ConversationsApp {
    constructor() {
        this.currentUserId = null;
        this.currentUsername = null;
        // Tableau représentant toutes les conversations
        this.conversations = [];
        
        this.init();
    }
    init() {
        this.setupEventListeners();
        this.getCurrentUser();
    }

    //Configure tous les écouteurs d'événements pour l'interface utilisateur.
    setupEventListeners() {
        const backButton = document.getElementById('backButton');
        const retryBtn = document.getElementById('retryBtn');

        backButton.addEventListener('click', () => this.goBack());
        retryBtn.addEventListener('click', () => this.loadConversations());
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
                
                await this.loadConversations();
            } else {
                // Protection contre l'accès non autorisé - redirection forcée vers l'authentification
                alert('You must be logged in to view conversations');
                window.location.href = 'login.html';
            }
        } catch (error) {
            console.error('Error getting current user:', error);
            this.showError('Error connecting to server. Please try again.');
        }
    }

    // Charge toutes les conversations en déterminant le rôle de l'utilisateurs dans chacun des cas
    async loadConversations() {
        try {
            this.showLoading();
            
            // Utilise les articles comme point d'entrée
            const articlesResponse = await fetch('https://localhost:8000/api/articles');
            if (!articlesResponse.ok) throw new Error('Failed to load articles');
            
            const articlesData = await articlesResponse.json();
            const articles = articlesData.articles;
            
            // Structure de données temporaire pour éviter les doublons et organiser par conversation unique
            // Clé = "nom_utilisateur_id_article", Valeur = objet conversation complet
            const conversationMap = new Map();
            
            // Parcours exhaustif de tous les articles pour identifier ceux où l'utilisateur a participé
            for (const article of articles) {
                const messages = await this.getArticleMessages(article.id);
                if (!messages || messages.length === 0) continue;
                
                // Analyse de chaque message pour déterminer les relations acheteur/vendeur
                for (const message of messages) {
                    let otherUser = null;
                    let role = null;
                    
                    // Logique de détermination du rôle dans la transaction
                    if (article.user_id === this.currentUserId) {
                        // Cas 1: L'utilisateur connecté est propriétaire de l'article (vendeur)
                        if (message.user_id !== this.currentUserId) {
                            otherUser = {
                                id: message.user_id,
                                username: message.username
                            };
                            role = 'seller';
                        }
                    } else if (message.user_id === this.currentUserId) {
                        // Cas 2: L'utilisateur connecté a commenté l'article d'un autre (acheteur)
                        // L'autre utilisateur est nécessairement le vendeur
                        otherUser = {
                            id: article.user_id,
                            username: article.seller_username
                        };
                        role = 'buyer';
                    }
                    
                    if (otherUser) {
                        // Génération d'une clé unique pour éviter la duplication des conversations
                        const conversationKey = `${otherUser.username}_${article.id}`;
                        
                        if (!conversationMap.has(conversationKey)) {
                            // Initialisation d'une nouvelle conversation avec métadonnées complètes
                            // Permet l'affichage riche avec contexte d'article et calculs de messages non lus
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
                            });
                        }
                        
                        // Agrégation de tous les messages dans la conversation correspondante
                        const conv = conversationMap.get(conversationKey);
                        conv.messages.push(message);
                    }
                }
            }
        
            // Transformation de la Map en Array
            this.conversations = [];
            for (const [key, conv] of conversationMap) {
                if (conv.messages.length > 0) {
                    // Tri chronologique nécessaire pour identifier le dernier message
                    conv.messages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
                    
                    // Extraction du message le plus récent 
                    conv.lastMessage = conv.messages[conv.messages.length - 1];
                    
                    this.conversations.push(conv);
                }
            }
            
            // Tri final par activité récente pour l'expérience utilisateur optimale
            this.conversations.sort((a, b) => new Date(b.lastMessageTime) - new Date(a.lastMessageTime));
            
            this.displayConversations();
            this.hideLoading();
            
        } catch (error) {
            console.error('Error loading conversations:', error);
            this.showError('Failed to load conversations. Please try again.');
        }
    }

    // Récupère tous les messages associés à un article spécifique
    async getArticleMessages(articleId) {
        try {
            const response = await fetch(`https://localhost:8000/api/articles/${articleId}/messages`, {
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

    // Affichage des conversations
    displayConversations() {
        const conversationsList = document.getElementById('conversationsList');
        const emptyConversations = document.getElementById('emptyConversations');
        
        if (this.conversations.length === 0) {
            conversationsList.style.display = 'none';
            emptyConversations.style.display = 'block';
            return;
        }

        conversationsList.style.display = 'block';
        emptyConversations.style.display = 'none';
        
        conversationsList.innerHTML = '';
        const userConversations = new Map();
        
        for (const conv of this.conversations) {
            const userKey = conv.otherUser.username;
            
            if (!userConversations.has(userKey)) {
                // Initialisation d'un groupe conversation pour cet utilisateur
                userConversations.set(userKey, {
                    otherUser: conv.otherUser,
                    conversations: [],
                    lastMessage: null,
                    lastMessageTime: null,
                });
            }
            
            const userConv = userConversations.get(userKey);
            userConv.conversations.push(conv);
            
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
        }
        
        // Tri par activité pour l'ordre d'affichage
        const sortedUserConversations = Array.from(userConversations.values())
            .sort((a, b) => new Date(b.lastMessageTime) - new Date(a.lastMessageTime));
        
        // Rendu de chaque élément conversation
        sortedUserConversations.forEach(userConv => {
            const conversationElement = this.createUserConversationElement(userConv);
            conversationsList.appendChild(conversationElement);
        });
    }

    // Génère les éléments html pour l'affichage
    createUserConversationElement(userConv) {
        const element = document.createElement('div');
        element.className = `conversation-item`;
        element.addEventListener('click', () => this.openChatWithUser(userConv));
        
        const lastMessageText = userConv.lastMessage.message.length > 50 
            ? userConv.lastMessage.message.substring(0, 50) + '...'
            : userConv.lastMessage.message;
            
        const isLastMessageFromUser = userConv.lastMessage.user_id === this.currentUserId;
        const lastMessagePrefix = isLastMessageFromUser ? 'You: ' : '';
        
        // Logique d'affichage adaptative selon le nombre d'articles dans la conversation
        
        element.innerHTML = `
            <div class="conversation-avatar">
                ${userConv.otherUser.username.charAt(0).toUpperCase()}
            </div>
            
            <div class="conversation-content">
                <div class="conversation-header">
                    <div class="conversation-title">
                        <span class="participant-name">${userConv.otherUser.username}</span>
                    </div>
                </div>
                
                <div class="conversation-preview">
                    <span class="last-message">${lastMessagePrefix}${lastMessageText}</span>
                </div>
            </div>
        `;
        
        return element;
    }

    // Gère la navigation vers les différents chats
    openChatWithUser(userConv) {
        if (userConv.conversations.length === 1) {
            const conv = userConv.conversations[0];
            const chatUrl = `chat.html?user=${encodeURIComponent(userConv.otherUser.username)}&articleId=${conv.articleId}`;
            window.location.href = chatUrl;
        } else {
            const mostRecent = userConv.conversations.reduce((a, b) => 
                new Date(a.lastMessageTime) > new Date(b.lastMessageTime) ? a : b
            );
            const chatUrl = `chat.html?user=${encodeURIComponent(userConv.otherUser.username)}&articleId=${mostRecent.articleId}`;
            window.location.href = chatUrl;
        }
    }

    // Transforme foramt ISO en format de date lisible
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

    // Affichage du chargement
    showLoading() {
        document.getElementById('loadingOverlay').style.display = 'flex';
        document.getElementById('errorMessage').style.display = 'none';
        document.getElementById('conversationsList').style.display = 'none';
        document.getElementById('emptyConversations').style.display = 'none';
    }
    hideLoading() {
        document.getElementById('loadingOverlay').style.display = 'none';
    }

    // Affichage erreurs
    showError(message) {
        this.hideLoading();
        document.getElementById('errorText').textContent = message;
        document.getElementById('errorMessage').style.display = 'block';
        document.getElementById('conversationsList').style.display = 'none';
        document.getElementById('emptyConversations').style.display = 'none';
    }

    // Gère la navigation retour
    goBack() {
        window.location.href = 'profile.html';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new ConversationsApp();
});