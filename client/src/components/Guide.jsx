import React, { useState, useRef, useEffect } from 'react';
import { callAI } from '../services/api';

export default function Guide({ 
  notes, 
  mentorSystem, 
  setMentorSystem, 
  goals,
  showToast 
}) {
  const [mentorMessage, setMentorMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const mentorMessagesRef = useRef(null);
  const mentorInputRef = useRef(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (mentorMessagesRef.current) {
      mentorMessagesRef.current.scrollTop = mentorMessagesRef.current.scrollHeight;
    }
  }, [mentorSystem.mentorSession, isTyping]);

  // Build context-aware system prompt
  const buildSystemPrompt = () => {
    const noteSummary = notes && notes.length > 0 
      ? `User has ${notes.length} notes: ${notes.slice(0, 5).map(n => n.title).join(', ')}`
      : 'User has no notes yet';
    
    return `You are an AI Learning Mentor helping a student learn effectively. Be encouraging, concise, and specific.
Current context: ${noteSummary}
Learning level: ${mentorSystem.level || 1}
XP earned: ${mentorSystem.xp || 0}
Learning streak: ${mentorSystem.streak || 1} days

Provide helpful, actionable advice. Keep responses brief (2-3 sentences max). End with 1-2 suggested follow-up questions or actions.`;
  };

  const handleMentorMessage = async (e) => {
    e.preventDefault();
    if (!mentorMessage.trim()) return;

    // Add user message
    const userMsg = {
      id: `user_${Date.now()}`,
      text: mentorMessage,
      type: 'user',
      timestamp: new Date().toISOString()
    };

    setMentorSystem(prev => ({
      ...prev,
      mentorSession: [...(prev.mentorSession || []), userMsg]
    }));

    const userInput = mentorMessage;
    setMentorMessage('');
    setIsTyping(true);

    try {
      // Call real AI endpoint
      const messages = [
        {
          role: 'system',
          content: buildSystemPrompt()
        },
        ...(mentorSystem.mentorSession || [])
          .filter(m => m.type !== 'mentor' || !m.suggestedActions) // Don't include action buttons
          .map(m => ({
            role: m.type === 'user' ? 'user' : 'assistant',
            content: m.text
          })),
        {
          role: 'user',
          content: userInput
        }
      ];

      const response = await callAI(messages, 'llama3-8b-8192', 512);
      
      if (response && response.text) {
        const mentorResponse = {
          id: `mentor_${Date.now()}`,
          text: response.text,
          type: 'mentor',
          timestamp: new Date().toISOString(),
          isFallback: response.fallback
        };

        setMentorSystem(prev => ({
          ...prev,
          mentorSession: [...(prev.mentorSession || []), mentorResponse],
          xp: (prev.xp || 0) + 5  // Award XP for interaction
        }));

        // Show warning if this is a fallback response due to rate limiting
        if (response.fallback && response.retryable) {
          showToast('AI is busy - using cached response. Try again in a moment.', 'warning');
        } else if (response.fallback) {
          showToast('Using AI fallback response', 'info');
        }
      } else {
        showToast('No response from AI', 'error');
      }
    } catch (error) {
      const errorMsg = error.message || 'Failed to get mentor response';
      if (errorMsg.includes('already in progress')) {
        showToast('Please wait for the previous message...', 'warning');
      } else if (errorMsg.includes('rate') || errorMsg.includes('429')) {
        showToast('Too many requests. Please wait a moment and try again.', 'warning');
      } else {
        showToast(errorMsg, 'error');
      }
    } finally {
      setIsTyping(false);
    }
  };

  const handleSuggestedQuestion = (question) => {
    setMentorMessage(question);
    mentorInputRef.current?.focus();
  };

  return (
    <div className="guide-view">
      <div className="guide-header">
        <div>
          <h2>ðŸ¤– AI Learning Guide</h2>
          <p className="guide-subtitle">Your personal AI mentor for smarter learning</p>
        </div>
        <div className="guide-stats">
          <div className="stat-item">
            <span className="stat-icon">â­</span>
            <div>
              <label>Level</label>
              <span className="stat-value">{mentorSystem.level || 1}</span>
            </div>
          </div>
          <div className="stat-item">
            <span className="stat-icon">âš¡</span>
            <div>
              <label>XP</label>
              <span className="stat-value">{mentorSystem.xp || 0}</span>
            </div>
          </div>
          <div className="stat-item">
            <span className="stat-icon">ðŸ”¥</span>
            <div>
              <label>Streak</label>
              <span className="stat-value">{mentorSystem.streak || 1}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="mentor-session" ref={mentorMessagesRef}>
        {(!mentorSystem.mentorSession || mentorSystem.mentorSession.length === 0) ? (
          <div className="welcome-message">
            <div className="welcome-icon">ðŸ‘‹</div>
            <h3>Welcome to Your AI Learning Guide!</h3>
            <p>I'm here to help you learn more effectively. You can ask me about:</p>
            <ul>
              <li>ðŸ“š Learning strategies and study techniques</li>
              <li>ðŸŽ¯ Setting goals and tracking progress</li>
              <li>ðŸ“ How to take better notes</li>
              <li>ðŸ’¡ Getting unstuck when confused</li>
              <li>ðŸ§  Understanding difficult concepts</li>
            </ul>
          </div>
        ) : (
          mentorSystem.mentorSession.map((msg) => (
            <div key={msg.id} className={`message-group message-${msg.type}`}>
              <div className="message-avatar">
                {msg.type === 'user' ? 'ðŸ‘¤' : 'ðŸ¤–'}
              </div>
              <div className="message-content">
                <div className="message-text">{msg.text}</div>
              </div>
            </div>
          ))
        )}

        {isTyping && (
          <div className="message-group message-mentor">
            <div className="message-avatar">ðŸ¤–</div>
            <div className="typing-indicator">
              <span>Thinking</span>
              <div className="dots">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          </div>
        )}
      </div>

      <form className="mentor-input-form" onSubmit={handleMentorMessage}>
        <textarea
          ref={mentorInputRef}
          value={mentorMessage}
          onChange={(e) => setMentorMessage(e.target.value)}
          placeholder="Ask your mentor anything... (Shift+Enter for new line)"
          className="mentor-textarea"
          rows="3"
          onKeyPress={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleMentorMessage(e);
            }
          }}
        />
        <button 
          type="submit" 
          disabled={!mentorMessage.trim() || isTyping} 
          className="button primary submit-btn"
        >
          {isTyping ? 'â³ Thinking...' : 'âœ“ Send'}
        </button>
      </form>
    </div>
  );
}
