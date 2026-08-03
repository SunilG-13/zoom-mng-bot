/* ============================================
   MNG Bot — Waiting View

   Shows when participant joins before host has started.
   Polls GET /status/{meeting_id} until host starts.
   Once active → auto-navigates participant to Chat.
   
   STRICT ISOLATION: Only checks the user-entered meeting_id.
   Never falls back to discovery or guessing.
   ============================================ */
import { useEffect, useState, useRef } from 'react';
import { checkMeetingStatusById } from '../api';
import { Icons } from '../components/Icons';

export default function WaitingView({ meetingId, participantName, onMeetingActive, onBack }) {
  const [statusMsg, setStatusMsg] = useState('Checking host status...');
  const [isJoining, setIsJoining] = useState(false);
  const onMeetingActiveRef = useRef(onMeetingActive);
  onMeetingActiveRef.current = onMeetingActive;

  useEffect(() => {
    let isMounted = true;
    let timer = null;

    if (!meetingId) {
      console.warn('⏳ WaitingView: No meetingId provided — skipping polling');
      setStatusMsg('No Meeting ID provided.');
      return;
    }

    console.log(`⏳ WaitingView: Polling for meetingId="${meetingId}"`);

    const checkStatus = async () => {
      try {
        const res = await checkMeetingStatusById(meetingId);
        console.log(`⏳ WaitingView: checkMeetingStatusById("${meetingId}") =>`, JSON.stringify(res));

        const isStarted = res?.active === true || res?.status === true;

        if (isStarted && isMounted) {
          if (timer) {
            clearInterval(timer);
            timer = null;
          }

          setStatusMsg(`Host is active (${res.company || 'Meeting'})`);
          setIsJoining(true);

          // Small delay for visual feedback, then auto-join
          setTimeout(() => {
            if (isMounted && onMeetingActiveRef.current) {
              onMeetingActiveRef.current({
                meeting_id: res.meeting_id || meetingId,
                company: res.company || 'Meeting',
                host_name: res.host_name || 'Host',
              });
            }
          }, 500);
        } else if (isMounted) {
          setStatusMsg('Host has not started yet — waiting for host to start...');
        }
      } catch (err) {
        console.warn('⏳ WaitingView: checkStatus error:', err);
        if (isMounted) setStatusMsg('Connecting to server...');
      }
    };

    // Initial check + interval polling
    checkStatus();
    timer = setInterval(checkStatus, 2000);

    return () => {
      isMounted = false;
      if (timer) clearInterval(timer);
    };
  }, [meetingId]);

  const handleManualCheck = async () => {
    if (!meetingId) return;
    try {
      const res = await checkMeetingStatusById(meetingId);
      const isStarted = res?.active === true || res?.status === true;

      if (isStarted) {
        setIsJoining(true);
        setTimeout(() => {
          if (onMeetingActiveRef.current) {
            onMeetingActiveRef.current({
              meeting_id: res.meeting_id || meetingId,
              company: res.company || 'Meeting',
              host_name: res.host_name || 'Host',
            });
          }
        }, 300);
      }
    } catch (_) {}
  };

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
          <span className="app-header__title">MNG Bot</span>
        </div>
        <div className="app-header__right">
          <span style={{ fontSize: 11, color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
            {Icons.user} {participantName || 'Participant'}
          </span>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '24px 16px', overflowY: 'auto' }}>
        <h2 style={{ fontSize: 18, color: 'var(--color-text-primary)', marginBottom: 6, textAlign: 'center' }}>
          {isJoining ? 'Joining Session... 🚀' : 'Waiting for Host... ⏳'}
        </h2>
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)', textAlign: 'center', marginBottom: 12, lineHeight: 1.5 }}>
          {isJoining
            ? 'The host has started the meeting. Joining now...'
            : statusMsg}
        </p>

        <div style={{
          textAlign: 'center',
          fontSize: 12,
          color: 'var(--color-accent-blue)',
          marginBottom: 24,
          padding: '6px 12px',
          background: 'rgba(79,124,255,0.08)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid rgba(79,124,255,0.2)',
        }}>
          Meeting ID: <strong>{meetingId}</strong>
        </div>

        {isJoining ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 12, background: 'rgba(34,197,94,0.08)', borderRadius: 'var(--radius-lg)', border: '1px solid rgba(34,197,94,0.3)' }}>
            <div className="spinner spinner--sm" />
            <span style={{ fontSize: 13, color: 'var(--color-success)' }}>Joining session...</span>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 12, background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--glass-border)' }}>
              <div className="spinner spinner--sm" />
              <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Waiting for host to start...</span>
            </div>
            <button
              className="btn btn--secondary btn--sm btn--full"
              onClick={handleManualCheck}
              style={{ fontSize: 12 }}
            >
              🔄 Check Host Status Now
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
