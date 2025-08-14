// profile.js - Fixed version with correct credentials handling

// Configuration
const API_BASE_URL = 'http://localhost:8000';

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
    console.log('🔄 Profile page loaded, attempting to load profile...');
    loadProfile();
});

// Load profile function
async function loadProfile() {
    try {
        showLoading();
        console.log(`🔄 Making request to ${API_BASE_URL}/test_cookie`);
        
        const response = await fetch(`${API_BASE_URL}/test_cookie`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include', // ✅ FIXED: Added credentials include to send cookies
        });

        console.log(`📡 Response status: ${response.status}`);
        console.log(`📡 Response headers:`, Object.fromEntries(response.headers.entries()));

        if (response.ok) {
            const data = await response.json();
            console.log('✅ Profile data received:', data);
            displayProfile(data.token_data);
            setupEventListeners();
            hideLoading();
        } else if (response.status === 401) {
            console.log('❌ Unauthorized - redirecting to login');
            alert('Session expired. Please login again.');
            window.location.href = 'login.html';
        } else if (response.status === 404) {
            console.log('❌ Endpoint not found - check server setup');
            showError('Server endpoint not found. Please check if the authentication server is running correctly.');
        } else {
            console.log(`❌ Unexpected response: ${response.status}`);
            const errorData = await response.text().catch(() => 'Unknown error');
            console.log('Error response:', errorData);
            throw new Error(`Server responded with status ${response.status}: ${errorData}`);
        }
    } catch (error) {
        console.error('❌ Profile loading error:', error);
        
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
            showError('Cannot connect to server. Please check:\n1. Server is running on port 8000\n2. CORS is properly configured\n3. Network connection is working');
        } else {
            showError(`Failed to load profile: ${error.message}`);
        }
    }
}

// Display profile information
function displayProfile(tokenData) {
    console.log('📋 Displaying profile for user:', tokenData);
    
    if (usernameDisplay) usernameDisplay.textContent = tokenData.username || 'Unknown';
    if (useridDisplay) useridDisplay.textContent = tokenData.userId || 'Unknown';
    
    // Format member since date
    if (memberSinceDisplay) {
        if (tokenData.loginTime) {
            const memberSince = new Date(tokenData.loginTime);
            memberSinceDisplay.textContent = memberSince.toLocaleDateString();
        } else {
            // Fallback calculation from token expiration
            const tokenExp = new Date(tokenData.exp * 1000);
            const estimatedJoinDate = new Date(tokenExp.getTime() - (7 * 24 * 60 * 60 * 1000)); // Estimate 7 days ago
            memberSinceDisplay.textContent = estimatedJoinDate.toLocaleDateString();
        }
    }
    
    // Display account type with styling
    const isAdmin = tokenData.isAdmin || false;
    if (accountTypeDisplay) {
        accountTypeDisplay.textContent = isAdmin ? 'Administrator' : 'Regular User';
        accountTypeDisplay.setAttribute('data-admin', isAdmin.toString());
        
        // Add admin styling
        if (isAdmin) {
            accountTypeDisplay.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
            accountTypeDisplay.style.color = 'white';
            accountTypeDisplay.style.padding = '0.25rem 0.75rem';
            accountTypeDisplay.style.borderRadius = '1rem';
            accountTypeDisplay.style.fontSize = '0.75rem';
            accountTypeDisplay.style.fontWeight = '600';
            accountTypeDisplay.style.textTransform = 'uppercase';
        }
    }
    
    // Update settings button for admin users
    if (isAdmin && settingsBtn) {
        settingsBtn.innerHTML = '<span class="btn-icon">👑</span><span>Admin Panel</span>';
        settingsBtn.classList.add('admin');
    }
    
    console.log('✅ Profile display complete');
}

// Setup event listeners
function setupEventListeners() {
    console.log('🔧 Setting up event listeners...');
    
    // My Articles button - Navigate to my-articles.html
    if (myArticlesBtn) {
        myArticlesBtn.addEventListener('click', function() {
            console.log('📋 Navigating to my articles');
            window.location.href = 'my_articles.html';
        });
    }

    // Settings button - Show admin panel for admins, coming soon for regular users
    if (settingsBtn) {
        settingsBtn.addEventListener('click', function() {
            const isAdmin = accountTypeDisplay && accountTypeDisplay.textContent === 'Administrator';
            console.log('⚙️ Settings clicked, admin status:', isAdmin);
            
            if (isAdmin) {
                // Check if admin.html exists, otherwise show placeholder
                window.location.href = 'admin.html';
            } else {
                alert('Settings page coming soon!\n\nHere you will be able to:\n- Change your password\n- Update your profile\n- Manage notifications\n- Delete your account');
            }
        });
    }

    // Logout button
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async function() {
            console.log('👋 Logout clicked');
            if (confirm('Are you sure you want to logout?')) {
                await logout();
            }
        });
    }

    // Error handling buttons
    if (retryBtn) {
        retryBtn.addEventListener('click', function() {
            console.log('🔄 Retry clicked');
            loadProfile();
        });
    }

    if (backToLoginBtn) {
        backToLoginBtn.addEventListener('click', function() {
            console.log('🔙 Back to login clicked');
            window.location.href = 'login.html';
        });
    }
    
    console.log('✅ Event listeners setup complete');
}

// Logout function
async function logout() {
    try {
        console.log('👋 Attempting logout...');
        
        const response = await fetch(`${API_BASE_URL}/api/auth/logout`, {
            method: 'POST',
            credentials: 'include', // ✅ FIXED: Added credentials include for logout
            headers: {
                'Content-Type': 'application/json'
            }
        });

        console.log(`📡 Logout response status: ${response.status}`);

        if (response.ok) {
            const data = await response.json();
            console.log('✅ Logout successful:', data);
            alert('Logged out successfully');
        } else {
            console.log('⚠️ Logout request failed, but proceeding anyway');
        }
    } catch (error) {
        console.error('❌ Logout error:', error);
        console.log('⚠️ Logout error occurred, but proceeding with client-side logout');
    }
    
    // Always redirect to login regardless of server response
    console.log('🔙 Redirecting to login page');
    window.location.href = 'login.html';
}

// Show loading overlay
function showLoading() {
    console.log('⏳ Showing loading overlay');
    if (loadingOverlay) {
        loadingOverlay.style.display = 'flex';
    }
    if (errorMessage) {
        errorMessage.style.display = 'none';
    }
}

// Hide loading overlay
function hideLoading() {
    console.log('✅ Hiding loading overlay');
    if (loadingOverlay) {
        loadingOverlay.style.display = 'none';
    }
}

// Show error message
function showError(message) {
    console.log('❌ Showing error:', message);
    hideLoading();
    if (errorText) {
        errorText.textContent = message;
    }
    if (errorMessage) {
        errorMessage.style.display = 'block';
    }
}

// Debug function to check server connectivity
async function checkServerConnection() {
    try {
        console.log('🔍 Checking server connection...');
        const response = await fetch(`${API_BASE_URL}/api/health`, {
            method: 'GET',
            credentials: 'include' // ✅ FIXED: Added credentials include for health check
        });
        
        console.log(`🏥 Health check response: ${response.status}`);
        return response.ok;
    } catch (error) {
        console.error('🚨 Server connection check failed:', error);
        return false;
    }
}

// Add a simple health check endpoint test
window.addEventListener('load', async () => {
    const serverOnline = await checkServerConnection();
    if (!serverOnline) {
        console.warn('⚠️ Server appears to be offline or unreachable');
    }
});