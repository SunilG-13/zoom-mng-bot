/* ============================================
   MNG Bot — Splash View
   
   FLOW:
   1. Init Zoom SDK → get meeting_id + user context
   2. Check /status/{meeting_id} to see if THIS meeting is active
   3. Determine role:
      - SDK says host → host flow
      - SDK says participant → participant flow
      - SDK unknown + meeting active → auto-participant (host already started)
      - SDK unknown + meeting NOT active → ask user (Host or Participant?)
   4. Route accordingly
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
  // Store context & activeMeeting at component level so manual selection can use them
  const [storedContext, setStoredContext] = useState(null);
  const [storedActiveMeeting, setStoredActiveMeeting] = useState(null);

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

      // Step 2: New meeting detection — clear stale data from previous meetings
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

      // Step 3: Check if THIS meeting is active on backend
      if (!cancelled) setStatusText('Checking meeting status...');
      const { checkMeetingStatusById, getActiveMeeting, CONFIG } = await import('../api');

      let activeMeeting = null;
      const meetingId = context.meeting_id;
      const isRealMeetingId = meetingId && 
        !meetingId.startsWith('fallback-') && 
        !meetingId.startsWith('meeting-') && 
        !meetingId.startsWith('mng-');

      console.log(`🔍 Splash — meeting_id from Zoom SDK: "${meetingId}", isReal: ${isRealMeetingId}`);

      if (isRealMeetingId) {
        // Real Zoom meeting_id → check ONLY this specific meeting (multi-meeting safe)
        try {
          const res = await checkMeetingStatusById(meetingId);
          console.log(`🔍 Splash — checkMeetingStatusById response:`, JSON.stringify(res));
          if (res.active && res.meeting_id) {
            activeMeeting = res;
          }
        } catch (err) {
          console.warn('🔍 Splash — checkMeetingStatusById error:', err);
        }
      } else {
        // No real meeting_id (browser mode / SDK failure) → use /active_meeting discovery
        // This works when there's 1 active meeting; with multiple it returns active:false
        console.log('🔍 Splash — No real meeting_id, trying /active_meeting discovery...');
        try {
          const discovery = await getActiveMeeting();
          console.log(`🔍 Splash — getActiveMeeting response:`, JSON.stringify(discovery));
          if (discovery.active && discovery.meeting_id) {
            activeMeeting = discovery;
            // Update context with the discovered meeting_id
            context.meeting_id = discovery.meeting_id;
            context.meetingUUID = discovery.meeting_id;
          }
        } catch (err) {
          console.warn('🔍 Splash — getActiveMeeting error:', err);
        }
      }

      // If an active meeting was found, align context meeting_id
      if (activeMeeting?.meeting_id) {
        context.meeting_id = activeMeeting.meeting_id;
        context.meetingUUID = activeMeeting.meeting_id;
        saveMeetingUUID(activeMeeting.meeting_id);
        const { saveMeetingId } = await import('../utils/meetingStorage');
        saveMeetingId(activeMeeting.meeting_id);
      }

      // Minimum splash duration for smooth UX
      const elapsed = Date.now() - startTime;
      if (elapsed < 1600) await sleep(1600 - elapsed);

      if (cancelled || !onComplete) return;

      // ---------------------------------------------------------
      // ROLE DETECTION & ROUTING RULES:
      //
      // Priority 1: Zoom SDK explicit role (when OAuth scopes are present)
      // Priority 2: Unknown SDK role (null) → ALWAYS prompt user to pick Host or Participant
      // ---------------------------------------------------------
      let isHost;
      if (context.explicitRole === false) {
        // SDK explicitly says participant
        isHost = false;
      } else if (context.explicitRole === true) {
        // SDK explicitly says host
        isHost = true;
      } else {
        // SDK role is unknown (null) — common without OAuth scopes
        console.log('🔍 Splash — Unknown SDK role → asking user for Host vs Participant selection');
        setStoredContext(context);
        setStoredActiveMeeting(activeMeeting);
        setNeedsManualRole(true);
        return; // Stop here and wait for manual selection
      }

      routeUser(isHost, activeMeeting, context);
    })();

    return () => { cancelled = true; };
  }, [onComplete]);

  // Handle manual role selection when SDK fails to provide role
  const handleManualRole = async (selectedRoleIsHost) => {
    setNeedsManualRole(false);
    setStatusText('Routing...');
    
    const context = storedContext || await import('../zoom').then(m => m.getMeetingContext());
    context.is_host = selectedRoleIsHost;
    context.isHost = selectedRoleIsHost;
    context.user_role = selectedRoleIsHost ? 'host' : 'participant';

    let activeMeeting = storedActiveMeeting;

    if (!selectedRoleIsHost && !activeMeeting) {
      // User said "I am a Participant" — check if meeting started
      const { checkMeetingStatusById, getActiveMeeting } = await import('../api');
      const meetingId = context.meeting_id;
      const isRealMeetingId = meetingId && 
        !meetingId.startsWith('fallback-') && 
        !meetingId.startsWith('meeting-') && 
        !meetingId.startsWith('mng-');

      if (isRealMeetingId) {
        try {
          const res = await checkMeetingStatusById(meetingId);
          if (res.active && res.meeting_id) {
            activeMeeting = res;
          }
        } catch (_) {}
      } else {
        try {
          const discovery = await getActiveMeeting();
          if (discovery.active && discovery.meeting_id) {
            context.meeting_id = discovery.meeting_id;
            context.meetingUUID = discovery.meeting_id;
            activeMeeting = discovery;
          }
        } catch (_) {}
      }
    }

    routeUser(selectedRoleIsHost, activeMeeting, context);
  };

  const routeUser = async (isHost, activeMeeting, context) => {
    const { CONFIG } = await import('../api');
    context.is_host = isHost;
    context.isHost = isHost;
    context.user_role = isHost ? 'host' : 'participant';

    console.log(`🎯 Route Decision: isHost=${isHost}, activeMeeting=${!!activeMeeting}, explicitRole=${context.explicitRole}`);

    if (isHost) {
      // Host Routing
      const hasHostStartedSession = sessionStorage.getItem('mng_host_started') === 'true';
      if (hasHostStartedSession && activeMeeting) {
        // Host has already started meeting in this active browser session → resume Chat+Dashboard
        const companyName = activeMeeting.company || 'Biocon';
        const matched = CONFIG.COMPANIES.find(
          c => c.name.toLowerCase() === companyName.toLowerCase()
        );
        const companyInfo = matched || {
          id: companyName.toLowerCase().replace(/\s+/g, '_'),
          name: companyName,
        };
        console.log('✅ Host (session active) → Chat + Dashboard (resume)');
        onComplete(context, companyInfo, 'host-resume');
      } else {
        // Fresh Host → Setup View (Enter company name & confirm display name)
        console.log('✅ Host → Setup View (Company selection)');
        onComplete(context, null, 'host');
      }
    } else {
      // Participant Routing
      if (activeMeeting) {
        const companyName = activeMeeting.company || 'Biocon';
        const matched = CONFIG.COMPANIES.find(
          c => c.name.toLowerCase() === companyName.toLowerCase()
        );
        const companyInfo = matched || {
          id: companyName.toLowerCase().replace(/\s+/g, '_'),
          name: companyName,
        };

        const hasJoinedInSession = sessionStorage.getItem('mng_participant_joined') === 'true';
        if (hasJoinedInSession) {
          console.log('✅ Participant (already joined in session) → Chat directly');
          onComplete(context, companyInfo, 'participant');
        } else {
          console.log('✅ Participant (first time) → Username confirm then auto-join Chat');
          onComplete(context, companyInfo, 'participant-setup');
        }
      } else {
        console.log('✅ Participant → Waiting View (waiting for host to start)');
        onComplete(context, null, 'waiting');
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
