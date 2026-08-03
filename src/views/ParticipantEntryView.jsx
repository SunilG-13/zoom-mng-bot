/* ============================================
   MNG Bot — Participant Entry View

   Participant enters:
     - Name
     - Meeting ID (e.g. HONDA001)

   On "Join Meeting":
     GET /status/{meeting_id}
     If meeting started → navigate to Chat
     If not started → navigate to Waiting Screen
   ============================================ */
import { useState } from 'react';
import { Icons } from '../components/Icons';
import { checkMeetingStatusById } from '../api';
import { useToast } from '../components/Toast';

export default function ParticipantEntryView({ onJoin, onBack }) {
  const [participantName, setParticipantName] = useState('');
  const [meetingId, setMeetingId] = useState('');
  const [isChecking, setIsChecking] = useState(false);
  const toast = useToast();

  const canJoin = participantName.trim().length > 0 && meetingId.trim().length > 0;

  const handleJoin = async () => {
    if (!canJoin || isChecking) return;

    const finalName = participantName.trim();
    const finalMeetingId = meetingId.trim();

    setIsChecking(true);

    try {
      const res = await checkMeetingStatusById(finalMeetingId);

      // Determine if the meeting is active
      const isActive = res.active === true || res.status === true;

      if (isActive) {
        // Meeting is active → go directly to Chat
        onJoin({
          meeting_id: finalMeetingId,
          participant_name: finalName,
          meetingActive: true,
          company: res.company || null,
          host_name: res.host_name || null,
        });
      } else {
        // Meeting not started → go to Waiting Screen
        onJoin({
          meeting_id: finalMeetingId,
          participant_name: finalName,
          meetingActive: false,
          company: null,
          host_name: null,
        });
      }
    } catch (err) {
      // If /status fails (e.g. network error), still send to waiting
      console.warn('Participant join: status check failed:', err.message);
      onJoin({
        meeting_id: finalMeetingId,
        participant_name: finalName,
        meetingActive: false,
        company: null,
        host_name: null,
      });
    } finally {
      setIsChecking(false);
    }
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
          <span className="app-header__title">Join Meeting</span>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '24px 16px', overflowY: 'auto' }}>
        <h2 style={{ fontSize: 18, color: 'var(--color-text-primary)', marginBottom: 6 }}>Join a Meeting 🎯</h2>
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 20 }}>
          Enter your name and the Meeting ID provided by the host.
        </p>

        {/* Participant Name */}
        <label style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 6, display: 'block' }}>
          Your Name
        </label>
        <div className="search-input" style={{ marginBottom: 16 }}>
          <span className="search-input__icon">{Icons.user}</span>
          <input
            type="text"
            placeholder="e.g. Ravi"
            value={participantName}
            onChange={e => setParticipantName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && canJoin && handleJoin()}
            autoFocus
          />
        </div>

        {/* Meeting ID */}
        <label style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 6, display: 'block' }}>
          Meeting ID
        </label>
        <div className="search-input" style={{ marginBottom: 20 }}>
          <span className="search-input__icon">{Icons.fileText}</span>
          <input
            type="text"
            placeholder="e.g. HONDA001"
            value={meetingId}
            onChange={e => setMeetingId(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && canJoin && handleJoin()}
          />
        </div>

        <button
          className="btn btn--primary btn--lg btn--full"
          disabled={!canJoin || isChecking}
          onClick={handleJoin}
        >
          {isChecking ? (
            <><div className="spinner spinner--sm" style={{ width: 16, height: 16 }} /> Checking...</>
          ) : (
            <>{Icons.arrowRight} Join Meeting</>
          )}
        </button>

        <p style={{
          marginTop: 16,
          fontSize: 11,
          color: 'var(--color-text-muted)',
          textAlign: 'center',
          lineHeight: 1.5,
        }}>
          If the host hasn't started the meeting yet,<br />
          you'll be placed in a waiting room automatically.
        </p>
      </div>
    </div>
  );
}
