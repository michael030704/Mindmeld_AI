import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { auth } from '../firebase/config';
import { sendPasswordResetEmail } from 'firebase/auth';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [lastName, setLastName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isLogin, setIsLogin] = useState(true);
  const [forgotMode, setForgotMode] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotStep, setForgotStep] = useState(1);
  
  const { signup, login, googleLogin, loading: authLoading, isDevMode, setIsDevMode } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [success, setSuccess] = useState('');

  // Map Firebase / auth errors to friendly messages
  function friendlyAuthMessage(err, prefix) {
    // Try to get a canonical Firebase error code. Some SDKs place it on `err.code`,
    // others include it only inside `err.message` like "Firebase: Error (auth/invalid-credential)."
    let code = err?.code || err?.response?.data?.error || null;
    if (!code && err?.message) {
      const m = err.message.match(/\(auth\/(.*?)\)/);
      if (m && m[1]) code = `auth/${m[1]}`;
    }
    let msg;
    switch (code) {
      case 'auth/invalid-credential':
        msg = 'Invalid credentials';
        break;
      case 'auth/wrong-password':
        msg = 'Wrong password';
        break;
      case 'auth/user-not-found':
        msg = 'No user found with that email';
        break;
      case 'auth/invalid-email':
        msg = 'Invalid email address';
        break;
      case 'auth/email-already-in-use':
        msg = 'Email is already in use';
        break;
      case 'auth/weak-password':
        msg = 'Password should be at least 6 characters';
        break;
      case 'auth/network-request-failed':
        msg = 'Network error. Please check your connection';
        break;
      case 'auth/operation-not-allowed':
        msg = 'Operation not allowed';
        break;
      default:
        // Prefer server-provided error, otherwise sanitize raw messages that may
        // include SDK prefixes like "Firebase: Error (...)" and internal codes.
        if (err?.response?.data?.error) {
          msg = err.response.data.error;
        } else if (err?.message) {
          let raw = err.message.replace(/^Firebase:\s*Error\s*/i, '');
          // remove parenthetical auth codes like (auth/invalid-credential)
          raw = raw.replace(/\(auth\/[^)]+\)/g, '').trim();
          msg = raw || 'An error occurred';
        } else {
          msg = 'An error occurred';
        }
    }
    return prefix ? `${prefix}: ${msg}` : msg;
  }

async function handleSubmit(e) {
  e.preventDefault();
  
  try {
    setError('');
    setLoading(true);
    
    if (isLogin) {
      await login(email, password);
      navigate('/dashboard', { state: { activeTab: 'dashboard' } });
    } else {
      // ✅ Validate client-side
      if (!firstName.trim() || !lastName.trim()) {
        setError('First and last name are required.');
        setLoading(false);
        return;
      }

      const displayName = [firstName.trim(), middleName.trim(), lastName.trim()]
        .filter(Boolean)
        .join(' ');

      // Names are passed directly to signup; no client-side localStorage persistence.

      // ✅ Pass names INLINE — this is critical
      await signup(
        email,
        password,
        {
          firstName: firstName.trim(),
          middleName: middleName.trim(),
          lastName: lastName.trim()
        }
      );
      navigate('/dashboard', { state: { activeTab: 'dashboard' } });
    }
  } catch (err) {
    setError(friendlyAuthMessage(err, `Failed to ${isLogin ? 'sign in' : 'sign up'}`));
  }
  setLoading(false);
}
// In Login.jsx, update handleGoogleSignIn function
async function handleGoogleSignIn() {
  try {
    setError('');
    setLoading(true);
    
    // Clear any cached Google data before login
      try {
        // Clear cookies and session storage; do not manipulate localStorage.
        document.cookie.split(";").forEach(c => {
          document.cookie = c.replace(/^ +/, "")
            .replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
        });
        sessionStorage.clear();
      } catch (e) {
        console.log("Error clearing cache:", e);
      }
    
    await googleLogin();
    navigate('/dashboard', { state: { activeTab: 'dashboard' } });
  } catch (err) {
    setError(friendlyAuthMessage(err, 'Google sign in failed'));
  }
  setLoading(false);
}

  async function handleSendOtp() {
    try {
      setError('');
      setLoading(true);
      if (!forgotEmail) throw new Error('Please enter your email');

      // Send password reset link which opens the app's reset page where user can set a new password
      const actionCodeSettings = {
        url: window.location.origin + '/login',
        handleCodeInApp: true
      };

      await sendPasswordResetEmail(auth, forgotEmail, actionCodeSettings);
      setError('Password reset link sent — check your email and open the link to set a new password.');
      setForgotStep(2);
    } catch (err) {
        setError(friendlyAuthMessage(err, 'Failed to send reset link'));
    }
    setLoading(false);
  }

  // OTP flow removed; only password-reset link is supported

  // Password-reset links open the dedicated /reset-password route; no auto-complete here.

  const isLoading = loading || authLoading;

  // Show success message if redirected from reset-password
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (location?.state?.resetSuccess || params.get('resetSuccess') === '1') {
        setSuccess('Password updated — you can now login');
        // Clear the location state/query so the message doesn't persist on navigation
        try { window.history.replaceState({}, document.title, window.location.pathname); } catch (e) {}
      }
    } catch (e) {}
  }, [location]);

  return (
    <div className="login-container">
      <div className="login-card">
        <h2 className="login-title">{isLogin ? 'Login' : 'Sign Up'}</h2>
        
              {isDevMode && (
                <div style={{
                  background: '#e7f3ff',
                  border: '1px solid #b3d9ff',
                  borderRadius: '5px',
                  padding: '10px',
                  marginBottom: '15px',
                  textAlign: 'center'
                }}>
                  <p style={{ margin: 0, fontSize: '14px', color: '#0066cc' }}>
                    <strong>🔧 Development Mode</strong>
                    <br/>
                    Using mock authentication. Works offline!
                  </p>
                  <div style={{ marginTop: 8 }}>
                    <button
                      type="button"
                      onClick={() => {
                        // Switch out of dev mock mode so real Firebase Google sign-in is used
                        try {
                          setIsDevMode(false);
                        } catch (e) {
                          console.error('Unable to toggle dev mode:', e);
                        }
                        // Reload to let AuthContext reinitialize in production mode
                        window.location.reload();
                      }}
                      className="switch-button"
                      style={{ padding: '6px 10px', fontSize: 13 }}
                    >
                      Use real Google sign-in
                    </button>
                  </div>
                </div>
              )}
        
              {error && (
                <div className="error-alert">
                  <div style={{ marginBottom: 8 }}>{error}</div>
                </div>
              )}

              {success && (
                <div className="success-alert" style={{ marginBottom: 12, padding: 10, background: '#e6ffed', border: '1px solid #b3f0c6', borderRadius: 6 }}>
                  {success}
                </div>
              )}

              {success && (
                <div className="success-alert" style={{ marginBottom: 12 }}>{success}</div>
              )}
        
        {forgotMode ? (
          <div className="forgot-card">
            {forgotStep === 1 && (
              <>
                <input
                  type="email"
                  placeholder="Enter your email"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  className="form-input"
                />

                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button onClick={handleSendOtp} disabled={isLoading} className="login-button">
                    {isLoading ? 'Sending...' : 'Send reset link'}
                  </button>
                  <button type="button" onClick={() => { setForgotMode(false); setForgotStep(1); setForgotEmail(''); }} className="switch-button">Cancel</button>
                </div>
              </>
            )}
            {forgotStep === 2 && (
              <>
                <div style={{ padding: 8, background: '#f5f7ff', borderRadius: 6 }}>
                  <p style={{ margin: 0 }}>A password reset link was sent to <strong>{forgotEmail}</strong>. Open that link and follow the instructions to set a new password.</p>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button type="button" onClick={() => { setForgotMode(false); setForgotStep(1); setForgotEmail(''); }} className="switch-button">Close</button>
                </div>
              </>
            )}
          </div>
        ) : (
          <>
            <form onSubmit={handleSubmit} className="login-form">
              {!isLogin && (
                <>
                  <input
                    type="text"
                    placeholder="First name"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    required
                    className="form-input"
                  />
                  <input
                    type="text"
                    placeholder="Middle name (optional)"
                    value={middleName}
                    onChange={(e) => setMiddleName(e.target.value)}
                    className="form-input"
                  />
                  <input
                    type="text"
                    placeholder="Last name"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    required
                    className="form-input"
                  />
                </>
              )}
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="form-input"
              />
              <input
                type="password"
                placeholder="Password (min 6 characters)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength="6"
                className="form-input"
              />
              <button 
                type="submit" 
                disabled={isLoading}
                className="login-button"
              >
                {isLoading ? 'Processing...' : (isLogin ? 'Login' : 'Sign Up')}
              </button>
            </form>

            <div className="divider">
              <span>OR</span>
            </div>

            <button
              onClick={handleGoogleSignIn} 
              disabled={isLoading}
              className="google-button"
            >
              <svg className="google-icon" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Sign in with Google
            </button>

            <div style={{ marginTop: 8, textAlign: 'center' }}>
              <button type="button" onClick={() => setForgotMode(true)} className="switch-button" disabled={isLoading}>
                Forgot password?
              </button>
            </div>

            <div className="switch-mode">
              <button 
                type="button" 
                onClick={() => {
                  setIsLogin(!isLogin);
                  // clear name fields when switching modes
                  setFirstName(''); setMiddleName(''); setLastName('');
                }}
                className="switch-button"
                disabled={isLoading}
              >
                {isLogin ? "Need an account? Sign Up" : "Already have an account? Login"}
              </button>
            </div>

            <div className="back-home">
              <Link to="/" className="back-link">
                ← Back to Home
              </Link>
            </div>
          </>
        )}
        
      </div>
    </div>
  );
}
