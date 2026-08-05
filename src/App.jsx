/* ============================================
   MNG Bot — Main App Controller

   ARCHITECTURE:
   - Landing → Host Entry or Participant Entry
   - Host: Host Entry → (start_meeting API) → Chat + Dashboard
   - Participant: Participant Entry → (check status) → Waiting or Chat
   - Waiting → (auto-poll) → Chat when host starts
   
   Meeting ID entered by the user is the SINGLE SOURCE OF TRUTH.
   No Zoom SDK auto-detection for meeting_id or role.
   ============================================ */
import { useState, useCallback, useEffect, useRef } from 'react';
import { ToastProvider, useToast } from './components/Toast';
import { EndMeetingModal } from './components/Modal';
import LandingView from './views/LandingView';
import HostEntryView from './views/HostEntryView';
import ParticipantEntryView from './views/ParticipantEntryView';
import WaitingView from './views/WaitingView';
import ChatView from './views/ChatView';
import DashboardView from './views/DashboardView';
import ExportModal from './views/ExportView';
import SessionHeader from './components/SessionHeader';
import { endMeeting } from './api';
import { Icons } from './components/Icons';

function AppInner() {
  const [currentView, setCurrentView] = useState('landing');
  const [context, setContext] = useState(null);
  const [isHost, setIsHost] = useState(false);
  const [meetingInfo, setMeetingInfo] = useState({ company: null, companyName: null });
  const [showEndModal, setShowEndModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportLogs, setExportLogs] = useState([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [resetGeneration, setResetGeneration] = useState(0);
  const toast = useToast();

  const meetingIdRef = useRef(null);

  /**
   * Reset all state — return to landing page.
   */
  const resetAllState = useCallback(() => {
    meetingIdRef.current = null;
    setContext(null);
    setIsHost(false);
    setMeetingInfo({ company: null, companyName: null });
    setPendingCount(0);
    setExportLogs([]);
    setShowEndModal(false);
    setShowExportModal(false);
    setResetGeneration(prev => prev + 1);
    setCurrentView('landing');
  }, []);

  /**
   * FULL END MEETING: API call + state reset.
   */
  const performFullReset = useCallback(async (meetingId) => {
    const id = meetingId || meetingIdRef.current;
    if (id) {
      try {
        await endMeeting(id);
      } catch (_) {
        console.warn('⚠️ Backend endMeeting failed, continuing with local reset');
      }
    }

    resetAllState();
    console.log('🧹 Full meeting reset complete');
  }, [resetAllState]);

  /**
   * Landing View → User selects Host or Participant.
   */
  const handleSelectRole = useCallback((role) => {
    if (role === 'host') {
      setCurrentView('host-entry');
    } else {
      setCurrentView('participant-entry');
    }
  }, []);

  /**
   * HOST: Meeting started successfully → navigate to Chat + Dashboard.
   * Called from HostEntryView after /start_meeting succeeds.
   */
  const handleHostMeetingStarted = useCallback((data) => {
    const { meeting_id, company, host_name } = data;

    // Generate a session_id for this host session
    const session_id = crypto.randomUUID();

    meetingIdRef.current = meeting_id;

    const newContext = {
      meeting_id,
      session_id,
      user_name: host_name,
      user_role: 'host',
      is_host: true,
      isHost: true,
    };

    setContext(newContext);
    setIsHost(true);
    setMeetingInfo({
      company: company.toLowerCase().replace(/\s+/g, '_'),
      companyName: company,
    });
    setResetGeneration(prev => prev + 1);
    setCurrentView('chat');
  }, []);

  /**
   * PARTICIPANT: Joined meeting → navigate to Chat or Waiting.
   * Called from ParticipantEntryView after /status check.
   */
  const handleParticipantJoin = useCallback((data) => {
    const { meeting_id, participant_name, meetingActive, company, host_name } = data;

    // Generate a session_id for this participant session
    const session_id = crypto.randomUUID();

    meetingIdRef.current = meeting_id;

    const newContext = {
      meeting_id,
      session_id,
      user_name: participant_name,
      user_role: 'participant',
      is_host: false,
      isHost: false,
    };

    setContext(newContext);
    setIsHost(false);

    if (meetingActive && company) {
      // Meeting is already active → go straight to Chat
      setMeetingInfo({
        company: company.toLowerCase().replace(/\s+/g, '_'),
        companyName: company,
      });
      setResetGeneration(prev => prev + 1);
      setCurrentView('chat');
    } else {
      // Meeting not started yet → go to Waiting
      setCurrentView('waiting');
    }
  }, []);

  /**
   * WAITING → Meeting becomes active → navigate to Chat.
   * Called from WaitingView when polling detects the meeting started.
   */
  const handleWaitingMeetingActive = useCallback((meetingData) => {
    // meetingData = { meeting_id, company, host_name }
    if (meetingData.company) {
      setMeetingInfo({
        company: meetingData.company.toLowerCase().replace(/\s+/g, '_'),
        companyName: meetingData.company,
      });
    }
    setResetGeneration(prev => prev + 1);
    setCurrentView('chat');
  }, []);

  // Navigate between Chat and Dashboard (host only)
  const handleNavigate = useCallback((view) => {
    if (view === 'chat' && !context?.meeting_id) {
      console.error('Meeting ID missing');
      return;
    }
    setCurrentView(view);
  }, [context?.meeting_id]);

  const handleEndMeetingRequest = useCallback(() => {
    setShowEndModal(true);
  }, []);

  const handleEndMeetingConfirm = useCallback(async () => {
    setShowEndModal(false);
    const targetMeetingId = context?.meeting_id || meetingIdRef.current;
    await performFullReset(targetMeetingId);
    toast.success('Meeting ended. All data has been deleted.');
  }, [context, performFullReset, toast]);

  const handleExportRequest = useCallback((logs) => {
    setExportLogs(logs || []);
    setShowExportModal(true);
  }, []);

  const handleLogsUpdated = useCallback((logs) => {
    const count = logs.filter(q => q.status === 'Partial' || q.status === 'Unresolved').length;
    setPendingCount(count);
  }, []);

  const handleChangeCompany = useCallback(() => {
    // Go back to host entry to change company
    setMeetingInfo({ company: null, companyName: null });
    setPendingCount(0);
    setExportLogs([]);
    setCurrentView('host-entry');
  }, []);

  const renderActiveView = () => {
    if (currentView === 'landing') {
      return <LandingView onSelectRole={handleSelectRole} />;
    }

    if (currentView === 'host-entry') {
      return (
        <HostEntryView
          onMeetingStarted={handleHostMeetingStarted}
          onBack={() => setCurrentView('landing')}
        />
      );
    }

    if (currentView === 'participant-entry') {
      return (
        <ParticipantEntryView
          onJoin={handleParticipantJoin}
          onBack={() => setCurrentView('landing')}
        />
      );
    }

    if (currentView === 'waiting') {
      return (
        <WaitingView
          meetingId={context?.meeting_id}
          participantName={context?.user_name}
          onMeetingActive={handleWaitingMeetingActive}
          onBack={() => setCurrentView('landing')}
        />
      );
    }

    // Chat + Dashboard views under fixed SessionHeader
    return (
      <div className="flex flex-col h-full w-full">
        <SessionHeader
          context={context}
          meetingInfo={meetingInfo}
          currentView={currentView}
          onNavigate={handleNavigate}
          onEndMeeting={handleEndMeetingRequest}
          onChangeCompany={isHost ? handleChangeCompany : undefined}
          onLeaveSession={resetAllState}
          pendingCount={pendingCount}
        />
        <div className="flex-1 min-h-0 flex flex-col">
          <div className={`flex-col h-full w-full ${currentView === 'chat' ? 'flex' : 'hidden'}`}>
            <ChatView
              key={`chat-${resetGeneration}`}
              context={context}
              meetingInfo={meetingInfo}
            />
          </div>
          <div className={`flex-col h-full w-full ${currentView === 'dashboard' ? 'flex' : 'hidden'}`}>
            <DashboardView
              key={`dash-${resetGeneration}`}
              context={context}
              meetingInfo={meetingInfo}
              onExport={handleExportRequest}
              onLogsUpdated={handleLogsUpdated}
            />
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="h-full w-full flex flex-col">
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

export default function App() {
  return (
    <ToastProvider>
      <AppInner />
    </ToastProvider>
  );
}
