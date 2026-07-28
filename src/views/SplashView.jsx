/* ============================================
   MNG Bot — Splash View
   
   Since the Zoom Apps SDK does not return user/meeting context
   (getUserContext and getMeetingContext return empty objects
   due to OAuth scope limitations), this view:
   
   1. Shows the splash animation
   2. Tries to get context from Zoom SDK (best effort)
   3. If role detected → routes automatically
   4. If role NOT detected → shows role selection buttons
   5. Handles new meeting detection via meetingUUID
   ============================================ */
import { useEffect, useState, useCallback } from 'react';
import { Icons } from '../components/Icons';
import { 
  detectNewMeeting, 
  completeSessionReset, 
  saveMeetingUUID 
} from '../utils/meetingStorage';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

export default function SplashView({ onComplete }) {
  const [phase, setPhase] = useState('loading'); // 'loading' | 'choose-role'
  const [statusText, setStatusText] = useState('Initializing...');
  const [zoomContext, setZoomContext] = useState(null);
  const [nameInput, setNameInput] = useState('');

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const startTime = Date.now();

      // ── Step 1: Init Zoom SDK ──
      if (!cancelled) setStatusText('Connecting to Zoom...');
      await sleep(600);

      if (!cancelled) setStatusText('Detecting meeting context...');

      const { initZoom, getMeetingContext } = await import('../zoom');
      await initZoom();
      const context = await getMeetingContext();
      console.log('🔍 Splash — Zoom context:', JSON.stringify(context));

      if (!cancelled) setZoomContext(context);

      // ── Step 2: NEW MEETING DETECTION ──
      if (!cancelled) setStatusText('Checking meeting session...');
      
      const { isNew, previousUUID } = detectNewMeeting(context.meetingUUID);
      
      if (isNew && previousUUID) {
        console.log(`🔄 NEW MEETING DETECTED! Old: ${previousUUID}, New: ${context.meetingUUID}`);
        completeSessionReset();
        await sleep(300);
      } else if (isNew && !previousUUID) {
        console.log('🆕 First meeting — fresh start');
      } else {
        console.log('✅ Same meeting continuing');
      }

      // Save UUID AFTER reset
      if (context.meetingUUID) {
        saveMeetingUUID(context.meetingUUID);
      }

      // ── Step 3: Check if SDK returned a valid role ──
      const isHost = context.isHost || context.is_host;
      const hasValidRole = context._debug?.userContextRole !== undefined 
        && context._debug?.userContextRole !== null
        && context._debug?.userContextRole !== '';

      console.log(`🎯 SDK role check: hasValidRole=${hasValidRole}, isHost=${isHost}, raw="${context._debug?.userContextRole}"`);

      // Pre-fill name from SDK if available (not a generic fallback)
      const sdkName = context.user_name;
      const isGenericName = !sdkName || sdkName === 'Zoom User' || sdkName === 'Guest User' || sdkName === 'Test Host' || sdkName === 'Test User';

      // Ensure minimum splash display
      const elapsed = Date.now() - startTime;
      if (elapsed < 2000) await sleep(2000 - elapsed);

      if (hasValidRole && !cancelled) {
        // ── SDK returned a valid role → auto-route ──
        if (!cancelled) setStatusText(isHost 
          ? `Host detected: ${context.user_name}` 
          : `Participant detected: ${context.user_name}`
        );
        await sleep(500);
        await autoRoute(context, isHost, isNew, cancelled);
      } else {
        // ── SDK did NOT return a role → show role selection ──
        console.log('⚠️ SDK did not return a valid role — showing role selection');
        if (!cancelled) {
          setStatusText('Please select your role');
          setPhase('choose-role');
        }
      }
    })();

    return () => { cancelled = true; };
  }, [onComplete]);

  // Auto-route when SDK provides role
  const autoRoute = useCallback(async (context, isHost, isNew, cancelled) => {
    const { checkMeetingStatus, checkAnyActiveMeeting, CONFIG } = await import('../api');

    let activeMeeting = null;

    if (context.meeting_id && !context.meeting_id.startsWith('fallback-')) {
      try {
        const res = await checkMeetingStatus(context.meeting_id);
        if (res.active && res.meeting_id) activeMeeting = res;
      } catch (_) {}
    }

    if (!activeMeeting && !isHost) {
      try {
        const res = await checkAnyActiveMeeting();
        if (res.active && res.meeting_id) {
          activeMeeting = res;
          context.meeting_id = res.meeting_id;
        }
      } catch (_) {}
    }

    if (!cancelled && onComplete) {
      routeUser(context, isHost, isNew, activeMeeting);
    }
  }, [onComplete]);

  // Route based on role + meeting status
  const routeUser = useCallback(async (context, isHost, isNew, activeMeeting) => {
    const { CONFIG } = await import('../api');

    if (activeMeeting && !isNew) {
      const matched = CONFIG.COMPANIES.find(
        c => c.name.toLowerCase() === (activeMeeting.company || '').toLowerCase()
      );
      const companyInfo = matched || {
        id: (activeMeeting.company || 'company').toLowerCase().replace(/\s+/g, '_'),
        name: activeMeeting.company || 'Company',
      };

      if (isHost) {
        console.log('✅ Host: Resuming active meeting → Chat+Dashboard');
        context.meeting_id = activeMeeting.meeting_id;
        onComplete(context, companyInfo, 'host-resume');
      } else {
        console.log('✅ Participant: Joining active meeting → Chat');
        context.meeting_id = activeMeeting.meeting_id;
        context.is_host = false;
        context.isHost = false;
        onComplete(context, companyInfo, 'participant');
      }
    } else {
      if (isHost) {
        console.log('✅ Host: No active meeting → Setup');
        context.is_host = true;
        context.isHost = true;
        onComplete(context, null, 'host');
      } else {
        console.log('✅ Participant: No active meeting → Waiting');
        context.is_host = false;
        context.isHost = false;
        onComplete(context, null, 'participant');
      }
    }
  }, [onComplete]);

  // ── Handle role selection ──
  const handleRoleSelect = useCallback(async (selectedRole) => {
    if (!zoomContext) return;

    const isHost = selectedRole === 'host';
    const displayName = nameInput.trim() || zoomContext.user_name || 'Zoom User';

    // Update context with selected role and name
    const updatedContext = {
      ...zoomContext,
      user_name: displayName,
      user_role: isHost ? 'host' : 'participant',
      is_host: isHost,
      isHost: isHost,
    };

    setPhase('loading');
    setStatusText(isHost ? `Starting as host: ${displayName}...` : `Joining as: ${displayName}...`);

    // Check for active meetings
    const { checkMeetingStatus, checkAnyActiveMeeting } = await import('../api');
    
    let activeMeeting = null;
    
    // Check if there's an active meeting on backend
    if (updatedContext.meeting_id && !updatedContext.meeting_id.startsWith('fallback-')) {
      try {
        const res = await checkMeetingStatus(updatedContext.meeting_id);
        if (res.active && res.meeting_id) activeMeeting = res;
      } catch (_) {}
    }

    if (!activeMeeting && !isHost) {
      try {
        const res = await checkAnyActiveMeeting();
        if (res.active && res.meeting_id) {
          activeMeeting = res;
          updatedContext.meeting_id = res.meeting_id;
        }
      } catch (_) {}
    }

    const isNew = true; // Role selection = always treat as new start
    await sleep(500);
    routeUser(updatedContext, isHost, isNew, activeMeeting);
  }, [zoomContext, nameInput, routeUser]);

  // ════════════════════════════════════════════════════════════════
  // RENDER: Role Selection Screen
  // ════════════════════════════════════════════════════════════════
  if (phase === 'choose-role') {
    return (
      <div className="splash">
        <div className="splash__bg" />
        <div className="splash__content" style={{ gap: 16, maxWidth: 320 }}>
          <div className="splash__logo">
            {Icons.bot}
          </div>
          <h1 className="splash__title" style={{ fontSize: 22, marginBottom: 0 }}>MNG Bot</h1>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)', textAlign: 'center', lineHeight: 1.5, marginBottom: 4 }}>
            Select your role in this meeting
          </p>

          {/* Name input */}
          <div style={{ width: '100%', marginBottom: 4 }}>
            <label style={{ fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 4, display: 'block' }}>
              Your Display Name
            </label>
            <input
              type="text"
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              placeholder={zoomContext?.user_name || 'Enter your name'}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--glass-border)',
                background: 'var(--color-bg-secondary)',
                color: 'var(--color-text-primary)',
                fontSize: 14,
                outline: 'none',
                boxSizing: 'border-box',
              }}
              autoFocus
            />
          </div>

          {/* Role buttons */}
          <button
            className="btn btn--primary btn--lg btn--full"
            onClick={() => handleRoleSelect('host')}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 16px' }}
          >
            🚀 Start Meeting (Host)
          </button>

          <button
            className="btn btn--secondary btn--lg btn--full"
            onClick={() => handleRoleSelect('participant')}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 16px' }}
          >
            👤 Join Meeting (Participant)
          </button>

          <p style={{ fontSize: 10, color: 'var(--color-text-muted)', textAlign: 'center', marginTop: 4, lineHeight: 1.4 }}>
            Zoom SDK could not detect your role automatically.
            <br />Please select your role to continue.
          </p>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════
  // RENDER: Loading / Splash Screen
  // ════════════════════════════════════════════════════════════════
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
