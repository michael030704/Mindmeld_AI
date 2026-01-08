import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useUserData } from '../contexts/UserDataContext';
import { useNavigate, useLocation } from 'react-router-dom';
import './Dashboard.css';
import Avatar from '../components/Avatar';
import mindmeldLogo from '../assets/mindmeld-logo.svg';
// Firestore
import { db } from '../firebase/config';
import { collection, getDocs, doc, getDoc, updateDoc, arrayUnion, arrayRemove, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore';

// Firestore helpers for follow/following migration
const fetchFollowingFromFirestore = async (uid) => {
  if (!db || !uid) return [];
  try {
    const ref = doc(db, 'users', uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) return [];
    const data = snap.data();
    if (!data) return [];
    const arr = Array.isArray(data.following) ? data.following : [];
    return arr.map(it => (typeof it === 'string' ? it : (it && (it.id || it.userId || it.uid) ? (it.id || it.userId || it.uid) : null))).filter(Boolean);
  } catch (e) {
    try {
      if (e && (e.code === 'permission-denied' || (e.message && e.message.toLowerCase().includes('permission')))) {
        console.debug('fetchFollowingFromFirestore permission denied');
      } else {
        console.warn('fetchFollowingFromFirestore failed', e);
      }
    } catch(_){}
    return [];
  }
};

const toggleFollowInFirestore = async (me, targetId, willFollow) => {
  if (!db || !me || !targetId) return false;
  try {
    const meRef = doc(db, 'users', me);
    const targetRef = doc(db, 'users', targetId);
    // ensure docs exist
    const [meSnap, targetSnap] = await Promise.all([getDoc(meRef), getDoc(targetRef)]);
    if (!meSnap.exists()) await setDoc(meRef, { following: [] }, { merge: true });
    if (!targetSnap.exists()) await setDoc(targetRef, { followers: [] }, { merge: true });
    if (willFollow) {
      await updateDoc(meRef, { following: arrayUnion(targetId) });
      await updateDoc(targetRef, { followers: arrayUnion(me) });
    } else {
      await updateDoc(meRef, { following: arrayRemove(targetId) });
      await updateDoc(targetRef, { followers: arrayRemove(me) });
    }
    return true;
  } catch (e) {
    console.warn('toggleFollowInFirestore failed', e);
    return false;
  }
};

// Persist notes/flashcards/mentor data to Firestore under users/{uid}
const persistUserDataToFirestore = async (uid, { notes, flashcards, mentorSystem }) => {
  if (!db || !uid) return false;
  try {
    const meRef = doc(db, 'users', uid);
    await updateDoc(meRef, { notes: notes || [], flashcards: flashcards || [], mentorSystem: mentorSystem || {} }).catch(async (e) => {
      // if update fails (e.g., doc missing), create it
      try { await setDoc(meRef, { notes: notes || [], flashcards: flashcards || [], mentorSystem: mentorSystem || {} }, { merge: true }); } catch(_){}
    });
    return true;
  } catch (e) {
    console.warn('persistUserDataToFirestore failed', e);
    return false;
  }
};

// Helper color utilities (use plain functions so they're available to AIService methods)
function getTopicColor(topic) {
  const colors = {
    learning: '#3b82f6',
    work: '#10b981',
    creative: '#8b5cf6',
    personal: '#f59e0b',
    technical: '#ef4444',
    business: '#ec4899',
    general: '#6b7280',
    research: '#06b6d4',
    idea: '#8b5cf6',
    project: '#10b981'
  };
  return colors[topic] || colors.general;
}

// Small inline SVG logo and icon components used in the header/navigation
const LogoIcon = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
    <path d="M12 2C9.243 2 7 4.243 7 7c0 3.5 5 8 5 8s5-4.5 5-8c0-2.757-2.243-5-5-5z" fill="#667eea"/>
    <circle cx="12" cy="7" r="2" fill="#fff" />
  </svg>
);

const IconNotes = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
    <path d="M7 3h7l5 5v11a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" stroke="#374151" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M13 3v6h6" stroke="#374151" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const IconMindmap = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
    <circle cx="12" cy="12" r="10" stroke="#10b981" strokeWidth="1.2"/>
    <circle cx="12" cy="12" r="4" fill="#10b981"/>
    <path d="M12 2v4m0 14v4M2 12h4m14 0h4" stroke="#10b981" strokeWidth="1.2" strokeLinecap="round"/>
  </svg>
);

const IconFlashcards = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
    <rect x="4" y="4" width="16" height="16" rx="2" stroke="#ec4899" strokeWidth="1.2"/>
    <path d="M9 10h6m-6 4h4" stroke="#ec4899" strokeWidth="1.2" strokeLinecap="round"/>
  </svg>
);

const IconConnections = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
    <path d="M7 12h3l2-3" stroke="#374151" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M17 12h-3l-2 3" stroke="#374151" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
    <circle cx="7" cy="12" r="1.6" fill="#fff" stroke="#374151" strokeWidth="1"/>
    <circle cx="17" cy="12" r="1.6" fill="#fff" stroke="#374151" strokeWidth="1"/>
  </svg>
);

const IconMentor = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
    <path d="M12 2a4 4 0 1 0 0 8 4 4 0 0 0 0-8z" fill="#f59e0b"/>
    <path d="M4 20c0-4 4-6 8-6s8 2 8 6" stroke="#f59e0b" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M9 12v2" stroke="#fff" strokeWidth="1.2" strokeLinecap="round"/>
    <path d="M15 12v2" stroke="#fff" strokeWidth="1.2" strokeLinecap="round"/>
  </svg>
);

const IconProfile = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
    <circle cx="12" cy="8" r="3" stroke="#6b7280" strokeWidth="1.2" fill="#f3f4f6"/>
    <path d="M4 20c0-3.5 4-6 8-6s8 2.5 8 6" stroke="#6b7280" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const IconTrophy = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
    <path d="M8 3h8v3a4 4 0 0 1-4 4 4 4 0 0 1-4-4V3z" fill="#8b5cf6"/>
    <path d="M12 14v6m0 0l-4-4m4 4l4-4" stroke="#8b5cf6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M5 18h14a2 2 0 0 1 2 2v1H3v-1a2 2 0 0 1 2-2z" stroke="#8b5cf6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const IconBook = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
    <path d="M3 6h14v12H3z" stroke="#06b6d4" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="#fff"/>
    <path d="M7 6v12" stroke="#06b6d4" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const IconCamera = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
    <path d="M4 7h3l2-2h6l2 2h3v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7z" stroke="#374151" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
    <circle cx="12" cy="13" r="3" stroke="#374151" strokeWidth="1.2"/>
  </svg>
);

const IconTrash = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
    <path d="M3 6h18" stroke="#ef4444" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M8 6v12a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V6" stroke="#ef4444" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M10 10v6M14 10v6" stroke="#ef4444" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const IconLogout = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
    <path d="M16 17l5-5-5-5" stroke="#374151" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M21 12H9" stroke="#374151" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M13 19H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h7" stroke="#374151" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

// DefaultAvatar now delegates to the shared Avatar component for consistent avatars
const DefaultAvatar = ({ size = 36, name = '', photoURL = null }) => (
  <Avatar size={size} name={name} photoURL={photoURL} />
);

// Image uploads disabled — no-op handler
const handleImageUpload = (e) => {
  // Profile pictures disabled in this build
  try { showAlertPopup && showAlertPopup('Disabled', 'Profile pictures are disabled.'); } catch (e) {}
};

// Learning Path Modal
const LearningPathModal = ({ learningPath, onClose }) => {
  if (!learningPath) return null;
  return (
    <div className="lp-overlay">
      <div className="lp-modal">
        <div className="lp-header">
          <h3>Personalized Learning Path</h3>
          <button onClick={onClose} className="lp-close">×</button>
        </div>
        <div className="lp-body">
          <p><strong>Level:</strong> {learningPath.level}</p>
          <p><strong>Estimated Completion:</strong> {learningPath.estimatedCompletion}</p>
          <h4>Steps</h4>
          <ol className="lp-steps">
            {learningPath.path.map((s, idx) => (
              <li key={idx}>
                <div className="lp-step-action">{s.step}. {s.action}</div>
                <div className="lp-step-meta">{s.duration} · {s.focus || ''}</div>
              </li>
            ))}
          </ol>
          <h4>Milestones</h4>
          <ul className="lp-milestones">
            {learningPath.milestones.map((m, idx) => (
              <li key={idx}>{m.milestone} — {m.reward}</li>
            ))}
          </ul>
        </div>
        <div className="lp-actions">
          <button onClick={onClose} className="popup-button primary">Close</button>
        </div>
      </div>
    </div>
  );
};

// Quick Action Button Component
const QuickAction = ({ icon, label, onClick, color = 'primary' }) => (
  <button onClick={onClick} className={`quick-action ${color}`}>
    <span className="action-icon">{icon}</span>
    <span className="action-label">{label}</span>
  </button>
);

// Enhanced Mentor Message Component
const MentorMessage = ({ message, isTyping = false, onActionClick = () => {}, onFollowUpClick = () => {} }) => {
  if (isTyping) {
    return (
      <div className="message mentor typing">
        <div className="typing-indicator">
          <div className="typing-dot"></div>
          <div className="typing-dot"></div>
          <div className="typing-dot"></div>
        </div>
        <span className="typing-text">Thinking...</span>
      </div>
    );
  }

  return (
    <div className={`message ${message?.type || 'mentor'}`}>
      <div className="message-content">
        <div className="message-text">
          {(message?.text || '').split('\n').map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </div>
        {message?.suggestedActions && message.suggestedActions.length > 0 && (
          <div className="suggested-actions">
            {message.suggestedActions.map((action, idx) => (
              <button key={idx} className="action-tag" onClick={() => onActionClick(action)}>{action}</button>
            ))}
          </div>
        )}
        {message?.followUpQuestions && message.followUpQuestions.length > 0 && (
          <div className="follow-up-questions">
            <div className="follow-up-label">You might also ask:</div>
            {message.followUpQuestions.map((q, idx) => (
              <button key={idx} className="follow-up-button" onClick={() => onFollowUpClick(q)}>{q}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

  // AI helper object
const AIService = {
  // Calculate string similarity (Levenshtein distance)
  similarity: (s1, s2) => {
    const longer = s1.length > s2.length ? s1 : s2;
    const shorter = s1.length > s2.length ? s2 : s1;
    if (longer.length === 0) return 1.0;
    return (longer.length - AIService.editDistance(longer, shorter)) / parseFloat(longer.length);
  },

  editDistance: (s1, s2) => {
    s1 = s1.toLowerCase();
    s2 = s2.toLowerCase();
    const costs = new Array(s2.length + 1);
    for (let i = 0; i <= s1.length; i++) {
      let lastValue = i;
      for (let j = 0; j <= s2.length; j++) {
        if (i === 0) {
          costs[j] = j;
        } else {
          if (j > 0) {
            let newValue = costs[j - 1];
            if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
              newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
            }
            costs[j - 1] = lastValue;
            lastValue = newValue;
          }
        }
      }
      if (i > 0) costs[s2.length] = lastValue;
    }
    return costs[s2.length];
  },

  // Generate intelligent flashcards with spaced repetition
  generateSmartFlashcards: (notes, userLearningStyle = 'visual') => {
    const flashcards = [];
    notes.forEach((note, index) => {
      const analysis = note.analysis || AIService.analyzeContentDeeply(note.content);
      const keywords = analysis.keyTopics && analysis.keyTopics.length ? analysis.keyTopics : AIService.extractKeywords(note.content);

      const cleanTitle = AIService.sanitizeText(note.title || '') || '';

      // Helper to build base metadata
      const baseMeta = (extra = {}) => ({
        id: `flashcard_${note.id}_${Date.now()}_${index}_${Math.random().toString(36).slice(2,6)}`,
        noteId: note.id,
        learned: false,
        lastReviewed: null,
        nextReviewDue: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        reviewCount: 0,
        masteryLevel: 0,
        category: note.category || 'general',
        tags: analysis.keyTopics || [],
        ...extra
      });

      // Primary AI-generated question (preferred): let the AI helper craft a natural Q/A
      try {
        const primary = AIService.generateQuestionFromAnalysis(note, analysis);
        if (primary && primary.question) {
          flashcards.push(Object.assign({
            question: primary.question,
            answer: primary.answer,
            hint: primary.hint || ''
          }, baseMeta({ difficulty: Math.min(5, 1 + Math.ceil(analysis.complexity * 2)) })));
        }
      } catch (e) {
        // fall through to other heuristics on error
        console.error('generateQuestionFromAnalysis failed', e);
      }

      // 1) Action-oriented flashcard (if any)
      if (analysis.actionItems && analysis.actionItems.length > 0) {
        const displayTitle = cleanTitle || AIService.sanitizeText(note.title || '') || '';
        flashcards.push(Object.assign({
          question: `What actionable steps are suggested in: "${displayTitle || 'this note'}"?`,
          answer: analysis.actionItems.map(i => `• ${i}`).join('\n'),
          hint: 'Focus on verbs and specific tasks.'
        }, baseMeta({ difficulty: Math.min(5, 2 + Math.ceil(analysis.complexity * 3)) })));
      }

      // 2) Cloze-style flashcard for top keyword
      if (keywords && keywords.length > 0) {
        const top = keywords[0];
        // find a sentence that contains the top keyword
        const sentence = (note.content || '').split(/(?<=[.!?])\s+/).find(s => s.toLowerCase().includes(top));
        if (sentence && sentence.length > 30) {
          const re = new RegExp(top, 'ig');
          const cloze = sentence.replace(re, '_____');
          flashcards.push(Object.assign({
            question: `Fill in the blank: ${cloze}`,
            answer: top,
            hint: `Look for the important term related to this sentence: ${top[0].toUpperCase()}...`,
          }, baseMeta({ difficulty: Math.min(5, 1 + Math.ceil(analysis.complexity * 2)) })));
        }

        // 3) Concept/explanation flashcard using top 2 keywords
        const qKeywords = keywords.slice(0, Math.min(3, keywords.length));
        const summary = note.content.length > 180 ? note.content.substring(0, 180) + '...' : note.content;
        flashcards.push(Object.assign({
          question: `Explain the key concepts: ${qKeywords.join(', ')}`,
          answer: summary,
          hint: 'Summarize the definitions and relationships between these concepts.'
        }, baseMeta({ difficulty: Math.min(5, 1 + Math.ceil(analysis.complexity * 2)) })));
      } else {
        // fallback: simple summary card
        const summary = note.content.length > 180 ? note.content.substring(0, 180) + '...' : note.content;
        const displayTitle = cleanTitle || AIService.sanitizeText(note.title || '') || '';
        flashcards.push(Object.assign({
          question: `Summarize the main point of: "${displayTitle || 'this note'}"`,
          answer: summary,
          hint: 'Identify the thesis or main conclusion.'
        }, baseMeta({ difficulty: Math.min(5, 1 + Math.ceil(analysis.complexity * 2)) })));
      }

      // apply learning-style hints
      flashcards.slice(-2).forEach(fc => {
        if (userLearningStyle === 'visual') fc.hint += ' (Try drawing a mind map)';
        if (userLearningStyle === 'auditory') fc.hint += ' (Explain it aloud)';
        if (userLearningStyle === 'kinesthetic') fc.hint += ' (Build a simple example)';
      });
    });
    // dedupe by question text and sort by difficulty
    const dedup = [];
    const seen = new Set();
    flashcards.forEach(f => {
      if (!seen.has(f.question)) {
        seen.add(f.question);
        dedup.push(f);
      }
    });
    return dedup.sort((a, b) => (a.difficulty || 2) - (b.difficulty || 2));
  },

  // Advanced mind map generation
  generateAdvancedMindMap: (notes, currentFocus = null) => {
    if (notes.length === 0) return { nodes: [], connections: [], clusters: [], centralTopic: 'Your Knowledge' };
    const clusters = {};
    notes.forEach(note => {
      const analysis = note.analysis || AIService.analyzeContentDeeply(note.content);
      const mainTopic = analysis.keyTopics[0] || 'general';
      if (!clusters[mainTopic]) {
        clusters[mainTopic] = {
          topic: mainTopic,
          notes: [],
          // ✅ FIXED: Use AIService.getTopicColor
          color: AIService.getTopicColor(mainTopic),
          size: 0
        };
      }
      clusters[mainTopic].notes.push(note);
      clusters[mainTopic].size++;
    });
    const nodes = [];
    const clusterPositions = {};
    const clusterCount = Object.keys(clusters).length;
    Object.values(clusters).forEach((cluster, clusterIndex) => {
      const angle = (clusterIndex / clusterCount) * Math.PI * 2;
      const radius = 180;
      clusterPositions[cluster.topic] = {
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius
      };
      nodes.push({
        id: `cluster_${cluster.topic}`,
        label: cluster.topic.toUpperCase(),
        type: 'cluster',
        size: 10 + Math.min(cluster.size, 10),
        color: cluster.color,
        x: clusterPositions[cluster.topic].x,
        y: clusterPositions[cluster.topic].y,
        cluster: cluster.topic
      });
      cluster.notes.slice(0, 8).forEach((note, noteIndex) => {
        const noteAngle = (noteIndex / cluster.notes.length) * Math.PI * 2;
        const noteRadius = 40 + noteIndex * 5;
        nodes.push({
          id: note.id,
          label: note.title || note.content.substring(0, 15) + '...',
          type: 'note',
          size: 6 + Math.min(note.content.length / 80, 6),
          // ✅ FIXED: Use AIService.getCategoryColor
          color: AIService.getCategoryColor(note.category || 'general'),
          x: clusterPositions[cluster.topic].x + Math.cos(noteAngle) * noteRadius,
          y: clusterPositions[cluster.topic].y + Math.sin(noteAngle) * noteRadius,
          cluster: cluster.topic,
          contentPreview: note.content.substring(0, 50) + (note.content.length > 50 ? '...' : '')
        });
      });
    });
    const connections = [];
    const processedPairs = new Set();
    notes.slice(0, 15).forEach((note, i) => {
      const noteAnalysis = note.analysis || AIService.analyzeContentDeeply(note.content);
      notes.slice(i + 1, Math.min(i + 10, notes.length)).forEach(otherNote => {
        const pairKey = [note.id, otherNote.id].sort().join('_');
        if (processedPairs.has(pairKey)) return;
        processedPairs.add(pairKey);
        const otherAnalysis = otherNote.analysis || AIService.analyzeContentDeeply(otherNote.content);
        const topicOverlap = noteAnalysis.keyTopics.filter(t =>
          otherAnalysis.keyTopics.includes(t)
        ).length;
        const sentimentSimilarity = 1 - Math.abs(noteAnalysis.sentiment - otherAnalysis.sentiment) / 2;
        const complexitySimilarity = 1 - Math.abs(noteAnalysis.complexity - otherAnalysis.complexity);
        const connectionStrength = (
          topicOverlap * 0.4 +
          sentimentSimilarity * 0.3 +
          complexitySimilarity * 0.3
        );
        if (connectionStrength > 0.35) {
          connections.push({
            source: note.id,
            target: otherNote.id,
            strength: connectionStrength,
            type: topicOverlap > 0 ? 'topic' : 'semantic',
            width: 1 + connectionStrength * 3
          });
        }
      });
    });
    return {
      nodes,
      connections: connections.slice(0, 20),
      clusters: Object.values(clusters),
      centralTopic: currentFocus || 'Your Knowledge Network',
      stats: {
        totalNodes: nodes.length,
        totalConnections: connections.length,
        clusterCount: Object.keys(clusters).length,
        connectionDensity: (connections.length / Math.max(1, nodes.length)).toFixed(2)
      }
    };
  },

  // Find semantic connections between a target note and others
  findSemanticConnections: (notes, noteId) => {
    try {
      if (!Array.isArray(notes) || notes.length < 2) return [];
      const target = notes.find(n => n.id === noteId);
      if (!target) return [];
      const baseAnalysis = target.analysis || AIService.analyzeContentDeeply(target.content || '');
      const connections = [];
      notes.forEach(n => {
        try {
          if (!n || n.id === noteId) return;
          const otherAnalysis = n.analysis || AIService.analyzeContentDeeply(n.content || '');
          let score = 0;
          // topic overlap (weighted)
          const overlap = (baseAnalysis.keyTopics || []).filter(t => (otherAnalysis.keyTopics || []).includes(t)).length;
          score += overlap * 40;
          // emotional tone match
          if (baseAnalysis.emotionalTone && otherAnalysis.emotionalTone && baseAnalysis.emotionalTone === otherAnalysis.emotionalTone) score += 20;
          // similar complexity
          if (typeof baseAnalysis.complexity === 'number' && typeof otherAnalysis.complexity === 'number' && Math.abs(baseAnalysis.complexity - otherAnalysis.complexity) < 0.2) score += 15;
          // keyword semantic similarity
          const kwsA = AIService.extractKeywords(target.content || '', 8);
          const kwsB = AIService.extractKeywords(n.content || '', 8);
          const semMatches = kwsA.filter(a => kwsB.some(b => AIService.similarity(a, b) > 0.7)).length;
          score += Math.min(30, semMatches * 15);

          // normalize into a 0..1 strength
          const strength = Math.max(0, Math.min(1, score / 100));
          if (strength > 0.05) {
            connections.push({
              id: n.id,
              title: n.title || (n.content || '').substring(0, 30),
              excerpt: (n.content || '').substring(0, 160),
              strength,
              score
            });
          }
        } catch (e) {}
      });
      return connections.sort((a, b) => b.strength - a.strength).slice(0, 50);
    } catch (e) { return []; }
  },

  // ✅ Expose helper functions as methods
  getTopicColor: (topic) => {
    const colors = {
      learning: '#3b82f6',
      work: '#10b981',
      creative: '#8b5cf6',
      personal: '#f59e0b',
      technical: '#ef4444',
      business: '#ec4899',
      general: '#6b7280',
      research: '#06b6d4',
      idea: '#8b5cf6',
      project: '#10b981'
    };
    return colors[topic] || colors.general;
  },

  getCategoryColor: (category) => {
    const colors = {
      idea: '#ec4899',
      research: '#3b82f6',
      project: '#10b981',
      personal: '#f59e0b',
      general: '#6b7280',
      technical: '#ef4444',
      business: '#8b5cf6',
      learning: '#06b6d4'
    };
    return colors[category] || colors.general;
  },

  // Basic sanitizer for display strings
  sanitizeText: (s) => {
    if (!s) return '';
    try {
      return String(s).replace(/\s+/g, ' ').trim();
    } catch (e) { return '' + s; }
  },

  // Very small keyword extractor (returns array of single-word topics)
  extractKeywords: (text, max = 6) => {
    if (!text) return [];
    try {
      const words = String(text).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 3);
      const counts = {};
      words.forEach(w => counts[w] = (counts[w] || 0) + 1);
      return Object.keys(counts).sort((a,b) => counts[b]-counts[a]).slice(0, max);
    } catch (e) { return []; }
  },

  // Lightweight content analysis used when no server AI available
  analyzeContentDeeply: (text) => {
    const cleaned = AIService.sanitizeText(text || '');
    const keywords = AIService.extractKeywords(cleaned, 8);
    const keyTopics = keywords.slice(0, 5);
    const keywordScores = keywords.map(w => ({ w, score: Math.min(1, (cleaned.match(new RegExp(`\\b${w}\\b`, 'g')) || []).length / 5) }));
    // naive complexity: ratio of unique words to total words
    const tokens = cleaned.split(/\s+/).filter(Boolean);
    const unique = Array.from(new Set(tokens));
    const complexity = tokens.length === 0 ? 0 : Math.min(1, unique.length / Math.max(1, tokens.length));
    const wordCount = tokens.length;
    // action items: look for lines starting with verbs or dash
    const actionItems = (cleaned.split(/\n|\.|;/).map(s => s.trim()).filter(Boolean).slice(0,6)).filter(s => s.split(' ').length > 2).slice(0,4);
    // sentiment: very naive positive/negative word count
    const posWords = ['good','great','improve','positive','success','benefit','increase','win','helpful'];
    const negWords = ['bad','problem','issue','error','fail','difficult','bug','reduce','loss'];
    const lc = cleaned.toLowerCase();
    let score = 0;
    posWords.forEach(w => { if (lc.includes(w)) score += 1; });
    negWords.forEach(w => { if (lc.includes(w)) score -= 1; });
    const sentiment = Math.max(-1, Math.min(1, score / Math.max(1, (posWords.length+negWords.length)/8)));
    // derive a simple emotional tone label
    let emotionalTone = 'neutral';
    if (sentiment > 0.25) emotionalTone = 'positive';
    else if (sentiment < -0.25) emotionalTone = 'negative';

    return {
      keyTopics,
      keywordScores,
      complexity,
      wordCount,
      emotionalTone,
      actionItems,
      sentiment,
    };
  },

  // Generate a natural-language question + answer from note analysis (heuristic AI)
  generateQuestionFromAnalysis: (note, analysis) => {
    const text = (note.content || '').trim();
    const rawTitle = (note.title || '').trim();
    const title = AIService.sanitizeText(rawTitle) || '';
    const keywords = (analysis && analysis.keyTopics && analysis.keyTopics.length) ? analysis.keyTopics.map(k => AIService.sanitizeText(k)).filter(Boolean) : (analysis && analysis.keywordScores ? analysis.keywordScores.map(k=>k.w).map(w=>AIService.sanitizeText(w)).filter(Boolean) : []);

    // Prefer action-items when present
    if (analysis.actionItems && analysis.actionItems.length > 0) {
      const displayTitle = title || AIService.sanitizeText(rawTitle) || '';
      const q = `What are the next actionable steps recommended in ${displayTitle ? `"${displayTitle}"` : 'this note'}?`;
      const a = analysis.actionItems.map(i => `• ${i}`).join('\n');
      return { question: q, answer: a, hint: 'List the concrete steps or tasks suggested.' };
    }

    // If there are strong keywords, craft a variety of question templates and pick the most suitable
    const topKeywords = keywords.slice(0, 3).map(k => AIService.sanitizeText(k)).filter(Boolean);
    if (topKeywords.length > 0) {
      const main = topKeywords[0];
      // try to find a sentence containing the main keyword
      const sentences = text.split(/(?<=[.!?])\s+/).filter(s=>s.trim());
      const containing = sentences.find(s=>s.toLowerCase().includes(main.toLowerCase()));

      // Cloze if sentence found
      if (containing && containing.length > 30) {
        const re = new RegExp(main, 'ig');
        const cloze = containing.replace(re, '_____');
        return {
          question: `Fill in the blank: ${cloze}`,
          answer: main,
          hint: `The missing term is an important concept (starts with ${main[0].toUpperCase()}).`
        };
      }

      // Definition-style question
      return {
        question: `What is ${main}? Explain briefly.`,
        answer: (containing && containing.length>0) ? containing : (text.length>150 ? text.substring(0,150)+'...' : text),
        hint: `Describe the meaning and role of ${main} in the note.`
      };
    }

    // Fallback summarization question
    const displayTitle = title || AIService.sanitizeText(rawTitle) || '';
    return {
      question: `Summarize the main point of ${displayTitle ? `"${displayTitle}"` : 'this note'}.`,
      answer: text.length > 200 ? text.substring(0,200) + '...' : text,
      hint: 'State the thesis or core conclusion in one or two sentences.'
    };
  },

  // SMART AI Mentor System
  MentorSystem: {
    // Initialize user profile
    initializeUserProfile: (notes) => {
      if (notes.length === 0) {
        return {
          learningStyle: 'balanced',
          consistencyScore: 0.3,
          engagementLevel: 0.5,
          knowledgeDepth: 0,
          growthRate: 0,
          learningPatterns: {},
          preferredTopics: [],
          cognitivePattern: 'balanced',
          motivationPattern: 'exploratory'
        };
      }
      const patterns = AIService.MentorSystem.analyzeWritingPatterns(notes);
      const allContent = notes.map(n => n.content).join(' ');
      const deepAnalysis = AIService.analyzeContentDeeply(allContent);
      let learningStyle = 'balanced';
      if (patterns.visualScore > patterns.verbalScore && patterns.visualScore > patterns.kinestheticScore) {
        learningStyle = 'visual';
      } else if (patterns.verbalScore > patterns.visualScore && patterns.verbalScore > patterns.kinestheticScore) {
        learningStyle = 'auditory';
      } else if (patterns.kinestheticScore > patterns.visualScore && patterns.kinestheticScore > patterns.verbalScore) {
        learningStyle = 'kinesthetic';
      }
      let cognitivePattern = 'balanced';
      const complexityScores = notes.map(n => (n.analysis?.complexity || 0));
      const avgComplexity = complexityScores.reduce((a, b) => a + b, 0) / complexityScores.length;
      if (avgComplexity > 0.7) cognitivePattern = 'analytical';
      else if (avgComplexity < 0.3) cognitivePattern = 'practical';
      return {
        learningStyle,
        consistencyScore: Math.min(1, notes.length / 20),
        engagementLevel: Math.min(1, notes.filter(n => n.content.length > 100).length / Math.max(1, notes.length)),
        knowledgeDepth: Math.min(1, notes.reduce((sum, n) => sum + (n.analysis?.complexity || 0), 0) / Math.max(1, notes.length)),
        growthRate: Math.min(1, notes.slice(0, 5).reduce((sum, n) => sum + (n.analysis?.complexity || 0), 0) /
          Math.max(1, notes.slice(-5).reduce((sum, n) => sum + (n.analysis?.complexity || 0), 0))),
        learningPatterns: patterns,
        preferredTopics: deepAnalysis.keyTopics,
        cognitivePattern,
        motivationPattern: deepAnalysis.sentiment > 0.3 ? 'achievement' : 'exploratory'
      };
    },

    // Analyze user's writing patterns deeply
    analyzeWritingPatterns: (notes) => {
      if (notes.length === 0) return {
        visualScore: 0,
        verbalScore: 0,
        kinestheticScore: 0,
        detailOriented: 0,
        bigPicture: 0,
        questionFrequency: 0,
        actionOrientation: 0
      };
      const patterns = {
        visualScore: 0,
        verbalScore: 0,
        kinestheticScore: 0,
        detailOriented: 0,
        bigPicture: 0,
        questionFrequency: 0,
        actionOrientation: 0
      };
      const visualWords = ['see', 'look', 'visual', 'picture', 'diagram', 'chart', 'graph', 'color', 'shape'];
      const verbalWords = ['say', 'tell', 'speak', 'discuss', 'explain', 'describe', 'word', 'language'];
      const kinestheticWords = ['do', 'make', 'build', 'create', 'move', 'action', 'practice', 'hands-on'];
      const detailWords = ['specifically', 'exactly', 'precisely', 'detail', 'particular', 'specific'];
      const bigPictureWords = ['overall', 'generally', 'broadly', 'big', 'picture', 'strategy', 'vision'];
      let totalWords = 0;
      let questionCount = 0;
      let actionWordCount = 0;
      notes.forEach(note => {
        const content = note.content.toLowerCase();
        const words = content.split(/\s+/);
        totalWords += words.length;
        questionCount += (content.match(/\?/g) || []).length;
        actionWordCount += kinestheticWords.filter(word => content.includes(word)).length;
        patterns.visualScore += visualWords.filter(word => content.includes(word)).length;
        patterns.verbalScore += verbalWords.filter(word => content.includes(word)).length;
        patterns.kinestheticScore += kinestheticWords.filter(word => content.includes(word)).length;
        patterns.detailOriented += detailWords.filter(word => content.includes(word)).length;
        patterns.bigPicture += bigPictureWords.filter(word => content.includes(word)).length;
      });
      patterns.questionFrequency = questionCount / Math.max(1, notes.length);
      patterns.actionOrientation = actionWordCount / Math.max(1, notes.length);
      Object.keys(patterns).forEach(key => {
        if (key !== 'questionFrequency' && key !== 'actionOrientation') {
          patterns[key] = patterns[key] / Math.max(1, totalWords / 100);
        }
        patterns[key] = Math.min(1, patterns[key]);
      });
      return patterns;
    },

    // Generate personalized learning path
    generateLearningPath: (userProfile, goals, currentProgress) => {
      const level = currentProgress < 30 ? 'beginner' :
        currentProgress < 70 ? 'intermediate' : 'advanced';
      const learningStyles = {
        visual: [
          { step: 1, action: 'Create visual mind maps for your notes', duration: '1 week', focus: 'visualization' },
          { step: 2, action: 'Use color coding for different topics', duration: '3 days', focus: 'organization' },
          { step: 3, action: 'Create diagrams for complex concepts', duration: '2 weeks', focus: 'comprehension' }
        ],
        auditory: [
          { step: 1, action: 'Record yourself explaining key concepts', duration: '1 week', focus: 'verbalization' },
          { step: 2, action: 'Discuss notes with others or teach concepts', duration: '2 weeks', focus: 'communication' },
          { step: 3, action: 'Create audio summaries of your notes', duration: '1 week', focus: 'synthesis' }
        ],
        kinesthetic: [
          { step: 1, action: 'Create physical representations of concepts', duration: '1 week', focus: 'tactile' },
          { step: 2, action: 'Apply concepts through practical projects', duration: '3 weeks', focus: 'application' },
          { step: 3, action: 'Build prototypes or models of ideas', duration: '2 weeks', focus: 'creation' }
        ],
        balanced: [
          { step: 1, action: 'Combine multiple learning methods', duration: '1 week', focus: 'integration' },
          { step: 2, action: 'Create multi-modal study materials', duration: '2 weeks', focus: 'diversity' },
          { step: 3, action: 'Teach concepts using different approaches', duration: '2 weeks', focus: 'adaptation' }
        ]
      };
      const path = learningStyles[userProfile.learningStyle] || learningStyles.balanced;
      const milestones = goals && goals.length > 0
        ? [
          { milestone: 'Complete first learning step', reward: '🚀 Starter Badge' },
          { milestone: 'Apply learning to a specific goal', reward: '🎯 Goal-Oriented Badge' },
          { milestone: 'Create comprehensive project', reward: '🏆 Mastery Badge' }
        ]
        : [
          { milestone: 'Complete 5 learning sessions', reward: '⭐ Consistency Badge' },
          { milestone: 'Master 3 key concepts', reward: '🧠 Knowledge Builder Badge' },
          { milestone: 'Teach someone a concept', reward: '👥 Mentor Badge' }
        ];
      return {
        level,
        path,
        estimatedCompletion: '4-6 weeks',
        milestones,
        focusAreas: userProfile.preferredTopics?.slice(0, 3) || ['general learning'],
        successMetrics: {
          notesTarget: 20,
          connectionsTarget: 10,
          masteryTarget: 5
        }
      };
    },

    // Adaptive challenge generation based on user patterns
    generateAdaptiveChallenge: (userProfile, recentPerformance, notes) => {
      if (!notes || notes.length === 0) {
        return {
          id: `challenge_${Date.now()}`,
          title: 'First Note Creation',
          description: 'Create your first note to start your knowledge journey',
          difficulty: 'beginner',
          xp: 10,
          timeEstimate: '10 minutes',
          successCriteria: 'Create one note with at least 50 words',
          tags: ['foundation', 'getting-started'],
          focusArea: 'general',
          assignedAt: new Date().toISOString(),
          dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          status: 'active',
          progress: 0
        };
      }
      const challengeTypes = {
        creativity: [
          {
            title: 'Idea Fusion Challenge',
            description: 'Combine three unrelated concepts from your notes into one innovative solution',
            difficulty: 'medium',
            xp: 30,
            timeEstimate: '45 minutes',
            successCriteria: 'Create a coherent concept combining all three ideas',
            tags: ['creativity', 'innovation', 'synthesis']
          },
          {
            title: 'Perspective Shifting',
            description: 'Rewrite a technical note for a complete beginner audience',
            difficulty: 'hard',
            xp: 40,
            timeEstimate: '60 minutes',
            successCriteria: 'Make the concept understandable without jargon',
            tags: ['communication', 'simplification', 'empathy']
          }
        ],
        analysis: [
          {
            title: 'Pattern Recognition Mastery',
            description: 'Analyze your last 15 notes and identify at least 5 recurring patterns',
            difficulty: 'medium',
            xp: 35,
            timeEstimate: '50 minutes',
            successCriteria: 'Document patterns with specific examples',
            tags: ['analysis', 'patterns', 'insights']
          },
          {
            title: 'Root Cause Investigation',
            description: 'Take a problem from your notes and trace it through 5 levels of "why"',
            difficulty: 'hard',
            xp: 45,
            timeEstimate: '75 minutes',
            successCriteria: 'Create a detailed cause-effect chain',
            tags: ['problem-solving', 'depth', 'investigation']
          }
        ],
        synthesis: [
          {
            title: 'Knowledge Integration',
            description: 'Connect 5 different notes into a coherent story or framework',
            difficulty: 'medium',
            xp: 35,
            timeEstimate: '55 minutes',
            successCriteria: 'Create meaningful connections between all notes',
            tags: ['synthesis', 'integration', 'framework']
          },
          {
            title: 'Concept Mapping',
            description: 'Create a comprehensive mind map connecting 10+ related notes',
            difficulty: 'hard',
            xp: 50,
            timeEstimate: '90 minutes',
            successCriteria: 'Map with clear hierarchy and connections',
            tags: ['visualization', 'organization', 'comprehension']
          }
        ]
      };
      let selectedType = 'creativity';
      const recentNotes = notes.slice(0, 5);
      if (recentNotes.length > 0) {
        const analyses = recentNotes.map(n => n.analysis || AIService.analyzeContentDeeply(n.content));
        const creativeCount = analyses.filter(a => a.emotionalTone === 'creative').length;
        const analyticalCount = analyses.filter(a => a.cognitiveLoad === 'high').length;
        const synthesisCount = analyses.filter(a => a.complexity > 0.6).length;
        if (analyticalCount > creativeCount && analyticalCount > synthesisCount) selectedType = 'analysis';
        else if (synthesisCount > creativeCount && synthesisCount > analyticalCount) selectedType = 'synthesis';
      }
      let difficulty = 'medium';
      if (userProfile.consistencyScore < 0.3) difficulty = 'beginner';
      else if (userProfile.consistencyScore > 0.7) difficulty = 'hard';
      const availableChallenges = challengeTypes[selectedType];
      const baseChallenge = availableChallenges[Math.floor(Math.random() * availableChallenges.length)];
      const xpMultiplier = difficulty === 'beginner' ? 0.7 : difficulty === 'hard' ? 1.3 : 1;
      const timeMultiplier = difficulty === 'beginner' ? 0.8 : difficulty === 'hard' ? 1.2 : 1;
      return {
        ...baseChallenge,
        id: `challenge_${Date.now()}`,
        difficulty,
        xp: Math.round(baseChallenge.xp * xpMultiplier),
        timeEstimate: baseChallenge.timeEstimate,
        focusArea: selectedType,
        assignedAt: new Date().toISOString(),
        dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        status: 'active',
        progress: 0
      };
    },

    determineIntent: (message) => {
      const msg = message.toLowerCase();
      if (msg.includes('how') && (msg.includes('learn') || msg.includes('study'))) return 'learning_method';
      if (msg.includes('goal') || msg.includes('achieve') || msg.includes('target')) return 'goal_achievement';
      if (msg.includes('problem') || msg.includes('stuck') || msg.includes('help')) return 'problem_solving';
      if (msg.includes('note') && (msg.includes('organize') || msg.includes('manage'))) return 'note_organization';
      if (msg.includes('time') || msg.includes('busy') || msg.includes('schedule')) return 'time_management';
      if (msg.includes('motivat') || msg.includes('energy') || msg.includes('tired')) return 'motivation';
      if (msg.includes('connect') || msg.includes('relate') || msg.includes('link')) return 'connection_making';
      if (msg.includes('create') || msg.includes('idea') || msg.includes('innovate')) return 'creativity';
      if (msg.includes('improve') || msg.includes('better') || msg.includes('enhance')) return 'skill_improvement';
      if (msg.includes('remember') || msg.includes('forget') || msg.includes('recall')) return 'memory';
      if (msg.includes('understand') || msg.includes('comprehend') || msg.includes('grasp')) return 'comprehension';
      return 'general_advice';
    },

    // ✅ FIXED & ENHANCED: Warm, human, contextual replies
    processUserMessage: (message, context) => {
      try {
        const { notes = [], goals = [], userProfile = {}, conversationHistory = [] } = context || {};
        const intent = AIService.MentorSystem.determineIntent(message || '');
        const analysis = AIService.analyzeContentDeeply(message || '');

        let reply = "";

        // Greeting with time + streak awareness
        const hour = new Date().getHours();
        const timeGreeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
        const streak = context.streak || 1;
        const progress = context.progress?.overall || 0;
        reply += `${timeGreeting}! 👋 `;
        if (streak > 3) reply += `You’re on a ${streak}-day streak—amazing consistency! `;
        if (progress > 70) reply += `You’re really leveling up! `;
        reply += `\n\n`;

        // Handle empty input gracefully
        if (!message || message.trim().length < 3) {
          reply += "No worries—you don’t need a perfect question. Even saying *“I’m stuck”* is enough. 💙\n\nHow about we...";
          const fallbackActions = ["Review your latest note?", "Check in on your active goal?", "Get a quick learning tip?"];
          return {
            text: reply + fallbackActions.map((a, i) => `\n${i + 1}. ${a}`).join(''),
            type: 'mentor',
            timestamp: new Date().toISOString(),
            suggestedActions: fallbackActions,
            followUpQuestions: ["What’s on your mind?", "Need a nudge?"]
          };
        }

        // Context-aware responses
        const recentNote = notes[0];
        const activeGoal = goals.find(g => g.status === 'active');

        switch (intent) {
          case 'learning_method':
            const topic = recentNote?.analysis?.keyTopics?.[0] || 'your current focus';
            reply += `You’ve got great notes on **${topic}**—here’s how to lock that in:\n\n`;
            reply += `• **Test yourself** *before* re-reading (it feels harder, but works better!)\n`;
            reply += `• **Space it out**: review today, then in 2 days\n`;
            reply += `• Since you learn best with **${userProfile.learningStyle || 'multiple'}** styles, try explaining it out loud *while* sketching key ideas.`;
            break;
          case 'goal_achievement':
            if (activeGoal) {
              const p = activeGoal.progress || 0;
              reply += `Love that you’re focused on **“${activeGoal.name}”**! 🎯\n\n`;
              if (p < 30) {
                reply += `Start with the tiniest possible win—like opening the project file or writing one sentence. Momentum starts with *motion*, not motivation.`;
              } else if (p < 80) {
                reply += `You’re in the messy middle—this is where growth happens! 🌱 Pick *one* 15-minute action to move the needle today.`;
              } else {
                reply += `You’re so close! What’s the final 5% you need to cross the finish line?`;
              }
            } else {
              reply += `Goals thrive on clarity + tiny steps. Try this:\n\n1. Write your goal as: “I will [verb] [object] by [date].”\n2. What’s the *very first* 2-minute action? Do it now.`;
            }
            break;
          case 'problem_solving':
            reply += `Feeling stuck? That’s your brain growing. 💪\n\n`;
            reply += `Try this:\n→ Write the problem in **7 words or fewer**.\n→ Ask: *“What’s the smallest piece I can solve right now?”*\n\nYou’ve untangled tough things before—this is just one more.`;
            break;
          case 'note_organization':
            reply += `Your notes are your second brain—let’s keep them tidy! ✨\n\n`;
            if (notes.length > 10) {
              reply += `• **Archive or delete** anything older than 30 days you haven’t revisited\n• **Tag consistently** (e.g., #idea, #question, #action)\n• Once a week, **connect related notes** using the “Connections” tab`;
            } else {
              reply += `• Give every note a clear **title**\n• Use **#tags** for easy filtering later\n• Group by theme—your future self will thank you!`;
            }
            break;
          case 'motivation':
            reply += `Motivation follows action—not the other way around. So…\n\n`;
            reply += `👉 Open the doc.\n👉 Write one sentence.\n👉 That’s a win.\n\nProgress > perfection. You’ve got this.`;
            break;
          case 'time_management':
            reply += `Time isn’t the issue—**focus** is. ⏳\n\nTry the **15-minute rule**:\n1. Set a timer\n2. Work on *one thing only*\n3. When it rings, stop and breathe\n\nYou’ll often keep going—but even if you don’t, you’ve won the day.`;
            break;
          default:
            const topics = analysis.keyTopics.join(', ') || 'your thoughts';
            reply += `Thanks for sharing about *${topics}*.\n\n`;
            if (analysis.sentiment < -0.2) {
              reply += `This sounds tough—I’m proud of you for facing it. 💙\n\n`;
            } else if (analysis.sentiment > 0.3) {
              reply += `Your energy is contagious! 🔥\n\n`;
            }
            reply += `Here’s what I’d suggest:\n• If it’s **learning**: test yourself, don’t just re-read\n• If it’s **creating**: start messy—edit later\n• If it’s **planning**: break it into a 2-minute starter task\n\nWant me to tailor this more? Just tell me your goal or topic.`;
        }

        // Suggested actions (friendly & actionable)
        const actions = {
          learning_method: ['Test myself', 'Space my review', 'Teach it out loud'],
          goal_achievement: ['Define tiny step', 'Track progress', 'Review weekly'],
          problem_solving: ['Simplify the problem', 'Try one small fix', 'Take a breath'],
          note_organization: ['Add tags', 'Archive old notes', 'Connect ideas'],
          motivation: ['Do a 2-min starter', 'Celebrate small win', 'Review progress'],
          time_management: ['Use 15-min timer', 'Single-task only', 'Plan breaks'],
          general_advice: ['Ask about learning', 'Review my notes', 'Set a tiny goal']
        };

        const suggestedActions = actions[intent] || actions.general_advice;
        const followUps = {
          learning_method: ["What topic are you focusing on?", "Want a custom study plan?"],
          goal_achievement: ["What’s your #1 goal right now?", "Need help breaking it down?"],
          problem_solving: ["Can you describe the block?", "Want a fresh perspective?"],
          note_organization: ["Want tagging suggestions?", "Should we clean up old notes?"],
          general_advice: ["What’s on your mind?", "How can I support you today?"]
        };
        const followUpQuestions = followUps[intent] || followUps.general_advice;

        return {
          text: reply,
          type: 'mentor',
          timestamp: new Date().toISOString(),
          suggestedActions,
          followUpQuestions,
          confidence: 0.95
        };
      } catch (err) {
        console.error('Error in processUserMessage:', err);
        return {
          text: "Hey! I'm your AI mentor—here to help you learn and grow. 😊\n\nWhat would you like to work on today?",
          type: 'mentor',
          timestamp: new Date().toISOString(),
          suggestedActions: ["Ask about learning", "Organize notes", "Set a goal"],
          followUpQuestions: ["What’s on your mind?", "Need study tips?", "Feeling stuck?"]
        };
      }
    },

    // Other MentorSystem methods
    generatePersonalizedInsights: (context) => {
      const { notes, userProfile } = context;
      const insights = [];
      if (notes.length >= 5) {
        const analyses = notes.slice(0, 5).map(n => n.analysis || AIService.analyzeContentDeeply(n.content));
        const avgComplexity = analyses.reduce((sum, a) => sum + a.complexity, 0) / analyses.length;
        if (avgComplexity > 0.6) {
          insights.push('You\'re engaging with complex topics, which accelerates learning');
        }
        if (userProfile.consistencyScore > 0.7) {
          insights.push('Strong consistency detected - this habit will compound over time');
        }
        const topicDiversity = new Set(notes.flatMap(n =>
          (n.analysis?.keyTopics || AIService.analyzeContentDeeply(n.content).keyTopics)
        )).size;
        if (topicDiversity > 3) {
          insights.push(`You're exploring ${topicDiversity} different topic areas - great for interdisciplinary thinking`);
        }
      }
      if (notes.length > 0) {
        const latestNote = notes[0];
        const analysis = latestNote.analysis || AIService.analyzeContentDeeply(latestNote.content);
        if (analysis.sentiment > 0.3) {
          insights.push('Positive tone in recent notes correlates with better learning outcomes');
        }
        if (analysis.actionItems.length > 0) {
          insights.push('Action-oriented notes increase implementation likelihood by 40%');
        }
      }
      return insights.slice(0, 2);
    },

    // ✅ CORRECTLY DEFINED INSIDE MentorSystem
    generateActionableSuggestions: (intent, context) => {
      const { notes, userProfile } = context;
      const suggestions = [];
      if (notes.length > 0) {
        const latestNote = notes[0];
        const analysis = latestNote.analysis || AIService.analyzeContentDeeply(latestNote.content);
        if (analysis.complexity < 0.3 && notes.length > 5) {
          suggestions.push('Challenge yourself with more complex topics to accelerate growth');
        }
        if (analysis.actionItems.length === 0 && analysis.complexity > 0.4) {
          suggestions.push('Add actionable next steps to complex notes for better application');
        }
        if (userProfile.learningStyle === 'visual' && !notes.some(n => n.category === 'mindmap')) {
          suggestions.push('Create visual mind maps for complex topics to leverage your visual learning strength');
        }
      }
      if (notes.length > 10 && !notes.some(n => n.tags && n.tags.length > 3)) {
        suggestions.push('Add more tags to notes for better organization and retrieval');
      }
      return suggestions.slice(0, 2);
    },

    getSuggestedActions: (intent, context) => {
      const actions = {
        learning_method: ['Create flashcards', 'Teach someone', 'Apply knowledge'],
        goal_achievement: ['Break into milestones', 'Set deadlines', 'Track progress'],
        problem_solving: ['Break it down', 'Seek perspectives', 'Experiment'],
        note_organization: ['Create categories', 'Add tags', 'Weekly review'],
        general_advice: ['Review patterns', 'Set learning goal', 'Connect concepts']
      };
      return actions[intent] || actions.general_advice;
    },

    generateFollowUpQuestions: (intent, context) => {
      const { notes, userProfile } = context;
      const questions = {
        learning_method: [
          'What specific topic do you want to master next?',
          'How do you prefer to test your understanding?',
          'What learning obstacles have you faced recently?'
        ],
        goal_achievement: [
          'What\'s the smallest step you can take today?',
          'How will you measure progress this week?',
          'What resources do you need to succeed?'
        ],
        problem_solving: [
          'Have you faced similar challenges before?',
          'Who could provide valuable perspective on this?',
          'What assumptions might be limiting your solution?'
        ],
        general_advice: [
          'What area of knowledge management interests you most?',
          'How can I better support your learning journey?',
          'What recent insight has been most valuable to you?'
        ]
      };
      return questions[intent] || questions.general_advice;
    },

    // Generate weekly learning report
    generateWeeklyReport: (notes, goals, challenges, userProfile) => {
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - 7);
      const recentNotes = notes.filter(n => new Date(n.createdAt) > weekStart);
      const completedGoals = goals.filter(g => g.status === 'completed' && new Date(g.completedAt) > weekStart);
      const completedChallenges = challenges.filter(c => c.status === 'completed' && new Date(c.completedAt) > weekStart);
      const noteAnalyses = recentNotes.map(n => n.analysis || AIService.analyzeContentDeeply(n.content));
      const metrics = {
        notesCreated: recentNotes.length,
        goalsCompleted: completedGoals.length,
        challengesCompleted: completedChallenges.length,
        avgNoteLength: recentNotes.length > 0
          ? Math.round(recentNotes.reduce((sum, n) => sum + n.content.length, 0) / recentNotes.length)
          : 0,
        topicDiversity: new Set(recentNotes.flatMap(n =>
          (n.analysis?.keyTopics || AIService.analyzeContentDeeply(n.content).keyTopics)
        )).size,
        avgComplexity: noteAnalyses.length > 0
          ? parseFloat((noteAnalyses.reduce((sum, a) => sum + a.complexity, 0) / noteAnalyses.length).toFixed(2))
          : 0,
        actionItemCount: noteAnalyses.reduce((sum, a) => sum + a.actionItems.length, 0)
      };
      const insights = [];
      if (metrics.notesCreated >= 5) {
        insights.push(`Consistent note-taking: ${metrics.notesCreated} notes this week`);
      }
      if (metrics.avgComplexity > 0.5) {
        insights.push('Engaging with complex topics - great for cognitive growth');
      }
      if (metrics.actionItemCount > 0) {
        insights.push(`${metrics.actionItemCount} actionable items identified - focus on implementation`);
      }
      if (completedChallenges.length > 0) {
        insights.push(`${completedChallenges.length} challenges completed - demonstrating perseverance`);
      }
      const recommendations = [
        metrics.notesCreated < 3 ? 'Aim for at least 5 notes next week' : 'Maintain current note-taking pace',
        'Review and connect notes from different days',
        'Set one specific learning goal for next week',
        metrics.topicDiversity < 2 ? 'Explore a new topic area' : 'Deepen existing topic knowledge'
      ];
      const achievements = completedChallenges.length > 0 ? [
        'Weekly challenge completion',
        'Knowledge consistency demonstrated'
      ] : ['Building foundational habits'];
      if (metrics.notesCreated >= 7) {
        achievements.push('Consistent daily practice');
      }
      return {
        period: 'Weekly Learning Report',
        dateRange: `${weekStart.toLocaleDateString()} - ${new Date().toLocaleDateString()}`,
        metrics,
        insights: insights.length > 0 ? insights : ['Starting your learning journey - every note counts!'],
        recommendations,
        achievements,
        growthAreas: [
          metrics.avgComplexity < 0.4 ? 'Increase topic complexity' : null,
          metrics.actionItemCount < 3 ? 'Focus on actionable insights' : null,
          metrics.topicDiversity < 3 ? 'Expand topic exploration' : null
        ].filter(Boolean)
      };
    },

    // Generate personalized learning recommendations
    generateLearningRecommendations: (userProfile, notes, goals) => {
      const recommendations = [];
      if (userProfile.learningStyle === 'visual') {
        recommendations.push({
          title: 'Visual Learning Boost',
          description: 'Create mind maps for your top 3 topics',
          reason: 'Leverages your visual learning strength',
          estimatedTime: '45 minutes',
          priority: 'high'
        });
      }
      if (userProfile.consistencyScore < 0.5) {
        recommendations.push({
          title: 'Consistency Building',
          description: 'Set a daily 15-minute note-taking habit',
          reason: 'Builds foundational learning consistency',
          estimatedTime: 'Daily 15 minutes',
          priority: 'high'
        });
      }
      if (userProfile.knowledgeDepth < 0.4 && notes.length > 5) {
        recommendations.push({
          title: 'Depth Development',
          description: 'Deep dive into one complex topic',
          reason: 'Increases knowledge depth and complexity',
          estimatedTime: '2-3 hours',
          priority: 'medium'
        });
      }
      if (goals && goals.length > 0) {
        const activeGoal = goals.find(g => g.status === 'active');
        if (activeGoal) {
          recommendations.push({
            title: 'Goal Alignment',
            description: `Create notes specifically related to "${activeGoal.name}"`,
            reason: 'Directly supports your current goal',
            estimatedTime: '30 minutes',
            priority: 'high'
          });
        }
      }
      return recommendations.slice(0, 3);
    }
  }
};

// Enhanced Dashboard Component
export default function Dashboard() {
  const { currentUser, logout, updateProfileNames } = useAuth();
  const location = useLocation();
  const { goals: userGoals, addGoal, updateGoal, deleteGoal } = useUserData();
  const navigate = useNavigate();

  const getStorageKey = (key) => {
    const uid = currentUser?.uid || 'anon';
    return `${uid}_${key}`;
  };

  const normalizeUser = (u) => {
    if (!u) return u;
    // avatars disabled: do not use stored or server images — force default
    const img = '';
    // ensure followers/following are arrays of ids
    const followersArr = Array.isArray(u.followers) ? u.followers.map(x => (typeof x === 'string' ? x : (x && (x.id||x.userId||x.uid) ? (x.id||x.userId||x.uid) : null))).filter(Boolean) : [];
    const followingArr = Array.isArray(u.following) ? u.following.map(x => (typeof x === 'string' ? x : (x && (x.id||x.userId||x.uid) ? (x.id||x.userId||x.uid) : null))).filter(Boolean) : [];
    // friendly name fallback: prefer explicit name/displayName, then email prefix, then a shortened id
    const friendlyName = u.name || u.displayName || (u.email ? (String(u.email).split('@')[0] || '') : '');
    const idFallback = u.id ? (String(u.id).length > 8 ? `${String(u.id).slice(0,6)}...` : String(u.id)) : 'Unknown';
    const name = friendlyName || idFallback;
    return { ...u, name, displayName: u.displayName || name, profileImage: img, followers: followersArr, following: followingArr };
  };

  const setUsersNormalized = (arr) => {
    try {
      if (!Array.isArray(arr) || arr.length === 0) {
        // If we got an empty list, don't clobber existing users (prevents flicker)
        try { console.debug('setUsersNormalized: received empty/invalid users array, ignoring'); } catch(_){}
        return;
      }
      const incoming = (arr || []).map(u => normalizeUser(u));
      // Merge with existing users to preserve previously-known display names/fields when incoming data is partial
      setUsers(prev => {
        try {
          const prevById = new Map((prev || []).map(p => [p.id, p]));
          const merged = incoming.map(inc => {
            const existing = prevById.get(inc.id) || {};
            const name = inc.name || inc.displayName || existing.name || existing.displayName || (inc.email ? inc.email.split('@')[0] : inc.id);
            return { ...existing, ...inc, name };
          });
          // include any previous users not present in incoming list
          const incomingIds = new Set(merged.map(m => m.id));
          const remaining = (prev || []).filter(p => !incomingIds.has(p.id));
          try {
            const prevIds = (prev || []).map(p => p.id).filter(Boolean);
            const newIds = merged.map(m => m.id).filter(Boolean);
            const added = newIds.filter(id => !prevIds.includes(id));
            const removed = prevIds.filter(id => !newIds.includes(id));
            console.debug('setUsersNormalized: merged users — added', added.length, 'removed', removed.length, { added, removed });
          } catch(_){}
          return [...merged, ...remaining];
        } catch (e) {
          return incoming;
        }
      });
      // avoid localStorage caching; rely on Firestore users collection
    } catch(e) { try { console.warn('setUsersNormalized failed to normalize users', e); } catch(_){} }
  };

  // Helper to resolve a user's display name from id -> name -> email prefix -> id
  const getUserNameFromId = (userId) => {
    if (!userId) return 'Unknown';
    try {
      const found = (users || []).find(u => u.id === userId);
      if (found) {
        if (found.name) return found.name;
        if (found.displayName) return found.displayName;
        if (found.email) return (String(found.email).split('@')[0] || userId);
      }
      // if no matching user, try to make a readable fallback from an email-like id
      if (String(userId).includes('@')) return String(userId).split('@')[0];
      // otherwise shorten long ids for display
      return String(userId).length > 8 ? `${String(userId).slice(0,6)}...` : String(userId);
    } catch (e) {
      return userId;
    }
  };

  // Helper to try multiple API bases (env first, then common localhost ports)
  const getApiBases = () => {
    const rawApi = import.meta.env.VITE_API_URL || '';
    const envBase = rawApi ? (rawApi.endsWith('/api') ? rawApi.slice(0, -4) : rawApi) : '';
    const bases = [];
    if (envBase) bases.push(envBase.replace(/\/$/, ''));
    // prefer 5001 (dev server started there), then 5000
    bases.push('http://localhost:5001');
    bases.push('http://localhost:5000');
    bases.push('http://127.0.0.1:5000');
    return bases.filter(Boolean);
  };

  // Cached working base to avoid trying all bases on every request
  let _cachedApiBase = null;
  const _baseFailureTimestamps = {};
  const fetchWithFallback = async (path, opts) => {
    const bases = getApiBases();
    let lastErr = null;
    // If caller passed an absolute URL, use it directly (avoid double-prefixing bases)
    if (/^https?:\/\//i.test(path)) {
      try {
        const resp = await fetch(path, opts);
        if (!resp.ok) {
          console.warn(`fetchWithFallback (absolute): ${resp.status} ${resp.statusText} from ${path}`);
          throw new Error(`${resp.status} from ${path}`);
        }
        return resp;
      } catch (e) {
        console.warn(`fetchWithFallback absolute URL error:`, e && e.message ? e.message : e);
        throw e;
      }
    }

    // If we have a cached working base, try it first
    const tryOrder = [];
    if (_cachedApiBase) tryOrder.push(_cachedApiBase);
    bases.forEach(b => { if (b !== _cachedApiBase) tryOrder.push(b); });

    for (const base of tryOrder) {
      // suppress repeated logs for the same base within short window
      const lastFail = _baseFailureTimestamps[base] || 0;
      const now = Date.now();
      try {
        const url = `${base}${path.startsWith('/') ? path : `/${path}`}`;
        const resp = await fetch(url, opts);
        if (!resp.ok) {
          if (now - lastFail > 5000) console.warn(`fetchWithFallback: ${resp.status} ${resp.statusText} from ${url}`);
          _baseFailureTimestamps[base] = now;
          lastErr = new Error(`${resp.status} from ${url}`);
          // try next base
          continue;
        }
        // success: cache this base for future calls
        _cachedApiBase = base;
        return resp;
      } catch (e) {
        // network error (connection refused, DNS, CORS preflight failures etc.)
        if (now - lastFail > 5000) console.warn(`fetchWithFallback error for base ${base}:`, e && e.message ? e.message : e);
        _baseFailureTimestamps[base] = now;
        lastErr = e;
        continue;
      }
    }

    // All bases failed. Return a lightweight failure-shaped object instead of throwing to avoid
    // unhandled promise rejections in callers that may not catch. Callers should check `resp.ok`.
    try {
      return { ok: false, status: 0, statusText: 'NetworkError', json: async () => { throw lastErr || new Error('NetworkError'); } };
    } catch (e) {
      throw lastErr || new Error('All API bases failed');
    }
  };

  const GLOBAL_USERS_KEY = 'mindmeld_all_users';

  const [notes, setNotes] = useState([]);
  const [currentMood, setCurrentMood] = useState('balanced');
  const [mindMap, setMindMap] = useState({ nodes: [], connections: [], clusters: [] });
  const [flashcards, setFlashcards] = useState([]);
  const [activeFlashcard, setActiveFlashcard] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);

  const [newNote, setNewNote] = useState({
    title: '',
    content: '',
    category: 'general'
  });

  const [relatedNotes, setRelatedNotes] = useState([]);
  const [users, setUsers] = useState([]);
  const [usersLoadedFromServer, setUsersLoadedFromServer] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [showUserProfile, setShowUserProfile] = useState(false);
  const [friendsSearch, setFriendsSearch] = useState('');
  const [following, setFollowing] = useState([]); // array of user ids we follow
  const [chats, setChats] = useState({}); // { userId: [{sender, text, ts}] }
  const [chatUser, setChatUser] = useState(null);
  const [showChat, setShowChat] = useState(false);
  const [lastRead, setLastRead] = useState({}); // { otherId: timestamp }
  const [contentAnalysis, setContentAnalysis] = useState(null);
  const [followers, setFollowers] = useState([]);
  const [showFollowersModal, setShowFollowersModal] = useState(false);

  // Consider users 'active' if seen within this window
  const ACTIVE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

  const initialTab = (location?.state && location.state.activeTab) || new URLSearchParams(location?.search || '').get('tab') || 'notes';
  const [activeTab, setActiveTab] = useState(initialTab);
  // Theme (light/dark) — restored from Firestore on mount
  const [theme, setTheme] = useState('light');
  const [themeLoaded, setThemeLoaded] = useState(false);
  // Profile edit state
  const [editingProfile, setEditingProfile] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [lastName, setLastName] = useState('');
  const [birthdate, setBirthdate] = useState('');
  const [editing, setEditing] = useState(false);
  const [editNote, setEditNote] = useState(null);

  const [profileImage, setProfileImage] = useState('');

  // Load theme preference from Firestore on mount — use real-time listener
  useEffect(() => {
    if (!currentUser?.uid || !db) {
      return;
    }
    const meRef = doc(db, 'users', currentUser.uid);
    const unsubscribe = onSnapshot(meRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.preferences && data.preferences.theme) {
          setTheme(data.preferences.theme);
        }
      }
      setThemeLoaded(true);
    }, (err) => {
      // on error, just mark as loaded so we can render
      setThemeLoaded(true);
    });
    return () => unsubscribe();
  }, [currentUser?.uid]);

  useEffect(() => {
    try {
      // Sync theme to Firestore only (no localStorage)
      const uid = currentUser?.uid;
      if (db && uid) {
        const meRef = doc(db, 'users', uid);
        updateDoc(meRef, { preferences: { theme } }).catch(() => setDoc(meRef, { preferences: { theme } }, { merge: true }));
      }
    } catch (e) {}
  }, [theme, currentUser?.uid]);

  const toggleTheme = (e) => {
    // If called from an input change event, use the checked value
    if (e && e.target && typeof e.target.checked !== 'undefined') {
      setTheme(e.target.checked ? 'dark' : 'light');
    } else {
      setTheme(prev => prev === 'dark' ? 'light' : 'dark');
    }
  };

  // populate name and birthdate fields from currentUser/localStorage when available
  useEffect(() => {
    const dn = currentUser?.displayName || '';
    if (dn) {
      const parts = dn.split(' ');
      setFirstName(parts[0] || '');
      if (parts.length === 1) {
        setMiddleName('');
        setLastName('');
      } else if (parts.length === 2) {
        setMiddleName('');
        setLastName(parts[1] || '');
      } else {
        setMiddleName(parts.slice(1, -1).join(' '));
        setLastName(parts[parts.length - 1] || '');
      }
    }

    // birthdate and greetings are handled from the user's Firestore doc (onSnapshot updates birthdate)
  }, [currentUser]);

  const [showDebugPanel, setShowDebugPanel] = useState(false);

  // keep profileImage in sync if server users change (use server image when available)
  useEffect(() => {
    // avatars disabled: do not sync profileImage from localStorage or server
    return;
  }, [users]);

  // ensure profileImage is loaded when currentUser becomes available
  useEffect(() => {
    try {
      const uid = currentUser?.uid;
      if (!uid) return;
      // prefer per-user key, then generic getStorageKey fallback
      // avatars disabled: do not load profile images
      return;
      // if no local saved image, fall back to server-stored image in users state
      const me = (users || []).find(u => u.id === uid);
      const serverImg = me ? (me.image || me.profileImage || '') : '';
      if (serverImg && serverImg !== profileImage) setProfileImage(serverImg);
    } catch (e) { /* ignore */ }
  }, [currentUser, users]);

  // Poll server for updated users list (so avatar/profile changes propagate to other clients)
  useEffect(() => {
    let mounted = true;
    const rawApi = import.meta.env.VITE_API_URL || 'http://localhost:5001';
    const apiBase = rawApi.endsWith('/api') ? rawApi.slice(0, -4) : rawApi;

    const intervalFetch = async () => {
      try {
        const resp = await fetchWithFallback('/api/users');
        if (!resp.ok) return;
        const data = await resp.json();
        try { console.debug('poll fetchUsersFromServer returned', Array.isArray(data) ? data.length + ' users' : data); } catch(e){}
        if (!mounted || !Array.isArray(data)) return;
            // prefer Firestore users collection; no localStorage caching
        setUsersNormalized(data);
        if (Array.isArray(data) && data.length > 0) setUsersLoadedFromServer(true);
      } catch (e) {
        // ignore network errors
      }
    };

    // initial fetch and periodic poll (shortened to 5s during debugging)
    intervalFetch();
    const iv = setInterval(intervalFetch, 5 * 1000);
    return () => { mounted = false; clearInterval(iv); };
  }, [currentUser]);

  // Force-refresh friends when the Friends tab becomes active and we haven't loaded users from server
  useEffect(() => {
    if (activeTab !== 'friends') return;
    if (usersLoadedFromServer) return;
    if ((users || []).length > 1) return; // already have others

    (async () => {
      try {
        const resp = await fetchWithFallback('/api/users');
        if (resp && resp.ok) {
          const all = await resp.json();
          if (Array.isArray(all)) {
            // avoid localStorage caching; rely on Firestore/users
            setUsersNormalized(all);
            if (all.length > 0) setUsersLoadedFromServer(true);
            showToast('Friends list refreshed', 'success');
          }
        }
      } catch (e) {
        console.warn('Failed to refresh friends from server', e);
      }
    })();
  }, [activeTab, usersLoadedFromServer, users.length]);
  // Compute followers from server-side users state
  const computeFollowers = () => {
    if (!currentUser || !currentUser.uid) return [];
    try {
      const myId = currentUser.uid;
      const f = [];
      (users || []).forEach(u => {
        try {
          if (!u || !u.id || u.id === myId) return;
          if (Array.isArray(u.following) && u.following.includes(myId)) {
            f.push({ ...u, profileImage: '' });
          } else if (Array.isArray(u.followers) && u.followers.includes(myId)) {
            f.push({ ...u, profileImage: '' });
          }
        } catch (e) {}
      });
      return f;
    } catch (e) { return []; }
  };

  // Also include followers discovered from server-provided `users` state (if any)
  const computeFollowersFromUsers = () => {
    if (!currentUser || !currentUser.uid) return [];
    try {
      const myId = currentUser.uid;
      const f = [];
      const seen = new Set();
      (users || []).forEach(u => {
        try {
          // if server user includes following or followers arrays, respect them
          if (Array.isArray(u.following) && u.following.includes(myId)) {
            f.push({ ...u, profileImage: '' });
            seen.add(u.id);
          } else if (Array.isArray(u.followers) && u.followers.includes(myId)) {
            f.push({ ...u, profileImage: '' });
            seen.add(u.id);
          }
        } catch (e) {}
      });
      return f;
    } catch (e) { return []; }
  };

  useEffect(() => {
    // Subscribe to Firestore users collection and current user's doc for realtime sync
    if (db && currentUser && currentUser.uid) {
      const uid = currentUser.uid;
      const usersCol = collection(db, 'users');
      const usersUnsub = onSnapshot(usersCol, (snap) => {
        try {
          const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          try {
            const prevIds = (users || []).map(u => u.id).filter(Boolean);
            const newIds = all.map(a => a.id).filter(Boolean);
            const added = newIds.filter(id => !prevIds.includes(id));
            const removed = prevIds.filter(id => !newIds.includes(id));
            console.debug('onSnapshot(users): docs=', all.length, 'added=', added.length, 'removed=', removed.length, { added, removed });
          } catch(_){}
          setUsersNormalized(all);
          setUsersLoadedFromServer(true);
          // recompute followers from updated users
          const serverF = computeFollowersFromUsers();
          setFollowers(serverF);
        } catch (e) {}
      }, (err) => {
        // ignore snapshot permission errors
      });

      const meRef = doc(db, 'users', uid);
      const meUnsub = onSnapshot(meRef, (snap) => {
        try {
          const data = snap.exists() ? snap.data() : null;
          if (data) {
            if (Array.isArray(data.following)) setFollowing(data.following);
            if (Array.isArray(data.notes)) setNotes(data.notes);
            if (Array.isArray(data.flashcards)) setFlashcards(data.flashcards);
            if (data.mentorSystem) setMentorSystem(prev => ({ ...prev, ...data.mentorSystem }));
            if (data.chats && typeof data.chats === 'object') setChats(data.chats);
            if (data.lastRead && typeof data.lastRead === 'object') setLastRead(data.lastRead);
            if (data.image || data.profileImage) setProfileImage(data.image || data.profileImage);
            if (data.birthdate) setBirthdate(data.birthdate);
            if (data.preferences && data.preferences.theme) setTheme(data.preferences.theme);
          }
        } catch (e) {}
      }, (err) => {
        // ignore errors
      });

      return () => { try { usersUnsub(); } catch(_){}; try { meUnsub(); } catch(_){}; };
    }

    (async () => {
      // Try Firestore first
      try {
        if (db) {
          const col = collection(db, 'users');
          const snap = await getDocs(col);
          const fsUsers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          const myId = currentUser?.uid;
          const fsFollowers = [];
          fsUsers.forEach(u => {
            try {
              if (!u || !u.id || u.id === myId) return;
              if (Array.isArray(u.following) && u.following.includes(myId)) fsFollowers.push({ ...u, profileImage: '' });
              else if (Array.isArray(u.followers) && u.followers.includes(myId)) fsFollowers.push({ ...u, profileImage: '' });
            } catch (e) {}
          });
          // merge with server users discovered by computeFollowersFromUsers
          const serverF = computeFollowersFromUsers();
          const merged = [...fsFollowers];
          serverF.forEach(sf => { if (!merged.find(x => x.id === sf.id)) merged.push(sf); });
          setFollowers(merged);
          return;
        }
      } catch (e) {
        // ignore firestore errors and fall back
      }

      const f = computeFollowers();
      // combine local-storage discovered followers and server-side discovered followers
      const serverF = computeFollowersFromUsers();
      const merged = [...f];
      serverF.forEach(sf => { if (!merged.find(x => x.id === sf.id)) merged.push(sf); });
      setFollowers(merged);
    })();
    // ensure our `following` state matches authoritative server when available
    try {
      const uid = currentUser?.uid;
      if (uid) {
        const me = (users || []).find(u => u.id === uid);
        if (me && Array.isArray(me.following)) {
            const serverFollowing = me.following.map(id => (typeof id === 'string' ? id : (id && (id.id||id.userId||id.uid) ? (id.id||id.userId||id.uid) : null))).filter(Boolean);
            // merge server and in-memory following to avoid stomping optimistic/local state
            const curRaw = Array.isArray(following) ? following : [];
            const merged = Array.from(new Set([...(curRaw || []), ...(serverFollowing || [])]));
            // only update if merged differs
            if (JSON.stringify(merged || []) !== JSON.stringify(curRaw || [])) {
              setFollowing(merged);
            }
        }
        // if a selectedUser modal is open, refresh it from the authoritative users list
        if (selectedUser && selectedUser.id) {
          const updated = (users || []).find(x => x.id === selectedUser.id);
          if (updated) setSelectedUser(normalizeUser(updated));
        }
      }
    } catch(e) {}
  }, [currentUser?.uid, db]);

  // Recompute followers when users/currentUser changes (use Firestore realtime instead of localStorage events)
  useEffect(() => {
    try {
      setFollowers(computeFollowers());
    } catch (e) {}
  }, [users, currentUser]);

  const openFollowersModal = () => {
    // Fetch fresh users from server first so followers list is authoritative
    (async () => {
      try {
        const resp = await fetchWithFallback('/api/users');
        if (resp && resp.ok) {
          const all = await resp.json();
          if (Array.isArray(all)) setUsersNormalized(all);
        }
      } catch(e) {}
      // Merge local-storage discovered followers and server-side discovered followers
      const fLocal = computeFollowers();
      const serverF = computeFollowersFromUsers();
      const merged = [...fLocal];
      serverF.forEach(sf => { if (!merged.find(x => x.id === sf.id)) merged.push(sf); });
      setFollowers(merged);
      setShowFollowersModal(true);
    })();
  };

  // handle mark-all-read from Notifications modal
  const handleMarkRead = (id) => {
    if (id === 'all') {
      markAllNotificationsRead();
    } else {
      markNotificationRead(id);
    }
  };
  const closeFollowersModal = () => setShowFollowersModal(false);

// Followers / Following modal
const FollowersModal = ({ open, onClose, followers = [], following = [], users = [], onToggleFollow = () => {} }) => {
  if (!open) return null;
  return (
    <div className="popup-overlay">
      <div className="popup-modal followers-modal" style={{maxWidth:600}}>
        <div className="popup-header">
          <h3>Followers & Following</h3>
          <button onClick={onClose} className="lp-close">×</button>
        </div>
        <div className="popup-content">
          <div className="followers-columns">
            <div className="followers-column">
              <h4>Followers <span style={{color:'var(--muted)',fontSize:'0.9em'}}>({followers.length})</span></h4>
              <div className="followers-list">
                  {followers.length === 0 ? <p className="form-label">No followers yet.</p> : (
                    followers.map(f => {
                      const fu = users.find(u => u.id === f.id) || f || { id: f.id, name: f.name || f.id };
                      const img = '';
                      const isFollowing = Array.isArray(following) ? following.includes(fu.id) : false;
                      return (
                        <div key={fu.id} className="follow-item">
                          {img ? (
                            <img src={img} alt={fu.name} />
                          ) : (
                            <div style={{width:36,height:36}}><DefaultAvatar size={36} name={(fu && (fu.name || fu.displayName || fu.email)) || ''} photoURL={fu && fu.photoURL} /></div>
                          )}
                          <div style={{flex:1}}>{fu.name || fu.displayName || (fu.email ? fu.email.split('@')[0] : fu.id)}</div>
                          <div style={{display:'flex',gap:8}}>
                            <button className="follow-button" onClick={async () => { const now = await onToggleFollow(fu.id); try { showToast(now ? `Followed` : `Unfollowed`, 'info'); } catch(e){} }}>{isFollowing ? 'Unfollow' : 'Follow'}</button>
                          </div>
                        </div>
                      );
                    })
                  )}
              </div>
            </div>
            <div className="followers-column">
              <h4>Following <span style={{color:'var(--muted)',fontSize:'0.9em'}}>({(following||[]).length})</span></h4>
              <div className="followers-list">
                  {((following||[]).length === 0) ? <p className="form-label">You are not following anyone.</p> : (
                      (following||[]).map(fid => {
                        const fu = users.find(u => u.id === fid) || { id: fid, name: fid };
                        const img = '';
                      return (
                        <div key={fid} className="follow-item">
                          {img ? (
                            <img src={img} alt={fu.name} />
                          ) : (
                            <div style={{width:36,height:36}}><DefaultAvatar size={36} name={(fu && (fu.name || fu.displayName || fu.email)) || ''} photoURL={fu && fu.photoURL} /></div>
                          )}
                          <div style={{flex:1}}>{fu.name || fu.displayName || (fu.email ? fu.email.split('@')[0] : fu.id)}</div>
                          <div style={{display:'flex',gap:8}}>
                            <button className="follow-button" onClick={async () => { const now = await onToggleFollow(fu.id); showToast(now ? `Followed` : `Unfollowed`, 'info'); }}>Unfollow</button>
                          </div>
                        </div>
                      );
                    })
                  )}
              </div>
            </div>
          </div>
        </div>
        <div className="popup-actions">
          <button onClick={onClose} className="popup-button secondary">Close</button>
        </div>
      </div>
    </div>
  );
};

// Notifications modal
const NotificationsModal = ({ open, onClose, notifications = [], onMarkRead = () => {}, onClear = () => {}, onDelete = () => {} }) => {
  if (!open) return null;
  return (
    <div className="popup-overlay">
      <div className="popup-modal notifications-modal" style={{maxWidth:560}}>
        <div className="popup-header">
          <h3>Notifications</h3>
          <div style={{display:'flex',gap:8,alignItems:'center'}}>
            <button className="popup-button" onClick={() => { if (typeof onMarkRead === 'function') onMarkRead('all'); }}>Mark all read</button>
            <button onClick={onClose} className="lp-close">×</button>
          </div>
        </div>
        <div className="popup-content">
          {notifications.length === 0 ? (
            <p className="form-label">No notifications</p>
          ) : (
            notifications.map(n => (
              <div key={n.id} className={`notification-item ${n.read ? 'read' : 'unread'}`} style={{padding:10,display:'flex',gap:12,alignItems:'flex-start',borderBottom:'1px solid var(--border)'}}>
                <div style={{flex:1}}>
                  <div style={{fontWeight:700}}>{n.title}</div>
                  <div style={{color:'var(--muted)',fontSize:'0.95em'}}>{n.body}</div>
                  <div style={{color:'var(--muted)',fontSize:'0.75em',marginTop:6}}>{new Date(n.ts).toLocaleString()}</div>
                </div>
                <div style={{display:'flex',flexDirection:'column',gap:6}}>
                  {!n.read && <button className="popup-button primary" onClick={() => onMarkRead(n.id)}>Mark read</button>}
                  <button className="popup-button secondary" onClick={() => onDelete(n.id)}>Delete</button>
                </div>
              </div>
            ))
          )}
        </div>
        <div className="popup-actions">
          <button className="popup-button secondary" onClick={onClear}>Clear all</button>
          <button className="popup-button" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};


// When a real user logs in, add/update them to the global users list
useEffect(() => {
  if (!currentUser || !currentUser.uid) return;
  // Build a minimal profile payload and POST to server, then refresh users list
  (async () => {
    try {
      const profile = {
        id: currentUser.uid,
        name: currentUser.displayName || (currentUser.email ? currentUser.email.split('@')[0] : 'User'),
        email: currentUser.email || '',
        image: currentUser.photoURL || profileImage || '',
        bio: '',
        topics: [],
        joined: new Date().toISOString(),
        lastSeen: new Date().toISOString(),
        followers: [],
        following: [],
        notifications: []
      };

      // 1. POST to /api/users so server saves it
      // NOTE: temporarily disabled because backend endpoint may be returning 500 errors
      // try {
      //   await fetchWithFallback('/api/users', {
      //     method: 'POST',
      //     headers: { 'Content-Type': 'application/json' },
      //     body: JSON.stringify(profile)
      //   });
      // } catch (postErr) {
      //   console.warn('Failed to POST user to server', postErr);
      // }

      // 2. THEN fetch fresh users list from server (authoritative)
      try {
        const resp = await fetchWithFallback('/api/users');
        if (resp && resp.ok) {
          const all = await resp.json();
          if (Array.isArray(all)) {
              // avoid localStorage caching; rely on Firestore/users
            setUsersNormalized(all);
            // mark that we've loaded users from server
            try { setUsersLoadedFromServer(true); } catch(e){}
          }
        }
      } catch (fetchErr) {
        console.warn('Failed to fetch users after POST', fetchErr);
      }
    } catch (e) {
      console.warn('Failed to sync user with server', e);
    }
  })();
}, [currentUser]);

  const handleSaveProfile = async () => {
    try {
      await updateProfileNames(firstName.trim(), middleName.trim(), lastName.trim());
      // save birthdate locally per-user
      try {
        try {
          const uid = currentUser?.uid;
          if (db && uid) {
            const meRef = doc(db, 'users', uid);
            updateDoc(meRef, { birthdate: birthdate || '' }).catch(() => setDoc(meRef, { birthdate: birthdate || '' }, { merge: true }));
          } else {
            // no localStorage fallback: birthdate persistence requires Firestore
          }
        } catch (e) {}
      } catch (e) {
        console.warn('Failed to persist birthdate', e);
      }
      setEditingProfile(false);
      showToast('Profile updated', 'success');
    } catch (e) {
      console.error('Failed to update profile', e);
      showToast('Failed to update profile', 'error');
    }
  };

  const [showPopup, setShowPopup] = useState(null);
  const [notifications, setNotifications] = useState([]); // {id, title, body, ts, read, type}
  const [popupData, setPopupData] = useState(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const shownNotifications = useRef(new Set());
  // Fetch server notifications ONCE on startup and show toasts for unread
  useEffect(() => {
    const uid = currentUser?.uid;
    if (!uid) return;

    const fetchAndShowNotifications = async () => {
      try {
        const resp = await fetchWithFallback(`/api/users/${uid}/notifications`);
        if (resp?.ok) {
          const srv = await resp.json();
          if (Array.isArray(srv)) {
            setNotifications(srv);
            const unread = srv.filter(n => !n.read);
            // track shown notifications this session only (avoid localStorage)
            const shown = shownNotifications.current || new Set();
            unread.forEach(n => {
              if (!shown.has(n.id)) {
                showToast(`${n.title}: ${n.body.substring(0, 60)}...`, n.type);
                shown.add(n.id);
              }
            });
            shownNotifications.current = shown;
          }
        }
      } catch (e) {
        console.warn('Failed to fetch notifications', e);
      }
    };

    fetchAndShowNotifications();
  }, [currentUser]);
  const [goalFormData, setGoalFormData] = useState({ name: '', description: '', timeframe: '1 month' });
  const [goalFormErrors, setGoalFormErrors] = useState({ name: '', description: '', timeframe: '' });

  const [mentorSystem, setMentorSystem] = useState({
    userProfile: null,
    currentChallenge: null,
    completedChallenges: [],
    mentorSession: [],
    goals: [],
    progress: {
      overall: 0,
      knowledge: 0,
      consistency: 0,
      depth: 0,
      connections: 0
    },
    streak: 1,
    xp: 0,
    level: 1,
    badges: [],
    weeklyReport: null,
    learningPath: null
  });

  const [mentorMessage, setMentorMessage] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [sessionType, setSessionType] = useState('text');
  const [isTyping, setIsTyping] = useState(false);
  const [showLearningPath, setShowLearningPath] = useState(false);

  const autoSaveTimer = useRef(null);
  const textareaRef = useRef(null);
  const mentorMessagesRef = useRef(null);
  const mentorInputRef = useRef(null);
  const pollIntervalRef = useRef(null);

  useEffect(() => {
    (async () => {
    let savedNotes = [];
    let savedFlashcards = [];
    let savedProfileImage = '';
    let savedMentorData = null;
    try {
      const uid = currentUser?.uid;
      if (db && uid) {
        const meRef = doc(db, 'users', uid);
        const snap = await getDoc(meRef);
        if (snap.exists()) {
          const data = snap.data() || {};
          savedNotes = Array.isArray(data.notes) ? data.notes : [];
          savedFlashcards = Array.isArray(data.flashcards) ? data.flashcards : [];
          savedProfileImage = data.image || data.profileImage || '';
          savedMentorData = data.mentorSystem || null;
        } else {
          // no user doc: start with empty data (no localStorage fallback)
          savedNotes = [];
          savedFlashcards = [];
          savedProfileImage = '';
          savedMentorData = null;
        }
      } else {
        // offline/no firestore: start empty (no persistent localStorage usage)
        savedNotes = [];
        savedFlashcards = [];
        savedProfileImage = '';
        savedMentorData = null;
      }
    } catch (e) {
      // on error, default to empty state
      savedNotes = [];
      savedFlashcards = [];
      savedProfileImage = '';
      savedMentorData = null;
    }

      // load suggested users/friends from server/local storage
      const loadUsers = async () => {
        try {
          // Try server first when available
          const rawApi = import.meta.env.VITE_API_URL || 'http://localhost:5001';
          let serverUsers = null;
          try {
            const resp = await fetchWithFallback('/api/users');
            if (resp && resp.ok) {
              const data = await resp.json();
              if (Array.isArray(data)) serverUsers = data;
            }
          } catch (err) {
            // ignore server fetch error and fallback to localStorage
          }

          if (serverUsers && Array.isArray(serverUsers) && serverUsers.length > 0) {
            try { console.debug('loadUsers: fetched server users', serverUsers.length, serverUsers.map(u=>u.id)); } catch(_){}
            setUsersNormalized(serverUsers);
          } else {
            try { console.debug('loadUsers: server returned no users or fetch failed', !!serverUsers); } catch(_){}
            // Do NOT overwrite an existing users list with an empty one; keep prior users until a real list arrives
            if (!users || users.length === 0) {
              // only set empty if we truly have no users yet
              setUsersNormalized([]);
            }
            try { setUsersLoadedFromServer(true); } catch(e){}
          }
        } catch (e) {
          console.warn('Failed to load users', e);
        }
      };
      loadUsers();

      // load following (migrated to Firestore)
      try {
        const uid = currentUser?.uid;
        if (db && uid) {
          const ff = await fetchFollowingFromFirestore(uid);
          if (Array.isArray(ff)) setFollowing(ff);
        } else {
          // no localStorage fallback: initialize empty following
          setFollowing([]);
        }
      } catch (e) {}
      try {
        const uid = currentUser?.uid;
        if (db && uid) {
          try {
            const meRef = doc(db, 'users', uid);
            const snap = await getDoc(meRef);
            if (snap.exists()) {
              const data = snap.data() || {};
              if (data.chats && typeof data.chats === 'object') setChats(data.chats);
              if (data.lastRead && typeof data.lastRead === 'object') setLastRead(data.lastRead);
            }
          } catch (e) {}
        } else {
          try {
            // chats migrated to Firestore; initialize empty
            setChats({});
          } catch (e) {}
          try {
            setLastRead({});
          } catch (e) {}
        }
      } catch (e) {}

    setNotes(savedNotes);
    setFlashcards(savedFlashcards);
    if (savedProfileImage) setProfileImage(savedProfileImage);

      // If server has a stored image for the current user, prefer it when local saved image isn't present
      try {
        const uid = currentUser?.uid;
        if (uid) {
          const me = (users || []).find(x => x.id === uid);
          const serverImg = me ? (me.image || me.profileImage || '') : '';
          if (!savedProfileImage && serverImg) setProfileImage(serverImg);
        }
      } catch (e) {}

    if (savedNotes.length > 0) {
      const initialMindMap = AIService.generateAdvancedMindMap(savedNotes);
      setMindMap(initialMindMap);

      const latestNote = savedNotes[0];
      if (latestNote) {
        const analysis = AIService.analyzeContentDeeply(latestNote.content);
        setContentAnalysis(analysis);
        setCurrentMood(analysis.emotionalTone);
      }
    }

    if (savedMentorData) {
      setMentorSystem(savedMentorData);
    } else {
      const initialProfile = AIService.MentorSystem.initializeUserProfile(savedNotes);
      const initialChallenge = AIService.MentorSystem.generateAdaptiveChallenge(
        initialProfile,
        { productivity: 0.5, creativity: 0.5, analysis: 0.5 },
        savedNotes
      );
      const initialSession = [
        {
          id: 'welcome',
          text: "👋 Welcome to your AI Learning Mentor! I'm here to help you grow your knowledge, connect ideas, and achieve your learning goals. I'll analyze your notes, provide personalized insights, and guide you on your learning journey.\nLet's start by creating your first note or asking me a question!",
          type: 'mentor',
          timestamp: new Date().toISOString(),
          suggestedActions: ["Create first note", "Ask a question", "Set a goal"]
        }
      ];
      setMentorSystem(prev => ({
        ...prev,
        userProfile: initialProfile,
        currentChallenge: initialChallenge,
        mentorSession: initialSession,
        progress: {
          overall: Math.min(100, savedNotes.length * 5),
          knowledge: Math.min(100, savedNotes.length * 8),
          consistency: Math.min(100, savedNotes.filter(n => n.content.length > 50).length * 10),
          depth: Math.min(100, savedNotes.reduce((sum, n) => sum + (n.analysis?.complexity || 0), 0) * 20),
          connections: 0
        }
      }));
    }
    })();
  }, [currentUser?.uid, db]);

  // Periodically update current user's lastSeen so others (and this client) can see active status
  useEffect(() => {
    if (!currentUser || !currentUser.uid) return;
    let mounted = true;
    const rawApi = import.meta.env.VITE_API_URL || 'http://localhost:5001';

    const heartbeat = async () => {
      try {
        const all = users || [];
        const existingIndex = all.findIndex(u => u.id === currentUser.uid || u.email === currentUser.email);
        const profile = {
          id: currentUser.uid,
          name: currentUser.displayName || (currentUser.email ? currentUser.email.split('@')[0] : 'User'),
          bio: all[existingIndex]?.bio || '',
          topics: all[existingIndex]?.topics || [],
          email: currentUser.email || '',
          joined: all[existingIndex]?.joined || new Date().toISOString(),
          lastSeen: new Date().toISOString()
        };
        if (db && currentUser && currentUser.uid) {
          try {
            const meRef = doc(db, 'users', profile.id);
            await setDoc(meRef, profile, { merge: true });
          } catch (e) {
            // fallback to local users array
            if (existingIndex >= 0) {
              all[existingIndex] = { ...all[existingIndex], ...profile };
            } else {
              all.push(profile);
            }
            if (mounted) setUsersNormalized(all);
          }
        } else {
          if (existingIndex >= 0) {
            all[existingIndex] = { ...all[existingIndex], ...profile };
          } else {
            all.push(profile);
          }
          if (mounted) setUsersNormalized(all);
        }
        // Try to persist to server if available
        try {
          await fetch(`${apiBase}/api/users`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(profile)
          });
        } catch (e) {
          // ignore server persistence errors (fallback to localStorage)
        }
      } catch (e) {
        // ignore
      }
    };
    // initial heartbeat
    heartbeat();
    const iv = setInterval(heartbeat, 30 * 1000); // heartbeat every 30s for more real-time presence
    return () => { mounted = false; clearInterval(iv); };
  }, [currentUser]);

  // Helper to determine if a user is active based on lastSeen
  const isUserActive = (u) => {
    try {
      if (!u || !u.lastSeen) return false;
      return (Date.now() - new Date(u.lastSeen).getTime()) < ACTIVE_THRESHOLD_MS;
    } catch (e) { return false; }
  };

  // Fetch message thread between current user and another user from server and merge into local chats
  const fetchThread = async (withUserId) => {
    if (!currentUser || !currentUser.uid || !withUserId) return;
    // Allow opening threads even if not following — keep messages but inform the user they are not following
    try {
      const amFollowing = Array.isArray(following) ? following.includes(withUserId) : false;
      if (!amFollowing) {
        // Informational only — do not block fetching the thread so messages remain visible
        try { showAlertPopup('Not following', 'You are not following this user. You can still view past messages but you may not be able to send new messages.'); } catch(e){}
      }
    } catch (e) {}
    try {
      const resp = await fetchWithFallback(`/api/messages?user1=${encodeURIComponent(currentUser.uid)}&user2=${encodeURIComponent(withUserId)}`);
      if (!resp.ok) return;
      const data = await resp.json();
      if (!Array.isArray(data)) return;
      const msgs = data.map(m => ({
        sender: m.from === currentUser.uid ? (currentUser.displayName || (currentUser.email ? currentUser.email.split('@')[0] : 'You')) : getUserNameFromId(m.from),
        text: m.text,
        ts: m.ts || m.createdAt || new Date().toISOString()
      }));
      setChats(prev => {
        const next = { ...prev };
        const existing = Array.isArray(next[withUserId]) ? next[withUserId] : [];
        const combined = [...existing, ...msgs];
        // dedupe by sender+ts+snippet
        const seen = new Set();
        const deduped = combined
          .sort((a, b) => new Date(a.ts) - new Date(b.ts))
          .filter(m => {
            const key = `${m.sender}__${m.ts}__${(m.text||'').slice(0,40)}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
        next[withUserId] = deduped;
        persistChats(next);
        return next;
      });
      // mark as read when opening thread
      try {
        const now = new Date().toISOString();
        setLastRead(prev => {
          const next = { ...(prev || {}), [withUserId]: now };
          // lastRead persisted to Firestore in persistLastRead; no localStorage write
          return next;
        });
      } catch(e){}
    } catch (e) {
      // ignore fetch errors and rely on local chats
    }
  };

  const formatLastSeen = (u) => {
    try {
      if (!u || !u.lastSeen) return 'Unknown';
      const diff = Date.now() - new Date(u.lastSeen).getTime();
      const mins = Math.floor(diff / 60000);
      if (mins < 1) return 'just now';
      if (mins < 60) return `${mins}m ago`;
      const hrs = Math.floor(mins / 60);
      if (hrs < 24) return `${hrs}h ago`;
      return new Date(u.lastSeen).toLocaleDateString();
    } catch (e) { return 'Unknown'; }
  };

  useEffect(() => {
    if (userGoals && userGoals.length > 0) {
      const transformedGoals = userGoals.map(goal => ({
        id: goal.id,
        name: goal.title || 'Untitled Goal',
        description: goal.description || '',
        progress: goal.progress || 0,
        status: 'active',
        created: goal.createdAt || new Date().toISOString()
      }));
      setMentorSystem(prev => ({
        ...prev,
        goals: transformedGoals
      }));
    }
  }, [userGoals]);

  useEffect(() => {
    if (autoSaveTimer.current) {
      clearTimeout(autoSaveTimer.current);
    }
    autoSaveTimer.current = setTimeout(() => {
      // Persist notes/flashcards/mentor data to Firestore when available; fallback to localStorage
      (async () => {
        const uid = currentUser?.uid;
        if (db && uid) {
          await persistUserDataToFirestore(uid, { notes, flashcards, mentorSystem });
        } else {
          // no localStorage fallback; persistence requires Firestore
        }
      })();

      if (notes.length > 0) {
        const updatedMindMap = AIService.generateAdvancedMindMap(notes);
        setMindMap(updatedMindMap);

        const updatedProfile = AIService.MentorSystem.initializeUserProfile(notes);
        setMentorSystem(prev => ({
          ...prev,
          userProfile: updatedProfile,
          progress: {
            ...prev.progress,
            overall: Math.min(100, notes.length * 3),
            knowledge: Math.min(100, notes.filter(n => n.content.length > 100).length * 10),
            consistency: Math.min(100, (notes.length / 30) * 100),
            depth: Math.min(100, notes.reduce((sum, n) =>
              sum + ((n.analysis || AIService.analyzeContentDeeply(n.content)).complexity || 0), 0) * 15),
            connections: Math.min(100, mindMap.connections.length * 5)
          }
        }));
      }

      const now = new Date();
      if (now.getDay() === 1 && !mentorSystem.weeklyReport) {
        const report = AIService.MentorSystem.generateWeeklyReport(
          notes,
          mentorSystem.goals,
          mentorSystem.completedChallenges,
          mentorSystem.userProfile
        );
        setMentorSystem(prev => ({ ...prev, weeklyReport: report }));
      }
    }, 2000);

    return () => {
      if (autoSaveTimer.current) {
        clearTimeout(autoSaveTimer.current);
      }
    };
  }, [notes, flashcards, mentorSystem, mindMap.connections.length]);

  useEffect(() => {
    if (newNote.content.length > 10) {
      const analysis = AIService.analyzeContentDeeply(newNote.content);
      setContentAnalysis(analysis);
      setCurrentMood(analysis.emotionalTone);
    } else {
      setContentAnalysis(null);
    }
  }, [newNote.content, notes, mentorSystem.userProfile, mentorSystem.goals]);

  useEffect(() => {
    if (notes.length > 1 && activeTab === 'connections') {
      const latestNote = notes[0];
      if (latestNote) {
        const connections = AIService.findSemanticConnections(notes, latestNote.id);
        setRelatedNotes(connections);
      }
    }
  }, [notes, activeTab]);

  useEffect(() => {
    if (mentorMessagesRef.current) {
      // Improved scroll behavior with delay to ensure DOM update
      setTimeout(() => {
        if (mentorMessagesRef.current) {
          mentorMessagesRef.current.scrollTop = mentorMessagesRef.current.scrollHeight;
        }
      }, 50);
    }
  }, [mentorSystem.mentorSession, isTyping]);

  // NOTE: automatic creation of notifications from mentorSession was removed to avoid noisy popups.

  const showToast = (message, type = 'info') => {
    // Use existing alert popup for notifications
    try {
      const title = (type && typeof type === 'string') ? `${type[0].toUpperCase() + type.slice(1)}` : 'Notice';
      showAlertPopup(title, message);
    } catch (e) {
      // fallback no-op
      try { console.warn('Toast failed', e); } catch(_){}
    }
    return null;
  };

  const addNotification = ({ title, body, type = 'info' }) => {
    const id = `notif_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
    const n = { id, title, body, ts: new Date().toISOString(), read: false, type };
    setNotifications(prev => [n, ...prev].slice(0, 50));
    // also show a small notification via popup
    showToast(`${title}: ${body}`, type);
    // Try to persist notification to server so it appears across devices/sessions
    (async () => {
      try {
        const uid = currentUser?.uid;
        if (!uid) return;
        const resp = await fetchWithFallback(`/api/users/${uid}/notifications`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, body, type })
        });
        if (resp && resp.ok) {
          const bodyJson = await resp.json();
          if (bodyJson && Array.isArray(bodyJson.notifications)) {
            // replace local notifications with server authoritative list to avoid duplicates
            setNotifications(bodyJson.notifications.slice(0,50));
            return;
          }
        }
      } catch (e) {
        // ignore persistence failures; local notifications still work
      }
    })();
  };

  const persistFollowing = (next) => {
    // Persist following to Firestore (no localStorage). Fire-and-forget.
    try {
      const uid = currentUser?.uid;
      if (db && uid) {
        const meRef = doc(db, 'users', uid);
        // write full following array to user doc (merge)
        updateDoc(meRef, { following: next }).catch(err => {
          // If update fails because doc missing, create it
          setDoc(meRef, { following: next }, { merge: true }).catch(() => {});
        });
      }
    } catch (e) {
      // ignore persistence failures
    }
  };

  const toggleFollow = async (userId) => {
    // compute optimistic next state from current in-memory `following`
    let nextFollowing = [];
    // determine new follow state early so it is available throughout
    const willFollow = (() => {
      try {
        const cur = Array.isArray(following) ? following : [];
        const exists = cur.includes(userId);
        const next = exists ? cur.filter(id => id !== userId) : [...cur, userId];
        nextFollowing = next;
        return next.includes(userId);
      } catch (e) {
        // fallback: compute from previous state in setter
        return null;
      }
    })();

    try {
      // apply optimistic UI update
      setFollowing(nextFollowing);
      persistFollowing(nextFollowing);
    } catch (e) {
      // fallback: toggle in-memory with setter
      setFollowing(prev => {
        const exists = prev.includes(userId);
        const next = exists ? prev.filter(id => id !== userId) : [...prev, userId];
        try { persistFollowing(next); } catch(e){}
        nextFollowing = next;
        return next;
      });
    }

    // Persist to Firestore (primary) and still attempt server API for compatibility
    try {
      const me = currentUser?.uid;
      // if willFollow is null (fallback path), recompute from nextFollowing
      const effectiveWillFollow = (willFollow === null) ? ((nextFollowing || []).includes(userId)) : willFollow;
      if (db && me) {
        // update firestore; best-effort
        try { await toggleFollowInFirestore(me, userId, effectiveWillFollow); } catch(e) {}
      }
      // continue to attempt server API below
    } catch(e) {}

    // try to persist to server so other users can see follows
    try {
      const me = currentUser?.uid;
      if (!me) return (nextFollowing || []).includes(userId);
      // If nextFollowing contains userId, we intend to follow now; otherwise unfollow
      const endpoint = ((nextFollowing || []).includes(userId)) ? `/api/users/${userId}/follow` : `/api/users/${userId}/unfollow`;
      const method = 'POST';
      const resp = await fetchWithFallback(endpoint, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ followerId: me }) });
      if (resp && resp.ok) {
        try {
          const data = await resp.json();
          // server returns updated users list when available — update local users + global cache
          if (data && Array.isArray(data.users)) {
            setUsersNormalized(data.users);
            // sync our local `following` state from server for the current user
            try {
              const updatedMe = data.users.find(x => x.id === me);
              if (updatedMe) {
                const serverFollowing = Array.isArray(updatedMe.following) ? updatedMe.following : [];
                // If we just followed, merge to preserve the optimistic new follow. If we unfollowed, prefer server's list (which should reflect removal).
                if ((nextFollowing || []).includes(userId)) {
                  const mergedFollowing = Array.from(new Set([...(serverFollowing || []), ...(nextFollowing || [])]));
                  setFollowing(mergedFollowing);
                  persistFollowing(mergedFollowing);
                  nextFollowing = mergedFollowing;
                } else {
                  // unfollow case: prefer server's authoritative list
                  setFollowing(serverFollowing);
                  persistFollowing(serverFollowing);
                  nextFollowing = serverFollowing;
                }
              }
              // recompute followers immediately so counts reflect server
              const fLocal = computeFollowers();
              const fServer = computeFollowersFromUsers();
              const merged = [...fLocal];
              fServer.forEach(sf => { if (!merged.find(x => x.id === sf.id)) merged.push(sf); });
              setFollowers(merged);
              // if we have selectedUser open and server returned updated users, update the modal data
              try {
                if (selectedUser && selectedUser.id) {
                  const updatedSelected = data.users.find(x => x.id === selectedUser.id);
                  if (updatedSelected) {
                    setSelectedUser(normalizeUser(updatedSelected));
                  }
                }
              } catch(e) {}
            } catch (e) {}
          }
          // fetch authoritative users list from server to ensure UI reflects server truth
          try {
            const resp2 = await fetchWithFallback('/api/users');
            if (resp2 && resp2.ok) {
              const all = await resp2.json();
              if (Array.isArray(all)) {
                setUsersNormalized(all);
                // update following/followers from authoritative list
                try {
                  const updatedMe = all.find(x => x.id === me);
                  if (updatedMe) {
                    const serverFollowing = Array.isArray(updatedMe.following) ? updatedMe.following : [];
                    if ((nextFollowing || []).includes(userId)) {
                      const mergedFollowing = Array.from(new Set([...(serverFollowing || []), ...(nextFollowing || [])]));
                      setFollowing(mergedFollowing);
                      persistFollowing(mergedFollowing);
                      nextFollowing = mergedFollowing;
                    } else {
                      setFollowing(serverFollowing);
                      persistFollowing(serverFollowing);
                      nextFollowing = serverFollowing;
                    }
                  }
                  const fLocal2 = computeFollowers();
                  const fServer2 = computeFollowersFromUsers();
                  const merged2 = [...fLocal2];
                  fServer2.forEach(sf => { if (!merged2.find(x => x.id === sf.id)) merged2.push(sf); });
                  setFollowers(merged2);
                } catch(e){}
              }
            }
          } catch(e){}
        } catch(e){}
      }
      // if followed, try to persist a server notification to the target user
      if ((nextFollowing || []).includes(userId)) {
        try {
          const resp = await fetchWithFallback(`/api/users/${userId}/notifications`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'New follower', body: `${currentUser?.displayName || 'Someone'} followed you`, type: 'social' }) });
          try { console.debug('Follower notification response', resp && resp.status); } catch(e){}
        } catch (e) { try { console.debug('Follower notification failed', e && e.message); } catch(_){} }
      }
    } catch (e) {
      // server failed — Firestore already applied when available
    }
    return (nextFollowing || []).includes(userId);
  };

  const openChat = (user) => {
    // normalize user object so downstream code can rely on `.id`
    const norm = { ...(user || {}), id: user?.id || user?.uid || user?.userId };
    setChatUser(norm);
    // Switch to Messages tab so chat UI is visible
    try { setActiveTab('messages'); } catch (e) {}
    setShowChat(true);
    // load server thread immediately and start polling for updates
    try {
      // clear any existing poll
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      const otherId = norm.id;
      fetchThread(otherId);
      pollIntervalRef.current = setInterval(() => fetchThread(otherId), 5000);
    } catch (e) {}
  };

  const persistLastRead = (otherId, ts) => {
      try {
        setLastRead(prev => {
          const next = { ...(prev || {}), [otherId]: ts };
          try {
            const uid = currentUser?.uid;
            if (db && uid) {
              const meRef = doc(db, 'users', uid);
              updateDoc(meRef, { lastRead: next }).catch(() => setDoc(meRef, { lastRead: next }, { merge: true }));
            } else {
              // migrated: last_read persisted to Firestore; no localStorage write
            }
          } catch (e) {}
          return next;
        });
      } catch (e) {}
  };

  const closeChat = () => {
    // stop polling when chat is closed
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    setChatUser(null);
    setShowChat(false);
  };

  // cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, []);

  // Poll server for incoming messages addressed to current user and merge into local chats
  useEffect(() => {
    if (!currentUser || !currentUser.uid) return;
    let mounted = true;
    const pollInbox = async () => {
      try {
        const resp = await fetchWithFallback(`/api/messages/unread?user=${encodeURIComponent(currentUser.uid)}`);
        if (!resp.ok) return;
        const data = await resp.json();
        if (!Array.isArray(data) || data.length === 0) return;

        setChats(prev => {
          const next = { ...prev };
          const newlyAdded = [];
          data.forEach(m => {
            const otherId = m.from;
            // Only accept messages from users we follow
            try {
              const amFollowing = Array.isArray(following) ? following.includes(otherId) : false;
              if (!amFollowing) return; // ignore messages from users we don't follow
            } catch (e) {}
            const senderName = getUserNameFromId(otherId);
            const msgObj = { sender: senderName, text: m.text, ts: m.ts || m.createdAt || new Date().toISOString() };
            const existing = Array.isArray(next[otherId]) ? next[otherId] : [];
            const exists = existing.some(e => (e.ts === msgObj.ts && (e.text || '').slice(0,40) === (msgObj.text||'').slice(0,40)));
            if (!exists) {
              next[otherId] = [...existing, msgObj].sort((a,b)=> new Date(a.ts)-new Date(b.ts));
              newlyAdded.push({ otherId, senderName, text: m.text });
            }
          });
          if (newlyAdded.length) {
            persistChats(next);
            // create notifications for each new message
            newlyAdded.forEach(n => {
              addNotification({ title: `New message from ${n.senderName}`, body: n.text, type: 'message' });
            });
          }
          return next;
        });
      } catch (e) {
        // ignore
      }
    };

    // initial poll + interval
    pollInbox();
    const iv = setInterval(pollInbox, 5000);
    return () => { mounted = false; clearInterval(iv); };
  }, [currentUser, users]);

  const persistChats = (next) => {
    try {
      const uid = currentUser?.uid;
      if (db && uid) {
        const meRef = doc(db, 'users', uid);
        updateDoc(meRef, { chats: next }).catch(() => setDoc(meRef, { chats: next }, { merge: true }));
      } else {
        // chats persisted to Firestore in persistChats; no localStorage write
      }
    } catch (e) {}
  };

  const sendChatMessage = (toUserId, text) => {
    // only allow sending to users we follow
    try {
      const amFollowing = Array.isArray(following) ? following.includes(toUserId) : false;
      if (!amFollowing) {
        showAlertPopup('Cannot send message', 'You can only send messages to users you follow.');
        return;
      }
    } catch (e) {}
    const sender = currentUser?.displayName || (currentUser?.email ? currentUser.email.split('@')[0] : 'You');
    const msg = { sender, text, ts: new Date().toISOString() };
    setChats(prev => {
      const next = { ...prev };
      next[toUserId] = (next[toUserId] || []).concat(msg);
      persistChats(next);
      return next;
    });
    // mark as read for this conversation (we sent it)
    try { persistLastRead(toUserId, msg.ts); } catch(e){}
    // Post to server for cross-device sync if available
    (async () => {
      try {
        await fetchWithFallback('/api/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: toUserId, from: currentUser?.uid, text, ts: msg.ts })
        });
      } catch (e) {
        // ignore
      }
    })();
  };

  // toast removal handled by popup system — toasts removed

  const showConfirmPopup = (title, message, onConfirm, confirmText = 'Confirm') => {
    setPopupData({ title, message, onConfirm, type: 'confirm', confirmText });
    setShowPopup('confirm');
  };

  const showAlertPopup = (title, message) => {
    setPopupData({ title, message, type: 'alert' });
    setShowPopup('alert');
  };

  // On first load: no localStorage usage for profile images (Firest ore is authoritative)
  React.useEffect(() => {
    // intentionally empty — profile images are persisted in Firestore
  }, []);

  const openNotifications = () => {
    // Open modal and fetch server notifications; do NOT auto-mark read on open.
    (async () => {
      try {
        const uid = currentUser?.uid;
        setShowNotifications(true);
        if (!uid) return;
        const resp = await fetchWithFallback(`/api/users/${uid}/notifications`);
        if (resp && resp.ok) {
          const srv = await resp.json();
          if (Array.isArray(srv)) {
            // keep local list in sync but preserve read flags from server
            setNotifications(srv.slice(0, 50));
          }
        }
      } catch (e) {
        // ignore fetch failures; local notifications still available
      }
    })();
  };

  const closeNotifications = () => setShowNotifications(false);
  const markNotificationRead = async (id) => {
    try {
      const uid = currentUser?.uid;
      if (!uid || !id) return;
      const resp = await fetchWithFallback(`/api/users/${uid}/notifications/mark-read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      if (resp && resp.ok) {
        const body = await resp.json();
        // update local notifications from server response when available
        if (body && Array.isArray(body.notifications)) setNotifications(body.notifications.slice(0,50));
        else setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
      } else {
        // optimistic local update
        setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
      }
    } catch (e) {
      // fallback to optimistic local update on error
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    }
  };

  // Clear all notifications (frontend + server)
  const clearNotifications = async () => {
    try {
      const uid = currentUser?.uid;
      if (!uid) {
        setNotifications([]);
        return;
      }
      const resp = await fetchWithFallback(`/api/users/${uid}/notifications`, { method: 'DELETE' });
      if (resp && resp.ok) {
        setNotifications([]);
      } else {
        // fallback: clear locally
        setNotifications([]);
      }
    } catch (e) {
      // always clear locally on error to avoid stale UI
      setNotifications([]);
    }
  };

  // Delete a single notification by ID
  const deleteNotification = async (nid) => {
    try {
      const uid = currentUser?.uid;
      if (!uid || !nid) return;
      const resp = await fetchWithFallback(`/api/users/${uid}/notifications/${nid}`, { method: 'DELETE' });
      if (resp && resp.ok) {
        setNotifications(prev => prev.filter(n => n.id !== nid));
      } else {
        // fallback: delete locally
        setNotifications(prev => prev.filter(n => n.id !== nid));
      }
    } catch (e) {
      // always delete locally on error to avoid stale UI
      setNotifications(prev => prev.filter(n => n.id !== nid));
    }
  };

  const handleLogout = async () => {
    showConfirmPopup(
      'Logout Confirmation',
      'Are you sure you want to log out? Your notes and learning progress are saved automatically.',
      async () => {
        try {
          await logout();
          navigate('/login');
          showToast('Logged out successfully', 'success');
        } catch (error) {
          showToast('Failed to log out', 'error');
        }
      }
    );
  };

  const handleCreateNote = () => {
    if (!newNote.content.trim()) {
      showAlertPopup('Empty Note', 'Please enter some content for your note');
      if (textareaRef.current) textareaRef.current.focus();
      return;
    }
    const analysis = AIService.analyzeContentDeeply(newNote.content);
    const note = {
      id: `note_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      title: newNote.title || `Note ${notes.length + 1}`,
      content: newNote.content,
      category: newNote.category,
      analysis,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tags: analysis.keyTopics,
      sentiment: analysis.sentiment,
      complexity: analysis.complexity,
      wordCount: analysis.wordCount
    };
    setNotes(prev => [note, ...prev]);
    setNewNote({ title: '', content: '', category: 'general' });

    const connections = AIService.findSemanticConnections([note, ...notes], note.id);
    setRelatedNotes(connections);

    setMentorSystem(prev => ({
      ...prev,
      xp: prev.xp + 10,
      progress: {
        ...prev.progress,
        overall: Math.min(100, prev.progress.overall + 3),
        knowledge: Math.min(100, prev.progress.knowledge + 5),
        consistency: Math.min(100, prev.progress.consistency + 2)
      }
    }));

    const mentorUpdate = {
      id: `note_created_${Date.now()}`,
      text: `📝 Note created! AI detected ${analysis.keyTopics.length} key topics: ${analysis.keyTopics.join(', ')}. Complexity: ${(analysis.complexity * 100).toFixed(0)}%`,
      type: 'system',
      timestamp: new Date().toISOString()
    };
    setMentorSystem(prev => ({
      ...prev,
      mentorSession: [...prev.mentorSession, mentorUpdate]
    }));
    showToast('Note created! AI analyzing semantic connections...', 'success');
    // create a local notification for note creation
    addNotification({ title: 'Note created', body: `${note.title} was added to your notes.`, type: 'notes' });
    // Persist immediately to Firestore (read-modify-write for reliability)
    (async () => {
      try {
        const uid = currentUser?.uid;
        if (db && uid) {
          const meRef = doc(db, 'users', uid);
          try {
            const snap = await getDoc(meRef);
            const existing = snap && snap.exists() ? (Array.isArray(snap.data().notes) ? snap.data().notes : []) : [];
            const newArr = [note, ...existing];
            await setDoc(meRef, { notes: newArr }, { merge: true });
          } catch (e) {
            console.warn('Failed to persist note to Firestore (read-modify-write)', e);
          }
        }
      } catch (e) {
        console.warn('Failed to persist note to Firestore', e);
      }
    })();
  };

  const handleDeleteNote = (id) => {
    showConfirmPopup(
      'Delete Note',
      'Are you sure you want to delete this note? This action cannot be undone.',
      () => {
        setNotes(prev => prev.filter(note => note.id !== id));
        setFlashcards(prev => prev.filter(card => card.noteId !== id));
        showToast('Note deleted', 'success');
        // Persist deletion to Firestore
        (async () => {
          try {
            const uid = currentUser?.uid;
            if (db && uid) {
              const meRef = doc(db, 'users', uid);
              try {
                const snap = await getDoc(meRef);
                if (snap && snap.exists()) {
                  const existing = Array.isArray(snap.data().notes) ? snap.data().notes : [];
                  const filtered = existing.filter(n => n.id !== id);
                  await updateDoc(meRef, { notes: filtered }).catch(async () => {
                    await setDoc(meRef, { notes: filtered }, { merge: true });
                  });
                }
              } catch (e) {
                console.warn('Failed to remove note from Firestore via read-modify-write', e);
              }
            }
          } catch (e) {}
        })();
      }
    );
  };

  const handleGenerateFlashcards = () => {
    if (notes.length === 0) {
      showAlertPopup('No Notes', 'Create some notes first to generate smart flashcards');
      return;
    }
    // Use user's learning style if present; otherwise let AIService default apply
    const learningStyle = mentorSystem.userProfile?.learningStyle;
    const newFlashcards = AIService.generateSmartFlashcards(notes, learningStyle);
    setFlashcards(prev => {
      const combined = [...prev, ...newFlashcards];
      // Persist flashcards immediately
      (async () => {
        try {
          const uid = currentUser?.uid;
          if (db && uid) {
            const meRef = doc(db, 'users', uid);
            await updateDoc(meRef, { flashcards: combined }).catch(async (e) => {
              try { await setDoc(meRef, { flashcards: combined }, { merge: true }); } catch(_){ }
            });
          }
        } catch (e) { console.warn('Failed to persist flashcards', e); }
      })();
      return combined;
    });
    setActiveTab('flashcards');
    showToast(`Created ${newFlashcards.length} intelligent flashcards!`, 'success');
  };

  const analyzeNoteDeeply = (noteId) => {
    const note = notes.find(n => n.id === noteId);
    if (!note) return;
    const analysis = note.analysis || AIService.analyzeContentDeeply(note.content);
    const connections = AIService.findSemanticConnections(notes, noteId);
    setRelatedNotes(connections);
    setContentAnalysis(analysis);
    setActiveTab('connections');

    const insightMessage = {
      id: `insight_${Date.now()}`,
      text: `🔍 Deep analysis complete for "${note.title || 'Untitled Note'}":\n• Sentiment: ${(analysis.sentiment * 100).toFixed(0)}%\n• Complexity: ${(analysis.complexity * 100).toFixed(0)}%\n• Found ${connections.length} semantic connections\n• Key topics: ${analysis.keyTopics.join(', ')}`,
      type: 'mentor',
      timestamp: new Date().toISOString()
    };
    setMentorSystem(prev => ({
      ...prev,
      mentorSession: [...prev.mentorSession, insightMessage]
    }));
    showToast(`Deep analysis complete. Found ${connections.length} semantic connections`, 'insight');
  };

  const handleClearAllData = () => {
    // Clear only profile-related data and mentor/account balances. Do not delete the entire user doc.
    showConfirmPopup(
      'Clear Profile Data',
      'This will clear your profile fields (name, bio, image) and reset Mentor progress. Notes and flashcards will NOT be deleted. Proceed?',
      () => {
        (async () => {
          try {
            const uid = currentUser?.uid;
            // reset local profile UI state
            setProfileImage(null);
            setSelectedUser(null);
            // reset mentor system sensible fields
            setMentorSystem(prev => ({
              ...prev,
              xp: 0,
              level: 1,
              progress: { overall: 0, knowledge: 0, consistency: 0, depth: 0, connections: 0 },
              completedChallenges: [],
              goals: []
            }));
            // persist cleared profile/mentor fields to Firestore without touching notes/flashcards
            if (db && uid) {
              const meRef = doc(db, 'users', uid);
              const cleared = {
                displayName: '',
                bio: '',
                photoURL: '',
                mentorSystem: {
                  xp: 0,
                  level: 1,
                  progress: { overall: 0, knowledge: 0, consistency: 0, depth: 0, connections: 0 },
                  completedChallenges: [],
                  goals: []
                }
              };
              try {
                await setDoc(meRef, cleared, { merge: true });
                showToast('Profile data cleared (kept notes & flashcards).', 'success');
              } catch (e) {
                console.warn('Failed to persist cleared profile', e);
                showToast('Cleared locally but failed to persist to server.', 'warning');
              }
            } else {
              showToast('Profile cleared locally. Connect to Firestore to persist changes.', 'info');
            }
          } catch (e) {
            console.error('clear profile failed', e);
            showToast('Failed to clear profile data.', 'error');
          }
        })();
      },
      'Clear Profile'
    );
  };

  // Backup functionality removed per user request. Keep a no-op handler to avoid missing reference errors.
  const handleBackupData = () => {
    showToast('Backup feature disabled.', 'info');
  };

  const handleMentorMessageSend = async () => {
    const text = mentorMessage.trim();
    setMentorMessage('');
    await sendMentorQuery(text);
  };

  const handleVoiceInput = () => {
    if (!isRecording) {
      setIsRecording(true);
      showToast('Starting voice input... Speak now', 'info');
      setTimeout(() => {
        let sampleMessages = [
          "How can I better organize my growing collection of notes?",
          "What learning strategies would work best for my current project?",
          "I'm feeling overwhelmed with information. How can I process it more effectively?",
          "How can I connect my technical learning with my creative projects?"
        ];
        if (notes.length > 0) {
          const latestNote = notes[0];
          const analysis = latestNote.analysis || AIService.analyzeContentDeeply(latestNote.content);
          if (analysis.keyTopics.includes('technical')) {
            sampleMessages.push("How can I build a systematic approach to learning complex technical concepts?");
          }
          if (analysis.emotionalTone === 'creative') {
            sampleMessages.push("What techniques can enhance my creative thinking process?");
          }
          if (analysis.complexity > 0.7) {
            sampleMessages.push("How can I break down complex topics into manageable pieces?");
          }
        }
        const randomMessage = sampleMessages[Math.floor(Math.random() * sampleMessages.length)];
        setMentorMessage(randomMessage);
        setIsRecording(false);
        showToast('Voice input processed!', 'success');
      }, 1500);
    } else {
      setIsRecording(false);
      showToast('Voice input stopped', 'info');
    }
  };

  const sendMentorQuery = async (text) => {
    if (!text || !text.trim()) return;
    const userMessage = {
      id: `msg_${Date.now()}`,
      text,
      type: 'user',
      timestamp: new Date().toISOString()
    };
    setMentorSystem(prev => ({ ...prev, mentorSession: [...prev.mentorSession, userMessage] }));
    setIsTyping(true);
    try {
      // Try server-side AI (OpenAI) first, fall back to local MentorSystem
      let response = null;
      try {
        const rawApi = import.meta.env.VITE_API_URL || 'http://localhost:5001';
        const apiBase = rawApi.endsWith('/api') ? rawApi.slice(0, -4) : rawApi;
        const aiResp = await fetch(`${apiBase}/api/ai`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: text, messages: [{ role: 'user', content: text }] })
        });

        if (aiResp.ok) {
          const aiData = await aiResp.json();
          if (aiData && aiData.text) {
            response = {
              id: aiData.id || `ai_${Date.now()}`,
              text: aiData.text,
              type: 'mentor',
              timestamp: new Date().toISOString(),
              suggestedActions: AIService.MentorSystem.getSuggestedActions(AIService.MentorSystem.determineIntent(text || ''), { notes, userProfile: mentorSystem.userProfile }),
              followUpQuestions: AIService.MentorSystem.generateFollowUpQuestions(AIService.MentorSystem.determineIntent(text || ''), { notes, userProfile: mentorSystem.userProfile })
            };
          }
        } else {
          console.warn('AI proxy returned', aiResp.status);
        }
      } catch (aiErr) {
        console.warn('AI proxy call failed, using local mentor:', aiErr?.message || aiErr);
      }

      if (!response) {
        response = await AIService.MentorSystem.processUserMessage(text, {
          notes,
          goals: mentorSystem.goals,
          challenges: [...mentorSystem.completedChallenges, mentorSystem.currentChallenge].filter(Boolean),
          userProfile: mentorSystem.userProfile,
          conversationHistory: mentorSystem.mentorSession,
          streak: mentorSystem.streak,
          progress: mentorSystem.progress,
          currentUserName: currentUser?.displayName || (currentUser?.email ? currentUser.email.split('@')[0] : 'friend')
        });
      }

      setMentorSystem(prev => ({
        ...prev,
        mentorSession: [...prev.mentorSession, { ...response, id: `resp_${Date.now()}` }],
        xp: prev.xp + 5,
        progress: {
          ...prev.progress,
          overall: Math.min(100, prev.progress.overall + 2)
        }
      }));
    } catch (error) {
      console.error('Mentor response error:', error);
      try {
        const quickAnalysis = AIService.analyzeContentDeeply(text || '');
        const quickTopics = quickAnalysis.keyTopics && quickAnalysis.keyTopics.length ? quickAnalysis.keyTopics.slice(0, 3).join(', ') : 'general';
        // ✅ CORRECT CALL in fallback
        const quickSuggestions = AIService.MentorSystem.generateActionableSuggestions(
          AIService.MentorSystem.determineIntent(text || ''),
          { notes, userProfile: mentorSystem.userProfile }
        ) || [];
        const replyText = `Thanks — I parsed your message. Key topics: ${quickTopics}.\nTop suggestions:\n${(quickSuggestions.length ? quickSuggestions.slice(0, 3).map((s, i) => `${i + 1}. ${s}`).join('\n') : '- Try rephrasing your request or tell me your goal -')}`;
        const localResponse = {
          id: `local_${Date.now()}`,
          text: replyText,
          type: 'mentor',
          timestamp: new Date().toISOString(),
          suggestedActions: quickSuggestions.slice(0, 3),
          followUpQuestions: AIService.MentorSystem.generateFollowUpQuestions(
            AIService.MentorSystem.determineIntent(text || ''),
            { notes, userProfile: mentorSystem.userProfile }
          )
        };
        setMentorSystem(prev => ({ ...prev, mentorSession: [...prev.mentorSession, localResponse] }));
      } catch (innerErr) {
        console.error('Local fallback failed:', innerErr);
        const fallbackResponse = {
          id: `fallback_${Date.now()}`,
          text: "I'm here to help you learn and grow. Could you rephrase your question or tell me more about what you're working on?",
          type: 'mentor',
          timestamp: new Date().toISOString(),
          suggestedActions: ["Ask about learning", "Get note suggestions", "Set a goal"],
          followUpQuestions: []
        };
        setMentorSystem(prev => ({ ...prev, mentorSession: [...prev.mentorSession, fallbackResponse] }));
      }
    } finally {
      setIsTyping(false);
    }
  };

  const handleStartChallenge = () => {
    const newChallenge = AIService.MentorSystem.generateAdaptiveChallenge(
      mentorSystem.userProfile || AIService.MentorSystem.initializeUserProfile(notes),
      {
        productivity: mentorSystem.progress.consistency / 100,
        creativity: mentorSystem.progress.knowledge / 100,
        analysis: mentorSystem.progress.depth / 100
      },
      notes
    );
    setMentorSystem(prev => ({
      ...prev,
      currentChallenge: newChallenge
    }));
    const challengeMessage = {
      id: `challenge_start_${Date.now()}`,
      text: `🎯 New challenge started: "${newChallenge.title}"\nDifficulty: ${newChallenge.difficulty}\nXP Reward: ${newChallenge.xp}\nTime estimate: ${newChallenge.timeEstimate}\n${newChallenge.description}`,
      type: 'system',
      timestamp: new Date().toISOString()
    };
    setMentorSystem(prev => ({
      ...prev,
      mentorSession: [...prev.mentorSession, challengeMessage]
    }));
    showToast('New adaptive challenge generated!', 'success');
  };

  const handleCompleteChallenge = () => {
    if (!mentorSystem.currentChallenge) return;
    const xpGain = mentorSystem.currentChallenge.xp;
    const newXp = mentorSystem.xp + xpGain;
    const newProgress = Math.min(mentorSystem.progress.overall + 8, 100);
    const newLevel = Math.floor(newXp / 100) + 1;
    setMentorSystem(prev => ({
      ...prev,
      completedChallenges: [...prev.completedChallenges, { ...prev.currentChallenge, completedAt: new Date().toISOString() }],
      currentChallenge: null,
      xp: newXp,
      progress: {
        ...prev.progress,
        overall: newProgress
      },
      streak: prev.streak + 1,
      level: newLevel,
      badges: [...prev.badges, `${mentorSystem.currentChallenge.difficulty}_challenge`]
    }));
    const achievementMessage = {
      id: `ach_${Date.now()}`,
      text: `🏆 Challenge completed! +${xpGain} XP\nYou've demonstrated ${mentorSystem.currentChallenge.tags?.join(', ') || 'valuable skills'} and are now at ${newXp} total XP. ${newLevel > mentorSystem.level ? `🎊 Level up to ${newLevel}!` : ''}`,
      type: 'system',
      timestamp: new Date().toISOString()
    };
    setMentorSystem(prev => ({
      ...prev,
      mentorSession: [...prev.mentorSession, achievementMessage]
    }));
    showToast(`Challenge completed! +${xpGain} XP`, 'achievement');
    addNotification({ title: 'Achievement', body: `Completed challenge: ${mentorSystem.currentChallenge?.title || 'a challenge'}`, type: 'achievement' });
  };

  const handleAddGoal = () => {
    setGoalFormData({ name: '', description: '', timeframe: '1 month' });
    setGoalFormErrors({ name: '', description: '', timeframe: '' });
    setShowPopup('goalForm');
  };

  const validateGoalForm = () => {
    const errors = { name: '', description: '', timeframe: '' };
    let isValid = true;

    // Validate goal name
    if (!goalFormData.name.trim()) {
      errors.name = 'Goal name is required';
      isValid = false;
    } else if (goalFormData.name.trim().length < 3) {
      errors.name = 'Goal name must be at least 3 characters';
      isValid = false;
    } else if (goalFormData.name.trim().length > 100) {
      errors.name = 'Goal name must not exceed 100 characters';
      isValid = false;
    }

    // Validate description
    if (goalFormData.description.trim().length > 500) {
      errors.description = 'Description must not exceed 500 characters';
      isValid = false;
    }

    // Validate timeframe
    if (!goalFormData.timeframe.trim()) {
      errors.timeframe = 'Timeframe is required';
      isValid = false;
    }

    setGoalFormErrors(errors);
    return isValid;
  };

  const handleConfirmAddGoal = () => {
    if (!validateGoalForm()) {
      return;
    }

    const newGoal = {
      id: `goal_${Date.now()}`,
      name: goalFormData.name,
      description: goalFormData.description,
      timeframe: goalFormData.timeframe,
      created: new Date().toISOString(),
      progress: 0,
      status: 'active',
      milestones: []
    };
    addGoal({
      title: goalFormData.name,
      description: goalFormData.description,
      progress: 0,
      createdAt: new Date().toISOString()
    });
    setMentorSystem(prev => ({
      ...prev,
      goals: [...prev.goals, newGoal]
    }));
    const goalMessage = {
      id: `goal_added_${Date.now()}`,
      text: `🎯 New goal added: "${goalFormData.name}"\nTimeframe: ${goalFormData.timeframe}\n${goalFormData.description ? `Description: ${goalFormData.description}` : ''}`,
      type: 'system',
      timestamp: new Date().toISOString()
    };
    setMentorSystem(prev => ({
      ...prev,
      mentorSession: [...prev.mentorSession, goalMessage]
    }));
    showToast('Goal added successfully!', 'success');
    setShowPopup(null);
    setGoalFormData({ name: '', description: '', timeframe: '1 month' });
    setGoalFormErrors({ name: '', description: '', timeframe: '' });
  };

  const handleSuggestedAction = (action) => {
    if (!action) return;
    const a = action.toLowerCase();
    if (a.includes('create') && a.includes('note')) {
      setActiveTab('notes');
      setTimeout(() => {
        if (textareaRef.current) textareaRef.current.focus();
      }, 150);
      return;
    }
    if (a.includes('ask') || a.includes('learning')) {
      const prompt = 'Can you help me improve my learning strategy?';
      setMentorMessage(prompt);
      setTimeout(() => mentorInputRef.current?.focus(), 100);
      return;
    }
    if (a.includes('set a goal') || a.includes('set goal')) {
      handleAddGoal();
      return;
    }
    if (a.includes('note') && a.includes('suggest')) {
      sendMentorQuery('Please review my notes and suggest the top 3 study actions I should take.');
      return;
    }
    sendMentorQuery(action);
  };

  const handleFollowUpQuestion = (question) => {
    if (!question) return;
    sendMentorQuery(question);
  };

  const handleUpdateGoalProgress = (goalId, progress) => {
    const newProgress = Math.min(Math.max(progress, 0), 100);
    updateGoal(goalId, { progress: newProgress });
    setMentorSystem(prev => ({
      ...prev,
      goals: prev.goals.map(goal =>
        goal.id === goalId
          ? { ...goal, progress: newProgress }
          : goal
      )
    }));
    if (newProgress === 100) {
      showToast('Goal completed!', 'achievement');
    }
  };

  const handleDeleteGoal = (goalId) => {
    deleteGoal(goalId);
    setMentorSystem(prev => ({
      ...prev,
      goals: prev.goals.filter(goal => goal.id !== goalId)
    }));
    showToast('Goal deleted', 'success');
  };

  const handleAskMentorAboutGoal = (goal) => {
    const message = `I need guidance on my goal: "${goal.name}". Current progress: ${goal.progress}%. ${goal.description ? `Context: ${goal.description}` : ''}`;
    setMentorMessage(message);
    if (mentorInputRef.current) {
      mentorInputRef.current.focus();
    }
  };

  const handleViewLearningPath = async () => {
    setIsTyping(true);
    try {
      const systemContext = `User Profile: ${notes.length} notes, Level ${mentorSystem.level}, ${mentorSystem.progress.overall}% progress, ${mentorSystem.userProfile?.learningStyle || 'balanced'} learning style. Goals: ${mentorSystem.goals.map(g => g.name).join(', ') || 'general learning'}`;
      let pathResponse = null;
      
      try {
        const rawApi = import.meta.env.VITE_API_URL || 'http://localhost:5001';
        const apiBase = rawApi.endsWith('/api') ? rawApi.slice(0, -4) : rawApi;
        const aiResp = await fetch(`${apiBase}/api/ai`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: `${systemContext}. Create a detailed, personalized learning path with: appropriate level (beginner/intermediate/advanced), 3-4 concrete actionable steps with specific duration and focus areas, key milestones with meaningful rewards, and overall estimated completion time.`,
            messages: [{ role: 'user', content: 'Generate my personalized learning path' }]
          })
        });
        if (aiResp.ok) {
          const aiData = await aiResp.json();
          pathResponse = aiData.text;
        }
      } catch (aiErr) {
        console.warn('AI path generation failed, using fallback:', aiErr?.message);
      }

      // Always use local generation to ensure proper structure for modal
      const learningPath = AIService.MentorSystem.generateLearningPath(
        mentorSystem.userProfile || AIService.MentorSystem.initializeUserProfile(notes),
        mentorSystem.goals,
        mentorSystem.progress.overall
      );

      let pathText = pathResponse;
      if (!pathResponse) {
        pathText = `📚 **Your Personalized Learning Path**\n**Level:** ${learningPath.level.toUpperCase()}\n**Estimated Completion:** ${learningPath.estimatedCompletion}\n\n**Learning Steps:**\n${learningPath.path.map(s => `**${s.step}. ${s.action}**\n⏱️ Duration: ${s.duration}\n📌 Focus: ${s.focus}`).join('\n\n')}\n\n**Milestones & Rewards:**\n${learningPath.milestones.map(m => `✓ ${m.milestone} → ${m.reward}`).join('\n')}\n\n**Focus Areas:** ${learningPath.focusAreas.join(', ')}`;
      }

      const pathMessage = {
        id: `path_${Date.now()}`,
        text: pathText,
        type: 'mentor',
        timestamp: new Date().toISOString(),
        suggestedActions: ['Start Step 1', 'View Schedule', 'Customize Path'],
        followUpQuestions: ['How should I pace this?', 'What resources do I need?', 'Can we adjust the difficulty?']
      };
      
      setMentorSystem(prev => ({
        ...prev,
        learningPath: learningPath,
        mentorSession: [...prev.mentorSession, pathMessage]
      }));
      setShowLearningPath(true);
      showToast('AI-generated learning path ready!', 'insight');
    } catch (error) {
      console.error('Learning path error:', error);
      showToast('Failed to generate learning path', 'error');
    } finally {
      setIsTyping(false);
    }
  };

  const handleGenerateLearningRecommendations = async () => {
    setIsTyping(true);
    try {
      const systemContext = `Based on user learning profile - ${notes.length} notes, Level ${mentorSystem.level}, ${mentorSystem.userProfile?.learningStyle || 'balanced'} learner. Topics: ${notes.flatMap(n => n.tags || []).slice(0, 5).join(', ')}`;
      let recommendations = null;
      
      try {
        const rawApi = import.meta.env.VITE_API_URL || 'http://localhost:5001';
        const apiBase = rawApi.endsWith('/api') ? rawApi.slice(0, -4) : rawApi;
        const aiResp = await fetch(`${apiBase}/api/ai`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: `${systemContext}. Generate 3-4 personalized learning recommendations with title, description, priority, reason, and estimated time.`,
            messages: [{ role: 'user', content: 'Generate my personalized learning recommendations' }]
          })
        });
        if (aiResp.ok) {
          const aiData = await aiResp.json();
          recommendations = aiData.text;
        }
      } catch (aiErr) {
        console.warn('AI recommendations failed, using fallback:', aiErr?.message);
      }

      // Fallback to local generation
      if (!recommendations) {
        const localRecs = AIService.MentorSystem.generateLearningRecommendations(
          mentorSystem.userProfile || AIService.MentorSystem.initializeUserProfile(notes),
          notes,
          mentorSystem.goals
        );
        recommendations = `💡 **Personalized Learning Recommendations**\n${localRecs.map(r => `**${r.title}** (${r.priority})\n${r.description}\nWhy: ${r.reason}\nTime: ${r.estimatedTime}`).join('\n\n')}`;
      }

      const recMessage = {
        id: `recs_${Date.now()}`,
        text: recommendations,
        type: 'mentor',
        timestamp: new Date().toISOString(),
        suggestedActions: ['Start First Recommendation', 'View All Options', 'Customize'],
        followUpQuestions: ['Which recommendation appeals most?', 'Need alternatives?', 'Time breakdown?']
      };
      setMentorSystem(prev => ({ ...prev, mentorSession: [...prev.mentorSession, recMessage] }));
      showToast('AI recommendations generated!', 'learning');
    } catch (error) {
      console.error('Recommendations error:', error);
      showToast('Failed to generate recommendations', 'error');
    } finally {
      setIsTyping(false);
    }
  };

  const getMentorGreeting = () => {
    const hour = new Date().getHours();
    let greeting = '';
    if (hour < 12) greeting = 'Good morning';
    else if (hour < 17) greeting = 'Good afternoon';
    else greeting = 'Good evening';
    const insights = [];
    if (mentorSystem.progress.overall > 70) {
      insights.push('You\'re making excellent progress!');
    }
    if (mentorSystem.streak > 3) {
      insights.push(`${mentorSystem.streak}-day streak - impressive consistency!`);
    }
    if (notes.length > 15) {
      insights.push('Your knowledge base is growing strong!');
    }
    if (mentorSystem.userProfile?.knowledgeDepth > 0.5) {
      insights.push('You\'re developing deep understanding in your topics.');
    }
    const insightText = insights.length > 0 ? ` ${insights.join(' ')}` : '';
    return `${greeting}! I'm your AI Learning Mentor.${insightText}`;
  };

  const quickActions = [
    { icon: '📝', label: 'New Note', onClick: () => textareaRef.current?.focus() },
    { icon: '🗺️', label: 'Mind Map', onClick: () => setActiveTab('mindmap') },
    { icon: '📇', label: 'Flashcards', onClick: handleGenerateFlashcards },
    { icon: '🧠', label: 'AI Mentor', onClick: () => setActiveTab('mentor') },
    { icon: '📊', label: 'Insights', onClick: () => {
      if (contentAnalysis) {
        showAlertPopup(
          'Content Analysis',
          `Tone: ${contentAnalysis.emotionalTone}\nSentiment: ${(contentAnalysis.sentiment * 100).toFixed(0)}%\nComplexity: ${(contentAnalysis.complexity * 100).toFixed(0)}%\nTopics: ${contentAnalysis.keyTopics.join(', ')}\nWord Count: ${contentAnalysis.wordCount}\nReadability: ${contentAnalysis.readability}`
        );
      }
    }}
  ];

  const getUserInitials = () => {
    if (currentUser?.displayName) {
      const nameParts = currentUser.displayName.split(' ');
      if (nameParts.length >= 2) {
        return `${nameParts[0][0]}${nameParts[nameParts.length - 1][0]}`.toUpperCase();
      }
      return currentUser.displayName[0].toUpperCase();
    }
    return currentUser?.email?.[0]?.toUpperCase() || 'U';
  };

  const stats = {
    totalNotes: notes.length,
    totalFlashcards: flashcards.length,
    learnedFlashcards: flashcards.filter(f => f.learned).length,
    totalConnections: mindMap.connections.length,
    avgNoteLength: notes.length > 0
      ? Math.round(notes.reduce((sum, n) => sum + n.content.length, 0) / notes.length)
      : 0,
    topicDiversity: new Set(notes.flatMap(n => n.tags || [])).size,
    knowledgeDensity: notes.length > 0
      ? Math.round(notes.reduce((sum, n) => sum + (n.analysis?.complexity || 0), 0) / notes.length * 100)
      : 0,
    connectionDensity: mindMap.nodes.length > 0
      ? (mindMap.connections.length / mindMap.nodes.length).toFixed(2)
      : 0
  };

  const getMoodColor = (mood) => {
    const colors = {
      creative: '#8b5cf6',
      analytical: '#3b82f6',
      emotional: '#ec4899',
      practical: '#10b981',
      balanced: '#6b7280',
      neutral: '#9ca3af'
    };
    return colors[mood] || colors.balanced;
  };

  const getMoodIcon = (mood) => {
    const icons = {
      creative: '🎨',
      analytical: '🔍',
      emotional: '💖',
      practical: '⚙️',
      balanced: '⚖️',
      neutral: '😐'
    };
    return icons[mood] || icons.balanced;
  };

  // Friends filtering
  const friendsQuery = (friendsSearch || '').trim().toLowerCase();
  const filteredFriends = (users || []).filter(u => {
    if (!u) return false;
    if (u.id === currentUser?.uid) return false;
    if (!friendsQuery) return true;
    const name = (u.name || '').toLowerCase();
    const email = (u.email || '').toLowerCase();
    const topics = (u.topics || []).map(t => t.toLowerCase()).join(' ');
    return name.includes(friendsQuery) || email.includes(friendsQuery) || topics.includes(friendsQuery);
  });

  // Chat follow-status helpers (used in chat header)
  const amFollowingChat = chatUser && Array.isArray(following) ? following.includes(chatUser.id) : false;
  const theyFollowMeChat = (() => {
    try {
      if (!chatUser || !currentUser?.uid) return false;
      const u = (users || []).find(x => x.id === chatUser.id);
      if (u && Array.isArray(u.following) && u.following.includes(currentUser.uid)) return true;
      if (u && Array.isArray(u.followers) && u.followers.includes(currentUser.uid)) return true;
      // No localStorage fallback: rely on server-side `users` data only
      return false;
    } catch (e) { return false; }
  })();

  // Don't render until currentUser is loaded AND theme is loaded from Firestore to avoid light mode flash
  if (!themeLoaded) {
    return <div className="loading">Loading your settings...</div>;
  }

  return (
    <div className={`dashboard-container ${theme === 'dark' ? 'theme-dark' : ''}`}>
      {/* toast container removed — using popup modals instead */}
      {showLearningPath && (
        <LearningPathModal
          learningPath={mentorSystem.learningPath}
          onClose={() => setShowLearningPath(false)}
        />
      )}

{/* Confirm Popup */}
{showPopup === 'confirm' && popupData && (
  <div className="popup-overlay">
    <div className="popup-modal">
      <div className="popup-header">
        <h3>{popupData.title}</h3>
        <button onClick={() => setShowPopup(null)} className="lp-close">×</button>
      </div>
      <div className="popup-content">
        <p>{popupData.message}</p>
      </div>
      <div className="popup-actions">
        <button onClick={() => setShowPopup(null)} className="popup-button secondary">
          Cancel
        </button>
        <button
          onClick={() => {
            if (typeof popupData.onConfirm === 'function') popupData.onConfirm();
            setShowPopup(null);
          }}
          className="popup-button primary"
        >
          {popupData.confirmText || 'Confirm'}
        </button>
      </div>
    </div>
  </div>
)}

{/* Alert Popup */}
{showPopup === 'alert' && popupData && (
  <div className="popup-overlay">
    <div className="popup-modal">
      <div className="popup-header">
        <h3>{popupData.title}</h3>
        <button onClick={() => setShowPopup(null)} className="lp-close">×</button>
      </div>
      <div className="popup-content">
        <p>{popupData.message}</p>
      </div>
      <div className="popup-actions">
        <button onClick={() => setShowPopup(null)} className="popup-button primary">
          OK
        </button>
      </div>
    </div>
  </div>
)}
      {/* Followers & Notifications modals */}
      <FollowersModal open={showFollowersModal} onClose={closeFollowersModal} followers={followers} following={following} users={users} onToggleFollow={toggleFollow} />
      <NotificationsModal
        open={showNotifications}
        onClose={closeNotifications}
        // show only unread notifications in the popup as requested
        notifications={(notifications || []).filter(n => !n.read)}
        onMarkRead={markNotificationRead}
        onClear={clearNotifications}
        onDelete={deleteNotification}
      />
      {showPopup === 'goalForm' && (
        <div className="popup-overlay">
          <div className="popup-modal goal-modal">
            <div className="popup-header">
              <h3>🎯 Create New Goal</h3>
            </div>
            <div className="popup-content goal-form-content">
              <div className="form-group">
                <label className="form-label">Goal Name *</label>
                <input
                  type="text"
                  value={goalFormData.name}
                  onChange={(e) => setGoalFormData({ ...goalFormData, name: e.target.value })}
                  placeholder="e.g., Master React Hooks"
                  className={`form-input ${goalFormErrors.name ? 'input-error' : ''}`}
                  autoFocus
                />
                {goalFormErrors.name && <span className="form-error">{goalFormErrors.name}</span>}
              </div>
              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea
                  value={goalFormData.description}
                  onChange={(e) => setGoalFormData({ ...goalFormData, description: e.target.value })}
                  placeholder="Describe your goal in detail..."
                  className={`form-textarea ${goalFormErrors.description ? 'input-error' : ''}`}
                  rows={4}
                />
                {goalFormErrors.description && <span className="form-error">{goalFormErrors.description}</span>}
              </div>
              <div className="form-group">
                <label className="form-label">Timeframe *</label>
                <select
                  value={goalFormData.timeframe}
                  onChange={(e) => setGoalFormData({ ...goalFormData, timeframe: e.target.value })}
                  className={`form-select ${goalFormErrors.timeframe ? 'input-error' : ''}`}
                >
                  <option value="">-- Select Timeframe --</option>
                  <option value="1 week">1 Week</option>
                  <option value="2 weeks">2 Weeks</option>
                  <option value="1 month">1 Month</option>
                  <option value="3 months">3 Months</option>
                  <option value="6 months">6 Months</option>
                  <option value="1 year">1 Year</option>
                </select>
                {goalFormErrors.timeframe && <span className="form-error">{goalFormErrors.timeframe}</span>}
              </div>
            </div>
            <div className="popup-actions">
              <button onClick={() => { setShowPopup(null); setGoalFormData({ name: '', description: '', timeframe: '1 month' }); }} className="popup-button secondary">
                Cancel
              </button>
              <button onClick={handleConfirmAddGoal} className="popup-button primary">
                Create Goal
              </button>
            </div>
          </div>
        </div>
      )}

      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="app-logo">
            <img src={mindmeldLogo} alt="MindMeld" className="brand-logo-sidebar" />
            <div style={{display:'flex',flexDirection:'column',marginLeft:8}}>
              <span className="logo-text">MindMeld AI</span>
              <span className="logo-beta">BETA</span>
            </div>
          </div>
          <div style={{marginTop:8}}>
          </div>
          <label className="theme-switch" title="Toggle theme">
            <input aria-label="Toggle dark mode" type="checkbox" checked={theme === 'dark'} onChange={toggleTheme} />
            <span className="slider" />
          </label>
          <div className="user-badge" onClick={() => setActiveTab('profile')}>
            <div className="avatar">
              {(() => {
                const src = profileImage || '/default-avatar.svg';
                try { console.debug('Avatar sidebar src for', currentUser?.uid, src); } catch(e){}
                return profileImage ? (<img src={profileImage} alt="Profile" className="avatar-image" />) : (<img src="/default-avatar.svg" alt="Profile" className="avatar-image default-avatar" />);
              })()}
            </div>
            <div className="user-info">
              <span className="user-name">
                {currentUser?.displayName || currentUser?.email?.split('@')[0] || 'User'}
              </span>
              <span className="user-status">
                <span className="status-dot" style={{ backgroundColor: getMoodColor(currentMood) }}></span>
                {currentMood} • Lvl {mentorSystem.level}
              </span>
            </div>
          </div>
        </div>
        <nav className="sidebar-nav">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
          >
            <span className="nav-icon"><LogoIcon size={16} /></span>
            <span className="nav-label">Dashboard</span>
          </button>
          <button
            onClick={() => setActiveTab('notes')}
            className={`nav-item ${activeTab === 'notes' ? 'active' : ''}`}
          >
            <span className="nav-icon"><IconNotes /></span>
            <span className="nav-label">Smart Notes</span>
            {notes.length > 0 && <span className="nav-count">{notes.length}</span>}
          </button>
          <button
            onClick={() => setActiveTab('mindmap')}
            className={`nav-item ${activeTab === 'mindmap' ? 'active' : ''}`}
          >
            <span className="nav-icon"><IconMindmap /></span>
            <span className="nav-label">Mind Map</span>
            {mindMap.nodes.length > 0 && <span className="nav-count">{mindMap.nodes.length}</span>}
          </button>
          <button
            onClick={() => setActiveTab('flashcards')}
            className={`nav-item ${activeTab === 'flashcards' ? 'active' : ''}`}
          >
            <span className="nav-icon"><IconFlashcards /></span>
            <span className="nav-label">Flashcards</span>
            {flashcards.length > 0 && <span className="nav-count">{flashcards.length}</span>}
          </button>
          <button
            onClick={() => setActiveTab('friends')}
            className={`nav-item ${activeTab === 'friends' ? 'active' : ''}`}
          >
            <span className="nav-icon"><IconConnections /></span>
            <span className="nav-label">Friends</span>
            {users.length > 0 && <span className="nav-count">{users.length}</span>}
          </button>
          <button
            onClick={() => setActiveTab('mentor')}
            className={`nav-item ${activeTab === 'mentor' ? 'active' : ''}`}
          >
            <span className="nav-icon"><IconMentor /></span>
            <span className="nav-label">AI Mentor</span>
            {mentorSystem.currentChallenge && <span className="nav-badge">🎯</span>}
          </button>
          <button
            onClick={() => setActiveTab('messages')}
            className={`nav-item ${activeTab === 'messages' ? 'active' : ''}`}
          >
            <span className="nav-icon">💬</span>
            <span className="nav-label">Messages</span>
            {Object.keys(chats || {}).length > 0 && <span className="nav-count">{Object.keys(chats).length}</span>}
          </button>
          <button
            onClick={() => setActiveTab('profile')}
            className={`nav-item ${activeTab === 'profile' ? 'active' : ''}`}
          >
            <span className="nav-icon"><IconProfile /></span>
            <span className="nav-label">Profile</span>
          </button>
        </nav>
        <div className="sidebar-footer">
          <div className="ai-indicator">
            <div className="ai-pulse"></div>
            <span>AI Assistant Active</span>
          </div>
          <button onClick={handleLogout} className="logout-button">
            <span className="logout-icon"><IconLogout /></span>
            <span>Logout</span>
          </button>
        </div>
      </aside>

      <main className="main-content">
        <header className="content-header">
          <div style={{display:'flex',alignItems:'center',justifyContent:'flex-end',gap:12}}>
            <button className="notif-button" onClick={openNotifications} style={{position:'relative'}}>
              🔔
              {notifications.filter(n => !n.read).length > 0 && (
                <span className="notif-count" style={{position:'absolute',top:-6,right:-6,background:'#ef4444',color:'#fff',borderRadius:12,padding:'2px 6px',fontSize:'0.75em'}}>{notifications.filter(n=>!n.read).length}</span>
              )}
            </button>
          </div>
        </header>

        {activeTab === 'dashboard' && (
          <div className="dashboard-view">
            <div className="dashboard-grid">
              <div className="dashboard-card">
                <div className="dashboard-card-icon"><IconBook size={28} /></div>
                <div className="dashboard-card-body">
                  <div className="dashboard-card-label">Total Notes</div>
                  <div className="dashboard-card-value">{stats.totalNotes}</div>
                  <div className="dashboard-card-meta">Avg length: {stats.avgNoteLength} chars</div>
                </div>
              </div>

              <div className="dashboard-card">
                <div className="dashboard-card-icon"><IconFlashcards size={28} /></div>
                <div className="dashboard-card-body">
                  <div className="dashboard-card-label">Flashcards</div>
                  <div className="dashboard-card-value">{stats.learnedFlashcards} / {stats.totalFlashcards} learned</div>
                  <div className="dashboard-card-meta">Active recall practice</div>
                </div>
              </div>
              {/* Connections card removed per user request */}

              <div className="dashboard-card">
                <div className="dashboard-card-icon">🧠</div>
                <div className="dashboard-card-body">
                  <div className="dashboard-card-label">Knowledge Density</div>
                  <div className="dashboard-card-value">{stats.knowledgeDensity}%</div>
                  <div className="dashboard-card-meta">Topic diversity: {stats.topicDiversity}</div>
                </div>
              </div>

              <div className="dashboard-card">
                <div className="dashboard-card-icon"><IconTrophy size={28} /></div>
                <div className="dashboard-card-body">
                  <div className="dashboard-card-label">XP & Level</div>
                  <div className="dashboard-card-value">Lvl {mentorSystem.level} • {mentorSystem.xp} XP</div>
                  <div className="dashboard-card-meta">
                    <div className="sentiment-bar" style={{background: '#f1f5f9'}}>
                      <div className="sentiment-fill" style={{width: `${mentorSystem.progress?.overall ?? 0}%`, background: 'linear-gradient(90deg,#667eea,#10b981)'}}></div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="dashboard-card">
                <div className="dashboard-card-icon">🔥</div>
                <div className="dashboard-card-body">
                  <div className="dashboard-card-label">Streak</div>
                  <div className="dashboard-card-value">{mentorSystem.streak} days</div>
                  <div className="dashboard-card-meta">Keep the momentum going</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'notes' && (
          <div className="notes-view">
            {contentAnalysis && (
              <div className="ai-analysis-panel">
                <div className="analysis-header">
                  <h4>🤖 AI Content Analysis</h4>
                  <span className="analysis-confidence">
                    Confidence: {(contentAnalysis.sentiment * 50 + 50).toFixed(0)}%
                  </span>
                </div>
                <div className="analysis-grid">
                  <div className="analysis-metric">
                    <span className="metric-label">Emotional Tone</span>
                    <span className="metric-value">{contentAnalysis.emotionalTone}</span>
                  </div>
                  <div className="analysis-metric">
                    <span className="metric-label">Sentiment</span>
                    <div className="sentiment-bar">
                      <div
                        className="sentiment-fill"
                        style={{
                          width: `${(contentAnalysis.sentiment + 1) * 50}%`,
                          background: contentAnalysis.sentiment > 0.2 ? '#10b981' :
                            contentAnalysis.sentiment < -0.2 ? '#ef4444' : '#f59e0b'
                        }}
                      ></div>
                    </div>
                  </div>
                  <div className="analysis-metric">
                    <span className="metric-label">Complexity</span>
                    <span className="metric-value">
                      {contentAnalysis.complexity < 0.3 ? 'Low' :
                        contentAnalysis.complexity < 0.7 ? 'Medium' : 'High'}
                    </span>
                  </div>
                  <div className="analysis-metric">
                    <span className="metric-label">Cognitive Load</span>
                    <span className="metric-value">{contentAnalysis.cognitiveLoad}</span>
                  </div>
                </div>
                <div className="analysis-topics">
                  <span className="topics-label">Key Topics:</span>
                  <div className="topic-tags">
                    {contentAnalysis.keyTopics.map((topic, idx) => (
                      <span key={idx} className="topic-tag" style={{
                        background: AIService.getTopicColor(topic) + '20',
                        color: AIService.getTopicColor(topic)
                      }}>
                        {topic}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="quick-note-card">
              <div className="card-header">
                <h3>Smart Note Creator</h3>
              </div>
              <div className="note-form">
                <input
                  type="text"
                  value={newNote.title}
                  onChange={(e) => setNewNote({ ...newNote, title: e.target.value })}
                  placeholder="Note title (AI will suggest if empty)"
                  className="note-title-input"
                />
                <textarea
                  ref={textareaRef}
                  value={newNote.content}
                  onChange={(e) => {
                    setNewNote({ ...newNote, content: e.target.value });
                    if (e.target.value.length > 10) {
                      const analysis = AIService.analyzeContentDeeply(e.target.value);
                      setCurrentMood(analysis.emotionalTone);
                    }
                  }}
                  placeholder="Start typing... AI is analyzing your content in real-time"
                  className="note-content-input"
                  rows={5}
                />
                <div className="note-actions">
                  <div className="category-selector">
                    <select
                      value={newNote.category}
                      onChange={(e) => setNewNote({ ...newNote, category: e.target.value })}
                      className="category-select"
                    >
                      <option value="general">📝 General</option>
                      <option value="idea">💡 Idea</option>
                      <option value="research">🔬 Research</option>
                      <option value="project">📁 Project</option>
                      <option value="personal">👤 Personal</option>
                      <option value="technical">💻 Technical</option>
                      <option value="business">📈 Business</option>
                    </select>
                  </div>
                  <button onClick={handleCreateNote} className="save-note-button">
                    <span>💾 Save Note</span>
                    <span className="button-subtext">AI will analyze connections</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="recent-notes">
              <div className="section-header">
                <h3>Recent Notes</h3>
                <div className="section-actions">
                  <button onClick={handleGenerateFlashcards} className="generate-flashcards-button">
                    📇 Generate Smart Flashcards
                  </button>
                  <button onClick={() => {
                    if (notes.length > 0) {
                      analyzeNoteDeeply(notes[0].id);
                    }
                  }} className="deep-analyze-button">
                    🔍 Deep AI Analysis
                  </button>
                </div>
              </div>
              {notes.length > 0 ? (
                <div className="notes-grid-enhanced">
                  {notes.slice(0, 6).map(note => {
                    const noteAnalysis = note.analysis || AIService.analyzeContentDeeply(note.content);
                    return (
                      <div key={note.id} className="note-card-enhanced">
                        <div className="note-card-header">
                          <h4>{note.title}</h4>
                          <div className="note-ai-badges">
                            <span
                              className="ai-badge complexity"
                              style={{
                                background: noteAnalysis.complexity < 0.3 ? '#10b98120' :
                                  noteAnalysis.complexity < 0.7 ? '#f59e0b20' : '#ef444420',
                                color: noteAnalysis.complexity < 0.3 ? '#10b981' :
                                  noteAnalysis.complexity < 0.7 ? '#f59e0b' : '#ef4444'
                              }}
                            >
                              {noteAnalysis.complexity < 0.3 ? 'Simple' :
                                noteAnalysis.complexity < 0.7 ? 'Moderate' : 'Complex'}
                            </span>
                            <span
                              className="ai-badge sentiment"
                              style={{
                                background: noteAnalysis.sentiment > 0.2 ? '#10b98120' :
                                  noteAnalysis.sentiment < -0.2 ? '#ef444420' : '#6b728020',
                                color: noteAnalysis.sentiment > 0.2 ? '#10b981' :
                                  noteAnalysis.sentiment < -0.2 ? '#ef4444' : '#6b7280'
                              }}
                            >
                              {noteAnalysis.sentiment > 0.2 ? 'Positive' :
                                noteAnalysis.sentiment < -0.2 ? 'Negative' : 'Neutral'}
                            </span>
                          </div>
                        </div>
                        <p className="note-preview">
                          {note.content.length > 120 ? note.content.substring(0, 120) + '...' : note.content}
                        </p>
                        <div className="note-tags">
                          {(note.tags || noteAnalysis.keyTopics).slice(0, 3).map((tag, idx) => (
                            <span key={idx} className="note-tag" style={{
                              background: AIService.getTopicColor(tag) + '15',
                              color: AIService.getTopicColor(tag)
                            }}>
                              #{tag}
                            </span>
                          ))}
                        </div>
                        <div className="note-actions-enhanced">
                          <button
                            onClick={() => analyzeNoteDeeply(note.id)}
                            className="action-button analyze"
                            title="Deep AI analysis"
                          >
                            🔍 Analyze
                          </button>
                          <button
                            onClick={() => handleDeleteNote(note.id)}
                            className="action-button delete"
                            title="Delete note"
                          >
                            🗑️ Delete
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="empty-state">
                  <div className="empty-icon">📝</div>
                  <h4>No notes yet</h4>
                  <p>Start writing to begin your knowledge journey!</p>
                  <p className="empty-subtext">AI will help analyze and connect your thoughts</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'mindmap' && (
          <div className="mindmap-view">
            <div className="mindmap-header">
              <h2>Your Knowledge Network</h2>
              <p>Visual connections between your thoughts</p>
            </div>
            {mindMap.nodes.length > 0 ? (
              <>
                <div className="mindmap-container">
                  <div className="mindmap-center">
                    <div className="center-node">
                      <div className="center-icon">🧠</div>
                      <div className="center-text">{mindMap.centralTopic}</div>
                    </div>
                  </div>
                  <div className="mindmap-clusters">
                    {mindMap.clusters.map((cluster, index) => (
                      <div
                        key={cluster.topic}
                        className="mindmap-cluster"
                        style={{
                          top: `${40 + Math.sin(index * 0.8) * 30}%`,
                          left: `${40 + Math.cos(index * 0.8) * 30}%`,
                          borderColor: cluster.color
                        }}
                      >
                        <div
                          className="cluster-label"
                          style={{ backgroundColor: cluster.color + '40', color: cluster.color }}
                        >
                          {cluster.topic}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mindmap-nodes">
                    {mindMap.nodes.map((node) => {
                      if (node.type === 'note') {
                        return (
                          <div
                            key={node.id}
                            className="mindmap-node"
                            style={{
                              top: `${50 + node.y / 10}%`,
                              left: `${50 + node.x / 10}%`,
                              width: `${node.size * 8}px`,
                              height: `${node.size * 8}px`,
                              background: node.color + '40',
                              borderColor: node.color
                            }}
                            title={node.contentPreview}
                          >
                            <div className="node-label">{node.label}</div>
                          </div>
                        );
                      }
                      return null;
                    })}
                  </div>
                </div>
                <div className="mindmap-stats">
                  <div className="stat">
                    <span className="stat-label">Nodes</span>
                    <span className="stat-value">{mindMap.stats?.totalNodes || mindMap.nodes.length}</span>
                  </div>
                  <div className="stat">
                    <span className="stat-label">Connections</span>
                    <span className="stat-value">{mindMap.stats?.totalConnections || mindMap.connections.length}</span>
                  </div>
                  <div className="stat">
                    <span className="stat-label">Clusters</span>
                    <span className="stat-value">{mindMap.stats?.clusterCount || mindMap.clusters.length}</span>
                  </div>
                  <div className="stat">
                    <span className="stat-label">Density</span>
                    <span className="stat-value">{mindMap.stats?.connectionDensity || '0.00'}</span>
                  </div>
                </div>
              </>
            ) : (
              <div className="empty-state">
                <div className="empty-icon">🗺️</div>
                <h4>No mind map yet</h4>
                <p>Create some notes to see connections visualized</p>
                <button onClick={() => setActiveTab('notes')} className="primary-button">
                  📝 Create Notes
                </button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'flashcards' && (
          <div className="flashcards-view">
            <div className="flashcards-header">
              <h2>Intelligent Flashcards</h2>
              <p>AI-generated from your notes with adaptive learning</p>
            </div>
            {flashcards.length > 0 ? (
              <>
                <div className="flashcard-counter">
                  Card {activeFlashcard + 1} of {flashcards.length}
                  <span className="learned-count">
                    ({stats.learnedFlashcards} learned • Difficulty: {flashcards[activeFlashcard]?.difficulty}/5)
                  </span>
                </div>
                <div className="flashcard-container">
                  <div className={`flashcard ${showAnswer ? 'show-back' : ''}`}>
                    <div className="flashcard-front">
                      <h3>{flashcards[activeFlashcard]?.question}</h3>
                      <p className="flashcard-hint">
                        💡 {flashcards[activeFlashcard]?.hint || 'Tap to reveal answer'}
                      </p>
                      {flashcards[activeFlashcard]?.tags && (
                        <div className="flashcard-tags">
                          {flashcards[activeFlashcard].tags.slice(0, 2).map((tag, idx) => (
                            <span key={idx} className="flashcard-tag">
                              #{tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    {showAnswer && (
                      <div className="flashcard-back">
                        <h4>Answer</h4>
                        <div className="flashcard-answer">
                          {flashcards[activeFlashcard]?.answer.split('\n').map((line, idx) => (
                            <p key={idx}>{line}</p>
                          ))}
                        </div>
                        <div className="flashcard-feedback">
                          <button
                            className="feedback-button success"
                            onClick={() => {
                              const updatedFlashcards = [...flashcards];
                              updatedFlashcards[activeFlashcard] = {
                                ...updatedFlashcards[activeFlashcard],
                                learned: true,
                                lastReviewed: new Date().toISOString(),
                                reviewCount: (updatedFlashcards[activeFlashcard].reviewCount || 0) + 1,
                                masteryLevel: Math.min(5, (updatedFlashcards[activeFlashcard].masteryLevel || 0) + 1)
                              };
                              setFlashcards(updatedFlashcards);
                              setActiveFlashcard((prev) => (prev + 1) % flashcards.length);
                              setShowAnswer(false);
                              showToast('Marked as learned!', 'success');
                            }}
                          >
                            ✅ Got it
                          </button>
                          <button
                            className="feedback-button review"
                            onClick={() => {
                              setActiveFlashcard((prev) => (prev + 1) % flashcards.length);
                              setShowAnswer(false);
                            }}
                          >
                            🔄 Review again
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flashcard-controls">
                  <button
                    onClick={() => {
                      setActiveFlashcard((prev) => (prev - 1 + flashcards.length) % flashcards.length);
                      setShowAnswer(false);
                    }}
                    className="control-button prev"
                  >
                    ← Previous
                  </button>
                  <button
                    onClick={() => setShowAnswer(!showAnswer)}
                    className="control-button reveal"
                  >
                    {showAnswer ? '👁️ Hide Answer' : '👁️ Show Answer'}
                  </button>
                  <button
                    onClick={() => {
                      setActiveFlashcard((prev) => (prev + 1) % flashcards.length);
                      setShowAnswer(false);
                    }}
                    className="control-button next"
                  >
                    Next →
                  </button>
                </div>
              </>
            ) : (
              <div className="empty-state">
                <div className="empty-icon">📇</div>
                <h4>No flashcards yet</h4>
                <p>Generate flashcards from your notes</p>
                <button onClick={handleGenerateFlashcards} className="primary-button">
                  ⚡ Generate Smart Flashcards
                </button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'friends' && (
          <div className="friends-view">
            <div className="friends-header">
              <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px'}}>
                <div>
                  <h2>Suggested Friends</h2>
                  <p>People you might want to connect with</p>
                  <div style={{marginTop:6}}><small style={{color:'var(--muted)'}}>Note: Friends UI is under development — some actions are disabled.</small></div>
                </div>
                <div className="friends-search">
                  <input
                    type="text"
                    placeholder="Search people by name, email or topic..."
                    value={friendsSearch}
                    onChange={(e) => setFriendsSearch(e.target.value)}
                    className="friends-search-input"
                    aria-label="Search friends"
                  />
                </div>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <button className="popup-button secondary" onClick={async () => {
                    try {
                      const resp = await fetchWithFallback('/api/users');
                      if (resp && resp.ok) {
                        const all = await resp.json();
                        if (Array.isArray(all)) {
                          setUsersNormalized(all);
                          if (all.length > 0) setUsersLoadedFromServer(true);
                          showToast('Friends list updated!', 'success');
                        }
                      } else {
                        showToast('Failed to refresh friends', 'error');
                      }
                    } catch (e) { console.warn('Refresh friends failed', e); showToast('Failed to refresh friends', 'error'); }
                  }}>Refresh</button>
                </div>
              </div>
            </div>
            {filteredFriends.length > 0 ? (
              (() => {
                // Build three lists: mutual friends, following-only, suggestions
                const friendsList = [];
                const followingOnly = [];
                const suggestions = [];
                filteredFriends.forEach(u => {
                  const isFollowingUser = following.includes(u.id);
                  let theyFollowMe = false;
                  try {
                    // Prefer server-side users arrays; fall back to localStorage stored `${u.id}_following` if server data missing
                    if (Array.isArray(u.following) && u.following.includes(currentUser?.uid)) {
                      theyFollowMe = true;
                    } else if (Array.isArray(u.followers) && u.followers.includes(currentUser?.uid)) {
                      theyFollowMe = true;
                    } else {
                      // no localStorage fallback: if server arrays missing, assume they do not follow
                      theyFollowMe = false;
                    }
                  } catch(e) { theyFollowMe = false; }
                  const isFriend = isFollowingUser && theyFollowMe;
                  if (isFriend) friendsList.push(u);
                  else if (isFollowingUser) followingOnly.push(u);
                  else suggestions.push(u);
                });

                return (
                  <div style={{display:'flex',flexDirection:'column',gap:16}}>
                    {/* Friends */}
                    <div>
                      <h3>Friends {friendsList.length > 0 && <small style={{color:'var(--muted)'}}>({friendsList.length})</small>}</h3>
                      {friendsList.length === 0 ? <p className="form-label">No mutual friends yet.</p> : (
                        <div className="friends-grid">
                          {friendsList.map((u, idx) => (
                            <div key={u.id || idx} className="friend-card">
                              <div className="friend-avatar">
                                {(() => {
                                  const img = '';
                                  try { console.debug('Friend avatar src for', u.id, img || '/default-avatar.svg'); } catch(e){}
                                  const displayName = u.name || getUserNameFromId(u.id);
                                  return img ? (<img src={img} alt={displayName} className="avatar-image friend-avatar-img" />) : (<img src="/default-avatar.svg" alt="Default" className="friend-avatar-img default-avatar" />);
                                })()}
                              </div>
                              <div className="friend-body">
                                <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px'}}>
                                  <h4 style={{margin: 0}}>{u.name || getUserNameFromId(u.id)}</h4>
                                  <div className="friend-status" title={u.lastSeen ? `Last seen: ${u.lastSeen}` : 'Unknown'}>
                                    {isUserActive(u) ? (<span className="status-dot online" aria-hidden style={{marginRight:6,backgroundColor:'#10b981',width:10,height:10,borderRadius:10,display:'inline-block'}}></span>) : (<span className="status-dot" aria-hidden style={{marginRight:6,backgroundColor:'#9ca3af',width:10,height:10,borderRadius:10,display:'inline-block'}}></span>)}
                                    <small style={{fontSize:12,color:'#6b7280'}}>{isUserActive(u) ? 'Active' : formatLastSeen(u)}</small>
                                  </div>
                                </div>
                                <p className="friend-bio">{u.bio}</p>
                              </div>
                              <div className="friend-actions">
                                <button className="view-profile-button" onClick={() => { console.debug('View Profile clicked for', u); const fresh = users.find(x => x.id === u.id) || u; setSelectedUser(normalizeUser(fresh)); setShowUserProfile(true); }}>View Profile</button>
                                <button className="follow-button" disabled style={{opacity:0.9,background:'#10b981',color:'#fff'}}>Friends</button>
                                <button className="message-button" onClick={() => openChat(u)}>Message</button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Following */}
                    <div>
                      <h3>Following {followingOnly.length > 0 && <small style={{color:'var(--muted)'}}>({followingOnly.length})</small>}</h3>
                      {followingOnly.length === 0 ? <p className="form-label">You are not following anyone (in results).</p> : (
                        <div className="friends-grid">
                          {followingOnly.map((u, idx) => (
                            <div key={u.id || idx} className="friend-card">
                              <div className="friend-avatar">{(() => { const img = ''; try { console.debug('Friend avatar (card) src for', u.id, img || '/default-avatar.svg'); } catch(e){}; const displayName = u.name || getUserNameFromId(u.id); return img ? (<img src={img} alt={displayName} className="avatar-image friend-avatar-img" />) : (<img src="/default-avatar.svg" alt="Default" className="friend-avatar-img default-avatar" />); })()}</div>
                              <div className="friend-body">
                                <h4 style={{margin:0}}>{u.name || getUserNameFromId(u.id)}</h4>
                                <p className="friend-bio">{u.bio}</p>
                              </div>
                              <div className="friend-actions">
                                <button className="view-profile-button" onClick={() => { const fresh = users.find(x => x.id === u.id) || u; setSelectedUser(normalizeUser(fresh)); setShowUserProfile(true); }}>View Profile</button>
                                <button className="follow-button" onClick={async () => { const now = await toggleFollow(u.id); const displayName = u.name || getUserNameFromId(u.id); showToast(now ? `Followed ${displayName}` : `Unfollowed ${displayName}`, 'success'); }}>{following.includes(u.id) ? 'Following' : 'Follow'}</button>
                                <button
                                    className="message-button"
                                    onClick={() => {
                                    setChatUser(u);          // Set active chat user
                                    setActiveTab('messages'); // Switch to Messages tab
                                    fetchThread(u.id);       // Load messages (optional but recommended)
                                  openChat(u);} }
                                >
                                 Message
                              </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Suggestions */}
                    <div>
                      <h3>Suggestions {suggestions.length > 0 && <small style={{color:'var(--muted)'}}>({suggestions.length})</small>}</h3>
                      {suggestions.length === 0 ? <p className="form-label">No suggestions</p> : (
                        <div className="friends-grid">
                          {suggestions.map((u, idx) => (
                            <div key={u.id || idx} className="friend-card">
                              <div className="friend-avatar">{(() => { const img = ''; const displayName = u.name || getUserNameFromId(u.id); return img ? (<img src={img} alt={displayName} className="avatar-image friend-avatar-img" />) : (<img src="/default-avatar.svg" alt="Default" className="friend-avatar-img default-avatar" />); })()}</div>
                              <div className="friend-body">
                                <h4 style={{margin:0}}>{u.name || getUserNameFromId(u.id)}</h4>
                                <p className="friend-bio">{u.bio}</p>
                              </div>
                              <div className="friend-actions">
                                <button className="view-profile-button" onClick={() => { console.debug('View Profile clicked for', u); const fresh = users.find(x => x.id === u.id) || u; setSelectedUser(normalizeUser(fresh)); setShowUserProfile(true); }}>View Profile</button>
                                <button className="follow-button" onClick={async () => { const now = await toggleFollow(u.id); const displayName = u.name || getUserNameFromId(u.id); showToast(now ? `Followed ${displayName}` : `Unfollowed ${displayName}`, 'success'); }}>{following.includes(u.id) ? 'Following' : 'Follow'}</button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()
            ) : (
              <div className="empty-state">
                <div className="empty-icon">👥</div>
                <h4>No users found</h4>
                <p>Try another search or invite colleagues.</p>
              </div>
            )}

            {/* User profile modal for viewing other users */}
            {showUserProfile && selectedUser && (
              <div className="popup-overlay">
                <div className="popup-modal goal-modal">
                  <div className="popup-header">
                          <div style={{display:'flex',alignItems:'center',gap:16}}>
                            {(() => { const img = ''; try { console.debug('SelectedUser avatar src for', selectedUser.id, img || '/default-avatar.svg'); } catch(e){}; return img ? (<img src={img} alt={selectedUser.name} style={{width:72,height:72,borderRadius:12,objectFit:'cover'}} />) : (<img src="/default-avatar.svg" alt="Default" style={{width:72,height:72,borderRadius:12}} />); })()}
                            <h3 style={{margin:0}}>{selectedUser.name}</h3>
                          </div>
                  </div>
                  <div className="popup-content goal-form-content">
                          <div className="form-group">
                            <label className="form-label">Followers</label>
                            <p>{Array.isArray(selectedUser.followers) ? selectedUser.followers.length : 0}</p>
                          </div>
                    <div className="form-group">
                      <label className="form-label">Bio</label>
                      <p>{selectedUser.bio}</p>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Email</label>
                      <p>{selectedUser.email || '—'}</p>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Topics</label>
                      <div className="topic-tags">
                        {(selectedUser.topics||[]).map((t, i) => (
                          <span key={i} className="topic-tag">#{t}</span>
                        ))}
                      </div>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Joined</label>
                      <p>{selectedUser.joined || 'Unknown'}</p>
                    </div>
                  </div>
                  <div className="popup-actions">
                    <button onClick={() => { setShowUserProfile(false); setSelectedUser(null); }} className="popup-button secondary">Close</button>
                    <button onClick={() => { openChat(selectedUser); }} className="popup-button primary">Message</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'mentor' && (
          <div className="mentor-view">
            <div className="mentor-header">
              <div className="mentor-avatar">
                <div className="avatar-gradient">
                  ✨
                </div>
                <div className="mentor-status">
                  <span className="status-indicator active"></span>
                  <span>Adaptive AI Mentor Online</span>
                </div>
              </div>
              <div className="mentor-info">
                <h2>Your AI Learning Mentor</h2>
                <p className="mentor-greeting">{getMentorGreeting()}</p>
                <div className="mentor-stats">
                  <div className="stat">
                    <span className="stat-icon">🏆</span>
                    <div>
                      <span className="stat-value">Level {mentorSystem.level}</span>
                      <span className="stat-label">{mentorSystem.xp} XP</span>
                    </div>
                  </div>
                  <div className="stat">
                    <span className="stat-icon">📈</span>
                    <div>
                      <span className="stat-value">{mentorSystem.progress.overall}%</span>
                      <span className="stat-label">Progress</span>
                    </div>
                  </div>
                  <div className="stat">
                    <span className="stat-icon">⏰</span>
                    <div>
                      <span className="stat-value">{mentorSystem.streak}</span>
                      <span className="stat-label">Day Streak</span>
                    </div>
                  </div>
                  <div className="stat">
                    <span className="stat-icon">🏅</span>
                    <div>
                      <span className="stat-value">{mentorSystem.completedChallenges.length}</span>
                      <span className="stat-label">Challenges</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="mentor-content">
              <div className="mentor-session">
                <div className="session-header">
                  <h3>Learning Session</h3>
                  <div className="session-controls">
                    <button
                      onClick={handleGenerateLearningRecommendations}
                      className="get-recommendations-button"
                    >
                      💡 Get Recommendations
                    </button>
                    <button
                      onClick={handleViewLearningPath}
                      className="learning-path-button"
                    >
                      📚 Learning Path
                    </button>
                  </div>
                </div>
                <div className="session-messages" ref={mentorMessagesRef}>
                  {mentorSystem.mentorSession.map((message) => (
                    <MentorMessage
                      key={message.id}
                      message={message}
                      onActionClick={handleSuggestedAction}
                      onFollowUpClick={handleFollowUpQuestion}
                    />
                  ))}
                  {isTyping && <MentorMessage isTyping={true} />}
                </div>
                <div className="session-input">
                  {sessionType === 'text' ? (
                    <div className="text-input-container">
                      <input
                        ref={mentorInputRef}
                        type="text"
                        value={mentorMessage}
                        onChange={(e) => setMentorMessage(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleMentorMessageSend()}
                        placeholder="Ask for advice on learning, notes, goals, productivity..."
                        className="mentor-input"
                      />
                      <button
                        onClick={handleMentorMessageSend}
                        className="send-button"
                        disabled={!mentorMessage.trim()}
                      >
                        📤
                      </button>
                    </div>
                  ) : (
                    <div className="voice-input-container">
                      <button
                        onClick={handleVoiceInput}
                        className={`voice-button ${isRecording ? 'recording' : ''}`}
                      >
                        {isRecording ? '🎤❌ Stop' : '🎤 Start'}
                      </button>
                      {mentorMessage && (
                        <div className="voice-preview">
                          <p>{mentorMessage}</p>
                          <button onClick={handleMentorMessageSend} className="send-voice-button">
                            📤 Send
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div className="mentor-sidebar">
                <div className="challenge-card">
                  <div className="card-header">
                    <span className="card-icon">🎯</span>
                    <h4>Active Challenge</h4>
                    {mentorSystem.currentChallenge && (
                      <span className={`challenge-level ${mentorSystem.currentChallenge.difficulty}`}>
                        {mentorSystem.currentChallenge.difficulty}
                      </span>
                    )}
                  </div>
                  {mentorSystem.currentChallenge ? (
                    <div className="challenge-content">
                      <h5 className="challenge-title">{mentorSystem.currentChallenge.title}</h5>
                      <p className="challenge-description">{mentorSystem.currentChallenge.description}</p>
                      <div className="challenge-meta">
                        <div className="meta-item">
                          <span className="meta-icon">⏱️</span>
                          <span className="meta-text">{mentorSystem.currentChallenge.timeEstimate}</span>
                        </div>
                        <div className="meta-item">
                          <span className="meta-icon">⭐</span>
                          <span className="meta-text">{mentorSystem.currentChallenge.xp} XP</span>
                        </div>
                      </div>
                      {mentorSystem.currentChallenge.tags && (
                        <div className="challenge-tags">
                          {mentorSystem.currentChallenge.tags.map((tag, idx) => (
                            <span key={idx} className="challenge-tag">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                      <button
                        onClick={handleCompleteChallenge}
                        className="complete-challenge-button"
                      >
                        ⭐ Mark Complete
                      </button>
                    </div>
                  ) : (
                    <div className="no-challenge">
                      <p>No active challenge</p>
                      <button
                        onClick={handleStartChallenge}
                        className="start-challenge-button"
                      >
                        ⚡ Start New Challenge
                      </button>
                    </div>
                  )}
                </div>
                {mentorSystem.userProfile && (
                  <div className="profile-card">
                    <div className="card-header">
                      <span className="card-icon">📊</span>
                      <h4>Learning Profile</h4>
                    </div>
                    <div className="profile-content">
                      <div className="profile-item">
                        <span className="profile-label">Learning Style:</span>
                        <span className="profile-value">{mentorSystem.userProfile.learningStyle}</span>
                      </div>
                      <div className="profile-item">
                        <span className="profile-label">Consistency:</span>
                        <div className="progress-bar">
                          <div
                            className="progress-fill"
                            style={{ width: `${mentorSystem.userProfile.consistencyScore * 100}%` }}
                          ></div>
                          <span className="progress-text">
                            {Math.round(mentorSystem.userProfile.consistencyScore * 100)}%
                          </span>
                        </div>
                      </div>
                      <div className="profile-item">
                        <span className="profile-label">Knowledge Depth:</span>
                        <div className="progress-bar">
                          <div
                            className="progress-fill"
                            style={{ width: `${mentorSystem.userProfile.knowledgeDepth * 100}%` }}
                          ></div>
                          <span className="progress-text">
                            {Math.round(mentorSystem.userProfile.knowledgeDepth * 100)}%
                          </span>
                        </div>
                      </div>
                      {mentorSystem.userProfile.preferredTopics && mentorSystem.userProfile.preferredTopics.length > 0 && (
                        <div className="profile-topics">
                          <span className="topics-label">Preferred Topics:</span>
                          <div className="topic-tags">
                            {mentorSystem.userProfile.preferredTopics.slice(0, 3).map((topic, idx) => (
                              <span key={idx} className="topic-tag">
                                {topic}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {mentorSystem.weeklyReport && (
                  <div className="report-card">
                    <div className="card-header">
                      <span className="card-icon">📊</span>
                      <h4>Weekly Report</h4>
                      <span className="report-date">{mentorSystem.weeklyReport.dateRange}</span>
                    </div>
                    <div className="report-content">
                      <div className="report-metrics">
                        <div className="report-metric">
                          <span className="report-value">{mentorSystem.weeklyReport.metrics.notesCreated}</span>
                          <span className="report-label">Notes</span>
                        </div>
                        <div className="report-metric">
                          <span className="report-value">{mentorSystem.weeklyReport.metrics.goalsCompleted}</span>
                          <span className="report-label">Goals</span>
                        </div>
                        <div className="report-metric">
                          <span className="report-value">{mentorSystem.weeklyReport.metrics.topicDiversity}</span>
                          <span className="report-label">Topics</span>
                        </div>
                      </div>
                      <div className="report-insights">
                        <h5>Insights:</h5>
                        {mentorSystem.weeklyReport.insights.map((insight, idx) => (
                          <div key={idx} className="insight-item">
                            <span className="insight-bullet">•</span>
                            <span>{insight}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'profile' && (
          <div className="profile-view">
            <div className="profile-header">
              <div className="profile-avatar-section">
                <div className="avatar-large">
                  {profileImage ? (
                    <img src={profileImage} alt="Profile" />
                  ) : (
                    <DefaultAvatar size={80} name={currentUser?.displayName || currentUser?.email || ''} photoURL={currentUser?.photoURL || null} />
                  )}
                </div>
                <div className="avatar-actions">
                  {/* Profile image uploads disabled — using default avatar/initials only */}
                </div>
              </div>
              <div className="profile-info">
                <div className="profile-title-row">
                  <h2>{currentUser?.displayName || 'MindMeld User'}</h2>
                    <button className="action-button" onClick={() => setEditingProfile(true)}>Edit profile</button>
                </div>

                {/* Profile edit handled in modal to match other popups */}

                <p className="profile-email">{currentUser?.email}</p>
                <div className="profile-stats">
                  <div className="stat-item">
                    <span className="stat-number">{stats.totalNotes}</span>
                    <span className="stat-label">Notes</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-number">{stats.totalFlashcards}</span>
                    <span className="stat-label">Flashcards</span>
                  </div>
                  {/* Connections stat removed per user request */}
                  <div className="stat-item">
                        <span className="stat-number">{mentorSystem.xp}</span>
                        <span className="stat-label">Mentor XP</span>
                  </div>
                      <div className="stat-item" style={{cursor:'pointer'}} onClick={openFollowersModal} title="View followers">
                        <span className="stat-number">{followers.length}</span>
                        <span className="stat-label">Followers</span>
                      </div>
                </div>
              </div>
            </div>
              <div className="profile-actions">
              <div className="action-section">
                <div className="action-buttons">
                  {/* Data management cleared per user request; destructive actions removed */}
                </div>
              </div>
              {/* Community block: followers displayed above beside Mentor XP — duplicate removed */}
              {/* Following list removed from profile per request (use Followers modal or Messages view) */}
              <div className="action-section">
                <h4>Learning Stats</h4>
                <div className="stats-grid">
                  <div className="stat-card">
                    <div className="stat-card-icon">📝</div>
                    <div className="stat-card-content">
                      <div className="stat-card-value">{stats.totalNotes}</div>
                      <div className="stat-card-label">Total Notes</div>
                    </div>
                  </div>
                  {/* Connections stat-card removed */}
                  <div className="stat-card">
                    <div className="stat-card-icon">📊</div>
                    <div className="stat-card-content">
                      <div className="stat-card-value">{stats.knowledgeDensity}%</div>
                      <div className="stat-card-label">Knowledge Density</div>
                    </div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-card-icon">⏰</div>
                    <div className="stat-card-content">
                      <div className="stat-card-value">{mentorSystem.streak}</div>
                      <div className="stat-card-label">Day Streak</div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="action-section">
                <h4>Account</h4>
                <div className="action-buttons">
                  <button onClick={handleLogout} className="action-button logout">
                    🚪 Logout
                  </button>
                </div>
              </div>
            </div>
            {/* Profile edit modal */}
            {editingProfile && (
              <div className="popup-overlay">
                    <div className="popup-modal goal-modal">
                      <div className="popup-header">
                        <h3>✏️ Edit Profile</h3>
                      </div>
                  <div className="popup-content goal-form-content">
                    <div className="form-group">
                      <label className="form-label">First name</label>
                      <input className="form-input" value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="First name" />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Middle name (optional)</label>
                      <input className="form-input" value={middleName} onChange={e => setMiddleName(e.target.value)} placeholder="Middle name (optional)" />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Last name</label>
                      <input className="form-input" value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Last name" />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Birthdate</label>
                      <input type="date" className="form-input" value={birthdate} onChange={e => setBirthdate(e.target.value)} />
                    </div>
                  </div>
                  <div className="popup-actions">
                    <button onClick={() => setEditingProfile(false)} className="popup-button secondary">Cancel</button>
                    <button onClick={handleSaveProfile} className="popup-button primary">Save</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      {activeTab === 'messages' && (
  <div className="messages-view">
    <div className="messages-layout">
      {/* Sidebar: Only followed users */}
      <div className="messages-sidebar">
        <div className="messages-sidebar-header">
          <h4>Messages</h4>
          <input
            className="friends-search-input"
            placeholder="Search followed users"
            value={friendsSearch}
            onChange={(e) => setFriendsSearch(e.target.value)}
          />
        </div>
        <div className="messages-list">
          {users
            .filter(u => {
              // Skip current user
              if (!u || u.id === currentUser?.uid) return false;
              // Show users you follow OR users with an existing chat history so unfollowing doesn't remove chats
              const hasChat = Array.isArray(chats && chats[u.id]) && (chats[u.id] || []).length > 0;
              return following.includes(u.id) || hasChat;
            })
            .filter(u => {
              // Apply search
              const q = (friendsSearch || '').trim().toLowerCase();
              if (!q) return true;
              const name = (u.name || '').toLowerCase();
              const email = (u.email || '').toLowerCase();
              const topics = (u.topics || []).map(t => t.toLowerCase()).join(' ');
              return name.includes(q) || email.includes(q) || topics.includes(q);
            })
            .map(u => {
              const last = (chats[u.id] && chats[u.id].length)
                ? chats[u.id][chats[u.id].length - 1]
                : null;
              const unreadCount = (() => {
                try {
                  const conv = chats[u.id] || [];
                  const lastTs = lastRead[u.id] ? new Date(lastRead[u.id]).getTime() : 0;
                  const curName = currentUser?.displayName || (currentUser?.email ? currentUser.email.split('@')[0] : 'You');
                  return conv.filter(m => new Date(m.ts).getTime() > lastTs && m.sender !== curName).length;
                } catch (e) {
                  return 0;
                }
              })();

              return (
                <div
                  key={u.id}
                  className={`messages-list-item ${chatUser && chatUser.id === u.id ? 'active' : ''}`}
                  onClick={() => {
                    setChatUser(u);
                    fetchThread(u.id); // Load messages with this user
                  }}
                >
                  <div className="messages-list-left">
                    <img
                      src="/default-avatar.svg"
                      alt="Default"
                      className="message-avatar default-avatar"
                    />
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div className="messages-name">{u.name || getUserNameFromId(u.id)}</div>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                        {isUserActive(u) ? 'Active' : formatLastSeen(u)}
                      </div>
                    </div>
                  </div>
                  <div className="messages-list-right">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div className="messages-last">
                        {last ? `${last.sender}: ${last.text.slice(0, 36)}` : ''}
                      </div>
                      {unreadCount > 0 && (
                        <div
                          className="unread-count"
                          style={{
                            background: '#ef4444',
                            color: '#fff',
                            borderRadius: 12,
                            padding: '4px 8px',
                            fontSize: '0.75em',
                          }}
                        >
                          {unreadCount}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
        </div>
      </div>

      {/* Chat area */}
      <div className="messages-chat-area">
        {chatUser ? (
          <div className="chat-panel">
            <div className="chat-header">
              <h3>Chat — {chatUser.name}</h3>
              <div style={{fontSize:12,color:'var(--muted)',marginTop:6}}>
                <span style={{marginRight:12}}>You: {amFollowingChat ? 'Following' : 'Not following'}</span>
                <span>They: {theyFollowMeChat ? 'Following you' : 'Not following you'}</span>
              </div>
              <div className="chat-header-actions">
                <button
                  className="popup-button secondary"
                  onClick={() => setChatUser(null)}
                >
                  Close
                </button>
              </div>
            </div>
            <div className="chat-messages-panel">
              {(chats[chatUser.id] || []).map((m, i) => (
                <div
                  key={i}
                  className={`chat-message ${
                    m.sender ===
                    (currentUser?.displayName ||
                      (currentUser?.email ? currentUser.email.split('@')[0] : 'You'))
                      ? 'me'
                      : 'them'
                  }`}
                >
                  <div className="chat-meta">
                    <strong>{m.sender}</strong>{' '}
                    <span className="chat-time">{new Date(m.ts).toLocaleTimeString()}</span>
                  </div>
                  <div className="chat-text">{m.text}</div>
                </div>
              ))}
            </div>
            <div className="chat-input-row">
              <input
                className="form-input"
                placeholder={`Message ${chatUser.name}`}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    const text = e.target.value.trim();
                    if (text) {
                      sendChatMessage(chatUser.id, text);
                      e.target.value = '';
                    }
                  }
                }}
              />
              <button
                className="popup-button primary"
                onClick={() => {
                  const input = document.querySelector('.messages-view .chat-input-row .form-input');
                  if (input && input.value.trim()) {
                    sendChatMessage(chatUser.id, input.value.trim());
                    input.value = '';
                  }
                }}
              >
                Send
              </button>
            </div>
          </div>
        ) : (
          <div className="chat-empty">
            <p>Select a friend to start chatting — messages appear here like the AI Mentor chat.</p>
          </div>
        )}
      </div>
    </div>
  </div>
)}
      </main>
    </div>
  );
}

// Debug Panel - temporary helper to show runtime state
function DebugPanel({ open, onClose, data }) {
  if (!open) return null;
  return (
    <div className="debug-panel">
      <div className="debug-panel-header">
        <strong>Debug</strong>
        <button onClick={onClose} className="debug-close">Close</button>
      </div>
      <div className="debug-panel-body">
        <pre className="debug-pre">{JSON.stringify(data, null, 2)}</pre>
      </div>
    </div>
  );
}

// Render debug toggle & panel near top-level so it's always available
// (temporary UI for troubleshooting)
function DebugToggle({ show, setShow, data }) {
  return (
    <>
      <div className="debug-toggle" onClick={() => setShow(s => !s)}>{show ? 'Hide Debug' : 'Show Debug'}</div>
      <DebugPanel open={show} onClose={() => setShow(false)} data={data} />
    </>
  );
}
              
