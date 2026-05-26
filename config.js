/**
 * ============================================
 * CONFIG.JS - Appwrite Configuration
 * Central configuration for all HTML files
 * ============================================
 */

// Appwrite Configuration Object
const CONFIG = {
    // Your Appwrite Project Details
    endpoint: 'https://fra.cloud.appwrite.io/v1',
    projectId: '6a14212c00327bbb4ba5',
    
    // Database Configuration
    databaseId: '6a14215a0009380c1370',
    
    // Collection IDs (Create these in Appwrite Console)
    collectionId: 'chathub_messages',      // For storing messages
    usersCollectionId: 'chathub_users',     // For user profiles
    groupsCollectionId: 'chathub_groups',   // For group chats (optional)
    roomsCollectionId: 'chathub_rooms'      // For public rooms (optional)
};

// Global Variables (Shared across all pages)
let client = null;
let account = null;
let databases = null;
let currentUser = null;
let currentConversation = null;
let unsubscribeRealtime = null;
let allConversations = [];
let onlineUsers = new Set();

/**
 * Initialize AppWrite Client
 * Call this on every page load
 */
function initializeAppwrite() {
    try {
        // Check if AppWrite SDK is loaded
        if (typeof Appwrite === 'undefined') {
            console.error('❌ AppWrite SDK not loaded. Check your internet connection.');
            return false;
        }

        // Initialize Client
        client = new Appwrite.Client()
            .setEndpoint(CONFIG.endpoint)
            .setProject(CONFIG.projectId);

        // Initialize Services
        account = new Appwrite.Account(client);
        databases = new Appwrite.Databases(client);

        console.log('✅ AppWrite SDK initialized successfully');
        console.log('📡 Endpoint:', CONFIG.endpoint);
        console.log('🆔 Project:', CONFIG.projectId);
        
        return true;

    } catch (error) {
        console.error('❌ Error initializing AppWrite:', error);
        return false;
    }
}

/**
 * Get Current User Session
 * Returns user data if logged in, null otherwise
 */
async function getCurrentSession() {
    try {
        const session = await account.get();
        currentUser = session;
        return session;
    } catch (error) {
        console.log('No active session');
        return null;
    }
}

/**
 * Check if User is Authenticated
 * Redirects to login if not authenticated
 */
async function checkSession() {
    // First, initialize AppWrite
    const initialized = initializeAppwrite();
    
    if (!initialized) {
        showAuthSection?.();
        return false;
    }

    try {
        const session = await account.get();
        currentUser = session;
        
        // Store in localStorage for quick access
        localStorage.setItem('chatHubUser', JSON.stringify({
            $id: session.$id,
            name: session.name,
            email: session.email,
            $createdAt: session.$createdAt
        }));

        console.log('✅ User authenticated:', session.name || session.email);
        return true;

    } catch (error) {
        console.log('⚠️ No active session - User needs to login');
        currentUser = null;
        localStorage.removeItem('chatHubUser');
        return false;
    }
}

/**
 * Show Alert Message (Used across all pages)
 */
function showAlert(elementId, message, type = 'error') {
    const alertEl = document.getElementById(elementId);
    if (alertEl) {
        alertEl.className = `alert ${type}`;
        alertEl.textContent = message;
        
        // Auto-hide after 5 seconds
        setTimeout(() => {
            alertEl.style.display = 'none';
        }, 5000);
    }
}

/**
 * Show Toast Notification
 */
function showToast(message, duration = 3000) {
    let toast = document.getElementById('toast');
    
    // Create toast element if it doesn't exist
    if (!toast) {
        toast = document.createElement('div');
        toast.className = 'toast';
        toast.id = 'toast';
        document.body.appendChild(toast);
    }

    toast.textContent = message;
    toast.classList.add('show');

    setTimeout(() => {
        toast.classList.remove('show');
    }, duration);
}

/**
 * Utility: Get Initials from Name
 */
function getInitials(name) {
    if (!name) return 'U';
    return name.split(' ')
        .map(n => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
}

/**
 * Utility: Generate Random Color for Avatars
 */
function getRandomColor(seed) {
    const colors = [
        ['#667eea', '#764ba2'],
        ['#f093fb', '#f5576c'],
        ['#4facfe', '#00f2fe'],
        ['#43e97b', '#38f9d7'],
        ['#fa709a', '#fee140'],
        ['#a8edea', '#fed6e3'],
        ['#ff9a9e', '#fecfef'],
        ['#ffecd2', '#fcb69f'],
        ['#a18cd1', '#fbc2eb'],
        ['#fad0c4', '#ffd1ff']
    ];
    
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
        hash = seed.charCodeAt(i) + ((hash << 5) - hash);
    }
    
    return colors[Math.abs(hash) % colors.length];
}

/**
 * Format Date/Time for Display
 */
function formatTime(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;
    
    // Less than a minute ago
    if (diff < 60000) {
        return 'Just now';
    }
    
    // Less than an hour
    if (diff < 3600000) {
        const minutes = Math.floor(diff / 60000);
        return `${minutes}m ago`;
    }
    
    // Less than 24 hours
    if (diff < 86400000 && date.getDate() === now.getDate()) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    
    // Yesterday
    if (diff < 172800000) {
        return 'Yesterday';
    }
    
    // Within the week
    if (diff < 604800000) {
        return date.toLocaleDateString([], { weekday: 'short' });
    }
    
    // Older dates
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

/**
 * Format Message Time (Short format)
 */
function formatMessageTime(dateString) {
    return new Date(dateString).toLocaleTimeString([], { 
        hour: '2-digit', 
        minute: '2-digit' 
    });
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Auto-resize Textarea
 */
function autoResize(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
}

/**
 * Handle Keyboard Shortcuts
 */
document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + K to focus search
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        const searchInput = document.getElementById('searchInput') || 
                           document.getElementById('globalSearch') ||
                           document.getElementById('roomsSearchInput');
        if (searchInput) searchInput.focus();
    }
    
    // Escape key to close modals
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay').forEach(modal => {
            modal.style.display = 'none';
        });
    }
});

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 ChatHub Application Loading...');
    console.log('📁 Config loaded from config.js');
});

// Export for use in other files (if using modules)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CONFIG, initializeAppwrite, checkSession };
}