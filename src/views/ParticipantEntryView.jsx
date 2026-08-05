/* ============================================
   MNG Bot — Participant Entry View
   Clean Centered Form with Back + Join Session button row
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
      const isActive = res.active === true || res.status === true;

      if (isActive) {
        onJoin({
          meeting_id: finalMeetingId,
          participant_name: finalName,
          meetingActive: true,
          company: res.company || null,
          host_name: res.host_name || null,
        });
      } else {
        onJoin({
          meeting_id: finalMeetingId,
          participant_name: finalName,
          meetingActive: false,
          company: null,
          host_name: null,
        });
      }
    } catch (err) {
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
    <div className="flex flex-col items-center justify-center h-full w-full bg-[#2B2D33] p-6">
      {/* Centered Join Form Card */}
      <div className="max-w-[440px] w-full bg-[#363B48] rounded-[24px] px-4 py-4 shadow-2xl shadow-black/50 flex flex-col items-center border border-white/5">
        {/* Official Brand MNG Logo Header */}
        <div className="flex items-center justify-center mb-3">
          <img src="./MNG_Health.png" alt="MNG Health" className="h-8 w-auto object-contain drop-shadow-md" />
        </div>

        <h2 className="text-[20px] font-bold text-white mb-1 text-center">
          Join Clinical Session
        </h2>

        <p className="text-[12px] text-[#9CA3B6] mb-6 text-center leading-relaxed">
          Enter your display name and Meeting ID provided by the host.
        </p>

        {/* Form Inputs Container */}
        <div className="w-full flex flex-col gap-4 mb-6">
          
          {/* Participant Name Input */}
          <div>
            <label className="text-[11px] font-bold text-[#9CA3B6] uppercase tracking-wider mb-1.5 block text-left">
              Your Display Name
            </label>
            <div className="search-input rounded-[12px]">
              <span className="text-[#82B4FF]">{Icons.user}</span>
              <input
                type="text"
                placeholder="e.g. Alex Morgan"
                value={participantName}
                onChange={e => setParticipantName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && canJoin && handleJoin()}
                autoFocus
              />
            </div>
          </div>

          {/* Meeting ID Input */}
          <div>
            <label className="text-[11px] font-bold text-[#9CA3B6] uppercase tracking-wider mb-1.5 block text-left">
              Meeting ID
            </label>
            <div className="search-input rounded-[12px]">
              <span className="text-[#82B4FF]">{Icons.fileText}</span>
              <input
                type="text"
                placeholder="e.g. MNG001"
                value={meetingId}
                onChange={e => setMeetingId(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && canJoin && handleJoin()}
              />
            </div>
          </div>

        </div>

        {/* Action Buttons Row: Back + Join Session */}
        <div className="flex gap-3 w-full">
          <button
            type="button"
            onClick={onBack}
            className="w-[32%] p-2 rounded-[14px] bg-[#44495B] hover:bg-[#4c5266] active:scale-[0.99] text-white text-sm font-semibold border border-white/10 cursor-pointer flex items-center justify-center gap-1.5 transition-all"
          >
            ← Back
          </button>

          <button
            type="button"
            disabled={!canJoin || isChecking}
            onClick={handleJoin}
            className={`w-[68%] p-2 rounded-[14px] text-white text-sm font-bold border-0 flex items-center justify-center gap-2 transition-all ${
              canJoin && !isChecking
                ? 'bg-[#2777FF] hover:bg-[#1e5fc9] active:scale-[0.99] cursor-pointer shadow-[0_6px_20px_rgba(39,119,255,0.35)]'
                : 'bg-[#2777FF]/40 cursor-not-allowed'
            }`}
          >
            {isChecking ? (
              <><div className="spinner spinner--sm border-t-white" /> Verifying...</>
            ) : (
              <>Join Session →</>
            )}
          </button>
        </div>

        <p className="mt-5 text-[11px] text-[#6C748A] text-center leading-relaxed">
          If the host hasn't launched the session yet,<br />
          you will enter the waiting room automatically.
        </p>
      </div>
    </div>
  );
}
