import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import logo from '../assets/mindmeld-logo.svg';

export default function Home() {
  const { currentUser } = useAuth();

  return (
    <div className="home-container">
      <header className="top-utility">
        <div className="brand">
          <h1><img src={logo} alt="MindMeld AI" className="brand-logo"/> MindMeld AI</h1>
          <p className="brand-sub">Your AI Mentor for Intelligent Learning</p>
        </div>
        <div className="utility-actions">
          <Link to="/dashboard" className="btn-utility">Start Learning</Link>
          <Link to="/dashboard" className="btn-utility">Connect with Others</Link>
          {currentUser ? (
            <span className="welcome-inline">Welcome, {currentUser.displayName || currentUser.email}</span>
          ) : (
            <Link to="/login" className="btn-utility outline">Login / Sign Up</Link>
          )}
        </div>
      </header>

      <main className="hero-section">
        <div className="hero-content">
          <h1 className="hero-title">Learn Smarter with Your AI Mentor</h1>
          <p className="hero-description">
            MindMeld AI transforms how you learn by combining intelligent note-taking, AI-powered insights, 
            and a collaborative community. Create notes, discover connections, get personalized challenges, 
            and grow alongside other learners.
          </p>
          
          <div className="features">
            <div className="feature-card">
              <h3>📝 Intelligent Note-Taking</h3>
              <p>Create notes with AI analysis. Discover semantic connections and build knowledge maps.</p>
            </div>
            <div className="feature-card">
              <h3>🤖 AI Mentor</h3>
              <p>Get personalized guidance, adaptive challenges, and learning insights tailored to you.</p>
            </div>
            <div className="feature-card">
              <h3>👥 Community Learning</h3>
              <p>Connect with other learners, share knowledge, message friends, and grow together.</p>
            </div>
            <div className="feature-card">
              <h3>📊 Progress Tracking</h3>
              <p>Track your learning goals, earn badges, and watch your progress unlock new challenges.</p>
            </div>
          </div>

          <div className="cta-buttons">
            {currentUser ? (
              <Link to="/dashboard" className="btn-primary">
                Go to Dashboard
              </Link>
            ) : (
              <Link to="/login" className="btn-primary">
                Start Your Learning Journey
              </Link>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}