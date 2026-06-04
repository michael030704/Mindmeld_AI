// AIService - Utility functions for AI-powered features

export const AIService = {
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
    const tokens = cleaned.split(/\s+/).filter(Boolean);
    const unique = Array.from(new Set(tokens));
    const complexity = tokens.length === 0 ? 0 : Math.min(1, unique.length / Math.max(1, tokens.length));
    const wordCount = tokens.length;
    const actionItems = (cleaned.split(/\n|\.|;/).map(s => s.trim()).filter(Boolean).slice(0,6)).filter(s => s.split(' ').length > 2).slice(0,4);
    const posWords = ['good','great','improve','positive','success','benefit','increase','win','helpful'];
    const negWords = ['bad','problem','issue','error','fail','difficult','bug','reduce','loss'];
    const lc = cleaned.toLowerCase();
    let score = 0;
    posWords.forEach(w => { if (lc.includes(w)) score += 1; });
    negWords.forEach(w => { if (lc.includes(w)) score -= 1; });
    const sentiment = Math.max(-1, Math.min(1, score / Math.max(1, (posWords.length+negWords.length)/8)));
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

  // Generate smart flashcards
  generateSmartFlashcards: (notes, userLearningStyle = 'visual') => {
    const flashcards = [];
    notes.forEach((note, index) => {
      const analysis = note.analysis || AIService.analyzeContentDeeply(note.content);
      const keywords = analysis.keyTopics && analysis.keyTopics.length ? analysis.keyTopics : AIService.extractKeywords(note.content);

      const cleanTitle = AIService.sanitizeText(note.title || '') || '';

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
        console.error('generateQuestionFromAnalysis failed', e);
      }

      if (analysis.actionItems && analysis.actionItems.length > 0) {
        const displayTitle = cleanTitle || AIService.sanitizeText(note.title || '') || '';
        flashcards.push(Object.assign({
          question: `What actionable steps are suggested in: "${displayTitle || 'this note'}"?`,
          answer: analysis.actionItems.map(i => `• ${i}`).join('\n'),
          hint: 'Focus on verbs and specific tasks.'
        }, baseMeta({ difficulty: Math.min(5, 2 + Math.ceil(analysis.complexity * 3)) })));
      }

      if (keywords && keywords.length > 0) {
        const top = keywords[0];
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

        const qKeywords = keywords.slice(0, Math.min(3, keywords.length));
        const summary = note.content.length > 180 ? note.content.substring(0, 180) + '...' : note.content;
        flashcards.push(Object.assign({
          question: `Explain the key concepts: ${qKeywords.join(', ')}`,
          answer: summary,
          hint: 'Summarize the definitions and relationships between these concepts.'
        }, baseMeta({ difficulty: Math.min(5, 1 + Math.ceil(analysis.complexity * 2)) })));
      }
    });

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

  // Generate mind map
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
        const connectionStrength = topicOverlap > 0 ? 0.5 : 0.1;
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

  // Helper functions
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

  generateQuestionFromAnalysis: (note, analysis) => {
    const text = (note.content || '').trim();
    const rawTitle = (note.title || '').trim();
    const title = AIService.sanitizeText(rawTitle) || '';
    const keywords = (analysis && analysis.keyTopics && analysis.keyTopics.length) ? analysis.keyTopics : [];

    if (analysis.actionItems && analysis.actionItems.length > 0) {
      const displayTitle = title || AIService.sanitizeText(rawTitle) || '';
      const q = `What are the next actionable steps recommended in ${displayTitle ? `"${displayTitle}"` : 'this note'}?`;
      const a = analysis.actionItems.map(i => `• ${i}`).join('\n');
      return { question: q, answer: a, hint: 'List the concrete steps or tasks suggested.' };
    }

    const topKeywords = keywords.slice(0, 3);
    if (topKeywords.length > 0) {
      const main = topKeywords[0];
      return {
        question: `What is ${main}? Explain briefly.`,
        answer: text.length > 150 ? text.substring(0, 150) + '...' : text,
        hint: `Describe the meaning and role of ${main} in the note.`
      };
    }

    const displayTitle = title || AIService.sanitizeText(rawTitle) || '';
    return {
      question: `Summarize the main point of ${displayTitle ? `"${displayTitle}"` : 'this note'}.`,
      answer: text.length > 200 ? text.substring(0, 200) + '...' : text,
      hint: 'State the thesis or core conclusion in one or two sentences.'
    };
  },

  // Mentor System
  MentorSystem: {
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

      const learningStyle = 'balanced';
      return {
        learningStyle,
        consistencyScore: Math.min(1, notes.length / 20),
        engagementLevel: Math.min(1, notes.filter(n => n.content.length > 100).length / Math.max(1, notes.length)),
        knowledgeDepth: Math.min(1, notes.reduce((sum, n) => sum + (n.analysis?.complexity || 0), 0) / Math.max(1, notes.length)),
        growthRate: 1,
        learningPatterns: {},
        preferredTopics: notes[0]?.analysis?.keyTopics || [],
        cognitivePattern: 'balanced',
        motivationPattern: 'achievement'
      };
    },

    determineIntent: (message) => {
      const msg = message.toLowerCase();
      if (msg.includes('how') && (msg.includes('learn') || msg.includes('study'))) return 'learning_method';
      if (msg.includes('goal') || msg.includes('achieve')) return 'goal_achievement';
      if (msg.includes('problem') || msg.includes('stuck')) return 'problem_solving';
      return 'general_advice';
    },

    processUserMessage: (message, context) => {
      try {
        const { notes = [], goals = [] } = context || {};
        const reply = `Thanks for sharing! I'm here to help you learn and grow. Keep creating notes and setting goals! 📚`;

        return {
          text: reply,
          type: 'mentor',
          timestamp: new Date().toISOString(),
          suggestedActions: ['Create a note', 'Set a goal', 'Review notes'],
          followUpQuestions: ['What would you like to learn?', 'Got a goal in mind?']
        };
      } catch (err) {
        console.error('Error in processUserMessage:', err);
        return {
          text: "Hey! I'm your AI mentor. What would you like to work on today?",
          type: 'mentor',
          timestamp: new Date().toISOString(),
          suggestedActions: ["Ask about learning", "Organize notes", "Set a goal"],
          followUpQuestions: ["What's on your mind?"]
        };
      }
    },

    generateAdaptiveChallenge: (userProfile, recentPerformance, notes) => {
      if (!notes || notes.length === 0) {
        return {
          id: `challenge_${Date.now()}`,
          title: 'First Note Creation',
          description: 'Create your first note',
          difficulty: 'beginner',
          xp: 10,
          timeEstimate: '10 minutes'
        };
      }
      return {
        id: `challenge_${Date.now()}`,
        title: 'Knowledge Building',
        description: 'Create and organize your notes',
        difficulty: 'medium',
        xp: 25,
        timeEstimate: '30 minutes'
      };
    },

    generateLearningPath: (userProfile, goals, currentProgress) => {
      return {
        level: 'beginner',
        path: [
          { step: 1, action: 'Create your first note', duration: '1 week', focus: 'foundation' },
          { step: 2, action: 'Connect related notes', duration: '1 week', focus: 'linking' },
          { step: 3, action: 'Generate flashcards', duration: '2 weeks', focus: 'review' }
        ],
        estimatedCompletion: '4 weeks',
        milestones: [
          { milestone: 'Create 5 notes', reward: '⭐ Starter Badge' },
          { milestone: 'Generate 10 flashcards', reward: '🎯 Learner Badge' }
        ]
      };
    },

    generateWeeklyReport: (notes, goals, challenges, userProfile) => {
      return {
        period: 'Weekly Report',
        metrics: {
          notesCreated: notes.length,
          goalsCompleted: 0,
          avgNoteLength: notes.length > 0 ? Math.round(notes.reduce((s, n) => s + n.content.length, 0) / notes.length) : 0
        },
        insights: ['Keep creating notes regularly', 'Your learning is on track!'],
        recommendations: ['Review your notes', 'Set a new goal']
      };
    }
  }
};
