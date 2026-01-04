import axios from 'axios';
import { auth } from '../firebase/config';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';

const api = axios.create({
  baseURL: API_URL,
  timeout: 10000, // 10 second timeout
});

// Request interceptor to add token from Firebase Auth
api.interceptors.request.use(
  async (config) => {
    try {
      if (auth && auth.currentUser) {
        const token = await auth.currentUser.getIdToken();
        if (token) config.headers.Authorization = `Bearer ${token}`;
      }
    } catch (e) {
      // ignore token errors
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      // Token expired — redirect to login to reauthenticate
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// API functions
export const getProtectedData = async () => {
  try {
    const response = await api.get('/protected');
    return response.data;
  } catch (error) {
    console.error('Error getting protected data:', error);
    throw error;
  }
};

export const createItem = async (itemData) => {
  try {
    const response = await api.post('/items', itemData);
    return response.data;
  } catch (error) {
    console.error('Error creating item:', error);
    throw error;
  }
};

export const getItems = async () => {
  try {
    const response = await api.get('/items');
    return response.data;
  } catch (error) {
    console.error('Error fetching items:', error);
    throw error;
  }
};

// Health check
export const checkServerHealth = async () => {
  try {
    const response = await api.get('/health');
    return response.data;
  } catch (error) {
    console.error('Server health check failed:', error);
    throw error;
  }
};

// Auth OTP endpoints
export const sendOtpToEmail = async (email) => {
  try {
    const response = await api.post('/auth/send-otp', { email });
    return response.data;
  } catch (error) {
    console.error('Error sending OTP:', error);
    throw error;
  }
};

export const verifyOtpAndReset = async (email, code, newPassword) => {
  try {
    const response = await api.post('/auth/verify-otp', { email, code, newPassword });
    return response.data;
  } catch (error) {
    console.error('Error verifying OTP:', error);
    throw error;
  }
};

export const verifyOtpOnly = async (email, code) => {
  try {
    const response = await api.post('/auth/verify-otp-only', { email, code });
    return response.data;
  } catch (error) {
    console.error('Error verifying OTP only:', error);
    throw error;
  }
};

export default api;