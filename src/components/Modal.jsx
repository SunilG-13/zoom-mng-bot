/* ============================================
   MNG Bot — Modal Component
   Reusable modal dialog with variants
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
      className="modal-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div className="modal" role="dialog" aria-modal="true">
        <div className="modal__header">
          <h3 className="modal__title">{title}</h3>
          <button className="modal__close" onClick={handleClose} aria-label="Close">
            {Icons.x}
          </button>
        </div>
        <div className="modal__body">
          {children}
        </div>
        <div className="modal__footer">
          <button className="btn btn--secondary" onClick={handleClose}>
            {cancelText}
          </button>
          <button className={`btn ${confirmClass}`} onClick={onConfirm}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * End Meeting Confirmation Modal
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
      <div className="modal__text" style={{ marginBottom: 'var(--space-4)' }}>
        <p style={{ marginBottom: 'var(--space-3)', color: 'var(--color-text-primary)', fontWeight: 600 }}>
          Are you sure you want to end this meeting?
        </p>
        <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>
          This action will permanently delete:
        </p>
        <ul style={{
          marginTop: 'var(--space-2)',
          paddingLeft: 'var(--space-5)',
          color: 'var(--color-text-muted)',
          fontSize: 'var(--font-size-sm)',
        }}>
          <li style={{ marginBottom: 4, listStyle: 'disc' }}>Vector database & embeddings</li>
          <li style={{ marginBottom: 4, listStyle: 'disc' }}>All conversation memories</li>
          <li style={{ marginBottom: 4, listStyle: 'disc' }}>Question logs & dashboard data</li>
          <li style={{ marginBottom: 4, listStyle: 'disc' }}>All temporary files</li>
        </ul>
      </div>
      <div style={{
        padding: 'var(--space-3)',
        background: 'var(--color-danger-bg)',
        border: '1px solid var(--color-unresolved-border)',
        borderRadius: 'var(--radius-md)',
        fontSize: 'var(--font-size-xs)',
        color: 'var(--color-danger)',
      }}>
        ⚠️ This action cannot be undone. Download the Excel report first if needed.
      </div>
    </Modal>
  );
}
