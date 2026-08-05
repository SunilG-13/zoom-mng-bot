/* ============================================
   MNG Bot — Host Entry View
   Clean Centered Setup Form with Back + Start Session button row
   ============================================ */
import { useState, useRef } from 'react';
import { Icons } from '../components/Icons';
import { startMeeting, CONFIG } from '../api';
import { useToast } from '../components/Toast';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

export default function HostEntryView({ onMeetingStarted, onBack }) {
  const [hostName, setHostName] = useState('');
  const [meetingId, setMeetingId] = useState('');
  const [company, setCompany] = useState('');
  const [screen, setScreen] = useState('form');
  const [loadSteps, setLoadSteps] = useState([0, 0, 0, 0, 0]);
  const [doneMsg, setDoneMsg] = useState('');
  const [copiedId, setCopiedId] = useState(false);
  const cancelRef = useRef(false);
  const toast = useToast();

  const canStart = hostName.trim().length > 0 && meetingId.trim().length > 0 && company.trim().length > 0;

  const handleStartMeeting = async () => {
    if (!canStart) return;
    cancelRef.current = false;

    const finalName = hostName.trim();
    const finalMeetingId = meetingId.trim();
    const finalCompany = company.trim();

    setScreen('loading');

    const stepDurations = [500, 600, 600, 500, 400];
    for (let i = 0; i < 5; i++) {
      if (cancelRef.current) return;
      setLoadSteps(prev => { const n = [...prev]; n[i] = 1; return n; });
      await sleep(stepDurations[i]);
      setLoadSteps(prev => { const n = [...prev]; n[i] = 2; return n; });
    }

    try {
      const result = await startMeeting(finalMeetingId, finalCompany, finalName);
      setDoneMsg(result.message || `${finalCompany} knowledge base loaded!`);
      setScreen('done');
    } catch (err) {
      toast.error('Failed to start meeting: ' + err.message);
      setScreen('form');
      setLoadSteps([0, 0, 0, 0, 0]);
    }
  };

  const handleCopyId = () => {
    if (!meetingId) return;
    navigator.clipboard?.writeText(meetingId.trim());
    setCopiedId(true);
    toast.success('Meeting ID copied!');
    setTimeout(() => setCopiedId(false), 2000);
  };

  const handleOpenChat = () => {
    if (!onMeetingStarted) return;
    onMeetingStarted({
      meeting_id: meetingId.trim(),
      company: company.trim(),
      host_name: hostName.trim(),
    });
  };

  const stepLabels = [
    'Locating Knowledge Directory',
    'Ingesting PDF Monograph Documents',
    'Extracting Clinical Text',
    'Generating Vector Embeddings',
    'AI Assistant Ready'
  ];

  if (screen === 'form') {
    return (
      <div className="flex flex-col items-center justify-center h-full w-full bg-[#2B2D33] p-4 my5">
        {/* Centered Setup Form Card */}
        <div className="max-w-[500px] w-full bg-[#363B48] rounded-[24px] px-7 py-4 shadow-2xl shadow-black/50 flex flex-col items-center border border-white/5">
          {/* Official Brand MNG Logo Header */}
          <div className="flex items-center justify-center mb-3">
            <img src="./MNG_Health.png" alt="MNG Health" className="h-9 w-auto object-contain drop-shadow-md" />
          </div>

          <h2 className="text-[24px] font-bold text-white mb-1 text-center">
            Host Setup
          </h2>
          
          <p className="text-[13px] text-[#9CA3B6] mb-6 text-center leading-relaxed">
            Enter host details, define a Meeting ID, and select the drug knowledge base.
          </p>

          {/* Form Fields Container */}
          <div className="w-full flex flex-col gap-4 mb-6">
            
            {/* Host Name Input */}
            <div>
              <label className="text-[11px] font-bold text-[#9CA3B6] uppercase tracking-wider mb-1.5 block text-left">
                Your Name (Host)
              </label>
              <div className="search-input rounded-[12px]">
                <span className="text-[#82B4FF]">{Icons.user}</span>
                <input
                  type="text"
                  placeholder="e.g. Dr. Alex Morgan"
                  value={hostName}
                  onChange={e => setHostName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && canStart && handleStartMeeting()}
                  autoFocus
                />
              </div>
            </div>

            {/* Meeting ID Input */}
            <div>
              <label className="text-[11px] font-bold text-[#9CA3B6] uppercase tracking-wider mb-1.5 block text-left">
                Meeting ID (Single Source of Truth)
              </label>
              <div className="search-input rounded-[12px]">
                <span className="text-[#82B4FF]">{Icons.fileText}</span>
                <input
                  type="text"
                  placeholder="e.g. MNG001"
                  value={meetingId}
                  onChange={e => setMeetingId(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && canStart && handleStartMeeting()}
                />
              </div>
            </div>

            {/* Company Knowledge Base Input */}
            <div>
              <label className="text-[11px] font-bold text-[#9CA3B6] uppercase tracking-wider mb-1.5 block text-left">
                Company Knowledge Base
              </label>
              <div className="search-input rounded-[12px] mb-2.5">
                <span className="text-[#82B4FF]">{Icons.folder}</span>
                <input
                  type="text"
                  placeholder="Type company name or pick preset..."
                  value={company}
                  onChange={e => setCompany(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && canStart && handleStartMeeting()}
                />
              </div>

              {/* Company Presets Chips */}
              <div className="flex flex-wrap gap-1.5">
                {CONFIG.COMPANIES.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCompany(c.name)}
                    className={`btn-ai-sugg mr-0 px-2.5 py-1 text-[11px] rounded-full transition-all cursor-pointer ${
                      company.toLowerCase() === c.name.toLowerCase()
                        ? 'bg-[#2777FF] text-white border-0 font-bold'
                        : 'bg-[#2777FF]/10 text-[#82B4FF] border border-[#2777FF]/20 hover:bg-[#2777FF]/20'
                    }`}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Action Buttons Row: Back + Start Session */}
          <div className="flex gap-3 w-full">
            <button
              type="button"
              onClick={onBack}
              className="w-[32%] py-3.5 px-4 rounded-[14px] bg-[#44495B] hover:bg-[#4c5266] active:scale-[0.99] text-white text-sm font-semibold border border-white/10 cursor-pointer flex items-center justify-center gap-1.5 transition-all"
            >
              ← Back
            </button>

            <button
              type="button"
              disabled={!canStart}
              onClick={handleStartMeeting}
              className={`w-[68%] py-3.5 px-[18px] rounded-[14px] text-white text-sm font-bold border-0 flex items-center justify-center gap-2 transition-all ${
                canStart
                  ? 'bg-[#2777FF] hover:bg-[#1e5fc9] active:scale-[0.99] cursor-pointer shadow-[0_6px_20px_rgba(39,119,255,0.35)]'
                  : 'bg-[#2777FF]/40 cursor-not-allowed'
              }`}
            >
              Start Session
            </button>
          </div>

        </div>
      </div>
    );
  }

  if (screen === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center h-full w-full bg-[#2B2D33] p-6">
        <div className="max-w-[440px] w-full bg-[#363B48] rounded-[24px] px-7 py-9 shadow-2xl shadow-black/50 flex flex-col items-center text-center border border-white/5">
          <div className="spinner spinner--lg mb-5 border-t-[#2777FF]" />
          
          <h3 className="text-[20px] font-bold text-white mb-1.5">
            Loading {company.trim()} Knowledge Base...
          </h3>
          
          <p className="text-[13px] text-[#9CA3B6] mb-6 leading-relaxed">
            Preparing AI vector index for Meeting ID: <strong className="text-[#82B4FF] font-mono">{meetingId.trim()}</strong>
          </p>

          <div className="w-full bg-[#2A2E39] rounded-[16px] p-5 flex flex-col gap-3 text-left border border-white/5">
            {stepLabels.map((label, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                  loadSteps[i] === 2
                    ? 'bg-[#32D74B]/20 text-[#32D74B] border border-[#32D74B]'
                    : loadSteps[i] === 1
                      ? 'bg-[#2777FF]/20 text-[#82B4FF] border border-[#2777FF]'
                      : 'bg-white/5 text-[#6C748A]'
                }`}>
                  {loadSteps[i] === 2 ? '✓' : loadSteps[i] === 1 ? '•' : i + 1}
                </div>
                <span className={`text-[13px] ${
                  loadSteps[i] === 2 ? 'text-[#32D74B] font-semibold' : loadSteps[i] === 1 ? 'text-[#82B4FF] font-semibold' : 'text-[#6C748A]'
                }`}>
                  {label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (screen === 'done') {
    return (
      <div className="flex flex-col items-center justify-center h-full w-full bg-[#2B2D33] p-6">
        <div className="max-w-[440px] w-full bg-[#363B48] rounded-[24px] px-7 py-9 shadow-2xl shadow-black/50 flex flex-col items-center text-center border border-white/5">
          {/* Animated Success Checkmark Circle */}
          <div className="w-16 h-16 rounded-full bg-[#32D74B]/15 border-2 border-[#32D74B] flex items-center justify-center text-[#32D74B] text-[28px] font-bold mb-4.5 shadow-[0_0_20px_rgba(50,215,75,0.3)]">
            ✓
          </div>
          
          <h2 className="text-[24px] font-bold text-white mb-1.5">
            {company.trim()} Ready!
          </h2>
          
          <p className="text-[13px] text-[#9CA3B6] mb-6 leading-relaxed">
            {doneMsg || `Meeting started for ${company.trim()}`}
          </p>

          {/* Share Meeting ID Card */}
          <div className="w-full bg-[#2A2E39] rounded-[16px] px-5 py-4 flex items-center justify-between mb-6 border border-white/10 text-left">
            <div>
              <div className="text-[10px] font-bold text-[#82B4FF] uppercase tracking-wider mb-1">
                SHARE MEETING ID WITH PARTICIPANTS
              </div>
              <div className="text-[20px] font-extrabold text-white font-mono">
                {meetingId.trim()}
              </div>
            </div>

            <button
              onClick={handleCopyId}
              className={`px-4 py-2 rounded-full text-xs font-bold cursor-pointer flex items-center gap-1.5 transition-all ${
                copiedId
                  ? 'bg-[#32D74B]/20 text-[#32D74B] border border-[#32D74B]'
                  : 'bg-[#2777FF] hover:bg-[#1e5fc9] text-white border-0 shadow-[0_4px_12px_rgba(39,119,255,0.35)]'
              }`}
            >
              {copiedId ? '✓ Copied' : '📋 Copy'}
            </button>
          </div>

          {/* Primary Action Button */}
          <button
            onClick={handleOpenChat}
            className="w-full py-4 px-6 rounded-[14px] bg-[#2777FF] hover:bg-[#1e5fc9] active:scale-[0.99] text-white text-[15px] font-bold border-0 cursor-pointer flex items-center justify-center gap-2.5 shadow-[0_6px_20px_rgba(39,119,255,0.4)] transition-all"
          >
            <span>Open Live Session & Dashboard</span>
            <span className="text-base">→</span>
          </button>
        </div>
      </div>
    );
  }

  return null;
}
