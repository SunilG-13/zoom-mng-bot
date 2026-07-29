/* ============================================
   MNG Bot — Waiting View
   Displayed for PARTICIPANTS while waiting for host
   to start the AI session.
   
   Clean UI — no host override buttons.
   Role selection is handled in SplashView.
   ============================================ */
import { useEffect, useState, useRef } from 'react';
import { checkActiveMeeting, getActiveMeeting } from '../api';
import { saveMeetingId, saveMeetingUUID } from '../utils/meetingStorage';

export default function WaitingView({ context, onMeetingActive, onClosePanel }) {
  const [statusMsg, setStatusMsg] = useState('Waiting for host to start the AI session...');
  const [checkCount, setCheckCount] = useState(0);
  // Use ref for onMeetingActive to avoid re-running effect when callback reference changes
  const onMeetingActiveRef = useRef(onMeetingActive);
  onMeetingActiveRef.current = onMeetingActive;

  useEffect(() => {
    let isMounted = true;
    let timer = null;

    const meetingId = context?.meeting_id;
    console.log(`⏳ WaitingView: Polling for meeting_id="${meetingId}"`);

    const checkStatus = async () => {
      try {
        console.log(`⏳ WaitingView: Checking status for "${meetingId}"...`);
        let res = await checkActiveMeeting(meetingId);
        if (!res?.active) {
          const discovery = await getActiveMeeting();
          if (discovery?.active) {
            res = discovery;
          }
        }
        console.log(`⏳ WaitingView: Response:`, JSON.stringify(res));

        if (res?.active) {
          console.log(`✅ WaitingView: Meeting is active! Company=${res.company}, ID=${res.meeting_id}`);
          const activeMeetingId = res.meeting_id || meetingId;
          if (context && activeMeetingId) {
            context.meeting_id = activeMeetingId;
            context.meetingUUID = activeMeetingId;
            saveMeetingId(activeMeetingId);
            saveMeetingUUID(activeMeetingId);
          }
          if (isMounted && onMeetingActiveRef.current) {
            onMeetingActiveRef.current({
              id: (res.company || 'meeting').toLowerCase().replace(/\s+/g, '_'),
              name: res.company || 'Meeting',
              company: res.company,
              meeting_id: activeMeetingId,
            });
          }
          // Stop polling once active
          if (timer) clearInterval(timer);
          return;
        } else {
          if (isMounted) {
            setCheckCount(prev => prev + 1);
            setStatusMsg('Host has not started yet \u2014 checking again...');
          }
        }
      } catch (err) {
        console.warn('⏳ WaitingView: Check error:', err);
        if (isMounted) {
          setStatusMsg('Connecting to server...');
        }
      }
    };

    // Check immediately on mount
    checkStatus();
    // Poll every 3 seconds
    timer = setInterval(checkStatus, 3000);

    return () => {
      isMounted = false;
      if (timer) clearInterval(timer);
    };
  }, [context?.meeting_id]);

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
