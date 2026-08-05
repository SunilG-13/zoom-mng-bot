import { useState, useRef } from 'react';
import { Icons } from './Icons';

export default function SessionHeader({
  context,
  meetingInfo,
  currentView,
  onNavigate,
  onEndMeeting,
  onChangeCompany,
  onLeaveSession,
  pendingCount = 0
}) {
  const isHost = context?.is_host || context?.isHost;
  const userName = context?.user_name || 'User';
  const meetingId = context?.meeting_id || '';
  const userInitial = userName ? userName.trim().charAt(0).toUpperCase() : 'U';

  const [isOpen, setIsOpen] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const timeoutRef = useRef(null);

  const handleMouseEnter = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setIsOpen(true);
  };

  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => {
      setIsOpen(false);
    }, 180);
  };

  const handleCopyId = (e) => {
    e.stopPropagation();
    if (!meetingId) return;
    navigator.clipboard?.writeText(meetingId);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  return (
    <header className="app-header h-[56px] sm:h-[64px] px-3 sm:px-6 bg-[#363B48] border-b border-white/5 flex items-center justify-between shrink-0 z-[200] relative">
      {/* Left: Logo & Company Context */}
      <div className="items-center gap-2 sm:gap-3 min-w-0 hidden md:flex justify-center">
        <div className="hidden md:block">
        <img src="./MNG_Health.png" alt="MNG Health" className="h-6 sm:h-8 w-auto object-contain shrink-0 drop-shadow" />
        </div>
        <div className="min-w-0">
          <div className="text-xs sm:text-[15px] font-bold text-white leading-snug truncate">
            <span className="hidden md:inline">MNG Intelligence Session</span>
            <span className="hidden">MNG Session</span>
          </div>
          {/* <div className="flex items-center gap-1 mt-0.5 min-w-0">
            <span className="text-[10px] sm:text-[11px] text-[#82B4FF] font-semibold truncate max-w-[100px] sm:max-w-[150px]">
              🏢 {meetingInfo?.companyName || 'Company'}
            </span>
            <span className="text-[9px] sm:text-[10px] text-[#9CA3B6] font-mono">
              • {meetingId}
            </span>
            {isHost && onChangeCompany && (
              <button
                onClick={onChangeCompany}
                className="text-[9px] sm:text-[10px] px-1 py-[1px] text-[#82B4FF] border border-[#2777FF]/30 rounded bg-transparent cursor-pointer hover:bg-[#2777FF]/10 transition-colors hidden sm:inline-block"
                title="Change Company Knowledge Base"
              >
                ✏️
              </button>
            )}
          </div> */}
        </div>
      </div>

      {/* Center: Segmented Control Tabs (Host only) */}
      {isHost && (
        <div className="flex items-center mx-1 sm:mx-2 shrink-0">
          <div className="tab-nav p-0.5 sm:p-1 gap-1">
            <button
              className={`tab-nav__item text-xs px-2.5 sm:px-4 py-1 sm:py-1.5 ${currentView === 'chat' ? 'tab-nav__item--active' : ''}`}
              onClick={() => onNavigate('chat')}
            >
              <span className="w-3.5 h-3.5 sm:w-4 sm:h-4">{Icons.messageSquare}</span>
              <span className=''>Chat</span>
            </button>
            <button
              className={`tab-nav__item text-xs px-2.5 sm:px-4 py-1 sm:py-1.5 ${currentView === 'dashboard' ? 'tab-nav__item--active' : ''}`}
              onClick={() => onNavigate('dashboard')}
            >
              <span className="w-3.5 h-3.5 sm:w-4 sm:h-4">{Icons.layoutDashboard}</span>
              <span className=''>Dashboard</span>
              {pendingCount > 0 && (
                <span className="tab-nav__badge">{pendingCount}</span>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Right: Live Badge & Profile Avatar */}
      <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
      

        {/* Profile Icon Button with Hover Dropdown */}
        <div
          className="relative"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <button
            type="button"
            className={`flex items-center gap-1.5 sm:gap-2.5 px-1.5 sm:px-2.5 py-1 sm:py-1.5 rounded-full border transition-all cursor-pointer ${
              isOpen
                ? 'bg-white/10 border-[#2777FF] shadow-[0_0_14px_rgba(39,119,255,0.35)]'
                : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20'
            }`}
          >
            {/* Avatar Circle */}
            <div className="relative flex items-center justify-center w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-gradient-to-br from-[#2777FF] to-[#32A2FF] text-white font-bold text-xs shadow-md shrink-0">
              {userInitial}
              <span
                className="absolute -bottom-0.5 -right-0.5 w-1.5 h-1.5 sm:w-2 sm:h-2 bg-[#32D74B] rounded-full ring-2 ring-[#363B48]"
                title="Online"
              />
            </div>

            {/* Display Name & Role */}
            <div className="flex flex-col text-left leading-tight hidden md:flex">
              <span className="text-xs font-semibold text-white truncate max-w-[100px]">
                {userName}
              </span>
              <span className="text-[10px] text-[#9CA3B6] font-medium">
                {isHost ? 'Host' : 'Participant'}
              </span>
            </div>

            {/* Chevron Icon */}
            <span className={`text-[#9CA3B6] w-3 h-3 sm:w-3.5 sm:h-3.5 transition-transform duration-200 ${isOpen ? 'rotate-180 text-white' : ''}`}>
              {Icons.chevronDown}
            </span>
          </button>

          {/* Hover Dropdown Menu */}
          {isOpen && (
            <div className="absolute right-0 top-full mt-2 w-64 sm:w-72 bg-[#2A2E39] border border-white/10 rounded-2xl shadow-2xl shadow-black/80 backdrop-blur-xl p-3 sm:p-3.5 z-[300] animate-fade-in text-left">
              {/* Profile Card Header */}
              <div className="flex items-center gap-2.5 sm:gap-3 p-2.5 rounded-xl bg-white/5 border border-white/5 mb-2.5">
                <div className="flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-gradient-to-br from-[#2777FF] to-[#32A2FF] text-white font-bold text-sm shadow-md shrink-0">
                  {userInitial}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs sm:text-sm font-bold text-white truncate leading-snug">
                    {userName}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className={`px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-extrabold uppercase border ${
                      isHost
                        ? 'bg-[#2777FF]/20 text-[#82B4FF] border-[#2777FF]/40'
                        : 'bg-[#32D74B]/20 text-[#32D74B] border-[#32D74B]/40'
                    }`}>
                      {isHost ? 'Host' : 'Participant'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Session Meta Info */}
              <div className="px-2 py-1 flex flex-col gap-1.5 text-xs text-[#9CA3B6]">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] sm:text-[11px] text-[#6C748A]">Company KB:</span>
                  <span className="font-semibold text-[#82B4FF] truncate max-w-[140px]">
                    🏢 {meetingInfo?.companyName || 'N/A'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] sm:text-[11px] text-[#6C748A]">Meeting ID:</span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-white font-semibold">{meetingId || 'N/A'}</span>
                    {meetingId && (
                      <button
                        type="button"
                        onClick={handleCopyId}
                        className="px-1.5 py-0.5 text-[10px] text-[#82B4FF] hover:text-white bg-white/5 hover:bg-white/10 rounded transition-colors cursor-pointer flex items-center gap-1"
                        title="Copy Meeting ID"
                      >
                        {copiedId ? (
                          <span className="text-[#32D74B] font-bold">✓ Copied</span>
                        ) : (
                          <>
                            <span className="w-3 h-3 block">{Icons.copy}</span>
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {isHost && (onChangeCompany || onEndMeeting) && (
                <>
                  <div className="h-px bg-white/10 my-2" />
                  <div className="flex flex-col gap-1">
                    {onChangeCompany && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsOpen(false);
                          onChangeCompany();
                        }}
                        className="flex items-center gap-2.5 w-full px-3 py-2 text-xs font-medium text-[#82B4FF] hover:text-white hover:bg-[#2777FF]/20 rounded-xl transition-all cursor-pointer"
                      >
                        <span className="w-4 h-4">{Icons.edit}</span>
                        <span>Change Company KB</span>
                      </button>
                    )}

                    {onEndMeeting && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsOpen(false);
                          onEndMeeting();
                        }}
                        className="flex items-center gap-2.5 w-full px-3 py-2 text-xs font-medium text-[#E12A1F] hover:text-white hover:bg-[#E12A1F]/20 rounded-xl transition-all cursor-pointer"
                      >
                        <span className="w-4 h-4">{Icons.power}</span>
                        <span>End Session</span>
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
