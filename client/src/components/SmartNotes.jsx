import React, { useState } from 'react';
import { AIService } from '../services/AIService';

export default function SmartNotes({ notes, setNotes, newNote, setNewNote, editing, setEditing, editNote, setEditNote, currentUser, db, showToast, showAlertPopup, showConfirmPopup }) {
  const [error, setError] = useState('');

  const addNote = async () => {
    if (!newNote.title.trim() || !newNote.content.trim()) {
      setError('Please enter both title and content');
      return;
    }

    const note = {
      id: `note_${Date.now()}`,
      title: newNote.title,
      content: newNote.content,
      category: newNote.category,
      createdAt: new Date().toISOString(),
      analysis: AIService.analyzeContentDeeply(newNote.content)
    };

    setNotes([note, ...notes]);
    setNewNote({ title: '', content: '', category: 'general' });
    setError('');
    showToast('Note added successfully', 'success');
  };

  const deleteNote = (id) => {
    showConfirmPopup('Delete Note', 'Are you sure you want to delete this note?', () => {
      setNotes(notes.filter(n => n.id !== id));
      showToast('Note deleted', 'success');
    });
  };

  const updateNote = () => {
    if (!editNote.title.trim() || !editNote.content.trim()) {
      setError('Please enter both title and content');
      return;
    }

    const updated = notes.map(n =>
      n.id === editNote.id
        ? { ...editNote, analysis: AIService.analyzeContentDeeply(editNote.content) }
        : n
    );
    setNotes(updated);
    setEditing(false);
    setEditNote(null);
    setError('');
    showToast('Note updated', 'success');
  };

  return (
    <div className="notes-container">
      <div className="notes-editor">
        <h2>Smart Notes</h2>
        {error && <div className="error-message">{error}</div>}

        {editing ? (
          <>
            <input
              type="text"
              placeholder="Note title..."
              value={editNote?.title || ''}
              onChange={(e) => setEditNote({ ...editNote, title: e.target.value })}
              className="note-input"
            />
            <textarea
              placeholder="Note content..."
              value={editNote?.content || ''}
              onChange={(e) => setEditNote({ ...editNote, content: e.target.value })}
              className="note-textarea"
              rows="8"
            />
            <div className="button-group">
              <button onClick={updateNote} className="button primary">Save Changes</button>
              <button onClick={() => { setEditing(false); setEditNote(null); }} className="button secondary">Cancel</button>
            </div>
          </>
        ) : (
          <>
            <input
              type="text"
              placeholder="Note title..."
              value={newNote.title}
              onChange={(e) => setNewNote({ ...newNote, title: e.target.value })}
              className="note-input"
            />
            <textarea
              placeholder="What's on your mind? Write freely..."
              value={newNote.content}
              onChange={(e) => setNewNote({ ...newNote, content: e.target.value })}
              className="note-textarea"
              rows="8"
            />
            <select
              value={newNote.category}
              onChange={(e) => setNewNote({ ...newNote, category: e.target.value })}
              className="category-select"
            >
              <option value="general">General</option>
              <option value="idea">Idea</option>
              <option value="research">Research</option>
              <option value="project">Project</option>
              <option value="personal">Personal</option>
              <option value="technical">Technical</option>
              <option value="business">Business</option>
              <option value="learning">Learning</option>
            </select>
            <button onClick={addNote} className="button primary">Create Note</button>
          </>
        )}
      </div>

      <div className="notes-list">
        <h3>Your Notes ({notes.length})</h3>
        {notes.length === 0 ? (
          <p className="empty-state">No notes yet. Create your first note to get started!</p>
        ) : (
          notes.map(note => (
            <div key={note.id} className="note-card">
              <div className="note-card-header">
                <h4>{note.title}</h4>
                <span className="note-category">{note.category}</span>
              </div>
              <p className="note-preview">{note.content.substring(0, 100)}...</p>
              <div className="note-card-actions">
                <button onClick={() => { setEditNote(note); setEditing(true); }} className="button small">Edit</button>
                <button onClick={() => deleteNote(note.id)} className="button small danger">Delete</button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
