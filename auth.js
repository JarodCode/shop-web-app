// Fixed client authentication - consistent with server
// auth.js

const API_BASE_URL = 'http://localhost:8000';

// Login function
async function login(username, password) {
    try {
        console.log(`🔐 Attempting login for: ${username}`);
        
        const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include', // ✅ FIXED: Added credentials include to send/receive cookies
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        console.log('Login response:', response.status, data);
        
        if (response.ok && data.user) {
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

// Register function
async function register(username, password) {
    try {
        console.log(`📝 Attempting registration for: ${username}`);
        
        const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include', // ✅ FIXED: Added credentials include
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        console.log('Registration response:', response.status, data);
        
        if (response.ok && data.user) {
            console.log(`✅ Registration successful for: ${username}`);
            
            return {
                success: true,
                user: data.user,
                message: `Welcome, ${data.user.username}! Registration successful.`
            };
        } else {
            return {
                success: false,
                message: data.error || 'Registration failed'
            };
        }
    } catch (error) {
        console.error('Registration error:', error);
        return {
            success: false,
            message: 'Network error. Please check if the server is running.'
        };
    }
}

// Logout function
async function logout() {
    try {
        console.log('👋 Attempting logout...');
        
        const response = await fetch(`${API_BASE_URL}/api/auth/logout`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include' // ✅ FIXED: Added credentials include
        });
        
        const data = await response.json();
        console.log('Logout response:', response.status, data);
        
        return {
            success: true,
            message: 'Logged out successfully'
        };
    } catch (error) {
        console.error('Logout error:', error);
        return {
            success: true,
            message: 'Logged out (with error)'
        };
    }
}

// Check auth status
async function checkAuthStatus() {
    try {
        const response = await fetch(`${API_BASE_URL}/test_cookie`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include' // ✅ FIXED: Added credentials include
        });
        
        if (response.ok) {
            const data = await response.json();
            
            return {
                isAuthenticated: true,
                user: data.token_data,
                source: 'server'
            };
        } else {
            return {
                isAuthenticated: false,
                user: null,
                source: 'server_rejected'
            };
        }
    } catch (error) {
        console.error('Auth check error:', error);
        return {
            isAuthenticated: false,
            user: null,
            source: 'error'
        };
    }
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
        
        const result = await register(username, password);
        
        if (result.success) {
            showMessage(result.message, 'success');
            clearForm('registerForm');
            
            setTimeout(() => {
                window.location.href = 'profile.html'; // ✅ FIXED: Go directly to profile after registration
            }, 1000);
        } else {
            showMessage(result.message, 'error');
        }
        
        setLoading(submitBtn, false, originalText);
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
                window.location.href = 'profile.html'; // ✅ FIXED: Go directly to profile after login
            }, 500); // Shorter delay
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

// Make functions available globally
window.login = login;
window.logout = logout;
window.register = register;
window.checkAuthStatus = checkAuthStatus;