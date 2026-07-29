/* ============================================
   MNG Bot — Chat View
   Q&A interface for all participants
   ============================================ */
import { useState, useRef, useEffect, useCallback } from 'react';
import { Icons } from '../components/Icons';
import { CONFIG, askQuestion, getAllQuestions, getParticipantQuestions } from '../api';
import { useToast } from '../components/Toast';
import { isGenericName } from '../utils/meetingStorage';

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatTime(date) {
  if (!(date instanceof Date)) date = new Date(date);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function getInitials(name) {
  if (!name) return '?';
  return name.split(' ').map(w => w[0]).join('').toUpperCase().substring(0, 2);
}

const statusIcons = {
  Resolved:   Icons.checkCircle,
  Partial:    Icons.alertTriangle,
  Unresolved: Icons.xCircle,
};

const STATUS_COLORS = {
  Resolved:   'var(--color-success)',
  Partial:    'var(--color-warning)',
  Unresolved: 'var(--color-danger)',
};

function normalizeStatus(s) {
  if (!s) return null;
  const lower = String(s).toLowerCase().trim();
  if (lower === 'resolved')   return 'Resolved';
  if (lower === 'partial')    return 'Partial';
  if (lower === 'unresolved') return 'Unresolved';
  return null;
}

function resolveSenderName(context) {
  if (context?.user_name && !isGenericName(context.user_name)) return context.user_name.trim();
  if (context?.participantName && !isGenericName(context.participantName)) return context.participantName.trim();
  try {
    const saved = localStorage.getItem('mng_user_name');
    if (saved && !isGenericName(saved)) return saved.trim();
  } catch {}
  return (context?.user_name && context.user_name.trim()) ? context.user_name.trim() : 'Zoom User';
}

export default function ChatView({ context, meetingInfo, onNavigate, onEndMeeting, onChangeCompany, pendingCount, onClosePanel }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [showWelcome, setShowWelcome] = useState(true);
  const messagesRef = useRef(null);
  const toast = useToast();

  const isHost = context?.is_host;

  // Restore participant's own chat history when joining/rejoining
  useEffect(() => {
    if (!context?.meeting_id) return;
    let isSubscribed = true;
    const fetchHistory = async () => {
      try {
        const pid = context.participant_id || context.session_id;
        const res = await getParticipantQuestions(context.meeting_id, pid, context.session_id);
        if (isSubscribed && res?.questions && res.questions.length > 0) {
          const loadedMsgs = [];
          res.questions.forEach(q => {
            if (q.question) {
              loadedMsgs.push({
                id: 'hist_q_' + (q.id || crypto.randomUUID()),
                type: 'user',
                sender: (!isGenericName(q.user_name || q.username)) ? (q.user_name || q.username).trim() : resolveSenderName(context),
                role: q.user_role || (isHost ? 'host' : 'participant'),
                text: q.question,
                timestamp: q.timestamp ? new Date(q.timestamp) : new Date(),
              });
            }
            if (q.answer) {
              loadedMsgs.push({
                id: 'hist_a_' + (q.id || crypto.randomUUID()),
                type: 'bot',
                sender: 'MNG Bot',
                text: q.answer,
                status: q.status,
                confidence: q.confidence_score,
                source: q.source_document,
                page: q.source_page,
                timestamp: q.timestamp ? new Date(q.timestamp) : new Date(),
              });
            }
          });
          if (loadedMsgs.length > 0) {
            setMessages(loadedMsgs);
            setShowWelcome(false);
          }
        }
      } catch (_) {}
    };
    fetchHistory();
    return () => { isSubscribed = false; };
  }, [context?.meeting_id, context?.participant_id, context?.session_id]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (messagesRef.current) {
      requestAnimationFrame(() => {
        messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
      });
    }
  }, [messages, isTyping]);

  const handleSend = async () => {
    const question = input.trim();
    if (!question || isTyping) return;

    setInput('');
    setShowWelcome(false);

    // Add user message
    const senderName = resolveSenderName(context);
    const userMsg = {
      id: crypto.randomUUID(),
      type: 'user',
      sender: senderName,
      participantName: senderName,
      role: context?.user_role || (isHost ? 'host' : 'participant'),
      text: question,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMsg]);

    // Show typing indicator
    setIsTyping(true);

    try {
      const result = await askQuestion(
        context.meeting_id,
        context.session_id,
        senderName,
        question,
        context?.user_role || (isHost ? 'host' : 'participant'),
        context?.participant_id,
        meetingInfo?.companyName || 'Biocon'
      );

      setIsTyping(false);

      const botMsg = {
        id: crypto.randomUUID(),
        type: 'bot',
        sender: 'MNG Bot',
        text: result.answer,
        status: result.status,
        confidence: result.confidence_score,
        source: result.source_document,
        page: result.source_page,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, botMsg]);

      // Refresh dashboard data in background for host
      if (isHost) {
        try {
          const data = await getAllQuestions(context.meeting_id);
          if (data?.questions && onNavigate) {
            // Trigger a refresh via parent
            window.__mngLastQuestionLogs = data.questions;
            window.dispatchEvent(new CustomEvent('mng-logs-updated', { detail: data.questions }));
          }
        } catch (_) {}
      }

    } catch (err) {
      setIsTyping(false);
      toast.error('Failed to get answer: ' + err.message);
    }
  };

  const handleSuggestionClick = (suggestion) => {
    setInput(suggestion);
    // Use a tiny delay so state updates, then auto-send
    setTimeout(() => {
      setInput('');
      setShowWelcome(false);

      const senderName = resolveSenderName(context);
      const userMsg = {
        id: crypto.randomUUID(),
        type: 'user',
        sender: senderName,
        participantName: senderName,
        role: context?.user_role || (isHost ? 'host' : 'participant'),
        text: suggestion,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, userMsg]);
      setIsTyping(true);

      askQuestion(
        context.meeting_id,
        context.session_id,
        senderName,
        suggestion,
        context?.user_role || (isHost ? 'host' : 'participant'),
        context?.participant_id
      )
        .then(result => {
          setIsTyping(false);
          const botMsg = {
            id: crypto.randomUUID(),
            type: 'bot',
            sender: 'MNG Bot',
            text: result.answer,
            status: result.status,
            confidence: result.confidence_score,
            source: result.source_document,
            page: result.source_page,
            timestamp: new Date(),
          };
          setMessages(prev => [...prev, botMsg]);

          if (isHost) {
            getAllQuestions(context.meeting_id).then(data => {
              if (data?.questions) {
                window.dispatchEvent(new CustomEvent('mng-logs-updated', { detail: data.questions }));
              }
            }).catch(() => {});
          }
        })
        .catch(err => {
          setIsTyping(false);
          toast.error('Failed to get answer: ' + err.message);
        });
    }, 0);
  };

  const handleCopy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Copied to clipboard');
    } catch {
      toast.info('Could not copy to clipboard');
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && input.trim()) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="chat">
      {/* Header */}
      <div className="app-header">
        <div className="app-header__left">
          <div className="app-header__logo">{Icons.bot}</div>
          <div>
            <span className="app-header__title">MNG Bot</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 1 }}>
              <span style={{ fontSize: 11, color: 'var(--color-accent-blue)', fontWeight: 600 }}>
                🏢 {meetingInfo?.companyName || 'Company'}
              </span>
              {isHost && onChangeCompany && (
                <button
                  className="btn btn--ghost btn--xs"
                  onClick={onChangeCompany}
                  style={{ fontSize: 10, padding: '1px 5px', height: 'auto', color: 'var(--color-accent-blue)', border: '1px solid rgba(79,124,255,0.3)', borderRadius: 4 }}
                  title="Change Company Knowledge Base"
                >
                  ✏️ Change
                </button>
              )}
            </div>
          </div>
        </div>
        <div className="app-header__right">
          <div className="app-header__meeting-badge">
            <span className="dot" />
            <span>Live</span>
          </div>
          <button className="btn btn--danger btn--sm" onClick={onEndMeeting} title="End Meeting">
            {Icons.power}
            <span>End</span>
          </button>
          {onClosePanel && (
            <button className="btn btn--ghost" onClick={onClosePanel} style={{ padding: 4, marginLeft: 4 }} title="Close Panel">
              {Icons.x}
            </button>
          )}
        </div>
      </div>

      {/* Host Tab Nav */}
      {isHost && (
        <div className="chat__header-nav">
          <div className="tab-nav">
            <button className="tab-nav__item tab-nav__item--active" onClick={() => onNavigate('chat')}>
              {Icons.messageSquare}
              <span>Chat</span>
            </button>
            <button className="tab-nav__item" onClick={() => onNavigate('dashboard')}>
              {Icons.layoutDashboard}
              <span>Dashboard</span>
              {pendingCount > 0 && (
                <span className="tab-nav__badge">{pendingCount}</span>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Messages Area */}
      <div className="chat__messages" ref={messagesRef}>
        {/* Welcome State */}
        {showWelcome && messages.length === 0 && (
          <div className="chat__welcome">
            <div className="chat__welcome-icon">
              {Icons.sparkles}
            </div>
            <h3 className="chat__welcome-title">Ask about {meetingInfo?.companyName || "the company"}</h3>
            <p className="chat__welcome-text">
              Type your questions in the input field below to search the loaded documents.
            </p>
          </div>
        )}

        {/* Message List */}
        {messages.map(msg => (
          <div key={msg.id} className={`message message--${msg.type}`}>
            <div className="message__avatar">
              {msg.type === 'user'
                ? getInitials(msg.sender)
                : <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{Icons.bot}</span>
              }
            </div>
            <div className="message__content">
              <div className="message__header">
                <span className="message__name">{msg.sender || msg.participantName || (msg.type === 'user' ? 'User' : 'MNG Bot')}</span>
                <span className="message__time">{formatTime(msg.timestamp)}</span>
              </div>
              <div className="message__bubble">
                <p>{msg.text}</p>
              </div>
              {msg.type === 'bot' && (
                <>
                  {/* Status badge — shows how well the question was answered */}
                  {(() => {
                    const ns = normalizeStatus(msg.status);
                    if (!ns) return null;
                    return (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          fontSize: 11, padding: '2px 8px', borderRadius: 10,
                          background: ns === 'Resolved' ? 'rgba(34,197,94,0.12)' : ns === 'Partial' ? 'rgba(251,191,36,0.12)' : 'rgba(239,68,68,0.12)',
                          color: STATUS_COLORS[ns],
                          border: '1px solid',
                          borderColor: ns === 'Resolved' ? 'rgba(34,197,94,0.3)' : ns === 'Partial' ? 'rgba(251,191,36,0.3)' : 'rgba(239,68,68,0.3)',
                        }}>
                          <span style={{ width: 12, height: 12, display: 'flex', alignItems: 'center' }}>{statusIcons[ns]}</span>
                          {ns}
                        </span>
                      </div>
                    );
                  })()}
                  <div className="message__footer">
                    <div style={{ flex: 1 }} />
                    <div className="message__actions">
                      <button className="message__action-btn" title="Copy" onClick={() => handleCopy(msg.text)}>
                        {Icons.copy}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        ))}

        {/* Typing Indicator */}
        {isTyping && (
          <div className="typing-indicator">
            <div className="message__avatar" style={{
              background: 'var(--color-bg-tertiary)',
              border: '1px solid var(--glass-border)',
              color: 'var(--color-accent-blue)',
            }}>
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{Icons.bot}</span>
            </div>
            <div className="typing-indicator__dots">
              <div className="typing-indicator__dot" />
              <div className="typing-indicator__dot" />
              <div className="typing-indicator__dot" />
            </div>
          </div>
        )}
      </div>

      {/* Input Bar */}
      <div className="chat-input-bar">
        <input
          type="text"
          className="chat-input-bar__field"
          placeholder="Ask about the documents..."
          autoComplete="off"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button
          className="chat-input-bar__send"
          disabled={!input.trim() || isTyping}
          onClick={handleSend}
          title="Send"
        >
          {Icons.send}
        </button>
      </div>
    </div>
  );
}
