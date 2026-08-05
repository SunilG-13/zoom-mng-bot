import { useState } from 'react';
import { Icons } from '../components/Icons';

export default function LandingView({ onSelectRole }) {
  const [selectedRole, setSelectedRole] = useState('host');

  const handleProceed = () => {
    if (selectedRole && onSelectRole) {
      onSelectRole(selectedRole);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-full w-full bg-[#2B2D33] p-6">
      <div className="max-w-[440px] w-full bg-[#363B48] rounded-[24px] px-8 py-6 shadow-2xl shadow-black/50 flex flex-col items-center text-center border border-white/5">
        {/* Official Brand MNG Logo Header */}
        <div className="flex items-center justify-center mb-3">
          <img src="./MNG_Health.png" alt="MNG Health" className="h-8 w-auto object-contain drop-shadow-md" />
        </div>

        {/* Title & Subtitle */}
        <h1 className="text-[22px] md:text-[26px] font-bold text-white mb-1.5 tracking-tight">
          Virtual Event Access
        </h1>

        <p className="text-[13px] text-[#9CA3B6] mb-4 leading-relaxed">
          Please select your access role to join the session
        </p>

        {/* ACCESS ROLE Label */}
        <div className="w-full text-left text-[11px] font-bold text-[#9CA3B6] uppercase tracking-widest mb-3">
          ACCESS ROLE
        </div>

        {/* Side-by-Side 2 Column Role Cards Grid */}
        <div className="grid grid-cols-2 gap-3.5 w-full mb-7">
          {/* ORGANIZER Card */}
          <div
            onClick={() => setSelectedRole('host')}
            className={`p-4 rounded-[16px] min-h-[140px] cursor-pointer flex flex-col items-center justify-center text-center transition-all duration-200 ${
              selectedRole === 'host'
                ? 'bg-[#2777FF]/15 border-2 border-[#2777FF] shadow-[0_0_24px_rgba(39,119,255,0.3)]'
                : 'bg-[#2A2E39] border border-white/5 hover:border-white/15'
            }`}
          >
            {/* Shield Icon */}
            <div className={`text-[32px] mb-3 transition-colors ${selectedRole === 'host' ? 'text-[#2777FF]' : 'text-[#9CA3B6]'}`}>
              <i className="bx bx-shield-alt-2" />
            </div>

            <div className="text-[13px] font-extrabold text-white tracking-wider mb-1">
              ORGANIZER
            </div>
            
            <div className={`text-[10px] font-semibold uppercase leading-tight ${selectedRole === 'host' ? 'text-[#82B4FF]' : 'text-[#6C748A]'}`}>
              MANAGE SESSION & QUESTIONS
            </div>
          </div>

          {/* GUEST Card */}
          <div
            onClick={() => setSelectedRole('participant')}
            className={`p-4 rounded-[16px] min-h-[140px] cursor-pointer flex flex-col items-center justify-center text-center transition-all duration-200 ${
              selectedRole === 'participant'
                ? 'bg-[#2777FF]/15 border-2 border-[#2777FF] shadow-[0_0_24px_rgba(39,119,255,0.3)]'
                : 'bg-[#2A2E39] border border-white/5 hover:border-white/15'
            }`}
          >
            {/* User Icon */}
            <div className={`text-[32px] mb-3 transition-colors ${selectedRole === 'participant' ? 'text-[#2777FF]' : 'text-[#9CA3B6]'}`}>
              <i className="bx bx-user" />
            </div>

            <div className="text-[13px] font-extrabold text-white tracking-wider mb-1">
              GUEST
            </div>
            
            <div className={`text-[10px] font-semibold uppercase leading-tight ${selectedRole === 'participant' ? 'text-[#82B4FF]' : 'text-[#6C748A]'}`}>
              PARTICIPATE IN DISCUSSION
            </div>
          </div>
        </div>

        {/* Primary Next Step Button */}
        <button
          onClick={handleProceed}
          disabled={!selectedRole}
          className="w-full py-4 px-6 rounded-[14px] bg-[#2777FF] hover:bg-[#1e5fc9] active:scale-[0.99] text-white text-[15px] font-bold border-0 cursor-pointer shadow-[0_6px_20px_rgba(39,119,255,0.4)] transition-all"
        >
          Next Step
        </button>
      </div>
    </div>
  );
}
