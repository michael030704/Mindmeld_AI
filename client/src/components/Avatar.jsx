import React from 'react';

export default function Avatar({ size = 36, photoURL = null, name = '', className = '' }) {
  const sizePx = typeof size === 'number' ? `${size}px` : size;

  // If a user-provided photo exists, show it.
  if (photoURL) {
    return (
      <img
        src={photoURL}
        alt={name || 'avatar'}
        className={`avatar-img ${className}`}
        style={{ width: sizePx, height: sizePx, borderRadius: '50%' }}
      />
    );
  }

  // Always use the project's default avatar from the public folder when no photo is provided.
  return (
    <img
      src={'/default-avatar.svg'}
      alt={name || 'Default avatar'}
      className={`avatar-img ${className}`}
      style={{ width: sizePx, height: sizePx }}
    />
  );
}
