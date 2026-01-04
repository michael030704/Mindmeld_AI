import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { db } from '../firebase/config';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const UserDataContext = createContext();

export function useUserData() {
  const context = useContext(UserDataContext);
  if (!context) {
    throw new Error('useUserData must be used within a UserDataProvider');
  }
  return context;
}

export function UserDataProvider({ children }) {
  const { currentUser, isDevMode, logout } = useAuth();
  const [goals, setGoals] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dataVersion, setDataVersion] = useState(1);

  // Load user data from Firestore
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!currentUser?.uid) {
        setGoals([]);
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      try {
        const userRef = doc(db, 'users', currentUser.uid);
        const snap = await getDoc(userRef);
        if (!snap.exists()) {
          setGoals([]);
        } else {
          const data = snap.data();
          setGoals(Array.isArray(data.goals) ? data.goals : []);
        }
      } catch (error) {
        console.error('Error loading user data from Firestore:', error);
        setGoals([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [currentUser, dataVersion]);

  // Save goals with user-specific key
  const saveGoals = useCallback((newGoals) => {
    if (!currentUser) return;
    setGoals(newGoals);
    try {
      const userRef = doc(db, 'users', currentUser.uid);
      setDoc(userRef, { goals: newGoals }, { merge: true });
    } catch (error) {
      console.error('Error saving goals to Firestore:', error);
    }
  }, [currentUser]);

  // Add a goal
  const addGoal = useCallback((goal) => {
    const newGoal = {
      ...goal,
      id: Date.now().toString(),
      createdAt: new Date().toISOString(),
      userId: currentUser?.uid,
    };
    
    const updatedGoals = [...goals, newGoal];
    saveGoals(updatedGoals);
    return newGoal;
  }, [goals, saveGoals, currentUser]);

  // Update a goal
  const updateGoal = useCallback((id, updates) => {
    const updatedGoals = goals.map(goal => 
      goal.id === id ? { ...goal, ...updates, updatedAt: new Date().toISOString() } : goal
    );
    saveGoals(updatedGoals);
  }, [goals, saveGoals]);

  // Delete a goal
  const deleteGoal = useCallback((id) => {
    const updatedGoals = goals.filter(goal => goal.id !== id);
    saveGoals(updatedGoals);
  }, [goals, saveGoals]);

  // Clear all user data
  const clearUserData = useCallback(() => {
    if (!currentUser?.uid) return;
    try {
      const userRef = doc(db, 'users', currentUser.uid);
      setDoc(userRef, { goals: [], notes: [], flashcards: [], mentorState: {} }, { merge: true });
    } catch (e) {
      console.warn('Failed to clear Firestore user data:', e);
    }
    setGoals([]);
    setDataVersion(prev => prev + 1); // Trigger reload
  }, [currentUser]);

  // Clear all data on logout
  // Note: Do NOT automatically clear user data when the component unmounts or on logout.
  // Clearing user data is now an explicit user action via `clearUserData`.

  // Migrate old data to user-specific format (one-time migration)
  useEffect(() => {
    // Migration from legacy localStorage keys has been disabled.
    // All user data is now stored in Firestore; no client-side localStorage migration will run.
  }, [currentUser, goals.length, isLoading, saveGoals]);

  const value = {
    goals,
    setGoals: saveGoals,
    addGoal,
    updateGoal,
    deleteGoal,
    isLoading,
    clearUserData,
    getUserData: async (key, defaultValue = null) => {
      if (!currentUser) return defaultValue;
      try {
        const userRef = doc(db, 'users', currentUser.uid);
        const snap = await getDoc(userRef);
        if (!snap.exists()) return defaultValue;
        const data = snap.data() || {};
        return data[key] !== undefined ? data[key] : defaultValue;
      } catch (error) {
        return defaultValue;
      }
    },
    setUserData: async (key, data) => {
      if (!currentUser) return;
      try {
        const userRef = doc(db, 'users', currentUser.uid);
        await setDoc(userRef, { [key]: data }, { merge: true });
      } catch (error) {
        console.error('Error saving user data to Firestore:', error);
      }
    },
  };

  return (
    <UserDataContext.Provider value={value}>
      {children}
    </UserDataContext.Provider>
  );
}