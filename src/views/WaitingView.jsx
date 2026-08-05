/* ============================================
   MNG Bot — Waiting View
   Style matched 1:1 with mng-meeting-room
   ============================================ */
import { useEffect, useState, useRef } from 'react';
import { checkMeetingStatusById } from '../api';
import { Icons } from '../components/Icons';

export default function WaitingView({ meetingId, participantName, onMeetingActive, onBack }) {
  const [statusMsg, setStatusMsg] = useState('Checking host status...');
  const [isJoining, setIsJoining] = useState(false);
  const onMeetingActiveRef = useRef(onMeetingActive);
  onMeetingActiveRef.current = onMeetingActive;

  useEffect(() => {
    let isMounted = true;
    let timer = null;

    if (!meetingId) {
      setStatusMsg('No Meeting ID provided.');
      return;
    }

    const checkStatus = async () => {
      try {
        const res = await checkMeetingStatusById(meetingId);
        const isStarted = res?.active === true || res?.status === true;

        if (isStarted && isMounted) {
          if (timer) {
            clearInterval(timer);
            timer = null;
          }

          setStatusMsg(`Host is active (${res.company || 'Meeting'})`);
          setIsJoining(true);

          setTimeout(() => {
            if (isMounted && onMeetingActiveRef.current) {
              onMeetingActiveRef.current({
                meeting_id: res.meeting_id || meetingId,
                company: res.company || 'Meeting',
                host_name: res.host_name || 'Host',
              });
            }
          }, 500);
        } else if (isMounted) {
          setStatusMsg('Waiting for host to launch knowledge session...');
        }
      } catch (err) {
        if (isMounted) setStatusMsg('Connecting to meeting server...');
      }
    };

    checkStatus();
    timer = setInterval(checkStatus, 2000);

    return () => {
      isMounted = false;
      if (timer) clearInterval(timer);
    };
  }, [meetingId]);

  const handleManualCheck = async () => {
    if (!meetingId) return;
    try {
      const res = await checkMeetingStatusById(meetingId);
      const isStarted = res?.active === true || res?.status === true;

      if (isStarted) {
        setIsJoining(true);
        setTimeout(() => {
          if (onMeetingActiveRef.current) {
            onMeetingActiveRef.current({
              meeting_id: res.meeting_id || meetingId,
              company: res.company || 'Meeting',
              host_name: res.host_name || 'Host',
            });
          }
        }, 300);
      }
    } catch (_) {}
  };

  return (
    <div className="flex flex-col h-full bg-[#2B2D33]">
      {/* Top Navigation Header Bar */}
      <header className="app-header h-[64px] px-6 bg-[#363B48] border-b border-white/5 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <img src="./MNG_Health.png" alt="MNG Health" className="h-8 w-auto object-contain shrink-0 drop-shadow" />
          <span className="text-[15px] font-bold text-white">
            MNG Intelligence Waiting Room
          </span>
        </div>

        <div className="flex items-center gap-3.5">
          <div className="flex items-center gap-1.5 text-xs text-[#9CA3B6] font-medium">
            {Icons.user}
            <span className="text-white font-semibold">{participantName || 'Participant'}</span>
          </div>
        </div>
      </header>

      {/* Main Centered Content */}
      <div className="flex-1 flex items-center justify-center p-6">
        {/* Centered Glass Modal Card */}
        <div className="max-w-[460px] w-full bg-[#363B48] rounded-[24px] px-8 py-9 border border-white/10 shadow-2xl flex flex-col items-center text-center">
          {/* Glowing Animated Icon Emblem */}
          <div className={`w-20 h-20 rounded-full flex items-center justify-center text-4xl mb-5 border-2 transition-all ${
            isJoining
              ? 'bg-[#32D74B]/15 border-[#32D74B] shadow-[0_0_24px_rgba(50,215,75,0.35)]'
              : 'bg-[#2777FF]/15 border-[#2777FF] shadow-[0_0_24px_rgba(39,119,255,0.35)]'
          }`}>
            {isJoining ? '🚀' : '⏳'}
          </div>

          {/* Heading Title */}
          <h2 className="text-[22px] font-bold text-white mb-2 leading-tight">
            {isJoining ? 'Session Active! Joining... 🚀' : 'Waiting for Host...'}
          </h2>

          <p className="text-[13px] text-[#9CA3B6] mb-6 leading-relaxed max-w-[360px]">
            {isJoining
              ? 'Host has started the session. Connecting to live chat...'
              : 'The host will start the intelligence session shortly. You will be connected automatically.'}
          </p>

          {/* Meeting ID Badge Card */}
          <div className="w-full bg-[#2A2E39] rounded-[14px] px-4 py-3 mb-6 border border-white/5 flex items-center justify-between">
            <span className="text-xs text-[#9CA3B6] font-semibold">🔑 Meeting ID</span>
            <span className="text-[15px] font-bold text-[#82B4FF] font-mono ml-2">
              {meetingId}
            </span>
          </div>

          {/* Status Indicator & Action Row */}
          {isJoining ? (
            <div className="w-full flex items-center justify-center gap-2.5 px-5 py-3.5 bg-[#32D74B]/15 rounded-full border border-[#32D74B]">
              <div className="spinner spinner--sm border-t-[#32D74B]" />
              <span className="text-sm font-bold text-[#32D74B]">Joining Chat Session...</span>
            </div>
          ) : (
            <div className="w-full flex flex-col gap-3.5">
              {/* Live Polling Status Pill */}
              <div className="flex items-center justify-center gap-2 px-4 py-2.5 bg-[#2777FF]/10 rounded-full border border-[#2777FF]/20">
                <div className="spinner spinner--sm border-t-[#2777FF]" />
                <span className="text-xs font-semibold text-[#82B4FF]">
                  Live polling active (checking every 2s)...
                </span>
              </div>

              {/* Action Buttons Row */}
              <div className="flex gap-2.5 w-full">
                <button
                  className="btn btn--secondary flex-1 py-2.5 px-4 text-xs rounded-full"
                  onClick={onBack}
                >
                  ← Back
                </button>
                
                <button
                  className="btn btn--primary flex-1 py-2.5 px-4 text-xs rounded-full"
                  onClick={handleManualCheck}
                >
                  🔄 Refresh Status
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
