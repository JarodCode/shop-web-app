const registerForm = document.getElementById('registerForm');
if (registerForm) {
    registerForm.addEventListener('submit', async function(event) {
        event.preventDefault();
        
        const submitBtn = document.getElementById('submitBtn');
        
        // Get form data
        const formData = new FormData(event.target);
        const username = formData.get('username');
        const password = formData.get('password');
        
        // Disable button during request
        submitBtn.disabled = true;
        submitBtn.textContent = 'Registering...';
        
        try {
            const response = await fetch(`http://localhost:8000/api/auth/register`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ username, password }),
                credentials: 'include',
            });
            
            const data = await response.json(); // Always parse the response
            
            if (response.ok) {
                console.log(data);
                alert('Registration successful! You can now login.');
                
                // Clear form
                document.getElementById('username').value = '';
                document.getElementById('password').value = '';
                
                // Optionally redirect to login page after a delay
                setTimeout(() => {
                    window.location.href = 'login.html';
                }, 2000);
            } else {
                // Show the actual error message from the server
                alert('Register failed: ' + (data.error || data.message || response.statusText));
            }
        } catch (error) {
            console.error('Network error:', error);
            alert('Register failed: Network error. Please check if the server is running.');
        } finally {
            // Re-enable button
            submitBtn.disabled = false;
            submitBtn.textContent = 'Register';
        }
    });
}

const loginForm = document.getElementById('loginForm');
if (loginForm) {
    loginForm.addEventListener('submit', async function(event) {
        event.preventDefault();
        
        const formData = new FormData(event.target);
        const username = formData.get('username');
        const password = formData.get('password');
        
        try {
            const response = await fetch(`http://localhost:8000/api/auth/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'include',
                body: JSON.stringify({ username, password })
            });
            
            if (response.ok) {
                const data = await response.json();
                console.log(data);
                
                // Redirect or perform other actions based on successful login
                window.location.href = '/profile.html';
            } else if (response.status === 401) {
                // Handle 401 Unauthorized error
                alert('Unauthorized: Invalid username or password');
            } else {
                // Handle other non-successful response codes
                const data = await response.json().catch(() => ({}));
                alert('Login failed: ' + (data.error || data.message || response.statusText));
            }
        } catch (error) {
            console.error('Login error:', error);
            alert('Login failed: ' + error.message);
        }
    });
}