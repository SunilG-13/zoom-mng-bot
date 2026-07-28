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

      // Ensure minimum splash duration for polished UX
      const elapsed = Date.now() - startTime;
      if (elapsed < 1800) await sleep(1800 - elapsed);

      if (cancelled || !onComplete) return;

      // Step 4: Automatic Role Determination & Routing
      // ---------------------------------------------------------
      // Rule 1: SDK explicitly says Participant (explicitRole === false)
      // Rule 2: SDK explicitly says Host (explicitRole === true)
      // Rule 3: SDK Role unknown (explicitRole === null):
      //         If active meeting exists on backend -> Participant
      //         If no active meeting on backend -> Host (initiating setup)
      // ---------------------------------------------------------
      let isHost;
      if (context.explicitRole === false) {
        isHost = false;
      } else if (context.explicitRole === true) {
        isHost = true;
      } else {
        // Unknown SDK role: if meeting already started on backend -> participant; else host!
        isHost = !activeMeeting;
      }

      context.is_host = isHost;
      context.isHost = isHost;
      context.user_role = isHost ? 'host' : 'participant';

      console.log(`🎯 Automatic Route Decision: isHost=${isHost}, activeMeeting=${!!activeMeeting}, explicitRole=${context.explicitRole}`);

      if (activeMeeting && !isNew) {
        // Active meeting exists -> Resume Chat / Join Chat
        const matched = CONFIG.COMPANIES.find(
          c => c.name.toLowerCase() === (activeMeeting.company || '').toLowerCase()
        );
        const companyInfo = matched || {
          id: (activeMeeting.company || 'company').toLowerCase().replace(/\s+/g, '_'),
          name: activeMeeting.company || 'Company',
        };

        if (isHost) {
          console.log('✅ Resuming Host Chat');
          onComplete(context, companyInfo, 'host-resume');
        } else {
          console.log('✅ Joining Participant Chat');
          onComplete(context, companyInfo, 'participant');
        }
      } else {
        // No active meeting on backend
        if (isHost) {
          console.log('✅ Host -> Setup View (Company selection)');
          onComplete(context, null, 'host');
        } else {
          console.log('✅ Participant -> Waiting View');
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
