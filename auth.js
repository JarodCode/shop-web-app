const API_BASE_URL = 'http://localhost:8000';

// Envoie les identifiants à l'API et gère la réponse de connexion
// Stocke automatiquement le cookie de session si l'authentification réussit
async function login(username, password) {
    try {
        
        const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        // Vérifie que la réponse du serveur est bonne
        if (response.ok && data.user) {
            
            return {
                success: true,
                user: data.user,
                token: data.auth_token,
                message: `Bon retour, ${data.user.username}!`
            };
        } else {
            // Retourne l'erreur du serveur ou un message générique
            return {
                success: false,
                message: data.error || 'Échec de la connexion'
            };
        }
    } catch (error) {
        // Gère les erreurs réseau (serveur arrêté, pas de connexion internet, etc.)
        console.error('Erreur de connexion:', error);
        return {
            success: false,
            message: 'Erreur réseau. Veuillez vérifier si le serveur fonctionne.'
        };
    }
}

// Crée un nouveau compte utilisateur et l'authentifie automatiquement
// Le serveur renvoie directement un cookie de session après inscription réussie
async function register(username, password) {
    try {
        
        const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (response.ok && data.user) {
            
            return {
                success: true,
                user: data.user,
                message: `Bienvenue, ${data.user.username}! Inscription réussie.`
            };
        } else {
            return {
                success: false,
                message: data.error || 'Échec de l\'inscription'
            };
        }
    } catch (error) {
        console.error('Erreur d\'inscription:', error);
        return {
            success: false,
            message: 'Erreur réseau. Veuillez vérifier si le serveur fonctionne.'
        };
    }
}

// Déconnecte l'utilisateur côté serveur et supprime le cookie d'authentification
// Retourne toujours succès même en cas d'erreur pour permettre la déconnexion locale
async function logout() {
    try {

        const response = await fetch(`${API_BASE_URL}/api/auth/logout`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
        });
        
        const data = await response.json();
        
        return {
            success: true,
            message: 'Déconnexion réussie'
        };
    } catch (error) {
        // Même en cas d'erreur réseau, on considère la déconnexion comme réussie
        // car l'utilisateur veut se déconnecter de toute façon
        console.error('Erreur de déconnexion:', error);
        return {
            success: true,
            message: 'Déconnexion effectuée (avec erreur)'
        };
    }
}

// Vérifie si l'utilisateur est actuellement authentifié en testant le cookie de session
// Utilisé au chargement des pages pour déterminer l'état de connexion
async function checkAuthStatus() {
    try {
        const response = await fetch(`${API_BASE_URL}/test_cookie`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
        });
        
        if (response.ok) {
            const data = await response.json();
            
            return {
                isAuthenticated: true,
                user: data.token_data,
                source: 'server'
            };
        } else {
            // Cookie invalide, expiré ou utilisateur non connecté
            return {
                isAuthenticated: false,
                user: null,
                source: 'server_rejected'
            };
        }
    } catch (error) {
        console.error('Erreur de vérification d\'authentification:', error);
        return {
            isAuthenticated: false,
            user: null,
            source: 'error'
        };
    }
}

// Gestionnaire du formulaire d'inscription avec validation côté client
// Vérifie les critères minimums avant d'envoyer au serveur
const registerForm = document.getElementById('registerForm');
if (registerForm) {
    registerForm.addEventListener('submit', async function(event) {
        event.preventDefault(); // Empêche le rechargement de page par défaut
        
        // Trouve le bouton pour gérer l'état de chargement
        const submitBtn = document.getElementById('submitBtn') || event.target.querySelector('button[type="submit"]');
        const originalText = submitBtn.textContent;
        
        // Extrait les données du formulaire de manière sécurisée
        const formData = new FormData(event.target);
        const username = formData.get('username')?.toString().trim();
        const password = formData.get('password')?.toString();
        
        // Validations côté client pour éviter des requêtes inutiles
        if (!username || !password) {
            showMessage('Veuillez remplir tous les champs', 'error');
            return;
        }
        
        if (username.length < 3) {
            showMessage('Le nom d\'utilisateur doit contenir au moins 3 caractères', 'error');
            return;
        }
        
        if (password.length < 6) {
            showMessage('Le mot de passe doit contenir au moins 6 caractères', 'error');
            return;
        }
        
        // Active l'état de chargement pour empêcher les soumissions multiples
        setLoading(submitBtn, true, originalText);
        
        const result = await register(username, password);
        
        if (result.success) {
            showMessage(result.message, 'success');
            clearForm('registerForm');
            
            // Redirection automatique vers le profil après inscription réussie
            setTimeout(() => {
                window.location.href = 'profile.html';
            }, 1000);
        } else {
            showMessage(result.message, 'error');
        }
        
        setLoading(submitBtn, false, originalText);
    });
}

// Gestionnaire du formulaire de connexion avec validation minimale
const loginForm = document.getElementById('loginForm');
if (loginForm) {
    loginForm.addEventListener('submit', async function(event) {
        event.preventDefault();
        
        const submitBtn = event.target.querySelector('button[type="submit"]');
        const originalText = submitBtn.textContent;
        
        const formData = new FormData(event.target);
        const username = formData.get('username')?.toString().trim();
        const password = formData.get('password')?.toString();
        
        if (!username || !password) {
            showMessage('Veuillez remplir tous les champs', 'error');
            return;
        }
        
        setLoading(submitBtn, true, originalText);
        
        const result = await login(username, password);
        
        if (result.success) {
            showMessage(result.message, 'success');
            // setTimeout permet de laisser le temps à l'utilisateur de lire le messge et de fluidifié la connexion
            setTimeout(() => {
                window.location.href = 'profile.html';
            }, 500);
        } else {
            showMessage(result.message, 'error');
        }
        
        setLoading(submitBtn, false, originalText);
    });
}

// Affiche des messages de feedback à l'utilisateur
function showMessage(message, type = 'info') {
    // Nettoie les messages précédents pour éviter l'encombrement
    const existingMessages = document.querySelectorAll('.message');
    existingMessages.forEach(msg => msg.remove());
    
    const messageElement = document.createElement('div');
    messageElement.className = `message message-${type}`;
    messageElement.textContent = message;
    
    // Applique les styles CSS directement pour éviter les dépendances externes
    messageElement.style.cssText = `
        padding: 10px;
        margin: 10px 0;
        border-radius: 4px;
        font-weight: bold;
        ${type === 'error' ? 'background-color: #ffebee; color: #c62828; border: 1px solid #ef5350;' : ''}
        ${type === 'success' ? 'background-color: #e8f5e8; color: #2e7d32; border: 1px solid #4caf50;' : ''}
        ${type === 'info' ? 'background-color: #e3f2fd; color: #1565c0; border: 1px solid #2196f3;' : ''}
    `;
    
    // Insère le message en haut du conteneur pour qu'il soit visible immédiatement
    const container = document.querySelector('.container');
    if (container) {
        container.insertBefore(messageElement, container.firstChild);
        // Auto-suppression après 5 secondes pour ne pas encombrer l'interface
        setTimeout(() => {
            if (messageElement.parentNode) {
                messageElement.remove();
            }
        }, 5000);
    }
}

// Gère visuellement l'état de chargement des boutons pendant les requêtes
// Empêche les soumissions multiples accidentelles
function setLoading(button, isLoading, originalText) {
    if (isLoading) {
        button.disabled = true;           // Désactive le bouton
        button.textContent = 'Chargement...';
        button.style.opacity = '0.6';     // Effet visuel de désactivation
    } else {
        button.disabled = false;
        button.textContent = originalText; // Restaure le texte original
        button.style.opacity = '1';
    }
}

// Remet à zéro tous les champs d'un formulaire après soumission réussie
// Utile pour permettre une nouvelle saisie sans recharger la page
function clearForm(formId) {
    const form = document.getElementById(formId);
    if (form) {
        form.reset(); // Méthode native
    }
}

// Espace global
window.login = login;
window.logout = logout;
window.register = register;
window.checkAuthStatus = checkAuthStatus;