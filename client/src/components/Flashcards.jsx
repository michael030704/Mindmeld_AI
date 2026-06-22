import React, { useState } from 'react';
import { AIService } from '../services/AIService';

export default function FlashcardView({ notes, flashcards, setFlashcards, showToast }) {
  const [activeFlashcard, setActiveFlashcard] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [reviewStats, setReviewStats] = useState({});

  React.useEffect(() => {
    if (notes.length > 0 && flashcards.length === 0) {
      const generated = AIService.generateSmartFlashcards(notes, 'visual');
      setFlashcards(generated);
      showToast('Smart challenges generated from your notes', 'success');
    }
  }, [notes, flashcards.length, setFlashcards, showToast]);

  const markAsLearned = () => {
    if (flashcards.length > 0) {
      const updated = [...flashcards];
      updated[activeFlashcard] = {
        ...updated[activeFlashcard],
        learned: true,
        reviewCount: (updated[activeFlashcard].reviewCount || 0) + 1,
        masteryLevel: Math.min(5, (updated[activeFlashcard].masteryLevel || 0) + 1)
      };
      setFlashcards(updated);
      setShowAnswer(false);
      moveToNext();
      showToast('Great! Moving to next challenge.', 'success');
    }
  };

  const moveToNext = () => {
    if (flashcards.length > 0) {
      setActiveFlashcard((prev) => (prev + 1) % flashcards.length);
    }
  };

  const moveToPrevious = () => {
    if (flashcards.length > 0) {
      setActiveFlashcard((prev) => (prev - 1 + flashcards.length) % flashcards.length);
    }
  };

  const regenerateFlashcards = () => {
    if (notes.length > 0) {
      const generated = AIService.generateSmartFlashcards(notes, 'visual');
      setFlashcards(generated);
      setActiveFlashcard(0);
      setShowAnswer(false);
      showToast('Challenges regenerated', 'success');
    }
  };

  if (flashcards.length === 0) {
    return (
      <div className="flashcard-view">
        <div className="flashcard-header">
          <div>
            <h2>Smart Challenges</h2>
            <p className="flashcard-subtitle">Test your knowledge with AI-generated adaptive challenges</p>
          </div>
          <div className="notes-stats">
            <div className="stat-pill">🎯 {notes.length} source notes</div>
          </div>
        </div>
        <div className="empty-state-card">
          <div className="empty-icon">🎯</div>
          <p>No Challenges Yet</p>
          <p className="empty-hint">Create 2+ notes first. Smart challenges are automatically generated from your notes to reinforce learning.</p>
          <button onClick={regenerateFlashcards} className="button primary" disabled={notes.length === 0}>
            Generate Challenges
          </button>
        </div>
      </div>
    );
  }

  const current = flashcards[activeFlashcard];
  const progress = Math.round(((activeFlashcard + 1) / flashcards.length) * 100);
  const learned = flashcards.filter(f => f.learned).length;

  return (
    <div className="flashcard-view">
      <div className="flashcard-header">
        <div>
          <h2>Smart Challenges</h2>
          <p className="flashcard-subtitle">Test your knowledge and track mastery</p>
        </div>
        <div className="notes-stats">
          <div className="stat-pill">✅ {learned}/{flashcards.length} learned</div>
        </div>
      </div>

      <div className="flashcard-progress">
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${progress}%` }}></div>
        </div>
        <div className="progress-text">
          <span>{activeFlashcard + 1} of {flashcards.length}</span>
          <span>{progress}%</span>
        </div>
      </div>

      <div className="flashcard-container">
        <div className={`flashcard ${showAnswer ? 'flipped' : ''}`} onClick={() => setShowAnswer(!showAnswer)}>
          <div className="flashcard-inner">
            <div className="flashcard-front">
              <p className="flashcard-label">Question</p>
              <p className="flashcard-text">{current?.question}</p>
              <p className="flashcard-hint">Click to reveal answer</p>
            </div>
            <div className="flashcard-back">
              <p className="flashcard-label">Answer</p>
              <p className="flashcard-text">{current?.answer}</p>
              {current?.hint && <p className="flashcard-hint">Hint: {current.hint}</p>}
            </div>
          </div>
        </div>
      </div>

      <div className="flashcard-controls">
        <button onClick={moveToPrevious} className="button secondary" disabled={flashcards.length === 0}>← Previous</button>
        <button onClick={() => setShowAnswer(!showAnswer)} className="button primary">
          {showAnswer ? 'Hide Answer' : 'Show Answer'}
        </button>
        <button onClick={markAsLearned} className="button success" disabled={flashcards.length === 0}>✓ Learned</button>
        <button onClick={moveToNext} className="button secondary" disabled={flashcards.length === 0}>Next →</button>
      </div>

      <div className="flashcard-actions">
        <button onClick={regenerateFlashcards} className="button small">Regenerate All</button>
      </div>
    </div>
  );
}

