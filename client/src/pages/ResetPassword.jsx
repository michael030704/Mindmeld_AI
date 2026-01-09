import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../firebase/config';
import { verifyPasswordResetCode, confirmPasswordReset } from 'firebase/auth';

export default function ResetPassword() {
  const [email, setEmail] = useState('');
  const [codeValid, setCodeValid] = useState(false);
  const [loading, setLoading] = useState(true);
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const navigate = useNavigate();

  function sanitizeAuthError(e) {
    if (!e) return 'An error occurred';
    // Try to extract firebase auth code from message
    let code = e.code || null;
    if (!code && e.message) {
      const m = e.message.match(/\(auth\/(.*?)\)/);
      if (m && m[1]) code = `auth/${m[1]}`;
    }
    switch (code) {
      case 'auth/invalid-action-code':
      case 'auth/invalid-oob-code':
        return 'Invalid reset code';
      case 'auth/expired-action-code':
        return 'This reset link has expired';
      case 'auth/user-not-found':
        return 'No account found for this email';
      case 'auth/network-request-failed':
        return 'Network error. Please check your connection';
      default:
        // Fallback: strip "Firebase: Error" prefix and any parenthetical codes
        let raw = e.message || String(e);
        raw = raw.replace(/^Firebase:\s*Error\s*/i, '');
        raw = raw.replace(/\(auth\/[^)]+\)/g, '').trim();
        return raw || 'An error occurred';
    }
  }

  useEffect(() => {
    (async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const oobCode = params.get('oobCode');
        if (!oobCode) {
          setError('Invalid or missing reset code');
          setLoading(false);
          return;
        }

        const emailFromCode = await verifyPasswordResetCode(auth, oobCode);
        setEmail(emailFromCode);
        setCodeValid(true);
      } catch (e) {
        setError(sanitizeAuthError(e) || 'Invalid or expired reset link');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!newPassword || newPassword.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    try {
      setLoading(true);
      const params = new URLSearchParams(window.location.search);
      const oobCode = params.get('oobCode');
      await confirmPasswordReset(auth, oobCode, newPassword);
      // success — show friendly message and button to go back to login
      setSuccess('Password changed successfully');
      setNewPassword('');
      setError('');
      setCodeValid(false);
    } catch (e) {
      setError(sanitizeAuthError(e) || 'Failed to reset password');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="loading-container">Loading...</div>;

  return (
    <div className="reset-password-container">
      <h2>Reset your password</h2>
      {error && <div className="error-text">{error}</div>}
      {success ? (
        <div className="success-box">
          {success}
          <div className="form-action-group">
            <button className="login-button" onClick={() => navigate('/login')}>Go to login</button>
          </div>
        </div>
      ) : codeValid ? (
        <form onSubmit={handleSubmit}>
          <p>Resetting password for <strong>{email}</strong></p>
          <input type="password" placeholder="New password (min 6)" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="form-input" />
          <div className="form-action-group">
            <button type="submit" className="login-button" disabled={loading}>{loading ? 'Saving...' : 'Set new password'}</button>
          </div>
        </form>
      ) : (
        <div>
          <p>Invalid or expired link.</p>
          <div className="form-action-group">
            <button className="switch-button" onClick={() => navigate('/login')}>Back to login</button>
          </div>
        </div>
      )}
    </div>
  );
}
