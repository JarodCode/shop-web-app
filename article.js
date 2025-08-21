class ArticleDetailsApp {
    constructor() {
        this.articleId = null;
        this.article = null;
        this.currentUserId = null;
        this.currentUsername = null;
        this.isAdmin = false;
        this.init();
    }

    init() {
        this.getArticleIdFromUrl();
        this.getCurrentUser();
        this.setupEventListeners();
        if (this.articleId) {
            this.loadArticleDetails();
        } else {
            this.showError('Aucun ID d\'article fourni');
        }
    }

    // Vérifier l'authentification et récupérer les informations utilisateur
    async getCurrentUser() {
        try {
            const response = await fetch('https://localhost:8000/test_cookie', {
                credentials: 'include'  // Inclut les cookies pour l'authentification
            });

            if (response.ok) {
                const data = await response.json();
                // Stocke les données utilisateur pour les vérifications de permissions ultérieures
                this.currentUserId = data.token_data.userId;
                this.currentUsername = data.token_data.username;
                this.isAdmin = data.token_data.isAdmin || false;
            }
        } catch (error) {
            console.error('Erreur lors de la récupération de l\'utilisateur actuel:', error);
        }
    }

    // Parse l'URL actuelle pour extraire le paramètre 'id' qui identifie l'article à afficher
    getArticleIdFromUrl() {
        const urlParams = new URLSearchParams(window.location.search);
        this.articleId = urlParams.get('id');
    }

    // Charge les informations
    setupEventListeners() {
        const retryBtn = document.getElementById('retryBtn');
        if (retryBtn) {
            retryBtn.addEventListener('click', () => this.loadArticleDetails());
        }

        const contactSellerBtn = document.getElementById('contactSellerBtn');
        if (contactSellerBtn) {
            // Ce bouton change de fonction selon le contexte (chat ou supprimer)
            contactSellerBtn.addEventListener('click', () => this.handleContactButtonClick());
        }

        const reportArticleBtn = document.getElementById('reportArticleBtn');
        if (reportArticleBtn) {
            reportArticleBtn.addEventListener('click', () => this.reportArticle());
        }
    }

    // Récupère tous les articles de l'API puis filtre pour trouver celui correspondant à l'id
    async loadArticleDetails() {
        this.showLoading();
        this.hideError();
        this.hideArticleDetails();

        try {
            const response = await fetch(`https://localhost:8000/api/articles`);
            
            if (!response.ok) {
                throw new Error(`Erreur HTTP! statut: ${response.status}`);
            }

            const data = await response.json();
            const articles = data.articles || [];
            
            // Trouve l'article spécifique parmi tous les articles retournés
            this.article = articles.find(article => article.id == this.articleId);
            
            if (!this.article) {
                throw new Error('Article non trouvé');
            }
            
            this.displayArticleDetails();
            
        } catch (error) {
            this.showError('Échec du chargement des détails de l\'article. Veuillez vérifier votre connexion et réessayer.');
        } finally {
            this.hideLoading();
        }
    }

    // Affiche toutes les sections de la page avec les données de l'article
    // Détermine également le type d'article (livre, DVD, CD)
    displayArticleDetails() {
        if (!this.article) return;

        // Adapte l'extraction des données selon la structure de l'objet article
        const itemInfo = this.article.book_info || this.article.dvd_info || this.article.cd_info || this.article.item_info;
        const title = itemInfo?.title || itemInfo?.author || 'Sans titre';
        const subtitle = this.getSubtitle(this.article, itemInfo);

        // Met à jour le titre de l'onglet du navigateur
        document.title = `${title} - Marketplace`;

        // Remplit les éléments textuels principaux de la page
        const articleTitle = document.getElementById('articleTitle');
        const articleSubtitle = document.getElementById('articleSubtitle');
        if (articleTitle) articleTitle.textContent = title;
        if (articleSubtitle) articleSubtitle.textContent = subtitle;

        // Formate et affiche le prix avec deux décimales
        const articlePrice = document.getElementById('articlePrice');
        if (articlePrice) {
            articlePrice.textContent = `$${this.article.price.toFixed(2)}`;
        }

        // Affiche la description ou un message par défaut si vide
        const articleDescription = document.getElementById('articleDescription');
        if (articleDescription) {
            articleDescription.textContent = this.article.description || 'Aucune description fournie.';
        }

        // Appelle les méthodes spécialisées pour chaque section de la page
        this.displayArticleDetailsGrid(itemInfo);
        this.displaySellerInfo();
        this.displayArticleCreationDate();
        this.updateContactButton();
        this.addAdminControls();

        this.showArticleDetails();
    }

    // Adapte le bouton principal selon la relation entre l'utilisateur et l'article (chat ou supprimer)
    updateContactButton() {
        const contactBtn = document.getElementById('contactSellerBtn');
        
        if (!contactBtn) return;

        // Vérifie si l'utilisateur connecté est le propriétaire de l'article
        const isOwnArticle = this.currentUserId && this.article.user_id === this.currentUserId;

        if (isOwnArticle) {
            // Pour le propriétaire : bouton de suppression rouge
            contactBtn.textContent = 'Supprimer l\'article';
            contactBtn.title = 'Supprimer cet article';
            contactBtn.className = 'btn-primary btn-delete';
            contactBtn.disabled = false;
            contactBtn.dataset.action = 'delete';
        } else {
            // Pour les autres utilisateurs : bouton de chat
            contactBtn.disabled = false;
            contactBtn.textContent = 'Discuter avec le vendeur';
            contactBtn.title = 'Commencer une discussion avec le vendeur';
            contactBtn.dataset.action = 'chat';
        }
    }

    // Affichage du panneau de contrôle administrateur si l'utilisateur l'est
    addAdminControls() {
        if (!this.isAdmin || (this.currentUserId && this.article.user_id === this.currentUserId)) {
            return;
        }

        // Supprime les contrôles existants pour éviter les doublons
        let adminControls = document.getElementById('adminControls');
        if (adminControls) {
            adminControls.remove();
        }

        adminControls = document.createElement('div');
        adminControls.id = 'adminControls';
        adminControls.className = 'admin-controls';
        adminControls.innerHTML = `
            <div class="admin-header">
                <h3>Contrôles Administrateur</h3>
                <span class="admin-badge">Administrateur</span>
            </div>
            <div class="admin-actions">
                <button id="adminDeleteBtn" class="btn-danger admin-btn">
                    Supprimer l'Article
                </button>
            </div>
        `;

        const style = document.createElement('style');
        style.textContent = `
            .admin-controls {
                background: #ff0000ff;
                color: white;
                padding: 20px;
                border-radius: 10px;
                margin: 20px 0;
            }
            
            .admin-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 15px;
            }
            
            .admin-header h3 {
                margin: 0;
                font-size: 1.2em;
                color: white;
            }
            
            .admin-badge {
                background: rgba(255, 255, 255, 0.2);
                padding: 4px 12px;
                border-radius: 20px;
                font-size: 0.85em;
                font-weight: bold;
            }
            
            .admin-actions {
                display: flex;
                gap: 10px;
                margin-bottom: 15px;
                flex-wrap: wrap;
            }
            
            .admin-btn {
                padding: 10px 16px;
                border: none;
                border-radius: 6px;
                font-weight: bold;
                cursor: pointer;
                transition: all 0.3s ease;
                min-width: 150px;
                font-size: 0.9em;
            }
            
            .btn-danger {
                background: #ffffff;
                color: #dc2626;
                border: 2px solid #dc2626;
            }
            
            .btn-danger:hover {
                background: #dc2626;
                color: white;
                transform: translateY(-2px);
                box-shadow: 0 4px 8px rgba(220, 38, 38, 0.4);
            }
        `;
        document.head.appendChild(style);

        // Trouve un point d'affichage dans la page existante
        const articleActions = document.querySelector('.article-actions');
        if (articleActions) {
            articleActions.parentNode.insertBefore(adminControls, articleActions.nextSibling);
        }

        // Connecte le gestionnaire d'événements au nouveau bouton
        const adminDeleteBtn = document.getElementById('adminDeleteBtn');
        if (adminDeleteBtn) {
            adminDeleteBtn.addEventListener('click', () => this.adminDeleteArticle());
        }
    }

    // Processus de suppression administrative avec double confirmation
    // Envoie une requête DELETE à l'API avec les credentials pour l'autorisation
    async adminDeleteArticle() {
        // Construit un titre lisible pour les confirmations selon le type d'article
        const title = this.article.book_info?.title || 
                     this.article.dvd_info?.title || 
                     this.article.cd_info?.author || 
                     this.article.item_info?.title || 
                     this.article.item_info?.author || 
                     'cet article';
                     
        const sellerUsername = this.article.seller_username;
        
        // Première confirmation avec explication des conséquences
        if (!confirm(`⚠️ ACTION ADMINISTRATEUR ⚠️\n\nÊtes-vous sûr de vouloir supprimer "${title}" de ${sellerUsername}?\n`)) {
            return;
        }
        try {
            
            // Envoie la requête de suppression avec authentification par cookie
            const response = await fetch(`https://localhost:8000/api/articles/${this.articleId}`, {
                method: 'DELETE',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `Erreur HTTP! statut: ${response.status}`);
            }

            
            // Redirige vers la page principale après succès
            window.location.href = 'marketplace.html';

        } catch (error) {
            alert(`Échec de la Suppression Administrateur\n\n${error.message}\n\nVeuillez réessayer ou contacter l'administrateur système.`);
        }
    }

    // Routeur qui détermine l'action à effectuer selon l'état du bouton contact (chat ou supprimer)
    // Lit l'attribut défini dans updateContactButton()
    handleContactButtonClick() {
        const contactBtn = document.getElementById('contactSellerBtn');
        const action = contactBtn?.dataset.action;

        switch (action) {
            case 'delete':
                this.deleteArticle();  // Suppression par le propriétaire
                break;
            case 'chat':
                this.openChat();       // Ouverture de la discussion
                break;
            default:
                break
        }
    }

    // Suppression d'article par le propriétaire
    // Similaire à la suppression admin
    async deleteArticle() {
        const title = this.article.book_info?.title || 
                     this.article.dvd_info?.title || 
                     this.article.cd_info?.author || 
                     this.article.item_info?.title || 
                     this.article.item_info?.author || 
                     'cet article';
                     
        if (!confirm(`Êtes-vous sûr de vouloir supprimer "${title}" ?\n\nCette action ne peut pas être annulée et supprimera également tous les messages de discussion associés.`)) {
            return;
        }

        try {
            
            const response = await fetch(`https://localhost:8000/api/articles/${this.articleId}`, {
                method: 'DELETE',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `Erreur HTTP! statut: ${response.status}`);
            }

            alert('Article supprimé avec succès !');
            
            window.location.href = 'marketplace.html';

        } catch (error) {
            console.error('Erreur lors de la suppression de l\'article:', error);
            alert(`Échec de la suppression de l'article : ${error.message}`);
        }
    }

    // Effectue les vérifications nécessaires avant de rediriger vers la page de chat
    // Vérifie l'authentification, le statut de vente et empêche d'ouvrir un chat avec soi-même
    openChat() {
        if (!this.currentUserId) {
            alert('Veuillez vous connecter pour contacter le vendeur.');
            return;
        }

        if (this.article.user_id === this.currentUserId) {
            alert('Vous ne pouvez pas discuter avec vous-même à propos de votre propre article.');
            return;
        }

        // Construit l'URL avec les paramètres nécessaires pour initialiser la conversation
        const chatUrl = `chat.html?user=${encodeURIComponent(this.article.seller_username)}&articleId=${this.articleId}`;
        window.location.href = chatUrl;
    }

    // Génère une grille de détails selon le type d'article (livre, DVD, CD)
    displayArticleDetailsGrid(itemInfo) {
        const detailsContent = document.getElementById('articleDetailsContent');
        if (!detailsContent || !itemInfo) return;

        const details = [];

        // Le genre est commun à tous les types d'articles
        if (itemInfo.genre) {
            details.push(['Genre', itemInfo.genre.charAt(0).toUpperCase() + itemInfo.genre.slice(1)]);
        }

        // Adapte les champs affichés selon le type d'article
        switch (this.article.item_type) {
            case 'book':
                if (itemInfo.author) details.push(['Auteur', itemInfo.author]);
                if (itemInfo.title) details.push(['Titre', itemInfo.title]);
                break;
            case 'dvd':
                if (itemInfo.director) details.push(['Réalisateur', itemInfo.director]);
                if (itemInfo.title) details.push(['Titre', itemInfo.title]);
                break;
            case 'cd':
                if (itemInfo.author) details.push(['Artiste', itemInfo.author]);
                break;
        }

        // Génère le HTML pour chaque paire label-valeur
        detailsContent.innerHTML = details.map(([label, value]) => `
            <div class="detail-item">
                <span class="detail-label">${label}:</span>
                <span class="detail-value">${value}</span>
            </div>
        `).join('');
    }

    // Affiche le nom du vendeur
    displaySellerInfo() {
        const sellerUsername = document.getElementById('sellerUsername');

        if (sellerUsername) {
            sellerUsername.textContent = this.article.seller_username;
        }
    }

    // Affiche la date de créationde l'article
    displayArticleCreationDate() {
        const articleDate = document.getElementById('articleDate');

        if (articleDate) {
            articleDate.textContent = this.formatDate(this.article.created_at);
        }
    }

    // Affiche le sous-titre selon le type d'article (Livre, DVD, CD)
    getSubtitle(article, itemInfo) {
        switch (article.item_type) {
            case 'book':
                return `écrit par ${itemInfo?.author || 'Auteur Inconnu'}`;
            case 'dvd':
                return `réalisé par ${itemInfo?.director || 'Réalisateur Inconnu'}`;
            case 'cd':
                return `par ${itemInfo?.author || 'Artiste Inconnu'}`;
            default:
                return '';
        }
    }

    // Convertit une chaîne de date ISO en format de date lisible
    formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString('fr-FR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }

    // Contrôle l'affichage des chargements
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

    // Contrôle l'affichage des messages d'erreur
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

    // Contrôle l'affichage de la section principale
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

document.addEventListener('DOMContentLoaded', () => {
    new ArticleDetailsApp();
});