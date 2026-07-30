/* ============================================
   MNG Bot — Waiting View
   
   Shows when participant opens bot before host has started.
   Polls /status/{meeting_id} until the host starts the meeting.
   Once active → auto-joins the participant (after username confirmation).
   
   KEY FIX: Uses checkMeetingStatusById() to poll ONLY the
   specific Zoom meeting — NO generic /active_meeting discovery.
   This prevents cross-meeting hijacking in multi-meeting scenarios.
   ============================================ */
import { useEffect, useState, useRef } from 'react';
import { checkMeetingStatusById, getActiveMeeting } from '../api';
import { saveMeetingId, saveMeetingUUID, isGenericName } from '../utils/meetingStorage';
import { Icons } from '../components/Icons';

export default function WaitingView({ context, onMeetingActive, onClosePanel }) {
  const autoName = (!isGenericName(context?.user_name))
    ? context.user_name
    : (localStorage.getItem('mng_participant_user_name') || 'Guest User');

  const [participantName, setParticipantName] = useState(autoName);
  const [statusMsg, setStatusMsg] = useState('Checking host status...');
  const [activeMeetingData, setActiveMeetingData] = useState(null);
  const [isJoining, setIsJoining] = useState(false);

  const onMeetingActiveRef = useRef(onMeetingActive);
  onMeetingActiveRef.current = onMeetingActive;

  // Sync auto-detected username if Zoom SDK context arrives later
  useEffect(() => {
    if (context?.user_name && !isGenericName(context.user_name)) {
      setParticipantName(context.user_name);
    }
  }, [context?.user_name]);

  useEffect(() => {
    let isMounted = true;
    let timer = null;

    const meetingId = context?.meeting_id;
    console.log(`⏳ WaitingView: Polling for meeting_id="${meetingId}"`);

    const checkStatus = async (showToast = false) => {
      try {
        let res = null;
        const targetId = meetingId || getLastMeetingId();
        
        // 1. Check by target ID first
        if (targetId) {
          try {
            res = await checkMeetingStatusById(targetId);
          } catch (_) {}
        }

        // 2. If not active by ID, perform unconstrained /active_meeting discovery
        if (!res?.active) {
          try {
            const discovery = await getActiveMeeting();
            if (discovery?.active) {
              res = discovery;
            }
          } catch (_) {}
        }

        if (res?.active && isMounted) {
          const activeMeetingId = res.meeting_id || targetId;
          const meetingData = {
            id: (res.company || 'meeting').toLowerCase().replace(/\s+/g, '_'),
            name: res.company || 'Meeting',
            company: res.company,
            meeting_id: activeMeetingId,
          };
          setActiveMeetingData(meetingData);
          setStatusMsg(`Host is active (${res.company || 'Meeting'})`);

          if (timer) clearInterval(timer);
          timer = null;
          setTimeout(() => {
            if (isMounted) {
              autoJoin(meetingData);
            }
          }, 500);
        } else if (isMounted) {
          setActiveMeetingData(null);
          setStatusMsg('Host has not started yet — waiting for host to start...');
        }
      } catch (err) {
        if (isMounted) setStatusMsg('Connecting to server...');
      }
    };

    checkStatus();
    timer = setInterval(() => checkStatus(), 3000);

    return () => {
      isMounted = false;
      if (timer) clearInterval(timer);
    };
  }, [context?.meeting_id]);

  const autoJoin = (targetData) => {
    if (isJoining) return;
    setIsJoining(true);

    const finalName = participantName.trim() || 'Guest User';

    try {
      localStorage.setItem('mng_participant_user_name', finalName);
      sessionStorage.setItem('mng_participant_joined', 'true');
    } catch (_) {}

    if (context) {
      context.user_name = finalName;
    }

    if (targetData.meeting_id) {
      saveMeetingId(targetData.meeting_id);
      saveMeetingUUID(targetData.meeting_id);
      if (context) {
        context.meeting_id = targetData.meeting_id;
        context.meetingUUID = targetData.meeting_id;
      }
    }

    if (onMeetingActiveRef.current) {
      onMeetingActiveRef.current(targetData, finalName, targetData.meeting_id);
    }
  };

  const handleJoin = (targetData) => {
    const data = targetData || activeMeetingData;
    if (!data || isJoining) return;
    autoJoin(data);
  };

  const isReadyToJoin = !!activeMeetingData;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--color-bg-primary)' }}>
      <div className="app-header">
        <div className="app-header__left">
          <div className="app-header__logo">{Icons.bot}</div>
          <span className="app-header__title">MNG Bot</span>
        </div>
        <div className="app-header__right">
          <span style={{ fontSize: 11, color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
            {Icons.user} {participantName.trim() || 'Guest User'}
          </span>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '24px 16px', overflowY: 'auto' }}>
        <h2 style={{ fontSize: 18, color: 'var(--color-text-primary)', marginBottom: 6, textAlign: 'center' }}>
          {isReadyToJoin ? 'Joining Session... 🚀' : 'Waiting for Host... ⏳'}
        </h2>
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)', textAlign: 'center', marginBottom: 24, lineHeight: 1.5 }}>
          {isReadyToJoin
            ? `The host has loaded the ${activeMeetingData.name} knowledge base. Joining...`
            : statusMsg}
        </p>

        <label style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 6, display: 'block' }}>
          Your Display Name
        </label>
        <div className="search-input" style={{ marginBottom: 20 }}>
          <span className="search-input__icon">{Icons.user}</span>
          <input
            type="text"
            placeholder="e.g. Alex Smith"
            value={participantName}
            onChange={e => setParticipantName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && isReadyToJoin && handleJoin()}
          />
        </div>

        {isReadyToJoin ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 12, background: 'rgba(34,197,94,0.08)', borderRadius: 'var(--radius-lg)', border: '1px solid rgba(34,197,94,0.3)' }}>
            <div className="spinner spinner--sm" />
            <span style={{ fontSize: 13, color: 'var(--color-success)' }}>Joining {activeMeetingData.name} session...</span>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 12, background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--glass-border)' }}>
              <div className="spinner spinner--sm" />
              <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Waiting for host to start...</span>
            </div>
            <button
              className="btn btn--secondary btn--sm btn--full"
              onClick={async () => {
                const { getActiveMeeting } = await import('../api');
                const discovery = await getActiveMeeting();
                if (discovery?.active) {
                  autoJoin({
                    id: (discovery.company || 'meeting').toLowerCase().replace(/\s+/g, '_'),
                    name: discovery.company || 'Meeting',
                    company: discovery.company,
                    meeting_id: discovery.meeting_id,
                  });
                }
              }}
              style={{ fontSize: 12 }}
            >
              🔄 Check Host Status Now
            </button>
          </div>
        )}

        {onClosePanel && (
          <button className="btn btn--ghost btn--sm" onClick={onClosePanel} style={{ marginTop: 16 }}>
            Close Panel
          </button>
        )}
      </div>
    </div>
  );
}
