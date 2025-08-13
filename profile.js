// profile.js - Profile page functionality

// DOM elements
const loadingOverlay = document.getElementById('loadingOverlay');
const errorMessage = document.getElementById('errorMessage');
const errorText = document.getElementById('errorText');
const retryBtn = document.getElementById('retryBtn');
const backToLoginBtn = document.getElementById('backToLoginBtn');

// Profile display elements
const usernameDisplay = document.getElementById('username-display');
const useridDisplay = document.getElementById('userid-display');
const memberSinceDisplay = document.getElementById('member-since');
const accountTypeDisplay = document.getElementById('account-type');

// Navigation buttons
const booksBtn = document.getElementById('booksBtn');
const dvdsBtn = document.getElementById('dvdsBtn');
const cdsBtn = document.getElementById('cdsBtn');

// Action buttons
const createArticleBtn = document.getElementById('createArticleBtn');
const myArticlesBtn = document.getElementById('myArticlesBtn');
const conversationsBtn = document.getElementById('conversationsBtn');
const settingsBtn = document.getElementById('settingsBtn');
const logoutBtn = document.getElementById('logoutBtn');

// Load profile data when page loads
document.addEventListener('DOMContentLoaded', function() {
    loadProfile();
});

// Load profile function
async function loadProfile() {
    try {
        showLoading();
        
        const response = await fetch('http://localhost:8000/test_cookie', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
        });

        if (response.ok) {
            const data = await response.json();
            displayProfile(data.token_data);
            setupEventListeners();
            hideLoading();
        } else if (response.status === 401) {
            // Token expired or invalid, redirect to login
            alert('Session expired. Please login again.');
            window.location.href = 'login.html';
        } else {
            throw new Error('Failed to load profile');
        }
    } catch (error) {
        console.error('Profile loading error:', error);
        showError('Failed to load profile. Please check your connection and try again.');
    }
}

// Display profile information
function displayProfile(tokenData) {
    usernameDisplay.textContent = tokenData.username;
    useridDisplay.textContent = tokenData.userId;
    
    // Convert timestamp to readable date
    const memberSince = new Date(tokenData.exp * 1000 - (24 * 60 * 60 * 1000)); // Approximate registration date
    memberSinceDisplay.textContent = memberSince.toLocaleDateString();
    
    // Display account type
    const isAdmin = tokenData.isAdmin || false;
    accountTypeDisplay.textContent = isAdmin ? 'Administrator' : 'Regular User';
    
    // If user is admin, modify the settings button to open admin panel
    if (isAdmin && settingsBtn) {
        settingsBtn.innerHTML = '<span class="btn-icon">👑</span><span>Admin Panel</span>';
        settingsBtn.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
        settingsBtn.style.color = 'white';
    }
}

// Setup event listeners
function setupEventListeners() {
    // My Articles button - Navigate to my-articles.html
    if (myArticlesBtn) {
        myArticlesBtn.addEventListener('click', function() {
            window.location.href = 'my_articles.html';
        });
    }

    // Settings button - Show admin panel for admins, coming soon for regular users
    if (settingsBtn) {
        settingsBtn.addEventListener('click', function() {
            // Check if user is admin from the account type display
            const isAdmin = accountTypeDisplay.textContent === 'Administrator';
            if (isAdmin) {
                window.location.href = 'admin.html';
            } else {
                alert('Settings page coming soon!\nHere you will be able to:\n- Change your password\n- Update your profile\n- Manage notifications\n- Delete your account');
            }
        });
    }

    // Logout button
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async function() {
            if (confirm('Are you sure you want to logout?')) {
                await logout();
            }
        });
    }

    // Error handling buttons
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

// Logout function
async function logout() {
    try {
        const response = await fetch('http://localhost:8000/api/auth/logout', {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (response.ok) {
            // Clear any client-side storage if needed
            alert('Logged out successfully');
            window.location.href = 'login.html';
        } else {
            throw new Error('Logout failed');
        }
    } catch (error) {
        console.error('Logout error:', error);
        // Even if logout fails on server, redirect to login
        alert('Logout completed');
        window.location.href = 'login.html';
    }
}

// Show loading overlay
function showLoading() {
    if (loadingOverlay) {
        loadingOverlay.style.display = 'flex';
    }
    if (errorMessage) {
        errorMessage.style.display = 'none';
    }
}

// Hide loading overlay
function hideLoading() {
    if (loadingOverlay) {
        loadingOverlay.style.display = 'none';
    }
}

// Show error message
function showError(message) {
    hideLoading();
    if (errorText) {
        errorText.textContent = message;
    }
    if (errorMessage) {
        errorMessage.style.display = 'block';
    }
}