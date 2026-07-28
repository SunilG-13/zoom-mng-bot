/* ============================================
   MNG Bot — Splash View
   ============================================ */
import { useEffect, useState } from 'react';
import { Icons } from '../components/Icons';
import { 
  detectNewMeeting, 
  completeSessionReset, 
  saveMeetingUUID 
} from '../utils/meetingStorage';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

export default function SplashView({ onComplete }) {
  const [statusText, setStatusText] = useState('Initializing...');
  const [needsManualRole, setNeedsManualRole] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const startTime = Date.now();

      // Step 1: Init Zoom SDK
      if (!cancelled) setStatusText('Connecting to Zoom...');
      await sleep(400);

      const { initZoom, getMeetingContext } = await import('../zoom');
      await initZoom();
      const context = await getMeetingContext();
      console.log('🔍 Splash — Zoom context:', JSON.stringify(context));

      if (!cancelled) setStatusText(`Welcome, ${context.user_name}`);

      // Step 2: New meeting detection
      const { isNew, previousUUID } = detectNewMeeting(context.meetingUUID);
      if (isNew && previousUUID) {
        console.log(`🔄 NEW MEETING DETECTED! Resetting backend and local session...`);
        const { getLastMeetingId } = await import('../utils/meetingStorage');
        const lastMeetingId = getLastMeetingId();
        if (lastMeetingId) {
          const { endMeeting } = await import('../api');
          try { await endMeeting(lastMeetingId); } catch (_) {}
        }
        completeSessionReset();
        await sleep(300);
      }
      if (context.meetingUUID) {
        saveMeetingUUID(context.meetingUUID);
      }

      // Step 3: Check backend active meeting status
      if (!cancelled) setStatusText('Checking meeting status...');
      const { checkMeetingStatus, checkAnyActiveMeeting, CONFIG } = await import('../api');

      let activeMeeting = null;

      if (context.meeting_id && !context.meeting_id.startsWith('fallback-')) {
        try {
          const res = await checkMeetingStatus(context.meeting_id);
          if (res.active && res.meeting_id) activeMeeting = res;
        } catch (_) {}
      }

      if (!activeMeeting) {
        try {
          const res = await checkAnyActiveMeeting();
          if (res.active && res.meeting_id) {
            activeMeeting = res;
            context.meeting_id = res.meeting_id;
          }
        } catch (_) {}
      }

      // Minimum splash duration for smooth UX
      const elapsed = Date.now() - startTime;
      if (elapsed < 1600) await sleep(1600 - elapsed);

      if (cancelled || !onComplete) return;

      // ---------------------------------------------------------
      // BULLETPROOF ROLE & ROUTING RULES:
      // ---------------------------------------------------------
      let isHost;
      if (context.explicitRole === false) {
        isHost = false;
      } else if (context.explicitRole === true) {
        isHost = true;
      } else {
        // Unknown SDK role (missing OAuth scopes).
        // If activeMeeting exists, we can safely assume they are joining an active meeting.
        if (activeMeeting) {
          isHost = false;
        } else {
          // WE DO NOT KNOW THE ROLE. Do NOT assume they are the Host.
          // Pause and ask the user manually to prevent Testers from seeing Setup.
          setNeedsManualRole(true);
          return; // Stop here and wait for manual selection
        }
      }

      routeUser(isHost, activeMeeting, context);
    })();

    return () => { cancelled = true; };
  }, [onComplete]);

  // Handle manual role selection when SDK fails
  const handleManualRole = async (selectedRoleIsHost) => {
    setNeedsManualRole(false);
    setStatusText('Routing...');
    
    // We already know activeMeeting is null if we reached here
    const context = await import('../zoom').then(m => m.getMeetingContext());
    context.is_host = selectedRoleIsHost;
    context.isHost = selectedRoleIsHost;
    context.user_role = selectedRoleIsHost ? 'host' : 'participant';

    routeUser(selectedRoleIsHost, null, context);
  };

  const routeUser = async (isHost, activeMeeting, context) => {
    const { CONFIG } = await import('../api');
    context.is_host = isHost;
    context.isHost = isHost;
    context.user_role = isHost ? 'host' : 'participant';

    console.log(`🎯 Route Decision: isHost=${isHost}, activeMeeting=${!!activeMeeting}, explicitRole=${context.explicitRole}`);

    if (activeMeeting) {
      // Active meeting exists -> Directly into Chat
      const companyName = activeMeeting.company || 'Biocon';
      const matched = CONFIG.COMPANIES.find(
        c => c.name.toLowerCase() === companyName.toLowerCase()
      );
      const companyInfo = matched || {
        id: companyName.toLowerCase().replace(/\s+/g, '_'),
        name: companyName,
      };

      if (isHost) {
        console.log('✅ Host -> Chat + Dashboard');
        onComplete(context, companyInfo, 'host-resume');
      } else {
        console.log('✅ Participant -> Chat directly (No setup!)');
        onComplete(context, companyInfo, 'participant');
      }
    } else {
      // No active meeting on backend yet
      if (isHost) {
        console.log('✅ Host -> Setup View (Company selection)');
        onComplete(context, null, 'host');
      } else {
        console.log('✅ Participant -> Waiting View');
        onComplete(context, null, 'participant');
      }
    }
  };

  if (needsManualRole) {
    return (
      <div className="splash">
        <div className="splash__bg" />
        <div className="splash__content" style={{ padding: '0 24px' }}>
          <div className="splash__logo" style={{ marginBottom: 16 }}>{Icons.alertTriangle}</div>
          <h2 style={{ fontSize: 18, color: 'var(--color-text-primary)', marginBottom: 8, textAlign: 'center' }}>Role Verification</h2>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)', textAlign: 'center', marginBottom: 24, lineHeight: 1.5 }}>
            Zoom could not verify your role. Are you the Host setting up the meeting, or a Participant joining?
          </p>
          <button className="btn btn--primary btn--lg btn--full" onClick={() => handleManualRole(true)} style={{ marginBottom: 12 }}>
            👑 I am the Host (Setup Meeting)
          </button>
          <button className="btn btn--secondary btn--lg btn--full" onClick={() => handleManualRole(false)}>
            👤 I am a Participant (Join Meeting)
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="splash">
      <div className="splash__bg" />
      <div className="splash__content">
        <div className="splash__logo">
          {Icons.bot}
        </div>
        <h1 className="splash__title">MNG Bot</h1>
        <p className="splash__subtitle">
          AI-Powered Meeting Assistant<br />
          Loading your intelligent meeting companion...
        </p>
        <div className="splash__status">
          <div className="spinner spinner--sm" />
          <span>{statusText}</span>
        </div>
      </div>
    </div>
  );
}
