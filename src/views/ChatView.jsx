/* ============================================
   MNG Bot — Chat View
   Q&A interface for all participants and hosts.
   
   Uses context.meeting_id (user-entered) for ALL API calls.
   ============================================ */
import { useState, useRef, useEffect } from 'react';
import { Icons } from '../components/Icons';
import { askQuestion, getAllQuestions, getParticipantQuestions } from '../api';
import { useToast } from '../components/Toast';

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

export default function ChatView({ context, meetingInfo, onNavigate, onEndMeeting, onChangeCompany, pendingCount }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [showWelcome, setShowWelcome] = useState(true);
  const messagesRef = useRef(null);
  const toast = useToast();

  const isHost = context?.is_host || context?.isHost;
  const meetingId = context?.meeting_id;
  const userName = context?.user_name || 'User';
  const userRole = context?.user_role || (isHost ? 'host' : 'participant');
  const sessionId = context?.session_id;

  // Restore participant's own chat history when joining/rejoining
  useEffect(() => {
    if (!meetingId) return;

    let isSubscribed = true;
    const fetchHistory = async () => {
      try {
        const res = await getParticipantQuestions(meetingId, sessionId, sessionId);
        if (isSubscribed && res?.questions && res.questions.length > 0) {
          const loadedMsgs = [];
          res.questions.forEach(q => {
            if (q.question) {
              loadedMsgs.push({
                id: 'hist_q_' + (q.id || crypto.randomUUID()),
                type: 'user',
                sender: q.user_name || q.username || userName,
                role: q.user_role || userRole,
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
  }, [meetingId, sessionId]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (messagesRef.current) {
      requestAnimationFrame(() => {
        messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
      });
    }
  }, [messages, isTyping]);

  const handleSend = async (overrideText = null) => {
    const question = (typeof overrideText === 'string' ? overrideText : input).trim();
    if (!question || isTyping) return;

    if (!meetingId) {
      toast.error('Meeting ID is missing.');
      return;
    }

    if (!sessionId) {
      toast.error('Session expired.');
      return;
    }

    setInput('');
    setShowWelcome(false);

    const userMsg = {
      id: crypto.randomUUID(),
      type: 'user',
      sender: userName,
      role: userRole,
      text: question,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMsg]);
    setIsTyping(true);

    try {
      const result = await askQuestion(
        meetingId,
        sessionId,
        userName,
        question,
        userRole,
        null,
        meetingInfo?.companyName || 'Company'
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

      // Refresh dashboard data in background (host only)
      if (isHost) {
        try {
          const data = await getAllQuestions(meetingId);
          if (data?.questions) {
            window.dispatchEvent(new CustomEvent('mng-logs-updated', {
              detail: { meeting_id: meetingId, questions: data.questions }
            }));
          }
        } catch (_) {}
      }

    } catch (err) {
      setIsTyping(false);
      toast.error('Failed to get answer: ' + err.message);
    }
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
              <span style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>
                • {meetingId}
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
          <span style={{ fontSize: 11, color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: 4, marginRight: 8 }}>
            {Icons.user} {userName}
          </span>
          <div className="app-header__meeting-badge">
            <span className="dot" />
            <span>Live</span>
          </div>
          {isHost && (
            <button className="btn btn--danger btn--sm" onClick={onEndMeeting} title="End Meeting">
              {Icons.power}
              <span>End</span>
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
                <span className="message__name">{msg.sender || (msg.type === 'user' ? 'User' : 'MNG Bot')}</span>
                <span className="message__time">{formatTime(msg.timestamp)}</span>
              </div>
              <div className="message__bubble">
                <p>{msg.text}</p>
              </div>
              {msg.type === 'bot' && (
                <>
                  {/* Status badge */}
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
          onClick={() => handleSend()}
          title="Send"
        >
          {Icons.send}
        </button>
      </div>
    </div>
  );
}
