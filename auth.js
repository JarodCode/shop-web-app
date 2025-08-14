// Fixed client authentication - consistent with server
// auth.js

const API_BASE_URL = 'http://localhost:8000';

// Simple token storage
let currentAuthToken = localStorage.getItem('auth_token');
let currentUser = null;

try {
    const storedUser = localStorage.getItem('current_user');
    if (storedUser) {
        currentUser = JSON.parse(storedUser);
    }
} catch (error) {
    console.error('Error loading stored user:', error);
}

// Login function - exactly like your example expects
async function login(username, password) {
    try {
        console.log(`🔐 Attempting login for: ${username}`);
        
        const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        console.log('Login response:', response.status, data);
        
        if (response.ok && data.auth_token) {
            // Store token and user info
            currentAuthToken = data.auth_token;
            currentUser = data.user;
            
            localStorage.setItem('auth_token', currentAuthToken);
            localStorage.setItem('current_user', JSON.stringify(currentUser));
            
            console.log(`✅ Login successful for: ${username}`);
            
            return {
                success: true,
                user: data.user,
                token: data.auth_token,
                message: `Welcome back, ${data.user.username}!`
            };
        } else {
            return {
                success: false,
                message: data.error || 'Login failed'
            };
        }
    } catch (error) {
        console.error('Login error:', error);
        return {
            success: false,
            message: 'Network error. Please check if the server is running.'
        };
    }
}

// Logout function - sends token in body
async function logout() {
    try {
        if (currentAuthToken) {
            console.log(`👋 Logging out: ${currentUser?.username}`);
            
            await fetch(`${API_BASE_URL}/api/auth/logout`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    auth_token: currentAuthToken
                })
            });
        }
        
        // Clear stored data
        currentAuthToken = null;
        currentUser = null;
        localStorage.removeItem('auth_token');
        localStorage.removeItem('current_user');
        
        return {
            success: true,
            message: 'Logged out successfully'
        };
    } catch (error) {
        console.error('Logout error:', error);
        // Still clear local data
        currentAuthToken = null;
        currentUser = null;
        localStorage.removeItem('auth_token');
        localStorage.removeItem('current_user');
        
        return {
            success: true,
            message: 'Logged out (with error)'
        };
    }
}

// Check auth status - sends token in body
async function checkAuthStatus() {
    try {
        if (!currentAuthToken) {
            return {
                isAuthenticated: false,
                user: null,
                source: 'no_token'
            };
        }
        
        const response = await fetch(`${API_BASE_URL}/api/auth/profile`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                auth_token: currentAuthToken
            })
        });
        
        if (response.ok) {
            const data = await response.json();
            
            if (data.user) {
                // Update stored user info
                currentUser = data.user;
                localStorage.setItem('current_user', JSON.stringify(currentUser));
                
                return {
                    isAuthenticated: true,
                    user: data.user,
                    source: 'server'
                };
            }
        }
        
        // Clear invalid token
        currentAuthToken = null;
        currentUser = null;
        localStorage.removeItem('auth_token');
        localStorage.removeItem('current_user');
        
        return {
            isAuthenticated: false,
            user: null,
            source: 'invalid_token'
        };
    } catch (error) {
        console.error('Auth check error:', error);
        
        // Use local data as fallback
        if (currentUser && currentAuthToken) {
            return {
                isAuthenticated: true,
                user: currentUser,
                source: 'local_fallback'
            };
        }
        
        return {
            isAuthenticated: false,
            user: null,
            source: 'error'
        };
    }
}

// Test the token with the fixed endpoint
async function testToken() {
    try {
        if (!currentAuthToken) {
            console.log('❌ No token to test');
            return { success: false, message: 'No token available' };
        }
        
        // For the test_cookie endpoint, send token as query parameter
        const response = await fetch(`${API_BASE_URL}/test_cookie?auth_token=${encodeURIComponent(currentAuthToken)}`);
        const data = await response.json();
        
        console.log('Test response:', response.status, data);
        
        if (response.ok) {
            return { 
                success: true, 
                message: 'Token is valid',
                data: data
            };
        } else {
            return { 
                success: false, 
                message: data.error || 'Token test failed'
            };
        }
    } catch (error) {
        console.error('Token test error:', error);
        return { 
            success: false, 
            message: 'Network error during token test'
        };
    }
}

// Enhanced API function for making authenticated requests
async function apiRequest(endpoint, data = {}, method = 'POST') {
    try {
        const requestData = {
            ...data,
            auth_token: currentAuthToken
        };
        
        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
            method: method,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestData)
        });
        
        return await response.json();
    } catch (error) {
        console.error('API request error:', error);
        throw error;
    }
}

// WebSocket connection - sends token in messages like your example
function connectWebSocket(endpoint) {
    if (!currentAuthToken) {
        console.error('No auth token for WebSocket');
        return null;
    }
    
    const ws = new WebSocket(`ws://localhost:8000${endpoint}`);
    
    ws.onopen = function() {
        console.log('🔌 WebSocket connected');
        
        // Send authentication with first message
        ws.send(JSON.stringify({
            auth_token: currentAuthToken,
            type: 'connect'
        }));
    };
    
    ws.onmessage = function(event) {
        try {
            const data = JSON.parse(event.data);
            
            if (data.go_to_login) {
                console.log('❌ WebSocket auth failed');
                showMessage('Session expired. Please log in again.', 'error');
                setTimeout(() => {
                    window.location.href = 'login.html';
                }, 2000);
                return;
            }
            
            console.log('📨 WebSocket message:', data);
            // Handle other message types here
            
        } catch (error) {
            console.error('WebSocket message error:', error);
        }
    };
    
    ws.onclose = function() {
        console.log('🔌 WebSocket closed');
    };
    
    ws.onerror = function(error) {
        console.error('WebSocket error:', error);
    };
    
    return ws;
}

// Form handlers
const registerForm = document.getElementById('registerForm');
if (registerForm) {
    registerForm.addEventListener('submit', async function(event) {
        event.preventDefault();
        
        const submitBtn = document.getElementById('submitBtn') || event.target.querySelector('button[type="submit"]');
        const originalText = submitBtn.textContent;
        
        const formData = new FormData(event.target);
        const username = formData.get('username')?.toString().trim();
        const password = formData.get('password')?.toString();
        
        if (!username || !password) {
            showMessage('Please fill in all fields', 'error');
            return;
        }
        
        if (username.length < 3) {
            showMessage('Username must be at least 3 characters long', 'error');
            return;
        }
        
        if (password.length < 6) {
            showMessage('Password must be at least 6 characters long', 'error');
            return;
        }
        
        setLoading(submitBtn, true, originalText);
        
        try {
            const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, password })
            });
            
            const data = await response.json();
            
            if (response.ok) {
                showMessage('Registration successful! You can now login.', 'success');
                clearForm('registerForm');
                
                setTimeout(() => {
                    window.location.href = 'login.html';
                }, 2000);
            } else {
                showMessage(data.error || 'Registration failed', 'error');
            }
        } catch (error) {
            showMessage('Registration failed: Network error', 'error');
        } finally {
            setLoading(submitBtn, false, originalText);
        }
    });
}

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
            showMessage('Please fill in all fields', 'error');
            return;
        }
        
        setLoading(submitBtn, true, originalText);
        
        const result = await login(username, password);
        
        if (result.success) {
            showMessage(result.message, 'success');
            setTimeout(() => {
                window.location.href = 'profile.html';
            }, 1000);
        } else {
            showMessage(result.message, 'error');
        }
        
        setLoading(submitBtn, false, originalText);
    });
}

// Utility functions
function showMessage(message, type = 'info') {
    const existingMessages = document.querySelectorAll('.message');
    existingMessages.forEach(msg => msg.remove());
    
    const messageElement = document.createElement('div');
    messageElement.className = `message message-${type}`;
    messageElement.textContent = message;
    
    messageElement.style.cssText = `
        padding: 10px;
        margin: 10px 0;
        border-radius: 4px;
        font-weight: bold;
        ${type === 'error' ? 'background-color: #ffebee; color: #c62828; border: 1px solid #ef5350;' : ''}
        ${type === 'success' ? 'background-color: #e8f5e8; color: #2e7d32; border: 1px solid #4caf50;' : ''}
        ${type === 'info' ? 'background-color: #e3f2fd; color: #1565c0; border: 1px solid #2196f3;' : ''}
    `;
    
    const container = document.querySelector('.container');
    if (container) {
        container.insertBefore(messageElement, container.firstChild);
        setTimeout(() => {
            if (messageElement.parentNode) {
                messageElement.remove();
            }
        }, 5000);
    }
}

function setLoading(button, isLoading, originalText) {
    if (isLoading) {
        button.disabled = true;
        button.textContent = 'Loading...';
        button.style.opacity = '0.6';
    } else {
        button.disabled = false;
        button.textContent = originalText;
        button.style.opacity = '1';
    }
}

function clearForm(formId) {
    const form = document.getElementById(formId);
    if (form) {
        form.reset();
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    // Display current user if logged in
    if (currentUser) {
        const userInfoElement = document.getElementById('userInfo');
        if (userInfoElement) {
            userInfoElement.innerHTML = `
                <span>Welcome, <strong>${currentUser.username}</strong></span>
                ${currentUser.isAdmin ? '<span class="admin-badge">(Admin)</span>' : ''}
            `;
        }
    }
    
    // Set up logout button
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async function(e) {
            e.preventDefault();
            const result = await logout();
            showMessage(result.message, result.success ? 'success' : 'error');
            
            if (result.success) {
                setTimeout(() => {
                    window.location.href = 'login.html';
                }, 1000);
            }
        });
    }
    
    // Set up test token button
    const testTokenBtn = document.getElementById('testTokenBtn');
    if (testTokenBtn) {
        testTokenBtn.addEventListener('click', async function(e) {
            e.preventDefault();
            const result = await testToken();
            showMessage(result.message, result.success ? 'success' : 'error');
            
            if (result.success) {
                console.log('Token test data:', result.data);
            }
        });
    }
});

// Make functions available globally
window.login = login;
window.logout = logout;
window.checkAuthStatus = checkAuthStatus;
window.testToken = testToken;
window.connectWebSocket = connectWebSocket;
window.apiRequest = apiRequest;
window.getCurrentToken = () => currentAuthToken;
window.getCurrentUser = () => currentUser;