import React, { useState, useEffect } from 'react';
import Avatar from './Avatar';
import { searchUsers } from '../services/api';

const DefaultAvatar = ({ size = 36, name = '', photoURL = null }) => (
  <Avatar size={size} name={name} photoURL={photoURL} />
);

export default function Friends({ 
  users, 
  following, 
  followers, 
  currentUser, 
  onToggleFollow, 
  onOpenChat, 
  onOpenProfile, 
  isUserActive,
  formatLastSeen 
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState('all'); // all, following, followers
  const [searchResults, setSearchResults] = useState(null);
  const [isSearching, setIsSearching] = useState(false);

  // Perform search on backend when search term changes
  useEffect(() => {
    if (!searchTerm.trim()) {
      setSearchResults(null);
      return;
    }

    setIsSearching(true);
    searchUsers(searchTerm)
      .then(results => {
        setSearchResults(results || []);
      })
      .catch(err => {
        console.error('Search failed:', err);
        setSearchResults([]);
      })
      .finally(() => setIsSearching(false));
  }, [searchTerm]);

  const filteredUsers = (searchResults || users).filter(u => {
    if (u.id === currentUser?.uid) return false;
    if (!u.name || !u.id) return false;

    if (activeFilter === 'following') {
      return following.includes(u.id);
    }
    if (activeFilter === 'followers') {
      // Support both array of IDs and array of objects with id property
      return followers.some(f => (typeof f === 'string' ? f === u.id : f.id === u.id));
    }

    return true;
  });

  const getFollowStatus = (userId) => {
    const isFollowing = following.includes(userId);
    const isFollower = followers.some(f => f.id === userId);
    if (isFollowing && isFollower) return 'mutual';
    if (isFollowing) return 'following';
    if (isFollower) return 'follower';
    return 'none';
  };

  return (
    <div className="friends-view">
      <h2>Friends & Connections</h2>

      <div className="friends-stats">
        <div className="stat">
          <label>Following:</label>
          <span>{following.length}</span>
        </div>
        <div className="stat">
          <label>Followers:</label>
          <span>{followers.length}</span>
        </div>
        <div className="stat">
          <label>Total Connections:</label>
          <span>{users.filter(u => u.id !== currentUser?.uid).length}</span>
        </div>
      </div>

      <div className="friends-controls">
        <div className="search-input-container">
          <input
            type="text"
            placeholder="Search friends..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
          {isSearching && <span className="search-loading">🔍 Searching...</span>}
        </div>

        <div className="filter-buttons">
          <button
            className={`filter-btn ${activeFilter === 'all' ? 'active' : ''}`}
            onClick={() => setActiveFilter('all')}
          >
            All ({(searchResults || users).filter(u => u.id !== currentUser?.uid).length})
          </button>
          <button
            className={`filter-btn ${activeFilter === 'following' ? 'active' : ''}`}
            onClick={() => setActiveFilter('following')}
          >
            Following ({following.length})
          </button>
          <button
            className={`filter-btn ${activeFilter === 'followers' ? 'active' : ''}`}
            onClick={() => setActiveFilter('followers')}
          >
            Followers ({followers.length})
          </button>
        </div>
      </div>

      <div className="friends-list">
        {filteredUsers.length === 0 ? (
          <p className="empty-state">
            {searchTerm ? 'No friends matching your search.' : 'No friends yet. Start following people!'}
          </p>
        ) : (
          filteredUsers.map(user => {
            const status = getFollowStatus(user.id);
            const active = isUserActive(user);

            return (
              <div key={user.id} className={`friend-card ${status} ${active ? 'active' : ''}`}>
                <div className="friend-avatar">
                  <DefaultAvatar size={50} name={user.name} photoURL={user.photoURL} />
                  {active && <div className="active-indicator"></div>}
                </div>

                <div className="friend-info">
                  <h4>{user.name}</h4>
                  <p className="friend-email">{user.email}</p>
                  {user.bio && <p className="friend-bio">{user.bio}</p>}
                  <p className="friend-lastSeen">
                    {active ? '🟢 Online' : `Last seen ${formatLastSeen(user)}`}
                  </p>
                </div>

                <div className="friend-actions">
                  <button
                    onClick={() => onToggleFollow(user.id)}
                    className={`button ${following.includes(user.id) ? 'secondary' : 'primary'}`}
                  >
                    {following.includes(user.id) ? 'Unfollow' : 'Follow'}
                  </button>
                  {following.includes(user.id) && (
                    <button onClick={() => onOpenChat(user)} className="button secondary">
                      Message
                    </button>
                  )}
                  <button onClick={() => onOpenProfile(user)} className="button small">
                    View
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
