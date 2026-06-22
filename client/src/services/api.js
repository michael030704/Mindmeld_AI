import { auth } from '../firebase/config';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';

// Helper to get auth token
const getAuthToken = async () => {
  try {
    if (auth && auth.currentUser) {
      return await auth.currentUser.getIdToken();
    }
  } catch (e) {
    // ignore token errors
  }
  return null;
};

// Helper to make fetch requests with auth
const makeRequest = async (endpoint, options = {}) => {
  const token = await getAuthToken();
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };
  
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const url = `${API_URL}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `HTTP ${response.status}`);
  }

  return response.json();
};

// API functions
export const getProtectedData = async () => {
  try {
    return await makeRequest('/protected', { method: 'GET' });
  } catch (error) {
    throw error;
  }
};

export const createItem = async (itemData) => {
  try {
    return await makeRequest('/items', {
      method: 'POST',
      body: JSON.stringify(itemData),
    });
  } catch (error) {
    throw error;
  }
};

export const getItems = async () => {
  try {
    return await makeRequest('/items', { method: 'GET' });
  } catch (error) {
    throw error;
  }
};

// Health check
export const checkServerHealth = async () => {
  try {
    return await makeRequest('/health', { method: 'GET' });
  } catch (error) {
    throw error;
  }
};

// Auth OTP endpoints
export const sendOtpToEmail = async (email) => {
  try {
    return await makeRequest('/auth/send-otp', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  } catch (error) {
    throw error;
  }
};

export const verifyOtpAndReset = async (email, code, newPassword) => {
  try {
    return await makeRequest('/auth/verify-otp', {
      method: 'POST',
      body: JSON.stringify({ email, code, newPassword }),
    });
  } catch (error) {
    throw error;
  }
};

export const verifyOtpOnly = async (email, code) => {
  try {
    return await makeRequest('/auth/verify-otp-only', {
      method: 'POST',
      body: JSON.stringify({ email, code }),
    });
  } catch (error) {
    throw error;
  }
};

// AI endpoint - calls the backend which proxies to Groq or OpenAI
// ✅ RATE LIMIT PROTECTION
let lastAIRequestTime = 0;
const AI_MIN_DELAY = 1000; // Minimum 1 second between AI requests
let aiRequestInProgress = false;

export const callAI = async (messages, model = 'llama3-8b-8192', maxTokens = 512) => {
  try {
    // Prevent concurrent AI requests
    if (aiRequestInProgress) {
      throw new Error('AI request already in progress. Please wait...');
    }

    // Enforce minimum delay between requests to avoid rate limiting
    const timeSinceLastRequest = Date.now() - lastAIRequestTime;
    if (timeSinceLastRequest < AI_MIN_DELAY) {
      const delayNeeded = AI_MIN_DELAY - timeSinceLastRequest;
      console.log(`[API] Throttling AI request: waiting ${delayNeeded}ms`);
      await new Promise(resolve => setTimeout(resolve, delayNeeded));
    }

    aiRequestInProgress = true;
    lastAIRequestTime = Date.now();

    const response = await makeRequest('/ai', {
      method: 'POST',
      body: JSON.stringify({
        messages,
        model,
        maxTokens,
      }),
    });

    aiRequestInProgress = false;
    return response;
  } catch (error) {
    aiRequestInProgress = false;
    throw error;
  }
};

// Users endpoints
export const searchUsers = async (query) => {
  try {
    return await makeRequest(`/users/search?q=${encodeURIComponent(query)}`, { 
      method: 'GET' 
    });
  } catch (error) {
    throw error;
  }
};

export const getAllUsers = async () => {
  try {
    return await makeRequest('/users', { method: 'GET' });
  } catch (error) {
    throw error;
  }
};

// Messages endpoints
export const sendMessage = async (from, to, text) => {
  try {
    return await makeRequest('/messages', {
      method: 'POST',
      body: JSON.stringify({
        from,
        to,
        text,
        ts: new Date().toISOString()
      }),
    });
  } catch (error) {
    throw error;
  }
};

export const getMessages = async (user1, user2) => {
  try {
    return await makeRequest(`/messages?user1=${encodeURIComponent(user1)}&user2=${encodeURIComponent(user2)}`, { 
      method: 'GET' 
    });
  } catch (error) {
    throw error;
  }
};

export const getUnreadMessages = async (userId) => {
  try {
    return await makeRequest(`/messages/unread?user=${encodeURIComponent(userId)}`, { 
      method: 'GET' 
    });
  } catch (error) {
    throw error;
  }
};

// Online status endpoints
export const updateUserOnlineStatus = async (userId, isOnline) => {
  try {
    return await makeRequest(`/users/${userId}/online`, {
      method: 'POST',
      body: JSON.stringify({ isOnline }),
    });
  } catch (error) {
    console.error('Failed to update online status:', error);
    throw error;
  }
};

// Save user profile to Firebase
export const saveUserProfile = async (userId, profileData) => {
  try {
    return await makeRequest('/users', {
      method: 'POST',
      body: JSON.stringify({
        id: userId,
        ...profileData
      }),
    });
  } catch (error) {
    console.error('Failed to save user profile:', error);
    throw error;
  }
};

// Message request endpoints
export const getMessageRequests = async (userId) => {
  try {
    return await makeRequest(`/messages/requests?user=${encodeURIComponent(userId)}`, {
      method: 'GET'
    });
  } catch (error) {
    console.error('Failed to get message requests:', error);
    throw error;
  }
};

export const acceptMessageRequest = async (fromUserId, toUserId) => {
  try {
    return await makeRequest(`/messages/requests/${fromUserId}/accept`, {
      method: 'POST',
      body: JSON.stringify({ toUserId })
    });
  } catch (error) {
    console.error('Failed to accept message request:', error);
    throw error;
  }
};

export const deleteMessageRequest = async (fromUserId, toUserId) => {
  try {
    return await makeRequest(`/messages/requests/${fromUserId}?toUserId=${encodeURIComponent(toUserId)}`, {
      method: 'DELETE'
    });
  } catch (error) {
    console.error('Failed to delete message request:', error);
    throw error;
  }
};

export const blockUser = async (fromUserId, toUserId) => {
  try {
    return await makeRequest(`/messages/requests/${fromUserId}/block`, {
      method: 'POST',
      body: JSON.stringify({ toUserId })
    });
  } catch (error) {
    console.error('Failed to block user:', error);
    throw error;
  }
};

// Follow/Unfollow endpoints
export const followUser = async (targetUserId, currentUserId) => {
  try {
    return await makeRequest(`/users/${targetUserId}/follow`, {
      method: 'POST',
      body: JSON.stringify({ followerId: currentUserId })
    });
  } catch (error) {
    console.error('Failed to follow user:', error);
    throw error;
  }
};

export const unfollowUser = async (targetUserId, currentUserId) => {
  try {
    return await makeRequest(`/users/${targetUserId}/unfollow`, {
      method: 'POST',
      body: JSON.stringify({ followerId: currentUserId })
    });
  } catch (error) {
    console.error('Failed to unfollow user:', error);
    throw error;
  }
};

export const getUserProfile = async (userId) => {
  try {
    return await makeRequest(`/users/${userId}`, { 
      method: 'GET' 
    });
  } catch (error) {
    console.error('Failed to get user profile:', error);
    throw error;
  }
};

export default makeRequest;