import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { db } from '../firebase/config';
import { doc, getDoc, updateDoc, setDoc } from 'firebase/firestore';
import './Dashboard.css';

// Import components
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

  // State management
  const [activeTab, setActiveTab] = useState(location?.state?.activeTab || 'notes');
  const [notes, setNotes] = useState([]);
  const [flashcards, setFlashcards] = useState([]);
  const [mindMap, setMindMap] = useState({ nodes: [], connections: [], clusters: [] });
  const [newNote, setNewNote] = useState({ title: '', content: '', category: 'general' });
  const [editing, setEditing] = useState(false);
  const [editNote, setEditNote] = useState(null);
  
  // User data
  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [lastName, setLastName] = useState('');
  const [birthdate, setBirthdate] = useState('');
  const [editingProfile, setEditingProfile] = useState(false);

  // Social
  const [users, setUsers] = useState([]);
  const [following, setFollowing] = useState([]);
  const [followers, setFollowers] = useState([]);
  const [chats, setChats] = useState({});
  
  // Mentor
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

  // Theme
  const [theme, setTheme] = useState(() => {
    try {
      return window.localStorage.getItem('mindmeld_theme') || 'light';
    } catch (e) { return 'light'; }
  });

  // Load user data on mount
  useEffect(() => {
    const loadUserData = async () => {
      if (!currentUser?.uid || !db) return;

      try {
        const meRef = doc(db, 'users', currentUser.uid);
        const snap = await getDoc(meRef);
        
        if (snap.exists()) {
          const data = snap.data();
          if (Array.isArray(data.notes)) setNotes(data.notes);
          if (Array.isArray(data.flashcards)) setFlashcards(data.flashcards);
          if (Array.isArray(data.following)) setFollowing(data.following);
          if (data.mentorSystem) setMentorSystem(data.mentorSystem);
          if (data.chats) setChats(data.chats);
          if (data.birthdate) setBirthdate(data.birthdate);
          if (data.preferences?.theme) setTheme(data.preferences.theme);
        }

        // Parse displayName
        const dn = currentUser?.displayName || '';
        if (dn) {
          const parts = dn.split(' ');
          setFirstName(parts[0] || '');
          setLastName(parts.slice(-1)[0] || '');
          setMiddleName(parts.slice(1, -1).join(' '));
        }
      } catch (e) {
        console.error('Failed to load user data', e);
      }
    };

    loadUserData();
  }, [currentUser?.uid]);

  // Auto-save data to Firestore
  useEffect(() => {
    const saveTimer = setTimeout(async () => {
      if (!currentUser?.uid || !db) return;
      try {
        const meRef = doc(db, 'users', currentUser.uid);
        await updateDoc(meRef, { 
          notes, 
          flashcards, 
          mentorSystem,
          following,
          chats,
          preferences: { theme }
        }).catch(() => {
          setDoc(meRef, { notes, flashcards, mentorSystem, following, chats, preferences: { theme } }, { merge: true });
        });
      } catch (e) {
        console.warn('Auto-save failed', e);
      }
    }, 2000);

    return () => clearTimeout(saveTimer);
  }, [notes, flashcards, mentorSystem, following, chats, theme, currentUser?.uid]);

  // UI Helpers
  const showToast = (message, type = 'info') => {
    try {
      alert(`[${type.toUpperCase()}] ${message}`);
    } catch (e) {}
  };

  const showAlertPopup = (title, message) => {
    alert(`${title}\n\n${message}`);
  };

  const showConfirmPopup = (title, message, onConfirm) => {
    if (confirm(`${title}\n\n${message}`)) {
      onConfirm();
    }
  };

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    try {
      window.localStorage.setItem('mindmeld_theme', next);
    } catch (e) {}
  };

  const handleSaveProfile = async () => {
    try {
      await updateProfileNames(firstName.trim(), middleName.trim(), lastName.trim());
      if (db && currentUser?.uid) {
        const meRef = doc(db, 'users', currentUser.uid);
        await updateDoc(meRef, { birthdate }).catch(() => 
          setDoc(meRef, { birthdate }, { merge: true })
        );
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

  // Helper functions
  const getUserNameFromId = (userId) => {
    const user = users.find(u => u.id === userId);
    return user?.name || (userId.includes('@') ? userId.split('@')[0] : userId);
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
    setFollowing(prev => 
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  const sendChatMessage = (toUserId, text) => {
    const msg = {
      sender: currentUser?.displayName || 'You',
      text,
      ts: new Date().toISOString()
    };
    setChats(prev => ({
      ...prev,
      [toUserId]: [...(prev[toUserId] || []), msg]
    }));
  };

  const openChat = (user) => {
    setActiveTab('messages');
    showToast(`Opened chat with ${user.name}`, 'info');
  };

  const openProfile = (user) => {
    showAlertPopup(user.name, `Email: ${user.email}\n\nBio: ${user.bio || 'No bio yet'}`);
  };

  // Render
  return (
    <div className={`dashboard ${theme}`}>
      <nav className="dashboard-nav">
        <div className="nav-brand">MindMeld AI</div>
        <div className="nav-tabs">
          {['notes', 'mindmap', 'flashcards', 'friends', 'guide', 'messages', 'profile'].map(tab => (
            <button
              key={tab}
              className={`nav-tab ${activeTab === tab ? 'active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
        <div className="nav-actions">
          <button onClick={toggleTheme} className="button small">
            {theme === 'dark' ? '🌞' : '🌙'}
          </button>
          <button onClick={handleLogout} className="button small danger">
            Logout
          </button>
        </div>
      </nav>

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
          <MindMapView notes={notes} mindMap={mindMap} setMindMap={setMindMap} />
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
