/* ============================================
   MNG Bot — Main App Controller
   
   KEY FIXES:
   
   1. Removed storage.js imports (markAsHost/clearHostMark)
      — Role is ONLY from Zoom SDK, never persisted in localStorage
   
   2. onMeetingEnded useEffect now uses cleanup function
      — Prevents listener accumulation across re-renders
   
   3. handleSplashComplete trusts detectedRole from SplashView
      — No redundant role computation
   
   4. performFullReset uses nuclearReset() for complete cleanup
   
   5. handleHostMeetingStarted no longer calls markAsHost()
      — Eliminates stale host marks in localStorage
   ============================================ */
import { useState, useCallback, useEffect, useRef } from 'react';
import { ToastProvider, useToast } from './components/Toast';
import { EndMeetingModal } from './components/Modal';
import SplashView from './views/SplashView';
import WaitingView from './views/WaitingView';
import {
  getLastMeetingId,
  saveMeetingId,
  nuclearReset,
  isGenericName,
} from './utils/meetingStorage';
import SetupView from './views/SetupView';
import ChatView from './views/ChatView';
import DashboardView from './views/DashboardView';
import ExportModal from './views/ExportView';
import { endMeeting } from './api';
import { isInZoom, onMeetingEnded } from './zoom';
import { Icons } from './components/Icons';

function AppInner() {
  const [currentView, setCurrentView] = useState('splash');
  const [context, setContext] = useState(null);
  const [isHost, setIsHost] = useState(false);
  const [meetingInfo, setMeetingInfo] = useState({ company: null, companyName: null });
  const [showEndModal, setShowEndModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportLogs, setExportLogs] = useState([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  // Incremented on every meeting reset — forces SplashView, ChatView, DashboardView
  // to fully remount with clean state (prevents stale meeting data leaking across meetings)
  const [resetGeneration, setResetGeneration] = useState(0);
  const toast = useToast();

  // Use ref for meeting_id to avoid stale closures in event listeners
  const meetingIdRef = useRef(null);

  const handleClosePanel = useCallback(() => {
    setIsOpen(false);
  }, []);

  /**
   * Complete internal state reset.
   * Call this alongside nuclearReset() for full cleanup.
   */
  const resetAllState = useCallback(() => {
    setContext(null);
    setIsHost(false);
    setMeetingInfo({ company: null, companyName: null });
    setPendingCount(0);
    setExportLogs([]);
    setShowEndModal(false);
    setShowExportModal(false);
    meetingIdRef.current = null;
    // Bump generation BEFORE setting view to splash — this ensures the
    // new SplashView instance has a different key and starts completely fresh
    setResetGeneration(prev => prev + 1);
    setCurrentView('splash');
  }, []);

  /**
   * FULL END MEETING: API call + nuclear storage reset + state reset.
   * This is the nuclear option — wipes everything so next meeting
   * starts completely fresh.
   */
  const performFullReset = useCallback(async (meetingId) => {
    // 1. Tell backend to end meeting (deletes Vector DB + Knowledge Base + Chat History)
    try {
      const id = meetingId || meetingIdRef.current;
      if (id) {
        await endMeeting(id);
      }
    } catch (_) {
      console.warn('⚠️ Backend endMeeting failed, continuing with local reset');
    }

    // 2. Nuclear storage reset (ALL localStorage + sessionStorage)
    nuclearReset();

    // 3. Reset all React state
    resetAllState();

    console.log('🧹 Full meeting reset complete');
  }, [resetAllState]);

  // ── Listen for Zoom meeting end event ──
  // CRITICAL: Use cleanup function to prevent listener accumulation
  useEffect(() => {
    const cleanup = onMeetingEnded(async (event) => {
      console.log('🔴 Zoom meeting ended event received:', event);
      await performFullReset(meetingIdRef.current);
      toast.success('Meeting ended. All data has been deleted.');
    });

    // Return cleanup to remove the listener when deps change
    return cleanup;
  }, [performFullReset, toast]);

  /**
   * Splash completed — route based on role (from Zoom SDK) + meeting status.
   * 
   * detectedRole is set by SplashView using ONLY Zoom SDK data.
   * No localStorage role override here.
   *
   * Possible detectedRole values:
   *   'host'             → Fresh host, no active meeting → Setup
   *   'host-resume'      → Host returning to active meeting → Chat+Dashboard
   *   'participant'      → Participant already joined in this session → Chat
   *   'participant-setup' → Participant first time, meeting IS active → auto-join Chat
   *   'waiting'          → Participant, meeting NOT active yet → WaitingView
   */
  const handleSplashComplete = useCallback(async (ctx, companyInfo, detectedRole) => {
    setContext(ctx);

    // Trust the role determined by SplashView (from Zoom SDK)
    const hostRole = detectedRole === 'host' || detectedRole === 'host-resume';
    setIsHost(hostRole);

    // Save the current meeting ID for API calls
    if (ctx?.meeting_id) {
      saveMeetingId(ctx.meeting_id);
      meetingIdRef.current = ctx.meeting_id;
    }

    if (hostRole) {
      if (!companyInfo) {
        // Host: No active meeting → MUST go through Setup
        console.log("✅ Host: No active meeting → Setup (fresh start)");
        setMeetingInfo({ company: null, companyName: null });
        setPendingCount(0);
        setCurrentView("setup");
        return;
      }
      // Host: Active meeting exists → Resume Chat+Dashboard
      console.log("✅ Host: Active meeting found → Resuming Chat");
      setMeetingInfo({ company: companyInfo.id, companyName: companyInfo.name });
      setCurrentView('chat');
    } else {
      // ── PARTICIPANT ROUTING ──
      if (detectedRole === 'participant' && companyInfo) {
        // Already joined in this session → Chat directly
        console.log("✅ Participant: Session active & joined → Chat directly");
        setMeetingInfo({
          company: companyInfo.id,
          companyName: companyInfo.name,
        });
        setCurrentView('chat');
      } else if (detectedRole === 'participant-setup' && companyInfo) {
        // First time participant, meeting IS active → auto-join Chat
        // (SplashView already confirmed the meeting is active)
        console.log("✅ Participant: First time + meeting active → Auto-joining Chat");
        try {
          localStorage.setItem('mng_participant_user_name', ctx.user_name || 'Guest User');
          sessionStorage.setItem('mng_participant_joined', 'true');
        } catch (_) {}
        setMeetingInfo({
          company: companyInfo.id,
          companyName: companyInfo.name,
        });
        setContext(prev => ({
          ...prev,
          user_role: 'participant',
          is_host: false,
          isHost: false,
        }));
        setCurrentView('chat');
      } else {
        // Meeting not started yet or no company info → Waiting/Join View
        console.log("✅ Participant: Routing to Waiting View");
        if (companyInfo) {
          setMeetingInfo({
            company: companyInfo.id,
            companyName: companyInfo.name,
          });
        }
        setCurrentView('waiting');
      }
    }
  }, []);

  // ── HOST: Started meeting → Chat + Dashboard ──
  const handleHostMeetingStarted = useCallback((company, hostName, realMeetingId) => {
    const targetMeetingId = realMeetingId || context?.meeting_id || getLastMeetingId();
    if (targetMeetingId) {
      saveMeetingId(targetMeetingId);
      meetingIdRef.current = targetMeetingId;
    }

    const resolvedHostName = (!isGenericName(hostName))
      ? hostName
      : (!isGenericName(context?.user_name))
        ? context.user_name
        : (localStorage.getItem('mng_host_user_name') || 'Host');

    try {
      localStorage.setItem('mng_host_user_name', resolvedHostName);
      sessionStorage.setItem('mng_host_started', 'true');
    } catch (_) {}

    setIsHost(true);
    setMeetingInfo({ company: company.id, companyName: company.name });
    setContext(prev => ({
      ...prev,
      user_name: resolvedHostName,
      user_role: 'host',
      is_host: true,
      isHost: true,
      meeting_id: targetMeetingId || prev?.meeting_id,
    }));
    // Bump generation so ChatView & DashboardView remount with clean state
    setResetGeneration(prev => prev + 1);
    setCurrentView('chat');
  }, [context]);

  // ── PARTICIPANT: Joined meeting → Chat only ──
  const handleParticipantJoined = useCallback((company, participantName, realMeetingId) => {
    setIsHost(false);
    setMeetingInfo({ company: company.id, companyName: company.name });
    const targetMeetingId = realMeetingId || context?.meeting_id;
    if (targetMeetingId) {
      saveMeetingId(targetMeetingId);
      meetingIdRef.current = targetMeetingId;
    }

    const resolvedParticipantName = (!isGenericName(participantName))
      ? participantName
      : (!isGenericName(context?.user_name))
        ? context.user_name
        : (localStorage.getItem('mng_participant_user_name') || 'Guest User');

    try {
      localStorage.setItem('mng_participant_user_name', resolvedParticipantName);
      sessionStorage.setItem('mng_participant_joined', 'true');
    } catch (_) {}

    setContext(prev => ({
      ...prev,
      user_name: resolvedParticipantName,
      user_role: 'participant',
      is_host: false,
      isHost: false,
      meeting_id: targetMeetingId,
    }));
    setResetGeneration(prev => prev + 1);
    setCurrentView('chat');
  }, [context]);

  // Navigate between chat and dashboard (host only)
  const handleNavigate = useCallback((view) => {
    setCurrentView(view);
  }, []);

  // End meeting — show confirmation modal
  const handleEndMeetingRequest = useCallback(() => {
    setShowEndModal(true);
  }, []);

  // End meeting — CONFIRMED → full reset (Issue #2 fix)
  const handleEndMeetingConfirm = useCallback(async () => {
    setShowEndModal(false);
    await performFullReset(context?.meeting_id);
    toast.success('Meeting ended. All data has been deleted.');
  }, [context, performFullReset, toast]);

  // Export modal
  const handleExportRequest = useCallback((logs) => {
    setExportLogs(logs || []);
    setShowExportModal(true);
  }, []);

  // Dashboard logs updated → update pending count
  const handleLogsUpdated = useCallback((logs) => {
    const count = logs.filter(q => q.status === 'Partial' || q.status === 'Unresolved').length;
    setPendingCount(count);
  }, []);

  // Build a context object with is_host set from our dedicated state
  const ctxWithRole = context ? { ...context, is_host: isHost, isHost } : null;

  const isInMeeting = currentView === 'chat' || currentView === 'dashboard';

  const handleChangeCompany = useCallback(() => {
    setMeetingInfo({ company: null, companyName: null });
    setPendingCount(0);
    setExportLogs([]);
    setCurrentView('setup');
  }, []);

  const renderActiveView = () => {
    if (currentView === 'splash') {
      return <SplashView key={`splash-${resetGeneration}`} onComplete={handleSplashComplete} />;
    }
    if (currentView === 'waiting') {
      return (
        <WaitingView
          context={ctxWithRole}
          onMeetingActive={(meetingData, participantName, realMeetingId) => {
            // WaitingView auto-joined → route through handleParticipantJoined
            handleParticipantJoined(meetingData, participantName, realMeetingId);
          }}
          onClosePanel={!isInZoom ? handleClosePanel : null}
        />
      );
    }
    if (currentView === 'setup') {
      return (
        <SetupView
          context={ctxWithRole}
          meetingInfo={meetingInfo}
          onHostMeetingStarted={handleHostMeetingStarted}
          onParticipantJoined={handleParticipantJoined}
          onClosePanel={!isInZoom ? handleClosePanel : null}
        />
      );
    }

    // Chat + Dashboard: both stay MOUNTED — only CSS visibility changes
    return (
      <>
        <div style={{ display: currentView === 'chat' ? 'flex' : 'none', flexDirection: 'column', height: '100%', width: '100%' }}>
          <ChatView
            key={`chat-${resetGeneration}`}
            context={ctxWithRole}
            meetingInfo={meetingInfo}
            onNavigate={handleNavigate}
            onEndMeeting={handleEndMeetingRequest}
            onChangeCompany={handleChangeCompany}
            pendingCount={pendingCount}
            onClosePanel={!isInZoom ? handleClosePanel : null}
          />
        </div>
        <div style={{ display: currentView === 'dashboard' ? 'flex' : 'none', flexDirection: 'column', height: '100%', width: '100%' }}>
          <DashboardView
            key={`dash-${resetGeneration}`}
            context={ctxWithRole}
            meetingInfo={meetingInfo}
            onNavigate={handleNavigate}
            onEndMeeting={handleEndMeetingRequest}
            onChangeCompany={handleChangeCompany}
            onExport={handleExportRequest}
            onLogsUpdated={handleLogsUpdated}
            onClosePanel={!isInZoom ? handleClosePanel : null}
          />
        </div>
      </>
    );
  };

  // ZOOM SIDEBAR MODE
  if (isInZoom) {
    return (
      <>
        <div style={{ height: '100%', width: '100%', display: 'flex', flexDirection: 'column' }}>
          {renderActiveView()}
        </div>
        {showEndModal && (
          <EndMeetingModal
            onConfirm={handleEndMeetingConfirm}
            onClose={() => setShowEndModal(false)}
          />
        )}
        {showExportModal && (
          <ExportModal
            logs={exportLogs}
            meetingId={context?.meeting_id}
            companyName={meetingInfo.companyName}
            onClose={() => setShowExportModal(false)}
          />
        )}
      </>
    );
  }

  // BROWSER MODE
  return (
    <>
      {isOpen && (
        <div className="float-panel">
          {renderActiveView()}
        </div>
      )}
      <button className="fab" onClick={() => setIsOpen(!isOpen)} title="Open Meeting Assistant">
        {isOpen ? Icons.x : Icons.bot}
        {!isOpen && pendingCount > 0 && <span className="fab-badge">{pendingCount}</span>}
      </button>
      {showEndModal && (
        <EndMeetingModal
          onConfirm={handleEndMeetingConfirm}
          onClose={() => setShowEndModal(false)}
        />
      )}
      {showExportModal && (
        <ExportModal
          logs={exportLogs}
          meetingId={context?.meeting_id}
          companyName={meetingInfo.companyName}
          onClose={() => setShowExportModal(false)}
        />
      )}
    </>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AppInner />
    </ToastProvider>
  );
}
