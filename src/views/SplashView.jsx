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
        console.log(`🔄 NEW MEETING DETECTED! Resetting local session...`);
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
      // ROLE & ROUTING RULES:
      // - Host: context.explicitRole === true OR context.isHost === true
      // - Participant: context.explicitRole === false OR not Host
      //
      // PARTICIPANTS NEVER SEE SETUP OR COMPANY SELECTION!
      // - If meeting is active -> Participant goes directly to Chat
      // - If meeting is not active -> Participant goes to Waiting View
      // ---------------------------------------------------------
      const isHost = context.explicitRole === true || context.isHost === true || context.is_host === true;

      context.is_host = isHost;
      context.isHost = isHost;
      context.user_role = isHost ? 'host' : 'participant';

      console.log(`🎯 Route Decision: isHost=${isHost}, activeMeeting=${!!activeMeeting}`);

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
          console.log('✅ Participant -> Chat directly (No setup/company selection!)');
          onComplete(context, companyInfo, 'participant');
        }
      } else {
        // No active meeting on backend yet
        if (isHost) {
          console.log('✅ Host -> Setup View (Company selection)');
          onComplete(context, null, 'host');
        } else {
          console.log('✅ Participant -> Waiting View (No setup/company selection!)');
          onComplete(context, null, 'participant');
        }
      }
    })();

    return () => { cancelled = true; };
  }, [onComplete]);

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
