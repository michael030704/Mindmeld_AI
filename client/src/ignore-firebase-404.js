// client/src/ignore-firebase-404.js - UPDATED
if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
  console.log('🔧 Development mode: Setting up Firebase error suppression');
  
  // Store original console methods
  const originalConsoleError = console.error;
  const originalConsoleWarn = console.warn;
  
  // Override console.error to suppress common Firebase errors
  console.error = function(...args) {
    const message = args[0]?.message || args[0] || '';
    
    // Common Firebase errors to suppress in development
    const errorsToSuppress = [
      'firebase/init.json',
      '__/firebase/init.json',
      'auth/popup-closed-by-user',
      'auth/popup-blocked',
      'auth/cancelled-popup-request'
    ];
    
    const shouldSuppress = errorsToSuppress.some(error => 
      typeof message === 'string' && message.includes(error)
    );
    
    if (shouldSuppress) {
      console.log('🔕 Suppressed Firebase error:', message.substring(0, 100));
      return;
    }
    
    // Pass through all other errors
    originalConsoleError.apply(console, args);
  };
  
  // Also suppress warnings about the same
  console.warn = function(...args) {
    const message = args[0] || '';
    
    if (typeof message === 'string' && message.includes('firebase/init.json')) {
      console.log('🔕 Suppressed Firebase warning');
      return;
    }
    
    originalConsoleWarn.apply(console, args);
  };
  
  console.log('✅ Firebase error suppression enabled');
}