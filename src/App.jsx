import { useEffect, useState, useRef, useCallback } from "react";
import {
  initZoom,
  isZoomReady,
  getMeetingContext,
  onMeetingStarted,
  onMeetingEnded,
} from "./zoom";
import { startMeeting, endMeeting, askQuestion } from "./api";

const COMPANIES = ["Pfizer", "Biocon"];

// ─── Are we inside the Zoom sidebar iframe? ───────────────────────────────────
// Check 1: classic iframe detection
// Check 2: ngrok URL = always served inside Zoom sidebar
const _inIframe = window.self !== window.top;
const _onNgrok  = window.location.hostname.includes("ngrok");
const isInZoom  = _inIframe || _onNgrok;

export default function App() {
  const [ctx,       setCtx]       = useState(null);
  const [company,   setCompany]   = useState("Pfizer");
  const [started,   setStarted]   = useState(false);
  const [status,    setStatus]    = useState("idle");   // idle | loading | active | ended | error
  const [messages,  setMessages]  = useState([]);
  const [input,     setInput]     = useState("");
  const [thinking,  setThinking]  = useState(false);
  const [errMsg,    setErrMsg]    = useState("");
  const [open,      setOpen]      = useState(false);
  const [unread,    setUnread]    = useState(0);

  const sessionId = useRef(`session-${Date.now()}`);
  const bottomRef = useRef(null);
  // Keep a ref to ctx so callbacks defined once can always read the latest value
  const ctxRef    = useRef(null);

  // ── Auto-scroll to bottom on new messages ──────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end", inline: "nearest" });
  }, [messages, thinking]);

  // ── Unread badge (only in browser / float mode) ────────────────────────────
  useEffect(() => {
    if (!open && messages.length > 0 && messages[messages.length - 1].role === "ai") {
      setUnread((u) => u + 1);
    }
  }, [messages]);

  // ── Start meeting session on backend ──────────────────────────────────────
  const handleStart = useCallback(async (meetingCtx, chosenCompany) => {
    const resolvedCtx     = meetingCtx || ctxRef.current;
    const resolvedCompany = chosenCompany || company;

    if (!resolvedCtx) {
      setErrMsg("Meeting context not available yet. Please wait a moment and try again.");
      setStatus("error");
      return;
    }

    try {
      setStatus("loading");
      setErrMsg("");
      await startMeeting(resolvedCtx.meeting_id, resolvedCompany);
      setStarted(true);
      setStatus("active");
      setMessages([{
        role:   "ai",
        text:   `✅ Session started for ${resolvedCompany}. Documents loaded. Ask me anything!`,
        status: "resolved",
      }]);
    } catch (err) {
      setStatus("error");
      setErrMsg(err.message || "Could not connect to backend");
    }
  }, [company]);

  // ── Zoom SDK initialisation (runs once on mount) ───────────────────────────
  useEffect(() => {
    let cancelled = false;

    (async () => {
      // 1. Init Zoom SDK
      await initZoom();

      if (cancelled) return;

      // 2. Get meeting context (works whether meeting just started or was already running)
      const info = await getMeetingContext();
      if (cancelled) return;

      ctxRef.current = info;
      setCtx(info);

      // 3. If we're inside Zoom and a meeting is already running → auto-start
      if (isZoomReady() && info.meeting_id && !info.meeting_id.startsWith("test-")) {
        await handleStart(info, company);
      }

      // 4. Listen for future meeting lifecycle events
      onMeetingStarted(async () => {
        const freshInfo = await getMeetingContext();
        ctxRef.current  = freshInfo;
        setCtx(freshInfo);
        await handleStart(freshInfo, company);
      });

      onMeetingEnded(async () => {
        const currentCtx = ctxRef.current;
        if (currentCtx) {
          try { await endMeeting(currentCtx.meeting_id); } catch (_) {}
        }
        setStarted(false);
        setStatus("ended");
        setMessages([]);
      });
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Send a question to the backend ─────────────────────────────────────────
  const sendMessage = async () => {
    if (!input.trim() || thinking) return;
    const currentCtx = ctxRef.current;
    if (!currentCtx) return;

    const question = input.trim();
    setMessages((prev) => [...prev, { role: "user", text: question }]);
    setInput("");
    setThinking(true);

    try {
      const result = await askQuestion(
        currentCtx.meeting_id,
        sessionId.current,
        question,
        currentCtx.user_name,
        currentCtx.user_role,
      );
      setMessages((prev) => [
        ...prev,
        { role: "ai", text: result.text, status: result.status },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "ai", text: `⚠️ Error: ${err.message}`, status: "error" },
      ]);
    } finally {
      setThinking(false);
    }
  };

  const handleOpen = () => { setOpen(true); setUnread(0); };

  const STATUS_COLOR = {
    resolved:   "#4ade80",
    partial:    "#facc15",
    unresolved: "#f87171",
    error:      "#f87171",
  };

  // ── Shared chat UI ─────────────────────────────────────────────────────────
  const chatContent = (
    <>
      {/* ── Setup screen (company selector + start button) ── */}
      {!started && status !== "ended" && (
        <div className="panel-setup">
          <p className="setup-label">Select Company</p>
          <div className="company-grid">
            {COMPANIES.map((c) => (
              <button
                key={c}
                className={`company-btn ${company === c ? "selected" : ""}`}
                onClick={() => setCompany(c)}
              >
                {c}
              </button>
            ))}
          </div>

          {errMsg && <div className="error-box">⚠️ {errMsg}</div>}

          <button
            className="start-btn"
            onClick={() => handleStart(ctxRef.current, company)}
            disabled={status === "loading"}
          >
            {status === "loading" ? <span className="spinner" /> : "▶ Start Meeting"}
          </button>

          {status === "loading" && (
            <p className="loading-note">Loading documents from SharePoint…</p>
          )}
        </div>
      )}

      {/* ── Ended screen ── */}
      {status === "ended" && (
        <div className="panel-setup" style={{ textAlign: "center" }}>
          <div style={{ fontSize: 36 }}>✅</div>
          <p style={{ color: "#94a3b8", marginTop: 8 }}>Meeting ended. Session cleared.</p>
        </div>
      )}

      {/* ── Active chat ── */}
      {started && (
        <>
          <div className="chat-area">
            {messages.map((m, i) => (
              <div key={i} className={`bubble-row ${m.role}`}>
                <div className={`bubble ${m.role}`}>
                  <p>{m.text}</p>
                  {m.status && m.role === "ai" && (
                    <span
                      className="status-tag"
                      style={{ color: STATUS_COLOR[m.status] }}
                    >
                      ● {m.status}
                    </span>
                  )}
                </div>
              </div>
            ))}

            {thinking && (
              <div className="bubble-row ai">
                <div className="bubble ai thinking">
                  <span /><span /><span />
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          <div className="input-bar">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
              placeholder="Ask about the documents…"
              className="chat-input"
              disabled={thinking}
            />
            <button
              className="send-btn"
              onClick={sendMessage}
              disabled={!input.trim() || thinking}
            >
              {thinking ? <span className="spinner" style={{ width: 16, height: 16 }} /> : "➤"}
            </button>
          </div>
        </>
      )}
    </>
  );

  // ── ZOOM MODE: full sidebar ────────────────────────────────────────────────
  if (isInZoom) {
    return (
      <div className="zoom-shell">
        <div className="zoom-header">
          <span className="logo">🤖</span>
          <span className="title">Meeting AI</span>
          {ctx && (
            <span className="user-badge">
              <span className="dot" />
              {ctx.user_name}
            </span>
          )}
        </div>
        {chatContent}
      </div>
    );
  }

  // ── BROWSER MODE: floating widget ─────────────────────────────────────────
  return (
    <>
      {open && (
        <div className="float-panel">
          <div className="float-header">
            <div className="float-header-left">
              <span className="logo">🤖</span>
              <span className="title">Meeting AI</span>
              {ctx && (
                <span className="user-badge">
                  <span className="dot" />
                  {ctx.user_name}
                </span>
              )}
            </div>
            <button className="close-btn" onClick={() => setOpen(false)}>✕</button>
          </div>
          {chatContent}
        </div>
      )}

      <button className="fab" onClick={open ? () => setOpen(false) : handleOpen}>
        {open ? "✕" : "🤖"}
        {!open && unread > 0 && <span className="fab-badge">{unread}</span>}
      </button>
    </>
  );
}
