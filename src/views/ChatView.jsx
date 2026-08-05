import { useState, useRef, useEffect } from 'react';
import { Icons } from '../components/Icons';
import { askQuestion, getAllQuestions, getParticipantQuestions, CONFIG } from '../api';
import { useToast } from '../components/Toast';

function parseDate(dateVal) {
  if (!dateVal) return new Date();
  if (dateVal instanceof Date) return dateVal;
  
  if (typeof dateVal === 'number') return new Date(dateVal);

  if (typeof dateVal === 'string') {
    let str = dateVal.trim();
    if (/^\d+$/.test(str)) {
      return new Date(parseInt(str, 10));
    }
    // If backend returns UTC ISO string without 'Z' or offset, append 'Z' so browser converts UTC to Local timezone
    if (!str.endsWith('Z') && !str.includes('+') && !/-\d{2}:\d{2}$/.test(str)) {
      str = str.replace(' ', 'T') + 'Z';
    }
    const d = new Date(str);
    if (!isNaN(d.getTime())) return d;
  }

  return new Date();
}

function formatTime(dateVal) {
  const date = parseDate(dateVal);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
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

function normalizeStatus(s) {
  if (!s) return null;
  const lower = String(s).toLowerCase().trim();
  if (lower === 'resolved')   return 'Resolved';
  if (lower === 'partial')    return 'Partial';
  if (lower === 'unresolved') return 'Unresolved';
  return null;
}

export default function ChatView({ context, meetingInfo }) {
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
      toast.info('Could not copy');
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && input.trim()) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="chat bg-[#2B2D33] h-full flex flex-col min-w-0">
      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto px-3 sm:px-5 py-4 sm:py-6 flex flex-col gap-3.5" ref={messagesRef}>
        {/* Welcome State */}
        {showWelcome && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 sm:py-12 px-3 text-center my-auto">
            <div className="w-[40px] h-[40px] sm:w-[55px] sm:h-[55px] p-1 rounded-[14px] sm:rounded-[18px] bg-[#2777FF] flex items-center justify-center text-[24px] sm:text-[32px] mb-3.5 text-white shadow-[0_8px_24px_rgba(39,119,255,0.4)]">
              {Icons.sparkles}
            </div>
            <h3 className="text-base sm:text-[20px] font-bold text-white mb-1.5 leading-snug">
              Clinical Drug Intelligence — {meetingInfo?.companyName || "Company"}
            </h3>
            <p className="text-xs sm:text-[13px] text-[#9CA3B6] max-w-[440px] mb-5 leading-relaxed">
              Ask questions to query the ingested drug monographs, clinical reports, and dosage guidelines.
            </p>
          </div>
        )}

        {/* Message List */}
        {messages.map(msg => (
          <div key={msg.id} className={`message message--${msg.type}`}>
            <div className="message__avatar">
              {msg.type === 'user'
                ? getInitials(msg.sender)
                : <span className="flex items-center justify-center w-[18px] h-[18px]">{Icons.bot}</span>
              }
            </div>
            <div className="message__content">
              <div className="message__header">
                <span className="message__name">{msg.sender || (msg.type === 'user' ? 'User' : 'MNG Bot')}</span>
                <span className="message__time">{formatTime(msg.timestamp)}</span>
              </div>
              <div className="message__bubble">
                <p className="m-0">{msg.text}</p>
              </div>

              {msg.type === 'bot' && (
                <div className="mt-2 flex flex-col gap-1.5">
                  {(msg.source || msg.confidence) && (
                    <div className="flex items-center flex-wrap gap-1.5 text-[10px] sm:text-[11px] text-[#9CA3B6]">
                      {msg.source && (
                        <span className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10 truncate max-w-[200px]">
                          📄 {msg.source} {msg.page ? `(p. ${msg.page})` : ''}
                        </span>
                      )}
                      {msg.confidence && (
                        <span className="px-2 py-0.5 rounded-md bg-[#2777FF]/15 text-[#82B4FF] font-semibold">
                          🎯 {Math.round(msg.confidence * 100)}% match
                        </span>
                      )}
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    {(() => {
                      const ns = normalizeStatus(msg.status);
                      if (!ns) return <div />;
                      return (
                        <span className={`status-badge status-badge--${ns.toLowerCase()}`}>
                          <span className="w-3 h-3 flex items-center">{statusIcons[ns]}</span>
                          {ns}
                        </span>
                      );
                    })()}

                    <button 
                      onClick={() => handleCopy(msg.text)}
                      className="bg-transparent border-0 text-[#9CA3B6] hover:text-white cursor-pointer p-1 transition-colors"
                      title="Copy text"
                    >
                      {Icons.copy}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}

        {isTyping && (
          <div className="message message--bot">
            <div className="message__avatar">
              <span className="flex items-center justify-center w-[18px] h-[18px]">{Icons.bot}</span>
            </div>
            <div className="message__content">
              <div className="message__bubble flex items-center gap-1.5 px-4 py-3">
                <div className="spinner spinner--sm border-t-[#2777FF]" />
                <span className="text-[12px] sm:text-[13px] text-[#9CA3B6]">Analyzing monograph data...</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Floating Dark Input Bar */}
      <div className="px-3 sm:px-5 py-3 sm:py-4 bg-[#363B48] border-t border-white/5">
        <div className="chat-input-bar">
          <input
            type="text"
            className="chat-input-bar__field"
            placeholder={`Ask about ${meetingInfo?.companyName || 'documents'}...`}
            autoComplete="off"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button
            className="chat-input-bar__send"
            disabled={!input.trim() || isTyping}
            onClick={() => handleSend()}
            title="Send Question"
          >
            {Icons.send}
          </button>
        </div>
      </div>
    </div>
  );
}
