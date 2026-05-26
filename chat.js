/**
 * ============================================
 * CHAT.JS - Chat Application Functions
 * Handles messaging, conversations, realtime
 * Used by: chat.html, rooms.html
 * ============================================ */

// Chat State Variables
let selectedConversationId = null;
let isTyping = false;
let typingTimeout = null;
let messageHistory = [];
let isLoadingMessages = false;

/**
 * Load Users and Conversations
 * Called when chat page loads
 */
async function loadUsersAndConversations() {
    console.log('📥 Loading users and conversations...');

    try {
        // Show loading state
        const convLoading = document.getElementById('convLoading');
        if (convLoading) convLoading.style.display = 'block';

        // Fetch all users from database
        const usersResponse = await databases.listDocuments(
            CONFIG.databaseId,
            CONFIG.usersCollectionId,
            [Appwrite.Query.limit(100)]
        );

        // Filter out current user
        const otherUsers = usersResponse.documents.filter(
            user => user.userId !== currentUser?.$id
        );

        console.log(`📊 Found ${otherUsers.length} other users`);

        // Render online users in sidebar
        renderOnlineUsers(otherUsers.filter(user => user.isOnline));

        // Build conversation list from users
        buildConversationsList(otherUsers);

        // Load recent messages for each conversation
        await loadRecentMessagesForAll(otherUsers);

        // Hide loading state
        if (convLoading) convLoading.style.display = 'none';

    } catch (error) {
        console.error('❌ Error loading data:', error);
        
        // Show demo/fallback data if database not ready
        showDemoConversations();
        
        if (document.getElementById('convLoading')) {
            document.getElementById('convLoading').style.display = 'none';
        }
    }
}

/**
 * Render Online Users List
 */
function renderOnlineUsers(onlineUsersArray) {
    const container = document.getElementById('onlineUsersList');
    const countEl = document.getElementById('onlineCount');

    if (!container) return;

    // Update online count
    if (countEl) {
        countEl.textContent = onlineUsersArray.length;
    }

    // Clear existing users set and rebuild
    onlineUsers.clear();

    if (onlineUsersArray.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 20px; color: var(--text-light); font-size: 0.85rem;">
                <i class="fas fa-moon" style="margin-right: 5px;"></i>
                No one's online right now
            </div>
        `;
        return;
    }

    container.innerHTML = onlineUsersArray.map(user => {
        // Add to online users set
        onlineUsers.add(user.userId);

        return `
            <div class="online-user-item" 
                 onclick="startConversation('${user.userId}', '${escapeHtml(user.name)}', '${user.email}')"
                 title="${escapeHtml(user.name)} - Click to chat">
                <div class="online-user-avatar" 
                     style="background: linear-gradient(135deg, ${getRandomColor(user.userId).join(',')})">
                    ${getInitials(user.name)}
                    <div class="online-indicator"></div>
                </div>
                <span class="online-user-name">${escapeHtml(user.name)}</span>
            </div>
        `;
    }).join('');
}

/**
 * Build Conversations List from Users
 */
function buildConversationsList(users) {
    allConversations = users.map(user => ({
        userId: user.userId,
        name: user.name,
        email: user.email || '',
        avatar: getInitials(user.name),
        color: getRandomColor(user.userId),
        isOnline: user.isOnline || false,
        lastMessage: '',
        lastTime: '',
        unreadCount: 0,
        lastMessageId: null
    }));

    updateConversationsDisplay();
}

/**
 * Update Conversations List UI
 */
function updateConversationsDisplay(filterText = '') {
    const container = document.getElementById('conversationsList');
    if (!container) return;

    // Filter conversations based on search
    let filteredConversations = allConversations;
    
    if (filterText) {
        filteredConversations = allConversations.filter(conv =>
            conv.name.toLowerCase().includes(filterText.toLowerCase())
        );
    }

    // Sort by last message time (most recent first)
    filteredConversations.sort((a, b) => {
        if (!a.lastTime && !b.lastTime) return 0;
        if (!a.lastTime) return 1;
        if (!b.lastTime) return -1;
        return new Date(b.lastTime) - new Date(a.lastTime);
    });

    // Check if empty
    if (filteredConversations.length === 0) {
        container.innerHTML = `
            <div style="padding: 40px; text-align: center; color: var(--text-light);">
                <i class="fas fa-comments" style="font-size: 3rem; margin-bottom: 15px; opacity: 0.2;"></i>
                <p>${filterText ? 'No matching conversations' : 'No conversations yet'}</p>
                <p style="font-size: 0.85rem; margin-top: 8px;">
                    ${filterText ? 'Try a different search term' : 'Start a new chat!'}
                </p>
            </div>
        `;
        return;
    }

    // Render conversation items
    container.innerHTML = filteredConversations.map(conv => {
        const isActive = currentConversation?.userId === conv.userId;
        
        return `
            <div class="conversation-item ${isActive ? 'active' : ''}" 
                 onclick="selectConversation('${conv.userId}', '${escapeHtml(conv.name).replace(/'/g, "\\'")}')"
                 data-user-id="${conv.userId}">
                
                <div class="conv-avatar" 
                     style="background: linear-gradient(135deg, ${conv.color.join(',')})">
                    ${conv.avatar}
                    ${conv.isOnline ? '<span class="status-dot online" style="position:absolute;bottom:2px;right:2px;width:10px;height:10px;"></span>' : ''}
                </div>
                
                <div class="conv-info">
                    <div class="conv-name">
                        ${escapeHtml(conv.name)}
                        ${conv.isOnline ? '<i class="fas fa-circle" style="color: var(--online-color); font-size: 0.6rem;"></i>' : ''}
                    </div>
                    <div class="conv-preview">${conv.lastMessage || 'Start a conversation...'}</div>
                </div>
                
                <div class="conv-meta">
                    <div class="conv-time">${conv.lastTime || ''}</div>
                    ${conv.unreadCount > 0 ? `<div class="unread-badge">${conv.unreadCount}</div>` : ''}
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Filter Conversations by Search Text
 */
function filterConversations() {
    const searchText = document.getElementById('searchInput')?.value || '';
    updateConversationsDisplay(searchText);
}

/**
 * Load Recent Messages for All Conversations
 */
async function loadRecentMessagesForAll(users) {
    for (const user of users) {
        try {
            const messagesResponse = await databases.listDocuments(
                CONFIG.databaseId,
                CONFIG.collectionId,
                [
                    Appwrite.Query.or([
                        Appwrite.Query.and([
                            Appwrite.Query.equal('senderId', currentUser.$id),
                            Appwrite.Query.equal('receiverId', user.userId)
                        ]),
                        Appwrite.Query.and([
                            Appwrite.Query.equal('senderId', user.userId),
                            Appwrite.Query.equal('receiverId', currentUser.$id)
                        ])
                    ]),
                    Appwrite.Query.orderDesc('$createdAt'),
                    Appwrite.Query.limit(1)
                ]
            );

            if (messagesResponse.documents.length > 0) {
                const latestMsg = messagesResponse.documents[0];
                const conv = allConversations.find(c => c.userId === user.userId);
                
                if (conv) {
                    conv.lastMessage = truncateText(latestMsg.content, 40);
                    conv.lastTime = formatTime(latestMsg.$createdAt);
                    conv.lastMessageId = latestMsg.$id;
                }
            }
        } catch (error) {
            console.warn(`Could not load messages for ${user.name}:`, error.message);
        }
    }

    // Update the display with loaded data
    updateConversationsDisplay(document.getElementById('searchInput')?.value || '');
}

/**
 * Truncate Text Helper
 */
function truncateText(text, maxLength) {
    if (!text) return '';
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
}

/**
 * Start/Select a Conversation
 */
function startConversation(userId, name, email) {
    selectConversation(userId, name);
    
    // Close sidebar on mobile after selection
    if (window.innerWidth <= 768) {
        toggleSidebar();
    }
}

function selectConversation(userId, name) {
    console.log(`💬 Selecting conversation with: ${name} (${userId})`);

    // Set current conversation
    currentConversation = { userId, name };
    selectedConversationId = userId;

    // Hide "no chat selected" state
    const noChatSelected = document.getElementById('noChatSelected');
    if (noChatSelected) noChatSelected.style.display = 'none';

    // Show chat header and input
    const chatHeader = document.getElementById('chatAreaHeader');
    const messageInput = document.getElementById('messageInputContainer');
    
    if (chatHeader) chatHeader.style.display = 'flex';
    if (messageInput) messageInput.style.display = 'block';

    // Update chat header info
    const conv = allConversations.find(c => c.userId === userId);
    if (conv) {
        // Avatar
        const avatarEl = document.getElementById('chatWithAvatar');
        if (avatarEl) {
            avatarEl.textContent = conv.avatar;
            avatarEl.style.background = `linear-gradient(135deg, ${conv.color.join(',')})`;
        }

        // Name
        const nameEl = document.getElementById('chatWithName');
        if (nameEl) nameEl.textContent = conv.name;

        // Status
        const statusDot = document.getElementById('chatStatusDot');
        const statusText = document.getElementById('chatWithStatus') || document.getElementById('chatStatusText');
        
        if (statusDot) {
            statusDot.className = `status-dot ${conv.isOnline ? 'online' : 'offline'}`;
        }
        if (statusText) {
            statusText.textContent = conv.isOnline ? 'Online' : 'Offline';
            statusText.style.color = conv.isOnline ? 'var(--online-color)' : 'var(--text-light)';
        }

        // Clear unread count
        conv.unreadCount = 0;
    }

    // Mark as active in sidebar
    updateConversationsDisplay(document.getElementById('searchInput')?.value || '');

    // Load messages for this conversation
    loadMessages(userId);

    // Focus on message input
    setTimeout(() => {
        const msgInput = document.getElementById('messageInput');
        if (msgInput) msgInput.focus();
    }, 100);
}

/**
 * Load Messages for a Specific Conversation
 */
async function loadMessages(receiverId) {
    const container = document.getElementById('messagesContainer');
    if (!container) return;

    // Clear previous messages (except typing indicator)
    const typingIndicator = document.getElementById('typingIndicator');
    container.innerHTML = '';
    if (typingIndicator) container.appendChild(typingIndicator);

    // Show loading state
    container.innerHTML += '<div class="spinner"></div>';
    isLoadingMessages = true;

    try {
        console.log(`📨 Loading messages for conversation: ${receiverId}`);

        // Query messages between current user and receiver
        const response = await databases.listDocuments(
            CONFIG.databaseId,
            CONFIG.collectionId,
            [
                Appwrite.Query.or([
                    Appwrite.Query.and([
                        Appwrite.Query.equal('senderId', currentUser.$id),
                        Appwrite.Query.equal('receiverId', receiverId)
                    ]),
                    Appwrite.Query.and([
                        Appwrite.Query.equal('senderId', receiverId),
                        Appwrite.Query.equal('receiverId', currentUser.$id)
                    ])
                ]),
                Appwrite.Query.orderAsc('$createdAt'),
                Appwrite.Query.limit(100)
            ]
        );

        console.log(`✅ Loaded ${response.documents.length} messages`);

        // Clear container again
        container.innerHTML = '';
        if (typingIndicator) container.appendChild(typingIndicator);

        // Check if empty
        if (response.documents.length === 0) {
            container.innerHTML += `
                <div style="text-align: center; color: var(--text-light); padding: 40px 20px;">
                    <i class="fas fa-comment-dots" style="font-size: 3rem; margin-bottom: 15px; opacity: 0.25;"></i>
                    <p>No messages yet</p>
                    <p style="font-size: 0.85rem;">Start the conversation by saying hello! 👋</p>
                </div>
            `;
            
            scrollToBottom();
            isLoadingMessages = false;
            return;
        }

        // Render each message
        response.documents.forEach(msg => {
            appendMessageToDOM(msg, false);
        });

        // Store in history
        messageHistory = response.documents;

        // Scroll to bottom
        scrollToBottom();

        isLoadingMessages = false;

    } catch (error) {
        console.error('❌ Error loading messages:', error);
        
        container.innerHTML = `
            <div style="text-align: center; color: var(--error-color); padding: 40px;">
                <i class="fas fa-exclamation-triangle" style="font-size: 3rem; margin-bottom: 15px;"></i>
                <p>Error loading messages</p>
                <button onclick="loadMessages('${receiverId}')" class="btn-small btn-primary" style="margin-top: 15px;">
                    <i class="fas fa-redo"></i> Retry
                </button>
            </div>
        `;
        
        isLoadingMessages = false;
    }
}

/**
 * Append Message to DOM
 */
function appendMessageToDOM(message, animate = true) {
    const container = document.getElementById('messagesContainer');
    if (!container) return;

    const isSentByMe = message.senderId === currentUser?.$id;
    
    const messageElement = document.createElement('div');
    messageElement.className = `message ${isSentByMe ? 'sent' : 'received'}`;
    if (!animate) messageElement.style.animation = 'none';
    
    // Message content HTML
    let html = '';
    
    // Show sender name for received messages
    if (!isSentByMe && message.senderName) {
        html += `<div class="message-sender">${escapeHtml(message.senderName)}</div>`;
    }
    
    // Message text (support line breaks)
    html += `<div class="message-text">${escapeHtml(message.content).replace(/\n/g, '<br>')}</div>`;
    
    // Timestamp
    html += `<div class="message-time">${formatMessageTime(message.$createdAt)}</div>`;
    
    messageElement.innerHTML = html;
    messageElement.dataset.messageId = message.$id;
    
    // Insert before typing indicator if it exists
    const typingIndicator = document.getElementById('typingIndicator');
    if (typingIndicator && typingIndicator.parentNode === container) {
        container.insertBefore(messageElement, typingIndicator);
    } else {
        container.appendChild(messageElement);
    }
}

/**
 * Send a New Message
 */
async function sendMessage() {
    const input = document.getElementById('messageInput');
    const content = input?.value?.trim();

    // Validations
    if (!content) {
        showToast('Please type a message first');
        return;
    }

    if (!currentConversation) {
        showToast('Please select a conversation first');
        return;
    }

    if (isLoadingMessages) {
        showToast('Please wait while messages load...');
        return;
    }

    console.log(`📤 Sending message to: ${currentConversation.name}`);

    // Create temporary message object for optimistic UI
    const tempMessage = {
        $id: 'temp-' + Date.now(),
        senderId: currentUser.$id,
        receiverId: currentConversation.userId,
        senderName: currentUser.name || 'You',
        content: content,
        $createdAt: new Date().toISOString(),
        temp: true
    };

    // Clear input immediately
    input.value = '';
    input.style.height = 'auto';

    // Add to DOM optimistically
    appendMessageToDOM(tempMessage, true);
    scrollToBottom();

    // Update conversation preview
    const conv = allConversations.find(c => c.userId === currentConversation.userId);
    if (conv) {
        conv.lastMessage = truncateText(content, 40);
        conv.lastTime = 'Just now';
        updateConversationsDisplay(document.getElementById('searchInput')?.value || '');
    }

    try {
        // Save to AppWrite Database
        const savedMessage = await databases.createDocument(
            CONFIG.databaseId,
            CONFIG.collectionId,
            Appwrite.ID.unique(), // Generate unique ID
            {
                senderId: currentUser.$id,
                receiverId: currentConversation.userId,
                senderName: currentUser.name || 'User',
                content: content,
                timestamp: new Date().toISOString()
            }
        );

        console.log('✅ Message saved:', savedMessage.$id);

        // Replace temporary message with real one
        const tempEl = document.querySelector(`[data-message-id="${tempMessage.$id}"]`);
        if (tempEl) {
            tempEl.dataset.messageId = savedMessage.$id;
            tempEl.classList.remove('temp');
        }

        // Stop typing indicator
        stopTyping();

    } catch (error) {
        console.error('❌ Error sending message:', error);
        showToast('Failed to send message. Please try again.');
        
        // Could add error state to the message here
    }
}

/**
 * Handle Keyboard Events in Message Input
 */
function handleKeyDown(event) {
    // Enter sends message (Shift+Enter for new line)
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
    }
}

/**
 * Handle Typing Indicator
 */
function handleTyping() {
    if (!currentConversation) return;

    // Start typing indicator after short delay
    if (!isTyping) {
        isTyping = true;
        // Could emit typing event here for realtime
    }

    // Debounce
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        isTyping = false;
        // Could emit stop-typing event here
    }, 1000);
}

function stopTyping() {
    isTyping = false;
    clearTimeout(typingTimeout);
}

/**
 * Scroll Messages Container to Bottom
 */
function scrollToBottom() {
    const container = document.getElementById('messagesContainer');
    if (container) {
        container.scrollTop = container.scrollHeight;
    }
}

/**
 * Toggle Sidebar (Mobile)
 */
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) {
        sidebar.classList.toggle('open');
    }
}

/**
 * Subscribe to Realtime Updates
 */
function subscribeToRealtime() {
    try {
        console.log('🔌 Subscribing to realtime updates...');

        // Subscribe to messages collection changes
        const subscription = client.subscribe(
            `databases.${CONFIG.databaseId}.collections.${CONFIG.collectionId}.documents`
        );

        // Listen for events
        subscription.subscribe((event) => {
            console.log('📡 Realtime event received:', event.events);

            // Handle new document creation (new message)
            if (event.events.includes('databases.*.collections.*.documents.create')) {
                handleNewRealtimeMessage(event.payload);
            }

            // Handle document update (message edited)
            if (event.events.includes('databases.*.collections.*.documents.update')) {
                handleUpdatedRealtimeMessage(event.payload);
            }

            // Handle document delete (message deleted)
            if (event.events.includes('databases.*.collections.*.documents.delete')) {
                handleDeletedRealtimeMessage(event.payload);
            }
        });

        // Store unsubscribe function
        unsubscribeRealtime = () => {
            subscription.close();
            console.log('🔌 Unsubscribed from realtime');
        };

        console.log('✅ Realtime subscription active');

    } catch (error) {
        console.error('❌ Realtime subscription error:', error);
        showToast('Realtime features may be limited');
    }
}

/**
 * Handle New Message from Realtime
 */
function handleNewRealtimeMessage(message) {
    console.log('📩 New message received:', message.senderName);

    // Ignore own messages (we already showed them)
    if (message.senderId === currentUser?.$id) return;

    // Check if this message is for current conversation
    const isCurrentChat = currentConversation && (
        message.senderId === currentConversation.userId ||
        message.receiverId === currentConversation.userId
    );

    if (isCurrentChat) {
        // Add to current chat view
        appendMessageToDOM(message, true);
        scrollToBottom();

        // Play notification sound (optional)
        playNotificationSound();
    } else {
        // Update conversation list with notification
        const conv = allConversations.find(c => 
            c.userId === message.senderId || c.userId === message.receiverId
        );

        if (conv) {
            conv.unreadCount = (conv.unreadCount || 0) + 1;
            conv.lastMessage = truncateText(message.content, 40);
            conv.lastTime = 'Just now';
            updateConversationsDisplay(document.getElementById('searchInput')?.value || '');
        }

        // Show browser notification (if permitted)
        showBrowserNotification(
            `${message.senderName || 'Someone'} sent you a message`,
            message.content
        );

        // Show toast
        showToast(`💬 New message from ${message.senderName || 'someone'}`);
    }
}

/**
 * Handle Updated Message from Realtime
 */
function handleUpdatedRealtimeMessage(message) {
    console.log('✏️ Message updated:', message.$id);

    // Find and update the message in DOM
    const msgEl = document.querySelector(`[data-message-id="${message.$id}"]`);
    if (msgEl) {
        const textEl = msgEl.querySelector('.message-text');
        if (textEl) {
            textEl.innerHTML = escapeHtml(message.content).replace(/\n/g, '<br>');
        }
    }
}

/**
 * Handle Deleted Message from Realtime
 */
function handleDeletedRealtimeMessage(messageData) {
    console.log('🗑️ Message deleted:', messageData.$id);

    // Remove from DOM
    const msgEl = document.querySelector(`[data-message-id="${messageData.$id}"]`);
    if (msgEl) {
        msgEl.style.animation = 'fadeOut 0.3s ease';
        setTimeout(() => msgEl.remove(), 300);
    }
}

/**
 * Play Notification Sound
 */
function playNotificationSound() {
    try {
        // Create audio context for notification sound
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.frequency.value = 800;
        oscillator.type = 'sine';
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);

        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.3);
    } catch (e) {
        // Audio not supported or blocked
    }
}

/**
 * Show Browser Notification
 */
function showBrowserNotification(title, body) {
    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, {
            body: body,
            icon: '💬',
            badge: '💬'
        });
    }
}

// Request notification permission on first interaction
document.addEventListener('click', () => {
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
}, { once: true });

/**
 * Show Demo/Fallback Conversations
 * Used when database is not ready
 */
function showDemoConversations() {
    console.log('🎭 Showing demo conversations');

    allConversations = [
        {
            userId: 'demo-alice',
            name: 'Alice Johnson',
            email: 'alice@example.com',
            avatar: 'AJ',
            color: ['#f093fb', '#f5576c'],
            isOnline: true,
            lastMessage: 'Hey! How are you doing today?',
            lastTime: '2m ago',
            unreadCount: 2
        },
        {
            userId: 'demo-bob',
            name: 'Bob Smith',
            email: 'bob@example.com',
            avatar: 'BS',
            color: ['#4facfe', '#00f2fe'],
            isOnline: true,
            lastMessage: 'See you at the meeting tomorrow!',
            lastTime: '1h ago',
            unreadCount: 0
        },
        {
            userId: 'demo-carol',
            name: 'Carol White',
            email: 'carol@example.com',
            avatar: 'CW',
            color: ['#43e97b', '#38f9d7'],
            isOnline: false,
            lastMessage: 'Thanks so much for your help! 🙏',
            lastTime: 'Yesterday',
            unreadCount: 0
        },
        {
            userId: 'demo-david',
            name: 'David Brown',
            email: 'david@example.com',
            avatar: 'DB',
            color: ['#fa709a', '#fee140'],
            isOnline: false,
            lastMessage: 'I sent you the project files 📎',
            lastTime: 'Yesterday',
            unreadCount: 1
        },
        {
            userId: 'demo-emma',
            name: 'Emma Davis',
            email: 'emma@example.com',
            avatar: 'ED',
            color: ['#a18cd1', '#fbc2eb'],
            isOnline: false,
            lastMessage: 'That sounds great! Let me know when...',
            lastTime: '2 days ago',
            unreadCount: 0
        },
        {
            userId: 'demo-frank',
            name: 'Frank Miller',
            email: 'frank@example.com',
            avatar: 'FM',
            color: ['#ff9a9e', '#fecfef'],
            isOnline: true,
            lastMessage: 'Did you see the game last night? ⚽',
            lastTime: '3 days ago',
            unreadCount: 0
        }
    ];

    // Update online users count
    const onlineCount = document.getElementById('onlineCount');
    if (onlineCount) onlineCount.textContent = '3';

    updateConversationsDisplay();
}

console.log('💬 Chat.js loaded - Messaging functions ready');