import React, { useState, useEffect, useRef, useCallback } from 'react';
import Avatar from './Avatar';
import { getMessages, getMessageRequests, acceptMessageRequest, deleteMessageRequest, blockUser } from '../services/api';

export default function Messages({ 
  chats, 
  currentUser, 
  users, 
  following,
  onSendMessage,
  getUserNameFromId,
  showAlertPopup,
  showToast,
  isUserActive,
  formatLastSeen
}) {
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [messageInput, setMessageInput] = useState('');
  const [backendMessages, setBackendMessages] = useState({});
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [pendingRequests, setPendingRequests] = useState({});
  const [acceptedRequests, setAcceptedRequests] = useState(new Set());
  const [unreadCounts, setUnreadCounts] = useState({});
  const messagesEndRef = useRef(null);
  const messagesCacheRef = useRef({}); // Cache for loaded messages
  const refreshIntervalRef = useRef(null); // Auto-refresh interval
  const lastFetchTimeRef = useRef({}); // Track when we last fetched

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    
    // Mark messages as read when a conversation is selected
    if (selectedUserId) {
      setUnreadCounts(prev => ({
        ...prev,
        [selectedUserId]: 0
      }));
    }
  }, [chats, selectedUserId, backendMessages]);

  // Load pending message requests when component mounts
  useEffect(() => {
    if (!currentUser?.uid) return;
    
    getMessageRequests(currentUser.uid)
      .then(requests => {
        setPendingRequests(requests || {});
      })
      .catch(err => {
        console.warn('Failed to load message requests:', err);
      });
  }, [currentUser?.uid]);

  // Load messages with faster polling instead of debounce
  const loadMessagesNow = useCallback(async (userId) => {
    if (!userId || !currentUser?.uid) return;
    
    // Don't fetch more than once per 1 second
    const lastFetch = lastFetchTimeRef.current[userId] || 0;
    if (Date.now() - lastFetch < 1000) return;
    
    lastFetchTimeRef.current[userId] = Date.now();
    setLoadingMessages(true);
    
    try {
      const messages = await getMessages(currentUser.uid, userId);
      messagesCacheRef.current[userId] = messages || [];
      setBackendMessages(prev => ({
        ...prev,
        [userId]: messages || []
      }));
    } catch (err) {
      console.error('Failed to load messages:', err);
      showToast('Could not load messages', 'error');
    } finally {
      setLoadingMessages(false);
    }
  }, [currentUser?.uid, showToast]);

  // Load messages immediately when conversation selected
  useEffect(() => {
    if (!selectedUserId) return;
    
    // Load immediately
    loadMessagesNow(selectedUserId);
    
    // Set up auto-refresh every 3 seconds
    refreshIntervalRef.current = setInterval(() => {
      loadMessagesNow(selectedUserId);
    }, 3000);
    
    // Cleanup interval on unmount or selection change
    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
  }, [selectedUserId, loadMessagesNow]);

  // Get conversations list - includes both active chats and followed users
  const getConversations = () => {
    const conversations = [];
    const seenUserIds = new Set();
    
    if (!chats || !users) return conversations;
    
    // Add users from chats (active conversations)
    Object.keys(chats || {}).forEach(userId => {
      const user = users.find(u => u.id === userId);
      const messages = chats[userId] || [];
      
      if (messages.length > 0 || user) {
        conversations.push({
          userId,
          userName: user?.name || getUserNameFromId(userId) || userId,
          photoURL: user?.photoURL,
          messages,
          lastMessage: messages[messages.length - 1],
          lastTime: messages.length > 0 ? new Date(messages[messages.length - 1].ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''
        });
        seenUserIds.add(userId);
      }
    });
    
    // Add followed users that don't have active chats
    if (following && Array.isArray(following)) {
      following.forEach(userId => {
        if (!seenUserIds.has(userId)) {
          const user = users.find(u => u.id === userId);
          if (user) {
            conversations.push({
              userId,
              userName: user?.name || userId,
              photoURL: user?.photoURL,
              messages: [],
              lastMessage: null,
              lastTime: ''
            });
            seenUserIds.add(userId);
          }
        }
      });
    }
    
    return conversations.sort((a, b) => 
      new Date(b.lastMessage?.ts || 0) - new Date(a.lastMessage?.ts || 0)
    );
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!selectedUserId || !messageInput.trim()) return;

    // Allow messaging: either following the user OR accepted a message request
    const canMessage = following.includes(selectedUserId) || acceptedRequests.has(selectedUserId);
    
    if (!canMessage) {
      showAlertPopup('Cannot send message', 'You can only message users you follow or who have sent you a message request.');
      return;
    }

    onSendMessage(selectedUserId, messageInput);
    setMessageInput('');
  };

  const handleAcceptRequest = async (fromUserId) => {
    try {
      await acceptMessageRequest(fromUserId, currentUser.uid);
      setAcceptedRequests(prev => new Set([...prev, fromUserId]));
      setPendingRequests(prev => {
        const updated = { ...prev };
        delete updated[fromUserId];
        return updated;
      });
      showToast('Message request accepted!', 'success');
    } catch (err) {
      showToast('Failed to accept request', 'error');
    }
  };

  const handleDeleteRequest = async (fromUserId) => {
    try {
      await deleteMessageRequest(fromUserId, currentUser.uid);
      setPendingRequests(prev => {
        const updated = { ...prev };
        delete updated[fromUserId];
        return updated;
      });
      showToast('Message request declined', 'info');
    } catch (err) {
      showToast('Failed to decline request', 'error');
    }
  };

  const handleBlockUser = async (fromUserId) => {
    try {
      await blockUser(fromUserId, currentUser.uid);
      setPendingRequests(prev => {
        const updated = { ...prev };
        delete updated[fromUserId];
        return updated;
      });
      showToast('User blocked', 'info');
    } catch (err) {
      showToast('Failed to block user', 'error');
    }
  };

  const conversations = getConversations();
  
  // Calculate unread counts for each conversation
  conversations.forEach(conv => {
    if (unreadCounts[conv.userId] === undefined && conv.userId !== selectedUserId) {
      // Count unread messages: messages from other user that haven't been marked as read
      const unreadCount = (conv.messages || []).filter(msg => {
        const isFromOther = msg.from !== currentUser?.uid && msg.sender !== currentUser?.displayName;
        return isFromOther;
      }).length;
      
      if (unreadCount > 0) {
        setUnreadCounts(prev => ({
          ...prev,
          [conv.userId]: unreadCount
        }));
      }
    }
  });
  
  const selectedConv = selectedUserId 
    ? conversations.find(c => c.userId === selectedUserId)
    : null;

  // Merge backend and local messages for display
  const getDisplayMessages = () => {
    if (!selectedConv) return [];
    const backend = backendMessages[selectedUserId] || [];
    const local = selectedConv.messages || [];
    
    // Create a map of messages by text + timestamp for deduplication
    const messageMap = new Map();
    
    // Add backend messages first (they're the source of truth)
    backend.forEach(msg => {
      const key = `${msg.from || msg.sender}:${msg.text}:${msg.ts}`;
      messageMap.set(key, msg);
    });
    
    // Add local messages, but only if they're not already in the backend
    local.forEach(msg => {
      const key = `${msg.from || msg.sender}:${msg.text}:${msg.ts}`;
      if (!messageMap.has(key)) {
        messageMap.set(key, msg);
      }
    });
    
    // Convert back to array and sort by timestamp
    const merged = Array.from(messageMap.values());
    return merged.sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
  };

  return (
    <div className="messages-view">
      {/* Conversations Sidebar */}
      <aside className="messages-sidebar">
        {/* Pending Message Requests */}
        {Object.keys(pendingRequests).length > 0 && (
          <div className="pending-requests-section">
            <div className="section-header">
              <h4>📨 Message Requests ({Object.keys(pendingRequests).length})</h4>
            </div>
            <div className="pending-requests-list">
              {Object.entries(pendingRequests).map(([fromUserId, messages]) => {
                const sender = users.find(u => u.id === fromUserId);
                const firstMsg = messages[0];
                return (
                  <div key={fromUserId} className="pending-request-card">
                    <div className="request-sender">
                      <Avatar size={36} name={sender?.name || fromUserId} photoURL={sender?.photoURL} />
                      <div className="sender-info">
                        <h5>{sender?.name || 'Unknown User'}</h5>
                        <p className="request-preview">{firstMsg?.text?.substring(0, 40)}...</p>
                      </div>
                    </div>
                    <div className="request-actions">
                      <button
                        className="button small primary"
                        onClick={() => handleAcceptRequest(fromUserId)}
                        title="Accept message request"
                      >
                        ✓ Accept
                      </button>
                      <button
                        className="button small secondary"
                        onClick={() => handleDeleteRequest(fromUserId)}
                        title="Decline request"
                      >
                        ✕ Delete
                      </button>
                      <button
                        className="button small danger"
                        onClick={() => handleBlockUser(fromUserId)}
                        title="Block this user"
                      >
                        🚫 Block
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="sidebar-header">
          <h3>💬 Your Conversations</h3>
          {conversations.length > 0 && (
            <span className="conversation-count badge">{conversations.length}</span>
          )}
        </div>

        {conversations.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">💭</div>
            <p>No conversations yet</p>
            <small>Follow someone from the Friends tab to start messaging</small>
          </div>
        ) : (
          <div className="conversation-list">
            {conversations.map(conv => {
              const unread = unreadCounts[conv.userId] || 0;
              return (
                <button
                  key={conv.userId}
                  className={`conversation-item ${selectedUserId === conv.userId ? 'active' : ''} ${unread > 0 ? 'has-unread' : ''}`}
                  onClick={() => setSelectedUserId(conv.userId)}
                  title={conv.userName}
                >
                  <Avatar 
                    size={40} 
                    name={conv.userName} 
                    photoURL={conv.photoURL} 
                  />
                  <div className="conv-info">
                    <h4>{conv.userName}</h4>
                    <p className="last-msg">
                      {conv.lastMessage?.text?.substring(0, 35) || 'No messages yet'}...
                    </p>
                  </div>
                  <div className="conv-meta">
                    {conv.lastTime && (
                      <span className="time-badge">{conv.lastTime}</span>
                    )}
                    {unread > 0 && (
                      <span className="unread-badge">{unread}</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </aside>

      {/* Main Chat Area */}
      <div className="messages-main">
        {selectedConv ? (
          <>
            {/* Chat Header */}
            <div className="chat-header">
              <div className="chat-header-left">
                <Avatar 
                  size={40} 
                  name={selectedConv.userName} 
                  photoURL={selectedConv.photoURL} 
                />
                <div className="chat-header-info">
                  <h3>{selectedConv.userName}</h3>
                  <small className="online-status">
                    {(() => {
                      const user = users.find(u => u.id === selectedUserId);
                      if (isUserActive && user && isUserActive(user)) {
                        return '🟢 Online';
                      } else if (user && formatLastSeen) {
                        return `Last seen ${formatLastSeen(user)}`;
                      }
                      return 'Offline';
                    })()}
                  </small>
                </div>
              </div>
              <button 
                className="button secondary small refresh-btn"
                onClick={() => loadMessagesNow(selectedUserId)}
                disabled={loadingMessages}
                title="Refresh messages"
              >
                {loadingMessages ? '⟳ Loading...' : '⟳ Refresh'}
              </button>
            </div>

            {/* Messages Area */}
            <div className="messages-thread">
              {loadingMessages && (
                <div className="loading-indicator">
                  <div className="spinner"></div>
                  <span>Loading messages...</span>
                </div>
              )}
              {getDisplayMessages().length > 0 ? (
                <>
                  {getDisplayMessages().map((msg, idx) => {
                    const isOwn = msg.sender === currentUser?.displayName || msg.from === currentUser?.uid;
                    return (
                      <div
                        key={idx}
                        className={`message-bubble ${isOwn ? 'sent' : 'received'}`}
                      >
                        <p className="message-text">{msg.text}</p>
                        <small className="msg-time">
                          {new Date(msg.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </small>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </>
              ) : (
                <div className="empty-conversation">
                  <div className="empty-conv-icon">👋</div>
                  <p>Start a conversation!</p>
                  <small>Say hello to {selectedConv.userName}</small>
                </div>
              )}
            </div>

            {/* Message Input */}
            <form className="message-input-form" onSubmit={handleSendMessage}>
              <textarea
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                placeholder="Type your message... (Shift+Enter for new line)"
                className="message-input"
                rows="2"
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage(e);
                  }
                }}
              />
              <button
                type="submit"
                disabled={!messageInput.trim()}
                className="button primary send-btn"
              >
                ✓ Send
              </button>
            </form>
          </>
        ) : (
          <div className="no-conversation-selected">
            <div className="empty-icon">💬</div>
            <h3>Select a Conversation</h3>
            <p>Choose someone from your conversations to start messaging</p>
            <p className="hint">💡 Tip: Go to Friends tab to add new people to message</p>
          </div>
        )}
      </div>
    </div>
  );
}
