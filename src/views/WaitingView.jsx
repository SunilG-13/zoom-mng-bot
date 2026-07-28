/* ============================================
   MNG Bot — Waiting View
   Displayed for PARTICIPANTS while waiting for host
   to start the AI session.
   
   Clean UI — no host override buttons.
   Role selection is handled in SplashView.
   ============================================ */
import { useEffect, useState } from 'react';
import { checkActiveMeeting, checkAnyActiveMeeting } from '../api';

export default function WaitingView({ context, onMeetingActive, onClosePanel }) {
  const [statusMsg, setStatusMsg] = useState('Waiting for host to start the AI session...');

  useEffect(() => {
    let isMounted = true;
    let timer = null;

    const checkStatus = async () => {
      try {
        let res;
        if (context?.meeting_id && !context.meeting_id.startsWith('fallback-')) {
          res = await checkActiveMeeting(context.meeting_id);
        } else {
          res = await checkAnyActiveMeeting();
        }

        if (res?.active) {
          if (isMounted && onMeetingActive) {
            onMeetingActive({
              id: (res.company || 'meeting').toLowerCase().replace(/\s+/g, '_'),
              name: res.company || 'Meeting',
              company: res.company,
              meeting_id: res.meeting_id || context?.meeting_id,
            });
          }
          return;
        } else {
          if (isMounted) {
            setStatusMsg('Host has not started yet — checking again...');
          }
        }
      } catch {
        if (isMounted) {
          setStatusMsg('Connecting to server...');
        }
      }
    };

    checkStatus();
    timer = setInterval(checkStatus, 3000);

    return () => {
      isMounted = false;
      if (timer) clearInterval(timer);
    };
  }, [context, onMeetingActive]);

  const displayName = context?.user_name || 'Participant';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg-primary)', padding: 24 }}>
      <div className="spinner spinner--lg" style={{ marginBottom: 20 }} />
      <h2 style={{ fontSize: 18, color: 'var(--color-text-primary)', marginBottom: 8, textAlign: 'center' }}>
        Waiting for Host...
      </h2>
      <p style={{ fontSize: 13, color: 'var(--color-text-muted)', textAlign: 'center', marginBottom: 16, maxWidth: 280, lineHeight: 1.5 }}>
        {statusMsg}
      </p>
      <p style={{ fontSize: 12, color: 'var(--color-text-muted)', textAlign: 'center', marginBottom: 24 }}>
        Joined as: <strong style={{ color: 'var(--color-text-primary)' }}>{displayName}</strong>
      </p>
      {onClosePanel && (
        <button className="btn btn--ghost btn--sm" onClick={onClosePanel}>
          Close Panel
        </button>
      )}
    </div>
  );
}
