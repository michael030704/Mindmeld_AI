import React, { useState } from 'react';
import { AIService } from '../services/AIService';

export default function SmartNotes({ notes, setNotes, newNote, setNewNote, editing, setEditing, editNote, setEditNote, currentUser, db, showToast, showAlertPopup, showConfirmPopup }) {
  const [error, setError] = useState('');

  // Validate note content quality
  const validateNoteContent = (title, content) => {
    const titleTrimmed = title.trim();
    const contentTrimmed = content.trim();

    // Check if fields are empty
    if (!titleTrimmed || !contentTrimmed) {
      return { valid: false, message: '❌ Please enter both title and content' };
    }

    // Check title length (min 3 characters)
    if (titleTrimmed.length < 3) {
      return { valid: false, message: '❌ Title must be at least 3 characters' };
    }

    // Check content length (min 20 characters for meaningful content)
    if (contentTrimmed.length < 20) {
      return { valid: false, message: '⚠️ Content seems too short. Please write at least 20 characters with meaningful details' };
    }

    // Check for spam patterns (repeated characters, all caps, random gibberish)
    const repeatedChars = /(.)\1{9,}/g; // More than 9 repeated characters
    if (repeatedChars.test(contentTrimmed)) {
      return { valid: false, message: '❌ Content appears to contain spam. Please write meaningful text' };
    }

    // Check if content is mostly spaces or special characters
    const meaningfulChars = contentTrimmed.replace(/[^a-zA-Z0-9]/g, '').length;
    if (meaningfulChars < 10) {
      return { valid: false, message: '❌ Content must contain meaningful text, not just symbols or spaces' };
    }

    return { valid: true, message: '' };
  };

  const addNote = async () => {
    const validation = validateNoteContent(newNote.title, newNote.content);
    if (!validation.valid) {
      setError(validation.message);
      return;
    }

    const note = {
      id: `note_${Date.now()}`,
      title: newNote.title.trim(),
      content: newNote.content.trim(),
      category: newNote.category,
      createdAt: new Date().toISOString(),
      analysis: AIService.analyzeContentDeeply(newNote.content)
    };

    setNotes([note, ...notes]);
    setNewNote({ title: '', content: '', category: 'general' });
    setError('');
    showToast('✅ Note added successfully', 'success');
  };

  const deleteNote = (id) => {
    showConfirmPopup('Delete Note', 'Are you sure you want to delete this note?', () => {
      setNotes(notes.filter(n => n.id !== id));
      showToast('Note deleted', 'success');
    });
  };

  const updateNote = () => {
    const validation = validateNoteContent(editNote.title, editNote.content);
    if (!validation.valid) {
      setError(validation.message);
      return;
    }

    const updated = notes.map(n =>
      n.id === editNote.id
        ? { ...editNote, title: editNote.title.trim(), content: editNote.content.trim(), analysis: AIService.analyzeContentDeeply(editNote.content) }
        : n
    );
    setNotes(updated);
    setEditing(false);
    setEditNote(null);
    setError('');
    showToast('✅ Note updated successfully', 'success');
  };

  return (
    <div className="smart-notes-wrapper">
      <div className="notes-header">
        <div className="notes-header-content">
          <h2>📝 Smart Notes</h2>
          <p className="notes-subtitle">Create and organize notes with AI-powered semantic analysis</p>
        </div>
        <div className="notes-header-stat">
          <div className="stat-pill">📚 {notes.length} note{notes.length !== 1 ? 's' : ''}</div>
        </div>
      </div>

      <div className="notes-container">
        <div className="notes-editor">
          <div className="editor-title">
            <h3>{editing ? '✏️ Edit Note' : '✍️ Create New Note'}</h3>
          </div>

          {error && (
            <div className="error-message">
              <span className="error-icon">⚠️</span>
              <span>{error}</span>
            </div>
          )}

          {editing ? (
            <>
              <div className="form-group">
                <label>Note Title</label>
                <input
                  type="text"
                  placeholder="Note title (min 3 characters)..."
                  value={editNote?.title || ''}
                  onChange={(e) => setEditNote({ ...editNote, title: e.target.value })}
                  className="note-input"
                />
              </div>
              <div className="form-group">
                <label>Note Content</label>
                <div className="textarea-wrapper">
                  <textarea
                    placeholder="Edit your note with meaningful details (min 20 characters)..."
                    value={editNote?.content || ''}
                    onChange={(e) => setEditNote({ ...editNote, content: e.target.value })}
                    className="note-textarea"
                    rows="8"
                  />
                  <div className="char-counter">
                    {editNote?.content?.length || 0} characters
                    {editNote?.content?.length < 20 && (
                      <span className="char-warning"> (need {20 - (editNote?.content?.length || 0)} more)</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="button-group">
                <button onClick={updateNote} className="button primary">
                  <span>✓</span> Save Changes
                </button>
                <button onClick={() => { setEditing(false); setEditNote(null); }} className="button secondary">
                  <span>✕</span> Cancel
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="form-group">
                <label>Note Title</label>
                <input
                  type="text"
                  placeholder="Note title (min 3 characters)..."
                  value={newNote.title}
                  onChange={(e) => setNewNote({ ...newNote, title: e.target.value })}
                  className="note-input"
                />
              </div>
              <div className="form-group">
                <label>Note Content</label>
                <div className="textarea-wrapper">
                  <textarea
                    placeholder="What's on your mind? Write meaningful details (min 20 characters)..."
                    value={newNote.content}
                    onChange={(e) => setNewNote({ ...newNote, content: e.target.value })}
                    className="note-textarea"
                    rows="8"
                  />
                  <div className="char-counter">
                    {newNote.content.length} characters
                    {newNote.content.length < 20 && (
                      <span className="char-warning"> (need {20 - newNote.content.length} more)</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="form-group">
                <label>Category</label>
                <select
                  value={newNote.category}
                  onChange={(e) => setNewNote({ ...newNote, category: e.target.value })}
                  className="category-select"
                >
                  <option value="general">📌 General</option>
                  <option value="idea">💡 Idea</option>
                  <option value="research">🔍 Research</option>
                  <option value="project">🚀 Project</option>
                  <option value="personal">👤 Personal</option>
                  <option value="technical">⚙️ Technical</option>
                  <option value="business">💼 Business</option>
                  <option value="learning">🎓 Learning</option>
                </select>
              </div>
              <button onClick={addNote} className="button primary create-btn">
                <span>+</span> Create Note
              </button>
            </>
          )}
        </div>

        <div className="notes-list">
          <div className="notes-list-header">
            <div>
              <h3>📚 Your Notes</h3>
              <p className="notes-list-hint">Organize and manage your learning notes</p>
            </div>
            <div className="notes-count-badge">{notes.length}</div>
          </div>
          
          {notes.length === 0 ? (
            <div className="empty-state-card">
              <div className="empty-icon">📝</div>
              <h4>No notes yet</h4>
              <p>Create your first note to start learning!</p>
              <p className="empty-hint">Notes with AI analysis help you discover connections and deeper insights.</p>
            </div>
          ) : (
            <div className="notes-cards-grid">
              {notes.map(note => (
                <div key={note.id} className="note-card">
                  <div className="note-card-header">
                    <div className="note-title-section">
                      <h4>{note.title}</h4>
                      <span className={`note-category category-${note.category}`}>{note.category}</span>
                    </div>
                    {note.analysis && (
                      <div className="note-insights-badge">
                        <span>✨</span> AI analyzed
                      </div>
                    )}
                  </div>
                  <p className="note-preview">{note.content.substring(0, 120)}...</p>
                  <div className="note-card-footer">
                    <span className="note-date">{new Date(note.createdAt).toLocaleDateString()}</span>
                    <div className="note-card-actions">
                      <button 
                        onClick={() => { setEditNote(note); setEditing(true); }} 
                        className="button small secondary"
                        title="Edit note"
                      >
                        ✏️ Edit
                      </button>
                      <button 
                        onClick={() => deleteNote(note.id)} 
                        className="button small danger"
                        title="Delete note"
                      >
                        🗑️ Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
