import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import logo from '../assets/mindmeld-logo.svg';

export default function Home() {
  const { currentUser } = useAuth();

  return (
    <div className="home-container">
      <header className="home-header">
        <div className="header-brand">
          <img src={logo} alt="MindMeld AI" className="header-logo"/> 
          <h1>MindMeld AI</h1>
        </div>
        <nav className="header-nav">
          <Link to="/dashboard" className="nav-link">Dashboard</Link>
          <Link to="/dashboard" className="nav-link">Community</Link>
          {currentUser ? (
            <span className="user-greeting">Hi, {currentUser.displayName || currentUser.email.split('@')[0]}</span>
          ) : (
            <Link to="/login" className="nav-link btn-nav-primary">Login</Link>
          )}
        </nav>
      </header>

      <main className="home-hero">
        <div className="hero-wrapper">
          <div className="hero-text">
            <h2>Learn Smarter, Grow Faster</h2>
            <p>Your AI-powered learning companion that adapts to your pace. Create notes, discover insights, and learn with a supportive community.</p>
            
            <div className="hero-features">
              <div className="feature">
                <span className="feature-icon">📝</span>
                <div>
                  <h4>Smart Notes</h4>
                  <p>AI-enhanced note taking with semantic analysis</p>
                </div>
              </div>
              <div className="feature">
                <span className="feature-icon">🧠</span>
                <div>
                  <h4>Knowledge Maps</h4>
                  <p>Visualize connections between concepts</p>
                </div>
              </div>
              <div className="feature">
                <span className="feature-icon">🎯</span>
                <div>
                  <h4>Smart Challenges</h4>
                  <p>Personalized flashcards and quizzes</p>
                </div>
              </div>
              <div className="feature">
                <span className="feature-icon">👥</span>
                <div>
                  <h4>Community</h4>
                  <p>Connect and learn with other students</p>
                </div>
              </div>
            </div>

            {currentUser ? (
              <Link to="/dashboard" className="btn-primary-large">Go to Dashboard</Link>
            ) : (
              <Link to="/login" className="btn-primary-large">Start Learning Free</Link>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}