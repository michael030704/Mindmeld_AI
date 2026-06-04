import React, { useState } from 'react';
import Avatar from './Avatar';

const DefaultAvatar = ({ size = 36, name = '', photoURL = null }) => (
  <Avatar size={size} name={name} photoURL={photoURL} />
);

const IconCamera = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
    <path d="M4 7h3l2-2h6l2 2h3v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7z" stroke="#374151" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
    <circle cx="12" cy="13" r="3" stroke="#374151" strokeWidth="1.2"/>
  </svg>
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
  const [profileImageUpload] = useState(null);

  const handleImageUpload = (e) => {
    showToast('Disabled', 'Profile pictures are disabled.');
  };

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
        <div className="profile-avatar-section">
          <div className="profile-avatar-container">
            <DefaultAvatar
              size={120}
              name={`${firstName} ${lastName}`.trim()}
              photoURL={currentUser?.photoURL}
            />
            <button className="profile-image-upload" onClick={handleImageUpload} title="Profile pictures disabled">
              <IconCamera size={20} />
            </button>
          </div>

          <div className="profile-info">
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
            <p className="profile-email">{currentUser?.email}</p>

            {editingProfile && (
              <input
                type="date"
                value={birthdate}
                onChange={(e) => setBirthdate(e.target.value)}
                className="birthdate-input"
                placeholder="Birthdate"
              />
            )}
          </div>
        </div>

        <div className="profile-actions">
          {editingProfile ? (
            <>
              <button onClick={onSaveProfile} className="button primary">Save Profile</button>
              <button onClick={() => setEditingProfile(false)} className="button secondary">Cancel</button>
            </>
          ) : (
            <button onClick={() => setEditingProfile(true)} className="button primary">Edit Profile</button>
          )}
        </div>
      </div>

      <div className="profile-stats">
        <h3>Your Stats</h3>
        <div className="stats-grid">
          {stats.map((stat, idx) => (
            <div key={idx} className="stat-card">
              <div className="stat-label">{stat.label}</div>
              <div className="stat-value">
                {typeof stat.value === 'number' && stat.value > 1 ? Math.round(stat.value) : stat.value}
              </div>
            </div>
          ))}
        </div>
      </div>

      {badges.length > 0 && (
        <div className="profile-badges">
          <h3>Badges</h3>
          <div className="badges-container">
            {badges.map((badge, idx) => (
              <div key={idx} className="badge">
                <span className="badge-icon">🏆</span>
                <span className="badge-name">{badge.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {learningPath && (
        <div className="profile-learning-path">
          <h3>Learning Path</h3>
          <div className="learning-path-card">
            <h4>{learningPath.level} Level</h4>
            <p className="path-duration">Est. completion: {learningPath.estimatedCompletion}</p>
            <div className="path-steps">
              <h5>Steps:</h5>
              <ol>
                {learningPath.path.map((step, idx) => (
                  <li key={idx}>
                    <strong>{step.step}. {step.action}</strong>
                    <p>{step.duration} • {step.focus}</p>
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
