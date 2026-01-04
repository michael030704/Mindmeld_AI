import React, { createContext, useState, useEffect, useContext } from 'react';
import { auth, db } from '../firebase/config';
import { collection, doc, getDoc, getDocs, query, where, setDoc } from 'firebase/firestore';

const AuthContext = createContext();

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Detect if we're on localhost
  const defaultIsLocal = window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1';
  
  let initialDev = false;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('useRealAuth') === 'true') initialDev = false;
    if (params.get('useDevAuth') === 'true') initialDev = true;
  } catch (e) {
    // URLSearchParams may be unavailable in some environments
  }

  const [isDevMode, setIsDevModeState] = useState(initialDev);

  const setIsDevMode = (val) => {
    // Do NOT persist dev mode to localStorage; keep in-memory only.
    setIsDevModeState(val);
  };

  // --- Clear all user-specific data ---
  const clearAllUserData = () => {
    if (currentUser?.uid) {
      // Clear per-user fields in Firestore (notes/goals/flashcards/etc.)
      try {
        const userRef = doc(db, 'users', currentUser.uid);
        // Overwrite the common user data containers with empty values
        setDoc(userRef, { notes: [], goals: [], flashcards: [], mentorState: {}, following: [], followers: [] }, { merge: true });
      } catch (e) {
        console.warn('Failed to clear Firestore user data:', e);
      }
    }
  };

  // --- DEV MODE FUNCTIONS ---
  const devSignup = async (email, password, names = {}) => {
    console.log("🔧 DEV: Mock signup for", email, 'names=', names);
    await new Promise(resolve => setTimeout(resolve, 1000));
    try {
      // Store dev users in Firestore so that other clients see them too
      const usersCol = collection(db, 'users');
      const q = query(usersCol, where('email', '==', email));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const err = new Error('Email already in use (dev)');
        err.code = 'auth/email-already-in-use';
        throw err;
      }

      const uid = 'dev-user-' + Date.now();
      const userEntry = { uid, email, password, ...names, displayName: [names.firstName, names.middleName, names.lastName].filter(Boolean).join(' ').trim() || null };
      await setDoc(doc(db, 'users', uid), userEntry);

      const mockUser = {
        uid,
        email,
        displayName: userEntry.displayName,
        getIdToken: async () => 'dev-token-' + Date.now()
      };

      setCurrentUser(mockUser);
      return { user: mockUser };
    } catch (e) {
      throw e;
    }
  };

  const devLogin = async (email, password) => {
    console.log("🔧 DEV: Mock login for", email);
    await new Promise(resolve => setTimeout(resolve, 1000));
    try {
      const usersCol = collection(db, 'users');
      const q = query(usersCol, where('email', '==', email));
      const snap = await getDocs(q);
      if (snap.empty) {
        const err = new Error('No user found (dev)');
        err.code = 'auth/user-not-found';
        throw err;
      }
      const found = snap.docs[0].data();
      if (found.password !== password) {
        const err = new Error('Wrong password (dev)');
        err.code = 'auth/wrong-password';
        throw err;
      }

      const mockUser = {
        uid: found.uid,
        email: found.email,
        displayName: found.displayName || null,
        getIdToken: async () => 'dev-token-' + Date.now()
      };

      setCurrentUser(mockUser);
      return { user: mockUser };
    } catch (e) {
      throw e;
    }
  };

  const devGoogleLogin = async () => {
    console.log("🔧 DEV: Mock Google login");
    await new Promise(resolve => setTimeout(resolve, 1500));
    const uid = 'google-dev-' + Date.now();
    const mockUser = {
      uid,
      email: 'google.user@example.com',
      displayName: 'Google Test User',
      getIdToken: async () => 'google-dev-token-' + Date.now()
    };

    // Persist mock Google user in Firestore so it is visible to the rest of the app
    try {
      await setDoc(doc(db, 'users', uid), { uid, email: mockUser.email, displayName: mockUser.displayName });
    } catch (e) {
      console.warn('Failed to persist dev Google user:', e);
    }

    setCurrentUser(mockUser);
    return { user: mockUser };
  };

  // --- REAL (FIREBASE) MODE FUNCTIONS ---
  const realSignup = async (email, password, names = {}) => {
    const { createUserWithEmailAndPassword, updateProfile } = await import('firebase/auth');
    console.log('REAL signup names=', names);

    const cred = await createUserWithEmailAndPassword(auth, email, password);
    const displayName = [names.firstName, names.middleName, names.lastName]
      .filter(Boolean)
      .join(' ')
      .trim();

    if (displayName) {
      try {
        await updateProfile(cred.user, { displayName });
        // Do not persist pendingDisplayName in localStorage; Firestore will be authoritative for profile data
      } catch (e) {
        console.warn('Failed to set displayName on signup:', e.message || e);
      }
    }

    const userObj = {
      uid: cred.user.uid,
      email: cred.user.email,
      displayName: displayName || null,
    };
    setCurrentUser(userObj);

    return cred;
  };

  const realLogin = async (email, password) => {
    const { signInWithEmailAndPassword } = await import('firebase/auth');
    return signInWithEmailAndPassword(auth, email, password);
  };

  const realGoogleLogin = async () => {
    const { GoogleAuthProvider, signInWithPopup, signOut } = await import('firebase/auth');
    
    try {
      await signOut(auth);
      console.log("Signed out previous user to force account selection");
    } catch (error) {
      console.log("No user to sign out or sign out failed:", error);
    }
    
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({
      prompt: 'select_account',
      login_hint: '',
      auth_type: 'reauthenticate'
    });
    provider.addScope('profile');
    provider.addScope('email');
    
    return signInWithPopup(auth, provider);
  };

  const googleLogout = async () => {
    console.log("Performing Google logout...");
    // NOTE: Do NOT clear per-user data on logout — keep notes and progress persisted.
    // Only clear session tokens and in-memory user state.
    if (!isDevMode) {
      const { signOut } = await import('firebase/auth');
      await signOut(auth);
    }
    
    setCurrentUser(null);
    
    const domains = ['', '.google.com', 'accounts.google.com'];
    domains.forEach(domain => {
      document.cookie.split(";").forEach(c => {
        const cookie = c.trim();
        const eqPos = cookie.indexOf("=");
        const name = eqPos > -1 ? cookie.substr(0, eqPos) : cookie;
        document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;" + 
          (domain ? "domain=" + domain + ";" : "");
      });
    });
    
    window.open('https://accounts.google.com/Logout', '_blank');
    
    setTimeout(() => {
      window.location.reload();
    }, 1000);
    
    return true;
  };

  const realLogout = async () => {
    const { signOut } = await import('firebase/auth');
    
    await signOut(auth);
    setCurrentUser(null);
  };

  const devLogout = async () => {
    // Preserve user data (notes, flashcards, mentor state) across logouts in dev mode.
    setCurrentUser(null);
  };

  const updateProfileNames = async (firstName, middleName, lastName) => {
    const names = { firstName, middleName, lastName };
    const displayName = [firstName, middleName, lastName].filter(Boolean).join(' ').trim();

    if (isDevMode) {
      try {
        // Update dev user record in Firestore
        const usersCol = collection(db, 'users');
        const q = query(usersCol, where('email', '==', (currentUser?.email || '')));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const docRef = snap.docs[0].ref;
          await setDoc(docRef, { ...names, displayName }, { merge: true });
        }

        setCurrentUser(prev => ({ ...prev, displayName: displayName || prev?.displayName }));
        return { message: 'Profile updated (dev)' };
      } catch (e) {
        console.error('Failed to update dev profile:', e);
        throw e;
      }
    }

    try {
      const { updateProfile } = await import('firebase/auth');
      if (!auth.currentUser) throw new Error('No authenticated user');
      await updateProfile(auth.currentUser, { displayName });
      setCurrentUser(prev => ({ ...prev, displayName }));
      // Do not persist profile into localStorage; Firestore / Firebase Auth will be authoritative.
      return { message: 'Profile updated' };
    } catch (e) {
      console.error('Failed to update profile:', e);
      throw e;
    }
  };

  const signup = isDevMode ? devSignup : realSignup;
  const login = isDevMode ? devLogin : realLogin;
  const googleLogin = isDevMode ? devGoogleLogin : realGoogleLogin;
  const logout = isDevMode ? devLogout : realLogout;

  // Auth state listener
  useEffect(() => {
    if (isDevMode) {
      // In dev mode we do not persist session in localStorage anymore.
      setLoading(false);
    } else {
      const setupListener = async () => {
        try {
          const { onAuthStateChanged } = await import('firebase/auth');
          
          const unsubscribe = onAuthStateChanged(auth, async (user) => {
            setLoading(false);

            if (user) {
              let displayName = user.displayName || null;
              const userObj = {
                uid: user.uid,
                email: user.email,
                displayName
              };

              setCurrentUser(userObj);
            } else {
              setCurrentUser(null);
              // session cleared; no localStorage cleanup required
            }
          });
          
          return unsubscribe;
        } catch (error) {
          console.error('Firebase auth error:', error);
          setLoading(false);
        }
      };
      
      const unsub = setupListener();
      return () => {
        if (unsub && unsub.then) unsub.then(u => u && u());
      };
    }
  }, [isDevMode]);

  const value = {
    currentUser,
    signup,
    login,
    logout,
    googleLogin,
    googleLogout,
    updateProfileNames,
    loading,
    isDevMode,
    setIsDevMode,
    clearAllUserData, // Export for use in components
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}