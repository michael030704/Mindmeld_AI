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
      showToast('Flashcards generated from your notes', 'success');
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
      showToast('Great! Moving to next card.', 'success');
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
      showToast('Flashcards regenerated', 'success');
    }
  };

  if (flashcards.length === 0) {
    return (
      <div className="flashcard-view">
        <h2>Flashcards</h2>
        <div className="empty-state">
          <p>Create some notes first to generate smart flashcards!</p>
          <button onClick={regenerateFlashcards} className="button primary" disabled={notes.length === 0}>
            Generate Flashcards
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
      <h2>Flashcards</h2>

      <div className="flashcard-stats">
        <div className="stat">
          <label>Progress:</label>
          <span>{activeFlashcard + 1}/{flashcards.length}</span>
        </div>
        <div className="stat">
          <label>Learned:</label>
          <span>{learned}/{flashcards.length}</span>
        </div>
        <div className="stat">
          <label>Difficulty:</label>
          <span>{current?.difficulty || 0}/5</span>
        </div>
      </div>

      <div className="progress-bar">
        <div className="progress-fill" style={{ width: `${progress}%` }}></div>
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

      <div className="flashcard-actions">
        <button onClick={moveToPrevious} className="button secondary">← Previous</button>
        <button onClick={markAsLearned} className="button primary">Mark as Learned</button>
        <button onClick={moveToNext} className="button secondary">Next →</button>
      </div>

      <div className="flashcard-controls">
        <button onClick={regenerateFlashcards} className="button small">Regenerate All</button>
      </div>
    </div>
  );
}
