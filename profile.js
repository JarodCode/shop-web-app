// Configuration de l'API
const API_BASE_URL = 'http://localhost:8000';

// Éléments DOM pour l'interface utilisateur
const loadingOverlay = document.getElementById('loadingOverlay');
const errorMessage = document.getElementById('errorMessage');
const errorText = document.getElementById('errorText');
const retryBtn = document.getElementById('retryBtn');
const backToLoginBtn = document.getElementById('backToLoginBtn');

// Éléments d'affichage du profil
const usernameDisplay = document.getElementById('username-display');
const useridDisplay = document.getElementById('userid-display');
const memberSinceDisplay = document.getElementById('member-since');
const accountTypeDisplay = document.getElementById('account-type');

// Boutons d'action
const logoutBtn = document.getElementById('logoutBtn');

// Charge le profil au chargement de la page
document.addEventListener('DOMContentLoaded', function() {
    loadProfile();
});

// Charge les données du profil depuis l'API avec gestion des cookies de session
async function loadProfile() {
    try {
        showLoading();
        
        const response = await fetch(`${API_BASE_URL}/test_cookie`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include', // Inclut les cookies de session
        });

        if (response.ok) {
            const data = await response.json();
            displayProfile(data.token_data);
            setupEventListeners();
            hideLoading();
        } else if (response.status === 401) {
            alert('Session expired. Please login again.');
            window.location.href = 'login.html';
        } else if (response.status === 404) {
            showError('Server endpoint not found. Please check if the authentication server is running correctly.');
        } else {
            const errorData = await response.text().catch(() => 'Unknown error');
            throw new Error(`Server responded with status ${response.status}: ${errorData}`);
        }
    } catch (error) {
        console.error('Profile loading error:', error);
        
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
            showError('Cannot connect to server. Please check:\n1. Server is running on port 8000\n2. CORS is properly configured\n3. Network connection is working');
        } else {
            showError(`Failed to load profile: ${error.message}`);
        }
    }
}

// Affiche les informations du profil utilisateur dans l'interface
function displayProfile(tokenData) {
    
    if (usernameDisplay) usernameDisplay.textContent = tokenData.username || 'Unknown';
    if (useridDisplay) useridDisplay.textContent = tokenData.userId || 'Unknown';
    
    // Formatage de la date d'inscription
    if (memberSinceDisplay) {
        if (tokenData.loginTime) {
            const memberSince = new Date(tokenData.loginTime);
            memberSinceDisplay.textContent = memberSince.toLocaleDateString();
        } else {
            // Calcul de fallback depuis l'expiration du token
            const tokenExp = new Date(tokenData.exp * 1000);
            const estimatedJoinDate = new Date(tokenExp.getTime() - (7 * 24 * 60 * 60 * 1000));
            memberSinceDisplay.textContent = estimatedJoinDate.toLocaleDateString();
        }
    }
    
    // Affichage du type de compte avec style spécial pour admin
    const isAdmin = tokenData.isAdmin || false;
    if (accountTypeDisplay) {
        accountTypeDisplay.textContent = isAdmin ? 'Administrateur' : 'Non administraeur';
        accountTypeDisplay.setAttribute('data-admin', isAdmin.toString());
        
        // Style spécial pour les administrateurs
        if (isAdmin) {
            accountTypeDisplay.style.background = '#ff0000ff';
            accountTypeDisplay.style.color = 'white';
            accountTypeDisplay.style.padding = '0.25rem 0.75rem';
            accountTypeDisplay.style.borderRadius = '1rem';
            accountTypeDisplay.style.fontSize = '0.75rem';
            accountTypeDisplay.style.fontWeight = '600';
            accountTypeDisplay.style.textTransform = 'uppercase';
        }
    }
    
}

// Configure les écouteurs d'événements après chargement du profil
function setupEventListeners() {
    
    // Bouton de déconnexion avec confirmation
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async function() {
            if (confirm('Are you sure you want to logout?')) {
                await logout();
            }
        });
    }

    // Boutons de gestion d'erreur
    if (retryBtn) {
        retryBtn.addEventListener('click', function() {
            loadProfile();
        });
    }

    if (backToLoginBtn) {
        backToLoginBtn.addEventListener('click', function() {
            window.location.href = 'login.html';
        });
    }
    
}

// Déconnecte l'utilisateur via l'API et redirige vers login
async function logout() {
    try {
        
        const response = await fetch(`${API_BASE_URL}/api/auth/logout`, {
            method: 'POST',
            credentials: 'include', // Inclut les cookies pour la déconnexion
            headers: {
                'Content-Type': 'application/json'
            }
        });


        if (response.ok) {
            const data = await response.json();
            alert('Logged out successfully');
        }
    } catch (error) {
        console.error('Logout error:', error);
    }
    
    // Redirection vers login dans tous les cas
    window.location.href = 'login.html';
}

// Méthodes de gestion de l'état de l'interface
function showLoading() {
    if (loadingOverlay) {
        loadingOverlay.style.display = 'flex';
    }
    if (errorMessage) {
        errorMessage.style.display = 'none';
    }
}

function hideLoading() {
    if (loadingOverlay) {
        loadingOverlay.style.display = 'none';
    }
}

function showError(message) {
    hideLoading();
    if (errorText) {
        errorText.textContent = message;
    }
    if (errorMessage) {
        errorMessage.style.display = 'block';
    }
}

// Vérifie la connectivité du serveur pour diagnostic
async function checkServerConnection() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/health`, {
            method: 'GET',
            credentials: 'include'
        });
        return response.ok;
    } catch (error) {
        console.error('Server connection check failed:', error);
        return false;
    }
}

// Test de connectivité au chargement de la page
window.addEventListener('load', async () => {
    const serverOnline = await checkServerConnection();
    if (!serverOnline) {
        console.warn('Server appears to be offline or unreachable');
    }
});