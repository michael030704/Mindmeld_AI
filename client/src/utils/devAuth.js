// client/src/utils/devAuth.js
const isDevelopment = window.location.hostname === 'localhost' || 
                      window.location.hostname === '127.0.0.1';

export const setupDevelopmentAuth = () => {
  if (!isDevelopment) return;
  
  console.log("🔧 Setting up development authentication mock");
  
  // Mock Firebase auth for development
  window.firebaseMock = {
    auth: () => ({
      currentUser: null,
      onAuthStateChanged: (callback) => {
        // Simulate no user initially
        setTimeout(() => callback(null), 100);
        return () => {}; // unsubscribe function
      },
      createUserWithEmailAndPassword: async (email, password) => {
        console.log("DEV: Creating user", email);
        await new Promise(resolve => setTimeout(resolve, 1000));
        return {
          user: {
            uid: 'dev-' + Date.now(),
            email,
            displayName: null,
            photoURL: null,
            getIdToken: async () => 'dev-token-' + Date.now()
          }
        };
      },
      signInWithEmailAndPassword: async (email, password) => {
        console.log("DEV: Signing in", email);
        await new Promise(resolve => setTimeout(resolve, 1000));
        return {
          user: {
            uid: 'dev-' + Date.now(),
            email,
            displayName: null,
            photoURL: null,
            getIdToken: async () => 'dev-token-' + Date.now()
          }
        };
      },
      signOut: async () => {
        console.log("DEV: Signing out");
        await new Promise(resolve => setTimeout(resolve, 500));
        return;
      }
    })
  };
  
  console.log("✅ Development auth mock ready");
};

// Mock Google auth for development
export const mockGoogleAuth = async () => {
  if (!isDevelopment) {
    throw new Error('Mock auth only available in development');
  }
  
  console.log("DEV: Mock Google auth");
  await new Promise(resolve => setTimeout(resolve, 1500));
  
  return {
    user: {
      uid: 'google-dev-' + Date.now(),
      email: 'google.user@example.com',
      displayName: 'Google Test User',
      photoURL: null,
      getIdToken: async () => 'google-dev-token-' + Date.now()
    }
  };
};