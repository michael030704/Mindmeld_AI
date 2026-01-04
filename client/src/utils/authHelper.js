// client/src/utils/authHelper.js
export const isLocalhost = window.location.hostname === 'localhost' || 
                          window.location.hostname === '127.0.0.1';

export const getGoogleAuthMethod = () => {
  if (isLocalhost) {
    console.warn('⚠️ Localhost detected: Using mock Google auth');
    return 'mock'; // Use mock auth in development
  }
  return 'redirect'; // Use redirect in production
};

// Mock Google auth for development
export const mockGoogleAuth = async () => {
  if (!isLocalhost) {
    throw new Error('Mock auth only available on localhost');
  }
  
  // Simulate a delay like real auth
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  return {
    user: {
      uid: 'dev-user-' + Date.now(),
      email: 'devuser@example.com',
      displayName: 'Development User',
      getIdToken: async () => 'dev-mock-token-' + Date.now()
    }
  };
};