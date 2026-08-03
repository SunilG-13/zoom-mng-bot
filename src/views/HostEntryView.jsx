/* ============================================
   MNG Bot — Host Entry View

   Host enters:
     - Name
     - Meeting ID (e.g. HONDA001)
     - Company Name (e.g. Honda)

   On "Start Meeting":
     POST /start_meeting → { meeting_id, company, host_name }
     On success → navigate to Chat/Dashboard (NEVER shows waiting)
   ============================================ */
import { useState, useRef } from 'react';
import { Icons } from '../components/Icons';
import { startMeeting } from '../api';
import { useToast } from '../components/Toast';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

export default function HostEntryView({ onMeetingStarted, onBack }) {
  const [hostName, setHostName] = useState('');
  const [meetingId, setMeetingId] = useState('');
  const [company, setCompany] = useState('');
  const [screen, setScreen] = useState('form'); // form | loading | done
  const [loadSteps, setLoadSteps] = useState([0, 0, 0, 0, 0]);
  const [doneMsg, setDoneMsg] = useState('');
  const cancelRef = useRef(false);
  const toast = useToast();

  const canStart = hostName.trim().length > 0
    && meetingId.trim().length > 0
    && company.trim().length > 0;

  // ─── Start Meeting ──────────────────────────────────────────────
  const handleStartMeeting = async () => {
    if (!canStart) return;
    cancelRef.current = false;

    const finalName = hostName.trim();
    const finalMeetingId = meetingId.trim();
    const finalCompany = company.trim();

    setScreen('loading');

    // Animate loading steps
    const stepDurations = [700, 900, 800, 700, 500];
    for (let i = 0; i < 5; i++) {
      if (cancelRef.current) return;
      setLoadSteps(prev => { const n = [...prev]; n[i] = 1; return n; });
      await sleep(stepDurations[i]);
      setLoadSteps(prev => { const n = [...prev]; n[i] = 2; return n; });
    }

    try {
      const result = await startMeeting(finalMeetingId, finalCompany, finalName);
      setDoneMsg(result.message || `${finalCompany} knowledge base loaded!`);
      setScreen('done');
    } catch (err) {
      toast.error('Failed to start meeting: ' + err.message);
      setScreen('form');
      setLoadSteps([0, 0, 0, 0, 0]);
    }
  };

  // ─── Navigate to Chat after success ─────────────────────────────
  const handleOpenChat = () => {
    if (!onMeetingStarted) return;
    const finalMeetingId = meetingId.trim();
    const finalCompany = company.trim();
    const finalName = hostName.trim();

    onMeetingStarted({
      meeting_id: finalMeetingId,
      company: finalCompany,
      host_name: finalName,
    });
  };

  const stepLabels = ['Locating folder', 'Reading PDFs', 'Processing text', 'Building index', 'Ready'];

  // ════════════════════════════════════════════════════════════════
  // SCREEN: Form
  // ════════════════════════════════════════════════════════════════
  if (screen === 'form') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--color-bg-primary)' }}>
        <div className="app-header">
          <div className="app-header__left">
            <button
              className="btn btn--ghost btn--sm"
              onClick={onBack}
              style={{ padding: '4px 8px', marginRight: 4 }}
              title="Back"
            >
              ← Back
            </button>
            <div className="app-header__logo">{Icons.bot}</div>
            <span className="app-header__title">Host Setup</span>
          </div>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '24px 16px', overflowY: 'auto' }}>
          <h2 style={{ fontSize: 18, color: 'var(--color-text-primary)', marginBottom: 6 }}>Start a Meeting 🚀</h2>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 20 }}>
            Enter your details and a unique Meeting ID for participants to join.
          </p>

          {/* Host Name */}
          <label style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 6, display: 'block' }}>
            Your Name
          </label>
          <div className="search-input" style={{ marginBottom: 16 }}>
            <span className="search-input__icon">{Icons.user}</span>
            <input
              type="text"
              placeholder="e.g. Sunil"
              value={hostName}
              onChange={e => setHostName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && canStart && handleStartMeeting()}
              autoFocus
            />
          </div>

          {/* Meeting ID */}
          <label style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 6, display: 'block' }}>
            Meeting ID
          </label>
          <div className="search-input" style={{ marginBottom: 16 }}>
            <span className="search-input__icon">{Icons.fileText}</span>
            <input
              type="text"
              placeholder="e.g. HONDA001"
              value={meetingId}
              onChange={e => setMeetingId(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && canStart && handleStartMeeting()}
            />
          </div>

          {/* Company Name */}
          <label style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 6, display: 'block' }}>
            Company Name
          </label>
          <div className="search-input" style={{ marginBottom: 20 }}>
            <span className="search-input__icon">{Icons.folder}</span>
            <input
              type="text"
              placeholder="e.g. Pfizer, Biocon..."
              value={company}
              onChange={e => setCompany(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && canStart && handleStartMeeting()}
            />
          </div>

          <button
            className="btn btn--primary btn--lg btn--full"
            disabled={!canStart}
            onClick={handleStartMeeting}
          >
            {Icons.power} Start Meeting
          </button>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════
  // SCREEN: Loading
  // ════════════════════════════════════════════════════════════════
  if (screen === 'loading') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg-primary)', padding: 24 }}>
        <div className="spinner spinner--lg" style={{ marginBottom: 20 }} />
        <h3 style={{ fontSize: 16, color: 'var(--color-text-primary)', marginBottom: 24 }}>
          Loading {company.trim()} Knowledge Base...
        </h3>
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {stepLabels.map((label, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, flexShrink: 0,
                background: loadSteps[i] === 2 ? 'var(--color-success)' : loadSteps[i] === 1 ? 'var(--color-accent-blue)' : 'var(--color-bg-tertiary)',
                color: loadSteps[i] > 0 ? 'white' : 'var(--color-text-muted)',
                transition: 'all 0.3s',
              }}>
                {loadSteps[i] === 2 ? '✓' : loadSteps[i] === 1 ? '...' : i + 1}
              </div>
              <span style={{ fontSize: 13, color: loadSteps[i] === 2 ? 'var(--color-success)' : loadSteps[i] === 1 ? 'var(--color-accent-blue)' : 'var(--color-text-muted)' }}>
                {label}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════
  // SCREEN: Done ✅
  // ════════════════════════════════════════════════════════════════
  if (screen === 'done') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg-primary)', padding: 24 }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%',
          background: 'rgba(34,197,94,0.15)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--color-success)', fontSize: 28, marginBottom: 16,
        }}>✓</div>
        <h3 style={{ fontSize: 18, color: 'var(--color-text-primary)', marginBottom: 8, textAlign: 'center' }}>
          {company.trim()} Ready!
        </h3>
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)', textAlign: 'center', marginBottom: 8 }}>
          {doneMsg}
        </p>
        <p style={{ fontSize: 12, color: 'var(--color-accent-blue)', textAlign: 'center', marginBottom: 28 }}>
          Meeting ID: <strong>{meetingId.trim()}</strong> — Share this with participants
        </p>
        <button className="btn btn--primary btn--lg btn--full" onClick={handleOpenChat}>
          {Icons.messageSquare} Open Chat + Dashboard
        </button>
      </div>
    );
  }

  return null;
}
