/* ============================================
   MNG Bot — Modal Component
   Reusable modal dialog with Tailwind CSS styling
   ============================================ */
import { useEffect, useCallback } from 'react';
import { Icons } from './Icons';


export function Modal({
  title = 'Confirm',
  children,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  confirmClass = 'btn--primary',
  onConfirm,
  onCancel,
  onClose,
}) {
  const handleClose = useCallback(() => {
    if (onClose) onClose();
    else if (onCancel) onCancel();
  }, [onClose, onCancel]);

  // Close on Escape
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [handleClose]);

  return (
    <div
      className="fixed inset-0 bg-black/75 backdrop-blur-md flex items-center justify-center z-[500] p-2 sm:p-4 overflow-y-auto animate-fade-in"
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div className="bg-[#363B48] border border-white/10 rounded-[20px] sm:rounded-[24px] shadow-[0_25px_60px_rgba(0,0,0,0.6)] w-full max-w-[440px] max-h-[calc(100vh-1.5rem)] sm:max-h-[calc(100vh-3rem)] my-auto overflow-hidden text-white flex flex-col shrink-0" role="dialog" aria-modal="true">
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-white/5 bg-[#363B48] shrink-0">
          <h3 className="text-sm sm:text-base font-bold text-white">{title}</h3>
          <button
            className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center text-[#9CA3B6] hover:text-white hover:bg-white/10 transition-colors bg-transparent border-0 cursor-pointer"
            onClick={handleClose}
            aria-label="Close"
          >
            {Icons.x}
          </button>
        </div>

        <div className="p-3.5 sm:p-6 text-[#9CA3B6] text-xs sm:text-sm leading-relaxed overflow-y-auto flex-1">
          {children}
        </div>

        <div className="flex items-center justify-end gap-2.5 sm:gap-3 px-4 sm:px-6 py-3 sm:py-4 border-t border-white/5 bg-[#363B48] shrink-0">
          <button className="btn btn--secondary px-3.5 sm:px-4 py-1.5 sm:py-2 text-[11px] sm:text-xs rounded-full font-semibold" onClick={handleClose}>
            {cancelText}
          </button>
          <button className={`btn ${confirmClass} px-4 sm:px-5 py-1.5 sm:py-2 text-[11px] sm:text-xs rounded-full font-bold`} onClick={onConfirm}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Redesigned End Meeting Confirmation Modal
 */
export function EndMeetingModal({ onConfirm, onClose }) {
  return (
    <Modal
      title="End Meeting"
      confirmText="End Meeting"
      confirmClass="btn--danger"
      onConfirm={onConfirm}
      onClose={onClose}
    >
      <div className="flex flex-col items-center text-center">
        {/* Warning Icon Badge */}
        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-[#E12A1F]/15 border border-[#E12A1F] text-[#E12A1F] flex items-center justify-center text-base sm:text-xl font-bold mb-2.5 sm:mb-3.5 shadow-[0_0_20px_rgba(225,42,31,0.3)] shrink-0">
          ⚠️
        </div>

        <h4 className="text-base sm:text-lg font-bold text-white mb-1 leading-snug">
          Are you sure you want to end this meeting?
        </h4>

        <p className="text-[11px] sm:text-xs text-[#9CA3B6] mb-3 leading-relaxed">
          This action will permanently purge the following session data:
        </p>

        {/* Deleted Data Items Card */}
        <div className="w-full bg-[#2A2E39] rounded-[12px] sm:rounded-[14px] p-2.5 sm:p-3.5 mb-3 border border-white/5 text-left flex flex-col gap-1.5 sm:gap-2 text-[11px] sm:text-xs font-semibold text-white/90">
          <div className="flex items-center gap-2">
            <span className="text-[#E12A1F] shrink-0">🗑️</span>
            <span>Vector database & PDF embeddings</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[#E12A1F] shrink-0">🗑️</span>
            <span>Live conversation context & memories</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[#E12A1F] shrink-0">🗑️</span>
            <span>Question logs & dashboard analytics</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[#E12A1F] shrink-0">🗑️</span>
            <span>All temporary session files</span>
          </div>
        </div>

        {/* High-Contrast Red Warning Box */}
        <div className="w-full p-2.5 sm:p-3.5 bg-[#E12A1F]/15 border border-[#E12A1F]/30 rounded-[12px] text-[11px] sm:text-xs text-[#FF8A84] font-semibold flex items-start sm:items-center gap-2 text-left leading-snug">
          <span className="text-sm sm:text-base shrink-0">⚠️</span>
          <span>This action cannot be undone. Download your Excel Report from the dashboard before ending if needed.</span>
        </div>
      </div>
    </Modal>
  );
}
