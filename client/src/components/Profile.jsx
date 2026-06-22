import React, { useState } from 'react';
import Avatar from './Avatar';

const DefaultAvatar = ({ size = 36, name = '', photoURL = null }) => (
  <Avatar size={size} name={name} photoURL={photoURL} />
);

export default function Profile({ 
  currentUser, 
  editingProfile, 
  setEditingProfile,
  firstName,
  setFirstName,
  middleName,
  setMiddleName,
  lastName,
  setLastName,
  birthdate,
  setBirthdate,
  onSaveProfile,
  mentorSystem,
  showToast
}) {

  const stats = [
    { label: 'Total Notes', value: mentorSystem?.userProfile?.consistencyScore * 100 || 0 },
    { label: 'Knowledge Depth', value: mentorSystem?.progress?.depth || 0 },
    { label: 'Level', value: mentorSystem?.level || 1 },
    { label: 'XP', value: mentorSystem?.xp || 0 },
    { label: 'Streak', value: mentorSystem?.streak || 1 },
    { label: 'Learning Style', value: mentorSystem?.userProfile?.learningStyle || 'Balanced' }
  ];

  const badges = mentorSystem?.badges || [];
  const learningPath = mentorSystem?.learningPath;

  return (
    <div className="profile-view">
      <div className="profile-header">
        <div className="profile-card-container">
          <div className="profile-avatar-section">
            <div className="profile-avatar-container">
              <DefaultAvatar
                size={140}
                name={`${firstName} ${lastName}`.trim()}
                photoURL={currentUser?.photoURL}
              />
            </div>
          </div>

          <div className="profile-info">
            <div className="profile-name-section">
              <h2>
                {editingProfile ? (
                  <div className="name-inputs">
                    <input
                      type="text"
                      placeholder="First name"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      className="name-input"
                    />
                    <input
                      type="text"
                      placeholder="Middle name (optional)"
                      value={middleName}
                      onChange={(e) => setMiddleName(e.target.value)}
                      className="name-input"
                    />
                    <input
                      type="text"
                      placeholder="Last name"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      className="name-input"
                    />
                  </div>
                ) : (
                  `${firstName} ${lastName}`.trim() || 'Set Your Name'
                )}
              </h2>
              <p className="profile-email">📧 {currentUser?.email}</p>
            </div>

            {editingProfile && (
              <div className="birthdate-section">
                <label>Birthday:</label>
                <input
                  type="date"
                  value={birthdate}
                  onChange={(e) => setBirthdate(e.target.value)}
                  className="birthdate-input"
                  placeholder="Birthdate"
                />
              </div>
            )}
          </div>
        </div>

        <div className="profile-actions">
          {editingProfile ? (
            <>
              <button onClick={onSaveProfile} className="button primary">✓ Save Profile</button>
              <button onClick={() => setEditingProfile(false)} className="button secondary">✕ Cancel</button>
            </>
          ) : (
            <button onClick={() => setEditingProfile(true)} className="button primary">✏️ Edit Profile</button>
          )}
        </div>
      </div>

      <div className="profile-stats">
        <div className="stats-header">
          <h3>📊 Your Stats & Progress</h3>
          <p className="stats-subtitle">Track your learning journey and achievements</p>
        </div>
        <div className="stats-grid">
          {stats.map((stat, idx) => {
            const icons = ['📝', '🎓', '⭐', '⚡', '🔥', '🧠'];
            return (
              <div key={idx} className="stat-card">
                <div className="stat-card-header">
                  <span className="stat-icon">{icons[idx % icons.length]}</span>
                  <span className="stat-label">{stat.label}</span>
                </div>
                <div className="stat-value">
                  {typeof stat.value === 'number' && stat.value > 1 ? Math.round(stat.value) : stat.value}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {badges.length > 0 && (
        <div className="profile-badges">
          <div className="badges-header">
            <h3>🏆 Achievements & Badges</h3>
            <p className="badges-subtitle">Earned {badges.length} badge{badges.length !== 1 ? 's' : ''}</p>
          </div>
          <div className="badges-container">
            {badges.map((badge, idx) => (
              <div key={idx} className="badge-item">
                <div className="badge-icon-large">🏆</div>
                <div className="badge-info">
                  <h4>{badge.name}</h4>
                  <p className="badge-description">{badge.description || 'Achievement unlocked'}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {learningPath && (
        <div className="profile-learning-path">
          <div className="path-header">
            <h3>🎯 Your Learning Path</h3>
            <div className="path-level-badge">{learningPath.level} Level</div>
          </div>
          <div className="learning-path-card">
            <div className="path-info">
              <p className="path-duration">⏱️ Est. completion: <strong>{learningPath.estimatedCompletion}</strong></p>
            </div>
            <div className="path-steps">
              <h4>Steps to Master:</h4>
              <ol className="steps-list">
                {learningPath.path.map((step, idx) => (
                  <li key={idx} className="step-item">
                    <div className="step-number">{step.step}</div>
                    <div className="step-content">
                      <strong>{step.action}</strong>
                      <p>{step.duration} • {step.focus}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
