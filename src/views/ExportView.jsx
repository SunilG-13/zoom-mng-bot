/* ============================================
   MNG Bot — Export View
   Excel export modal with column selection
   ============================================ */
import { useState } from 'react';
import { Icons } from '../components/Icons';
import { Modal } from '../components/Modal';
import { CONFIG } from '../api';
import { useToast } from '../components/Toast';

function formatTimestamp(date) {
  if (!(date instanceof Date)) date = new Date(date);
  return date.toLocaleString([], {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

export default function ExportModal({ logs, meetingId, companyName, onClose }) {
  const [checkedKeys, setCheckedKeys] = useState(() => {
    const keys = new Set();
    CONFIG.EXPORT_COLUMNS_DEFAULT.forEach(c => { if (c.checked) keys.add(c.key); });
    return keys;
  });
  const toast = useToast();

  const toggleKey = (key) => {
    setCheckedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const doExport = () => {
    const allCols = [...CONFIG.EXPORT_COLUMNS_DEFAULT, ...CONFIG.EXPORT_COLUMNS_OPTIONAL];
    const selectedColumns = allCols.filter(c => checkedKeys.has(c.key));

    if (selectedColumns.length === 0) {
      toast.warning('Please select at least one column');
      return;
    }

    try {
      const headers = selectedColumns.map(c => c.label);
      const rows = logs.map(q => {
        return selectedColumns.map(col => {
          switch (col.key) {
            case 'timestamp':        return q.timestamp ? formatTimestamp(q.timestamp) : '';
            case 'username':         return q.user_name || q.username || '';
            case 'question':         return q.question || '';
            case 'answer':           return q.answer || '';
            case 'status':           return q.status || '';
            case 'meeting_id':       return meetingId || '';
            case 'session_id':       return q.session_id || '';
            case 'company':          return companyName || '';
            case 'source_document':  return q.source_document || 'N/A';
            case 'source_page':      return q.source_page != null ? String(q.source_page) : 'N/A';
            case 'confidence_score': return q.confidence_score != null ? (q.confidence_score * 100).toFixed(0) + '%' : 'N/A';
            case 'response_time':    return q.response_time ? q.response_time + 's' : 'N/A';
            default: return '';
          }
        });
      });

      // Try SheetJS first, fallback to CSV
      if (typeof XLSX !== 'undefined') {
        const wb = XLSX.utils.book_new();
        const wsData = [headers, ...rows];
        const ws = XLSX.utils.aoa_to_sheet(wsData);

        // Auto-width columns
        ws['!cols'] = headers.map((h, i) => {
          let max = h.length;
          rows.forEach(r => { if (r[i] && r[i].length > max) max = Math.min(r[i].length, 60); });
          return { wch: max + 4 };
        });

        XLSX.utils.book_append_sheet(wb, ws, 'Meeting Log');
        const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        const safeCompany = (companyName || 'Meeting').replace(/[^a-zA-Z0-9]/g, '_');
        link.download = `${safeCompany}_Report.xlsx`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 100);
      } else {
        // CSV fallback
        const escape = (val) => {
          const str = String(val || '');
          return (str.includes(',') || str.includes('"') || str.includes('\n'))
            ? '"' + str.replace(/"/g, '""') + '"'
            : str;
        };
        const csvContent = [
          headers.map(escape).join(','),
          ...rows.map(row => row.map(escape).join(',')),
        ].join('\n');
        
        const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        const safeCompany = (companyName || 'Meeting').replace(/[^a-zA-Z0-9]/g, '_');
        link.download = `${safeCompany}_Report.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 100);
      }

      toast.success('Excel file downloaded successfully!');
      onClose();
    } catch (err) {
      toast.error('Export failed: ' + err.message);
    }
  };

  const doCopy = () => {
    const allCols = [...CONFIG.EXPORT_COLUMNS_DEFAULT, ...CONFIG.EXPORT_COLUMNS_OPTIONAL];
    const selectedColumns = allCols.filter(c => checkedKeys.has(c.key));

    if (selectedColumns.length === 0) {
      toast.warning('Please select at least one column');
      return;
    }

    try {
      const headers = selectedColumns.map(c => c.label);
      const rows = logs.map(q => {
        return selectedColumns.map(col => {
          switch (col.key) {
            case 'timestamp':        return q.timestamp ? formatTimestamp(q.timestamp) : '';
            case 'username':         return q.user_name || q.username || '';
            case 'question':         return q.question || '';
            case 'answer':           return q.answer || '';
            case 'status':           return q.status || '';
            case 'meeting_id':       return meetingId || '';
            case 'session_id':       return q.session_id || '';
            case 'company':          return companyName || '';
            case 'source_document':  return q.source_document || 'N/A';
            case 'source_page':      return q.source_page != null ? String(q.source_page) : 'N/A';
            case 'confidence_score': return q.confidence_score != null ? (q.confidence_score * 100).toFixed(0) + '%' : 'N/A';
            case 'response_time':    return q.response_time ? q.response_time + 's' : 'N/A';
            default: return '';
          }
        });
      });

      const content = [
        headers.join('\t'),
        ...rows.map(row => row.join('\t'))
      ].join('\n');

      navigator.clipboard.writeText(content)
        .then(() => {
          toast.success('Excel-ready data copied! Open Excel and paste (Ctrl+V).');
          onClose();
        })
        .catch(err => {
          toast.error('Copy failed: ' + err.message);
        });
    } catch (err) {
      toast.error('Export failed: ' + err.message);
    }
  };

  return (
    <Modal
      title="Export to Excel"
      confirmText="Download Excel"
      confirmClass="btn--primary"
      onConfirm={doExport}
      onClose={onClose}
    >
      <p className="modal__text" style={{ marginBottom: 'var(--space-4)' }}>
        Select the columns to include in the Excel export.
      </p>
      
      <div style={{
        marginBottom: 'var(--space-4)',
        padding: '8px 12px',
        background: 'rgba(251, 191, 36, 0.08)',
        border: '1px solid rgba(251, 191, 36, 0.2)',
        borderRadius: 'var(--radius-md)',
        fontSize: 'var(--font-size-xs)',
        color: 'var(--color-text-primary)'
      }}>
        💡 <strong>Zoom App Notice:</strong> Sandboxed Zoom Apps may block standard downloads. If the download button doesn't work, click <strong>"Copy Data"</strong> below, open Excel, and paste (Ctrl+V).
      </div>

      <div className="export-modal__options">
        <div className="export-modal__section-title">Default Columns</div>
        {CONFIG.EXPORT_COLUMNS_DEFAULT.map(col => (
          <label
            key={col.key}
            className={`checkbox${checkedKeys.has(col.key) ? ' checkbox--checked' : ''}`}
            onClick={() => toggleKey(col.key)}
          >
            <span className="checkbox__input">{Icons.check}</span>
            <span className="checkbox__label">{col.label}</span>
          </label>
        ))}
        <div className="export-modal__section-title" style={{ marginTop: 'var(--space-4)' }}>Optional Columns</div>
        {CONFIG.EXPORT_COLUMNS_OPTIONAL.map(col => (
          <label
            key={col.key}
            className={`checkbox${checkedKeys.has(col.key) ? ' checkbox--checked' : ''}`}
            onClick={() => toggleKey(col.key)}
          >
            <span className="checkbox__input">{Icons.check}</span>
            <span className="checkbox__label">{col.label}</span>
          </label>
        ))}
      </div>

      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 'var(--space-4)',
        gap: 'var(--space-2)'
      }}>
        <div style={{
          padding: 'var(--space-2) var(--space-3)',
          background: 'rgba(79, 124, 255, 0.06)',
          borderRadius: 'var(--radius-md)',
          fontSize: 'var(--font-size-xs)',
          color: 'var(--color-text-muted)',
          flex: 1
        }}>
          📊 {logs.length} question(s) selected
        </div>
        <button 
          className="btn btn--secondary btn--sm" 
          onClick={doCopy}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          {Icons.copy}
          <span>Copy Data</span>
        </button>
      </div>
    </Modal>
  );
}
