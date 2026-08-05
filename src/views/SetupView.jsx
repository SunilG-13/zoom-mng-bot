import { useState, useRef, useEffect } from 'react';
import { Icons } from '../components/Icons';
import { CONFIG, startMeeting } from '../api';
import { useToast } from '../components/Toast';
import { saveMeetingId, isGenericName } from '../utils/meetingStorage';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

export default function SetupView({ context, onHostMeetingStarted, onClosePanel }) {
  const isHost = context?.isHost || context?.is_host;
  
  // ── Only hosts see Setup. Participants should never reach here. ──
  if (!isHost) {
    return null;
  }

  // ── Auto-detected username from Zoom SDK / storage / fallback ──
  const autoDisplayName = (!isGenericName(context?.user_name))
    ? context.user_name
    : (localStorage.getItem('mng_user_name') || 'Zoom User');

  const [screen, setScreen] = useState('host'); // host | host-loading | host-done
  const [company, setCompany] = useState('');
  const [hostDisplayName, setHostDisplayName] = useState(autoDisplayName);
  const [loadSteps, setLoadSteps] = useState([0, 0, 0, 0, 0]); // 0=pending 1=active 2=done
  const [doneMsg, setDoneMsg] = useState('');
  const cancelRef = useRef(false);
  const toast = useToast();

  // Sync auto-detected username if context updates after initial render
  useEffect(() => {
    if (context?.user_name && !isGenericName(context.user_name)) {
      setHostDisplayName(context.user_name);
    }
  }, [context?.user_name]);

  const canStart = company.trim().length > 0 && hostDisplayName.trim().length > 0;
  const [startedMeetingId, setStartedMeetingId] = useState(null);

  // ─── HOST: Start Meeting ────────────────────────────────────────────────────
  const handleStartMeeting = async () => {
    if (!canStart) return;
    cancelRef.current = false;
    const finalHostName = hostDisplayName.trim() || 'Zoom User';

    // Persist edited display name under host key
    try {
      localStorage.setItem('mng_host_user_name', finalHostName);
    } catch (_) {}

    if (context) {
      context.user_name = finalHostName;
    }

    setScreen('host-loading');

    // Animate steps one by one
    const stepDurations = [700, 900, 800, 700, 500];
    for (let i = 0; i < 5; i++) {
      setLoadSteps(prev => { const n = [...prev]; n[i] = 1; return n; });
      await sleep(stepDurations[i]);
      setLoadSteps(prev => { const n = [...prev]; n[i] = 2; return n; });
    }

    try {
      let activeId = context?.meetingUUID || context?.meeting_id || context?.meetingNumber;
      if (!activeId) {
        activeId = `mng_host_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      }
      const result = await startMeeting(activeId, company.trim(), finalHostName);
      const finalId = result?.meeting_id || activeId;
      setStartedMeetingId(finalId);
      saveMeetingId(finalId);
      setDoneMsg(result.message || `${company.trim()} knowledge base loaded!`);
      setScreen('host-done');
    } catch (err) {
      toast.error('Failed: ' + err.message);
      setScreen('host');
      setLoadSteps([0, 0, 0, 0, 0]);
    }
  };

  // ─── HOST: Open Chat after success ─────────────────────────────────────────
  const handleOpenChat = () => {
    const co = company.trim();
    if (!co || !onHostMeetingStarted) return;
    const finalId = startedMeetingId || context?.meetingUUID || context?.meeting_id || context?.meetingNumber;
    if (finalId) {
      saveMeetingId(finalId);
    }
    const finalHostName = hostDisplayName.trim() || 'Zoom User';
    // Pass the real or edited display name
    onHostMeetingStarted({ id: co.toLowerCase().replace(/\s+/g, '_'), name: co }, finalHostName, finalId);
  };

  const stepLabels = ['Locating folder', 'Reading PDFs', 'Processing text', 'Building index', 'Ready'];

  // Screen: Host Enter Display Name & Company
  if (screen === 'host') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--color-bg-primary)' }}>
        <div className="app-header">
          <div className="app-header__left">
            <div className="app-header__logo">{Icons.bot}</div>
            <span className="app-header__title">MNG Bot — Host</span>
          </div>
          {/* Show real or edited display name */}
          <div className="app-header__right">
            <span style={{ fontSize: 11, color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
              {Icons.user} {hostDisplayName.trim() || 'Zoom User'}
            </span>
          </div>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '24px 16px', overflowY: 'auto' }}>
          <h2 style={{ fontSize: 18, color: 'var(--color-text-primary)', marginBottom: 6 }}>Start Meeting 🚀</h2>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 20 }}>
            Confirm your display name and enter company name to start.
          </p>

          <label style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 6, display: 'block' }}>
            Your Display Name
          </label>
          <div className="search-input" style={{ marginBottom: 16 }}>
            <span className="search-input__icon">{Icons.user}</span>
            <input
              type="text"
              placeholder="e.g. Sunil Kumar"
              value={hostDisplayName}
              onChange={e => setHostDisplayName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && canStart && handleStartMeeting()}
            />
          </div>

          <label style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 6, display: 'block' }}>
            Company Name
          </label>
          <div className="search-input" style={{ marginBottom: 20 }}>
            <span className="search-input__icon">{Icons.folder}</span>
            <input
              type="text"
              placeholder="e.g. Pfizer, Biocon, Novartis..."
              value={company}
              onChange={e => setCompany(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && canStart && handleStartMeeting()}
              autoFocus
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

  // Screen: Host Loading
  if (screen === 'host-loading') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg-primary)', padding: 24 }}>
        <div className="spinner spinner--lg" style={{ marginBottom: 20 }} />
        <h3 style={{ fontSize: 16, color: 'var(--color-text-primary)', marginBottom: 24 }}>
          Loading {company} Knowledge Base...
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

  // Screen: Host Done
  if (screen === 'host-done') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg-primary)', padding: 24 }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%',
          background: 'rgba(34,197,94,0.15)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--color-success)', fontSize: 28, marginBottom: 16,
        }}>✓</div>
        <h3 style={{ fontSize: 18, color: 'var(--color-text-primary)', marginBottom: 8, textAlign: 'center' }}>
          {company} Ready!
        </h3>
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)', textAlign: 'center', marginBottom: 28 }}>
          {doneMsg}
        </p>
        <button className="btn btn--primary btn--lg btn--full" onClick={handleOpenChat}>
          {Icons.messageSquare} Open Chat + Dashboard
        </button>
      </div>
    );
  }

  return null;
}
