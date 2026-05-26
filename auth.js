/**
 * ============================================
 * AUTH.JS - Authentication Functions
 * Handles Login, Signup, Logout, Sessions
 * Used by: index.html, login.html, signup.html
 * ============================================
 */

/**
 * Handle User Login
 * Called from login forms on multiple pages
 */
async function handleLogin(event) {
    event.preventDefault();
    
    const email = document.getElementById('loginEmail')?.value;
    const password = document.getElementById('loginPassword')?.value;
    const btn = document.getElementById('loginBtn');
    const alert = document.getElementById('loginAlert');

    // Validation
    if (!email || !password) {
        showAlert('loginAlert', 'Please fill in all fields', 'error');
        return false;
    }

    // Email validation
    if (!isValidEmail(email)) {
        showAlert('loginAlert', 'Please enter a valid email address', 'error');
        return false;
    }

    // Disable button and show loading state
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Signing in...';
    }

    try {
        console.log('🔐 Attempting login for:', email);

        // Create Email/Password Session
        const session = await account.createEmailPasswordSession(email, password);
        
        // Get user data
        currentUser = await account.get();

        console.log('✅ Login successful:', currentUser.name || currentUser.email);

        // Show success message
        if (alert) {
            alert.className = 'alert success';
            alert.textContent = `Welcome back, ${currentUser.name || 'User'}! Redirecting...`;
        }

        // Update online status
        await updateUserOnlineStatus(true);

        // Store session info
        localStorage.setItem('chatHubSession', JSON.stringify({
            userId: currentUser.$id,
            name: currentUser.name,
            email: currentUser.email,
            loginTime: new Date().toISOString()
        }));

        // Redirect to chat after short delay
        setTimeout(() => {
            window.location.href = 'chat.html';
        }, 1000);

        return true;

    } catch (error) {
        console.error('❌ Login error:', error);

        let errorMessage = 'Login failed. Please try again.';
        
        // Handle specific error messages
        if (error.message.includes('invalid_credentials')) {
            errorMessage = 'Invalid email or password. Please check your credentials.';
        } else if (error.message.includes('user_not_found')) {
            errorMessage = 'No account found with this email.';
        } else if (error.message.includes('too_many_requests')) {
            errorMessage = 'Too many attempts. Please try again later.';
        } else if (error.message.includes('user_blocked')) {
            errorMessage = 'This account has been blocked.';
        } else if (error.message) {
            errorMessage = error.message;
        }

        showAlert('loginAlert', errorMessage, 'error');
        return false;

    } finally {
        // Re-enable button
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Sign In';
        }
    }
}

/**
 * Handle User Signup/Registration
 * Creates new account and profile
 */
async function handleSignup(event) {
    event.preventDefault();

    const name = document.getElementById('signupName')?.value;
    const email = document.getElementById('signupEmail')?.value;
    const password = document.getElementById('signupPassword')?.value;
    const confirmPassword = document.getElementById('confirmPassword')?.value;
    const btn = document.getElementById('signupBtn');
    const alert = document.getElementById('signupAlert');

    // Validations
    if (!name || !email || !password) {
        showAlert('signupAlert', 'Please fill in all required fields', 'error');
        return false;
    }

    if (name.length < 2) {
        showAlert('signupAlert', 'Name must be at least 2 characters', 'error');
        return false;
    }

    if (!isValidEmail(email)) {
        showAlert('signupAlert', 'Please enter a valid email address', 'error');
        return false;
    }

    if (password.length < 8) {
        showAlert('signupAlert', 'Password must be at least 8 characters long', 'error');
        return false;
    }

    if (confirmPassword && password !== confirmPassword) {
        showAlert('signupAlert', 'Passwords do not match', 'error');
        return false;
    }

    // Password strength check
    if (!isStrongPassword(password)) {
        showAlert('signupAlert', 'Password should include uppercase, lowercase, and numbers', 'error');
        return false;
    }

    // Disable button and show loading
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating account...';
    }

    try {
        console.log('📝 Creating new account:', email);

        // Generate unique ID for the user
        const userId = Appwrite.ID.unique();

        // Create user account in AppWrite Auth
        await account.create(userId, email, password, name);
        console.log('✅ Account created successfully');

        // Create session automatically after registration
        await account.createEmailPasswordSession(email, password);
        
        // Get current user
        currentUser = await account.get();

        console.log('✅ Session created for:', currentUser.name);

        // Create user profile in database
        try {
            await databases.createDocument(
                CONFIG.databaseId,
                CONFIG.usersCollectionId,
                currentUser.$id,
                {
                    userId: currentUser.$id,
                    name: name,
                    email: email,
                    avatar: getInitials(name),
                    isOnline: true,
                    lastSeen: new Date().toISOString(),
                    statusMessage: '',
                    createdAt: new Date().toISOString(),
                    settings: {
                        showOnlineStatus: true,
                        readReceipts: true,
                        notificationsEnabled: true
                    }
                }
            );
            console.log('✅ User profile created in database');

        } catch (dbError) {
            console.warn('⚠️ Profile creation warning:', dbError.message);
            // Continue even if profile creation fails
        }

        // Show success
        if (alert) {
            alert.className = 'alert success';
            alert.textContent = `Account created successfully! Welcome, ${name}! 🎉`;
        }

        // Store session
        localStorage.setItem('chatHubSession', JSON.stringify({
            userId: currentUser.$id,
            name: name,
            email: email,
            isNewUser: true,
            signupTime: new Date().toISOString()
        }));

        // Redirect to chat or show success screen
        setTimeout(() => {
            window.location.href = 'chat.html';
        }, 1500);

        return true;

    } catch (error) {
        console.error('❌ Signup error:', error);

        let errorMessage = 'Registration failed. Please try again.';

        // Handle specific errors
        if (error.message.includes('already_exists')) {
            errorMessage = 'An account with this email already exists. Try logging in instead.';
        } else if (error.message.includes('invalid_email')) {
            errorMessage = 'Invalid email format.';
        } else if (error.message.includes('weak_password')) {
            errorMessage = 'Password is too weak. Please choose a stronger password.';
        } else if (error.message.includes('rate_limit')) {
            errorMessage = 'Too many registration attempts. Please wait a moment.';
        } else if (error.message) {
            errorMessage = error.message;
        }

        showAlert('signupAlert', errorMessage, 'error');
        return false;

    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-rocket"></i> Create Account';
        }
    }
}

/**
 * Handle User Logout
 * Clears session and redirects to login
 */
async function handleLogout() {
    try {
        console.log('👋 Logging out...');

        // Update offline status before logout
        try {
            await updateUserOnlineStatus(false);
        } catch (statusError) {
            console.warn('Could not update offline status:', statusError.message);
        }

        // Delete current session from AppWrite
        await account.deleteSession('current');
        console.log('✅ Session deleted');

        // Clear local storage
        localStorage.removeItem('chatHubUser');
        localStorage.removeItem('chatHubSession');
        sessionStorage.clear();

        // Reset global variables
        currentUser = null;
        currentConversation = null;
        allConversations = [];
        onlineUsers.clear();

        // Unsubscribe from realtime
        if (unsubscribeRealtime) {
            unsubscribeRealtime();
            unsubscribeRealtime = null;
        }

        console.log('✅ Logged out successfully');

        // Redirect to login page
        window.location.href = 'login.html';

        return true;

    } catch (error) {
        console.error('❌ Logout error:', error);
        
        // Force redirect even if logout fails
        localStorage.clear();
        window.location.href = 'login.html';
        
        return false;
    }
}

/**
 * Show Authentication Section (Login/Signup)
 */
function showAuthSection() {
    const authSection = document.getElementById('authSection');
    const chatApp = document.getElementById('chatApp');
    
    if (authSection) authSection.style.display = 'flex';
    if (chatApp) chatApp.style.display = 'none';
}

/**
 * Show Chat Application (After Login)
 */
function showChatApp(user) {
    const authSection = document.getElementById('authSection');
    const chatApp = document.getElementById('chatApp');
    
    if (authSection) authSection.style.display = 'none';
    if (chatApp) chatApp.style.display = 'flex';

    // Update UI with user info
    updateChatUIWithUser(user);
}

/**
 * Update Chat UI with Current User Info
 */
function updateChatUIWithUser(user) {
    const initials = getInitials(user?.name || 'User');
    
    // Update avatar elements
    const avatarElements = ['currentUserAvatar', 'profileAvatarLarge', 'modalUserAvatar'];
    avatarElements.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = initials;
    });

    // Update name elements
    const nameElements = ['currentUserName', 'profileDisplayName', 'modalUserName'];
    nameElements.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = user?.name || 'User';
    });

    // Update email elements
    const emailElements = ['profileEmail', 'modalUserEmail', 'editEmail'];
    emailElements.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.textContent = user?.email || '';
            if (el.tagName === 'INPUT') el.value = user?.email || '';
        }
    });

    // Update join date
    const dateElements = ['profileJoinDate', 'modalJoinDate', 'profileLastSeen'];
    dateElements.forEach(id => {
        const el = document.getElementById(id);
        if (el && user?.$createdAt) {
            el.textContent = new Date(user.$createdAt).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
        }
    });

    // Update handle/username
    const handleEl = document.getElementById('profileHandle');
    if (handleEl && user?.name) {
        handleEl.textContent = '@' + user.name.toLowerCase().replace(/\s+/g, '');
    }
}

/**
 * Update User Online Status in Database
 */
async function updateUserOnlineStatus(isOnline) {
    if (!currentUser || !databases) return;

    try {
        await databases.updateDocument(
            CONFIG.databaseId,
            CONFIG.usersCollectionId,
            currentUser.$id,
            {
                isOnline: isOnline,
                lastSeen: new Date().toISOString()
            }
        );
        console.log(`📊 Status updated: ${isOnline ? 'online' : 'offline'}`);
    } catch (error) {
        console.warn('⚠️ Could not update status:', error.message);
    }
}

/**
 * Validate Email Format
 */
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

/**
 * Check Password Strength
 */
function isStrongPassword(password) {
    // At least 8 chars, one uppercase, one lowercase, one number
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    
    return hasUpperCase && hasLowerCase && hasNumber;
}

/**
 * Password Strength Score (0-4)
 */
function getPasswordStrength(password) {
    let score = 0;
    
    if (password.length >= 8) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[a-z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;
    
    return score;
}

/**
 * Forgot Password Handler
 */
async function handleForgotPassword(email) {
    if (!email) {
        showToast('Please enter your email address');
        return;
    }

    try {
        // AppWrite Password Recovery
        await account.createRecovery(
            email,
            `${window.location.origin}/reset-password`
        );
        
        showToast('✅ Password reset link sent to your email!');
        
    } catch (error) {
        showToast('Error: ' + error.message);
    }
}

/**
 * Session Management - Check expiry
 */
function isSessionValid() {
    const sessionData = localStorage.getItem('chatHubSession');
    if (!sessionData) return false;

    try {
        const { loginTime } = JSON.parse(sessionData);
        const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
        
        return (Date.now() - new Date(loginTime).getTime()) < maxAge;
    } catch {
        return false;
    }
}

// Auto-check session on page load (for pages that use this)
document.addEventListener('DOMContentLoaded', async () => {
    // Only run on auth-related pages
    const isAuthPage = document.querySelector('.auth-container') || 
                      document.getElementById('authSection');
    
    if (isAuthPage) {
        const hasSession = await checkSession();
        
        // If already logged in and on login/signup page, redirect to chat
        if (hasSession && (window.location.pathname.includes('login') || 
                          window.location.pathname.includes('signup'))) {
            // Don't auto-redirect from signup success page
            if (!document.getElementById('successMessage')) {
                window.location.href = 'chat.html';
            }
        }
    }
});

// Handle page visibility changes (online/offline)
document.addEventListener('visibilitychange', async () => {
    if (currentUser) {
        await updateUserOnlineStatus(!document.hidden);
    }
});

// Handle beforeunload (page close)
window.addEventListener('beforeunload', () => {
    if (currentUser) {
        // Use sendBeacon for reliable delivery
        const data = new Blob([JSON.stringify({
            userId: currentUser.$id,
            isOnline: false,
            timestamp: new Date().toISOString()
        })], { type: 'application/json' });
        
        navigator.sendBeacon('/api/status', data);
    }
});

console.log('📝 Auth.js loaded - Authentication functions ready');