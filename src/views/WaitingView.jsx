import { useEffect, useState, useRef } from 'react';
import { checkActiveMeeting, getActiveMeeting } from '../api';
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

    const checkStatus = async () => {
      try {
        let res = await checkActiveMeeting(meetingId);
        if (!res?.active && (!meetingId || meetingId.startsWith('fallback-'))) {
          // Only attempt discovery if no specific meeting ID was provided
          const discovery = await getActiveMeeting();
          if (discovery?.active) {
            res = discovery;
          }
        }

        if (res?.active && isMounted) {
          const activeMeetingId = res.meeting_id || meetingId;
          const meetingData = {
            id: (res.company || 'meeting').toLowerCase().replace(/\s+/g, '_'),
            name: res.company || 'Meeting',
            company: res.company,
            meeting_id: activeMeetingId,
          };
          setActiveMeetingData(meetingData);
          setStatusMsg(`Host is active (${res.company || 'Meeting'})`);
        } else if (isMounted) {
          setActiveMeetingData(null);
          setStatusMsg('Host has not started yet — waiting for host to start...');
        }
      } catch (err) {
        if (isMounted) setStatusMsg('Connecting to server...');
      }
    };

    checkStatus();
    timer = setInterval(checkStatus, 3000);

    return () => {
      isMounted = false;
      if (timer) clearInterval(timer);
    };
  }, [context?.meeting_id]);

  const handleJoin = (targetData) => {
    const data = targetData || activeMeetingData;
    if (!data || isJoining) return;
    setIsJoining(true);

    const finalName = participantName.trim() || 'Guest User';

    try {
      localStorage.setItem('mng_participant_user_name', finalName);
      sessionStorage.setItem('mng_participant_joined', 'true');
    } catch (_) {}

    if (context) {
      context.user_name = finalName;
    }

    if (data.meeting_id) {
      saveMeetingId(data.meeting_id);
      saveMeetingUUID(data.meeting_id);
      if (context) {
        context.meeting_id = data.meeting_id;
        context.meetingUUID = data.meeting_id;
      }
    }

    if (onMeetingActiveRef.current) {
      onMeetingActiveRef.current(data, finalName, data.meeting_id);
    }
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
          {isReadyToJoin ? 'Join AI Session 🚀' : 'Waiting for Host... ⏳'}
        </h2>
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)', textAlign: 'center', marginBottom: 24, lineHeight: 1.5 }}>
          {isReadyToJoin
            ? `The host has loaded the ${activeMeetingData.name} knowledge base.`
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
          <button
            className="btn btn--primary btn--lg btn--full"
            disabled={!participantName.trim() || isJoining}
            onClick={() => handleJoin()}
          >
            {Icons.messageSquare} Join Chat
          </button>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 12, background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--glass-border)' }}>
            <div className="spinner spinner--sm" />
            <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Waiting for host to start...</span>
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
