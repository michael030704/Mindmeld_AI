import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { db } from '../firebase/config';
import { doc, getDoc, updateDoc, setDoc, collection, onSnapshot } from 'firebase/firestore';
import { updateUserOnlineStatus } from '../services/api';
import './Dashboard.css';

// Import feature components
import SmartNotes from '../components/SmartNotes';
import MindMapView from '../components/MindMap';
import FlashcardView from '../components/Flashcards';
import Friends from '../components/Friends';
import Guide from '../components/Guide';
import Messages from '../components/Messages';
import Profile from '../components/Profile';

export default function Dashboard() {
  const { currentUser, logout, updateProfileNames } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Navigation - read from URL pathname
  const pathSegments = location.pathname.split('/').filter(Boolean);
  const pathTab = pathSegments[pathSegments.length - 1];
  const validTabs = ['notes', 'mindmap', 'flashcards', 'friends', 'guide', 'messages', 'profile'];
  const urlTab = validTabs.includes(pathTab) ? pathTab : 'notes';
  const [activeTab, setActiveTab] = useState(urlTab);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Sync URL when tab changes
  const handleTabChange = (tab) => {
    setActiveTab(tab);
    navigate(`/${tab}`, { replace: true });
  };

  // Update activeTab if URL changes (browser back/forward)
  useEffect(() => {
    setActiveTab(urlTab);
  }, [urlTab]);

  // User profile
  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [lastName, setLastName] = useState('');
  const [birthdate, setBirthdate] = useState('');
  const [editingProfile, setEditingProfile] = useState(false);

  // Notes
  const [notes, setNotes] = useState([]);
  const [newNote, setNewNote] = useState({ title: '', content: '', category: 'general' });
  const [editing, setEditing] = useState(false);
  const [editNote, setEditNote] = useState(null);

  // Flashcards
  const [flashcards, setFlashcards] = useState([]);

  // Mind map
  const [mindMap, setMindMap] = useState({ nodes: [], connections: [], clusters: [] });

  // Social
  const [users, setUsers] = useState([]);
  const [following, setFollowing] = useState([]);
  const [followers, setFollowers] = useState([]);
  const [chats, setChats] = useState({});

  // Mentor/Guide
  const [mentorSystem, setMentorSystem] = useState({
    userProfile: null,
    currentChallenge: null,
    mentorSession: [],
    progress: { overall: 0, knowledge: 0, consistency: 0, depth: 0 },
    streak: 1,
    xp: 0,
    level: 1,
    badges: []
  });

  // Theme - Initialize from localStorage first, will be overridden by Firestore
  const [theme, setTheme] = useState(() => {
    try {
      return window.localStorage.getItem('mindmeld_theme') || 'light';
    } catch (e) {
      return 'light';
    }
  });
  const [themeLoaded, setThemeLoaded] = useState(false);

  // Load user data from Firestore
  useEffect(() => {
    if (!currentUser?.uid || !db) return;

    const uid = currentUser.uid;

    // Subscribe to user document changes
    const meRef = doc(db, 'users', uid);
    const unsubscribe = onSnapshot(meRef, (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();

      // Load notes
      if (Array.isArray(data.notes)) setNotes(data.notes);

      // Load flashcards
      if (Array.isArray(data.flashcards)) setFlashcards(data.flashcards);

      // Load following
      if (Array.isArray(data.following)) setFollowing(data.following);

      // Load mentor system
      if (data.mentorSystem) setMentorSystem(data.mentorSystem);

      // Load chats
      if (data.chats) setChats(data.chats);

      // Load birthdate
      if (data.birthdate) setBirthdate(data.birthdate);

      // Load theme from Firestore (optional - prefer localStorage)
      // If Firestore has a theme, sync it with localStorage
      // Otherwise, localStorage value remains the source of truth
      if (data.preferences?.theme && data.preferences.theme !== window.localStorage.getItem('mindmeld_theme')) {
        setTheme(data.preferences.theme);
        try {
          window.localStorage.setItem('mindmeld_theme', data.preferences.theme);
        } catch (e) {
          console.warn('Failed to save theme to localStorage');
        }
      }
      setThemeLoaded(true);

      // Load followers
      if (Array.isArray(data.followers)) setFollowers(data.followers);
    });

    // Parse user display name
    const dn = currentUser?.displayName || '';
    if (dn) {
      const parts = dn.split(' ');
      setFirstName(parts[0] || '');
      if (parts.length > 1) {
        setLastName(parts[parts.length - 1]);
        if (parts.length > 2) {
          setMiddleName(parts.slice(1, -1).join(' '));
        }
      }
    }

    return () => unsubscribe();
  }, [currentUser?.uid]);

  // 🔄 Sync followers/following from backend
  useEffect(() => {
    if (!currentUser?.uid) return;

    const syncFollowersFromBackend = async () => {
      try {
        const { getUserProfile } = await import('../services/api');
        const userProfile = await getUserProfile(currentUser.uid);
        
        if (userProfile) {
          if (Array.isArray(userProfile.followers)) {
            setFollowers(userProfile.followers);
            console.log(`✅ Synced followers from backend: ${userProfile.followers.length}`);
          }
          if (Array.isArray(userProfile.following)) {
            setFollowing(userProfile.following);
            console.log(`✅ Synced following from backend: ${userProfile.following.length}`);
          }
        }
      } catch (err) {
        console.warn('Failed to sync followers from backend:', err);
      }
    };

    // Sync on initial load
    syncFollowersFromBackend();
    
    // Sync every 30 seconds to stay up-to-date
    const intervalId = setInterval(syncFollowersFromBackend, 30000);
    
    return () => clearInterval(intervalId);
  }, [currentUser?.uid]);

  // 🟢 Track user online/offline status
  useEffect(() => {
    if (!currentUser?.uid) return;

    // Mark user as online
    updateUserOnlineStatus(currentUser.uid, true).catch(e => 
      console.warn('Failed to mark online:', e)
    );

    // Periodically update lastSeen
    const intervalId = setInterval(() => {
      updateUserOnlineStatus(currentUser.uid, true).catch(e =>
        console.warn('Failed to update presence:', e)
      );
    }, 30000); // Update every 30 seconds

    // Mark user as offline when leaving
    const handleBeforeUnload = () => {
      updateUserOnlineStatus(currentUser.uid, false).catch(e =>
        console.warn('Failed to mark offline:', e)
      );
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      clearInterval(intervalId);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      // Mark as offline when component unmounts
      updateUserOnlineStatus(currentUser.uid, false).catch(e =>
        console.warn('Failed to mark offline on unmount:', e)
      );
    };
  }, [currentUser?.uid]);

  // Fetch users list periodically
  useEffect(() => {
    if (!db) return;
    let mounted = true;

    const usersCol = collection(db, 'users');
    const unsubscribe = onSnapshot(usersCol, (snap) => {
      if (!mounted) return;
      const allUsers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setUsers(allUsers);
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  // Auto-save data to Firestore
  useEffect(() => {
    if (!currentUser?.uid || !db) return;

    const timer = setTimeout(async () => {
      try {
        const uid = currentUser.uid;
        const meRef = doc(db, 'users', uid);
        await updateDoc(meRef, {
          notes,
          flashcards,
          mentorSystem,
          following,
          followers,
          chats,
          preferences: { theme }
        }).catch(() => {
          setDoc(meRef, {
            notes,
            flashcards,
            mentorSystem,
            following,
            followers,
            chats,
            preferences: { theme }
          }, { merge: true });
        });
      } catch (e) {
        console.warn('Auto-save failed', e);
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [notes, flashcards, mentorSystem, following, followers, chats, theme, currentUser?.uid]);

  // UI Helpers
  const showToast = (message, type = 'info') => {
    try {
      alert(`[${type.toUpperCase()}] ${message}`);
    } catch (e) {
      console.warn('Toast failed', e);
    }
  };

  const showAlertPopup = (title, message) => {
    alert(`${title}\n\n${message}`);
  };

  const showConfirmPopup = (title, message, onConfirm) => {
    if (confirm(`${title}\n\n${message}`)) {
      onConfirm();
    }
  };

  // Profile handlers
  const handleSaveProfile = async () => {
    try {
      await updateProfileNames(firstName.trim(), middleName.trim(), lastName.trim());

      if (db && currentUser?.uid) {
        const uid = currentUser.uid;
        const meRef = doc(db, 'users', uid);
        await updateDoc(meRef, { birthdate }).catch(() => {
          setDoc(meRef, { birthdate }, { merge: true });
        });
      }

      setEditingProfile(false);
      showToast('Profile updated', 'success');
    } catch (e) {
      console.error('Failed to save profile', e);
      showToast('Failed to save profile', 'error');
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (e) {
      console.error('Logout failed', e);
      showToast('Logout failed', 'error');
    }
  };

  // Theme toggle
  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    // Save to both localStorage and Firestore (Firestore via auto-save)
    try {
      window.localStorage.setItem('mindmeld_theme', next);
    } catch (e) {
      console.warn('Theme save to localStorage failed', e);
    }
  };

  // Social helpers
  const getUserNameFromId = (userId) => {
    const user = users.find(u => u.id === userId);
    if (user?.name) return user.name;
    if (user?.displayName) return user.displayName;
    if (user?.email) return user.email.split('@')[0];
    return userId.includes('@') ? userId.split('@')[0] : userId;
  };

  const isUserActive = (u) => {
    if (!u?.lastSeen) return false;
    return (Date.now() - new Date(u.lastSeen).getTime()) < 5 * 60 * 1000;
  };

  const formatLastSeen = (u) => {
    if (!u?.lastSeen) return 'Unknown';
    const diff = Date.now() - new Date(u.lastSeen).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return new Date(u.lastSeen).toLocaleDateString();
  };

  const toggleFollow = async (userId) => {
    try {
      const { followUser, unfollowUser } = await import('../services/api');
      const isFollowing = following.includes(userId);
      
      if (isFollowing) {
        // Unfollow
        await unfollowUser(userId, currentUser?.uid);
        const newFollowing = following.filter(id => id !== userId);
        setFollowing(newFollowing);
        
        // Update Firestore
        await setDoc(
          doc(db, 'users', currentUser?.uid),
          { following: newFollowing },
          { merge: true }
        );
      } else {
        // Follow
        await followUser(userId, currentUser?.uid);
        const newFollowing = [...following, userId];
        setFollowing(newFollowing);
        
        // Update Firestore
        await setDoc(
          doc(db, 'users', currentUser?.uid),
          { following: newFollowing },
          { merge: true }
        );
      }
    } catch (error) {
      console.error('Failed to toggle follow:', error);
      showToast('Failed to update follow status', 'error');
    }
  };

  const sendChatMessage = async (toUserId, text) => {
    try {
      const { sendMessage } = await import('../services/api');
      
      // Create message with temporary ID
      const tempId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      const msg = {
        id: tempId,
        sender: currentUser?.displayName || 'You',
        from: currentUser?.uid,
        text,
        ts: new Date().toISOString()
      };
      
      // Add to local state immediately for UI feedback (don't wait for backend)
      setChats(prev => ({
        ...prev,
        [toUserId]: [...(prev[toUserId] || []), msg]
      }));
      
      // Send to backend (fire and forget for better UX)
      sendMessage(currentUser?.uid, toUserId, text).catch(error => {
        console.error('Failed to send message:', error);
        showToast('Failed to send message', 'error');
        // Remove from local state if send failed
        setChats(prev => ({
          ...prev,
          [toUserId]: (prev[toUserId] || []).filter(m => m.id !== tempId)
        }));
      });
    } catch (error) {
      console.error('Failed to send message:', error);
      showToast('Failed to send message', 'error');
    }
  };

  const openChat = (user) => {
    // Initialize user in chats if they don't exist
    if (!chats[user.id]) {
      setChats(prev => ({
        ...prev,
        [user.id]: []
      }));
    }
    handleTabChange('messages');
    showToast(`Opened chat with ${user.name}`, 'info');
  };

  const openProfile = (user) => {
    showAlertPopup(
      user.name,
      `Email: ${user.email}\n\nBio: ${user.bio || 'No bio set'}`
    );
  };

  // Render
  return (
    <div className={`dashboard ${theme === 'dark' ? 'theme-dark' : ''} ${sidebarOpen ? 'sidebar-open' : 'sidebar-closed'}`}>
      {/* Floating Toggle Button - Visible when sidebar is closed */}
      <button 
        className="sidebar-toggle-floating"
        onClick={() => setSidebarOpen(!sidebarOpen)}
        aria-label="Toggle sidebar"
        title="Toggle navigation"
      >
        ☰
      </button>

      {/* Sidebar Navigation */}
      <aside className="dashboard-sidebar">
        <div className="sidebar-header">
          <div className="sidebar-brand">MindMeld</div>
          <button 
            className="sidebar-toggle"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label="Toggle sidebar"
          >
            ☰
          </button>
        </div>

        <nav className="sidebar-nav">
          {[
            { id: 'notes', label: 'Notes', icon: '📝' },
            { id: 'mindmap', label: 'Mind Map', icon: '🧠' },
            { id: 'flashcards', label: 'Flashcards', icon: '🎴' },
            { id: 'friends', label: 'Friends', icon: '👥' },
            { id: 'guide', label: 'Guide', icon: '🤖' },
            { id: 'messages', label: 'Messages', icon: '💬' },
            { id: 'profile', label: 'Profile', icon: '👤' }
          ].map(item => (
            <button
              key={item.id}
              className={`sidebar-nav-item ${activeTab === item.id ? 'active' : ''}`}
              onClick={() => handleTabChange(item.id)}
            >
              <span className="sidebar-nav-icon">{item.icon}</span>
              <span className="sidebar-nav-label">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <button onClick={toggleTheme} className="sidebar-action" title="Toggle theme">
            {theme === 'dark' ? '🌞' : '🌙'}
          </button>
          <button onClick={handleLogout} className="sidebar-action logout" title="Logout">
            🚪
          </button>
        </div>
      </aside>

      {/* Sidebar Overlay (for mobile) */}
      {sidebarOpen && (
        <div 
          className="sidebar-overlay"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main Content */}
      <main className="dashboard-content">
        {activeTab === 'notes' && (
          <SmartNotes
            notes={notes}
            setNotes={setNotes}
            newNote={newNote}
            setNewNote={setNewNote}
            editing={editing}
            setEditing={setEditing}
            editNote={editNote}
            setEditNote={setEditNote}
            currentUser={currentUser}
            db={db}
            showToast={showToast}
            showAlertPopup={showAlertPopup}
            showConfirmPopup={showConfirmPopup}
          />
        )}

        {activeTab === 'mindmap' && (
          <MindMapView
            notes={notes}
            mindMap={mindMap}
            setMindMap={setMindMap}
          />
        )}

        {activeTab === 'flashcards' && (
          <FlashcardView
            notes={notes}
            flashcards={flashcards}
            setFlashcards={setFlashcards}
            showToast={showToast}
          />
        )}

        {activeTab === 'friends' && (
          <Friends
            users={users}
            following={following}
            followers={followers}
            currentUser={currentUser}
            onToggleFollow={toggleFollow}
            onOpenChat={openChat}
            onOpenProfile={openProfile}
            isUserActive={isUserActive}
            formatLastSeen={formatLastSeen}
          />
        )}

        {activeTab === 'guide' && (
          <Guide
            notes={notes}
            mentorSystem={mentorSystem}
            setMentorSystem={setMentorSystem}
            goals={[]}
            showToast={showToast}
          />
        )}

        {activeTab === 'messages' && (
          <Messages
            chats={chats}
            currentUser={currentUser}
            users={users}
            following={following}
            onSendMessage={sendChatMessage}
            getUserNameFromId={getUserNameFromId}
            showAlertPopup={showAlertPopup}
            showToast={showToast}
            isUserActive={isUserActive}
            formatLastSeen={formatLastSeen}
          />
        )}

        {activeTab === 'profile' && (
          <Profile
            currentUser={currentUser}
            editingProfile={editingProfile}
            setEditingProfile={setEditingProfile}
            firstName={firstName}
            setFirstName={setFirstName}
            middleName={middleName}
            setMiddleName={setMiddleName}
            lastName={lastName}
            setLastName={setLastName}
            birthdate={birthdate}
            setBirthdate={setBirthdate}
            onSaveProfile={handleSaveProfile}
            mentorSystem={mentorSystem}
            showToast={showToast}
          />
        )}
      </main>
    </div>
  );
}
