/* ============================================
   MNG Bot — Export View
   Excel export modal with 2-column grid selection & fixed action bar
   ============================================ */
import { useState, useEffect, useCallback } from 'react';
import { Icons } from '../components/Icons';
import { CONFIG } from '../api';
import { useToast } from '../components/Toast';

function formatTimestamp(date) {
  if (!(date instanceof Date)) date = new Date(date);
  return date.toLocaleString([], {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

export default function ExportModal({ logs = [], meetingId, companyName, onClose }) {
  const [checkedKeys, setCheckedKeys] = useState(() => {
    const keys = new Set();
    CONFIG.EXPORT_COLUMNS_DEFAULT.forEach(c => { if (c.checked) keys.add(c.key); });
    return keys;
  });
  const toast = useToast();

  // Close on Escape key
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape' && onClose) onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const toggleKey = (key) => {
    setCheckedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const selectAll = () => {
    const allCols = [...CONFIG.EXPORT_COLUMNS_DEFAULT, ...CONFIG.EXPORT_COLUMNS_OPTIONAL];
    const next = new Set(allCols.map(c => c.key));
    setCheckedKeys(next);
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
          rows.forEach(r => { if (r[i] && String(r[i]).length > max) max = Math.min(String(r[i]).length, 60); });
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
      if (onClose) onClose();
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
          if (onClose) onClose();
        })
        .catch(err => {
          toast.error('Copy failed: ' + err.message);
        });
    } catch (err) {
      toast.error('Export failed: ' + err.message);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/75 backdrop-blur-md flex items-center justify-center z-[500] p-4 animate-fade-in"
      onClick={(e) => { if (e.target === e.currentTarget && onClose) onClose(); }}
    >
      <div className="bg-[#363B48] border border-white/10 rounded-[24px] shadow-[0_25px_60px_rgba(0,0,0,0.6)] w-full max-w-[480px] max-h-[90vh] flex flex-col overflow-hidden text-white" role="dialog" aria-modal="true">
        {/* Fixed Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-[#363B48] shrink-0">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <span>📊</span>
            <span>Export Session Data to Excel</span>
          </h3>
          <button
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[#9CA3B6] hover:text-white hover:bg-white/10 transition-colors bg-transparent border-0 cursor-pointer"
            onClick={onClose}
            aria-label="Close"
          >
            {Icons.x}
          </button>
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Zoom App Notice Box */}
          <div className="bg-amber-500/10 border border-amber-500/25 rounded-[14px] p-3.5 text-xs text-amber-200 leading-relaxed flex items-start gap-2.5">
            <span className="text-base shrink-0">💡</span>
            <span>
              <strong>Zoom App Notice:</strong> Sandboxed Zoom Apps may block direct file downloads. If downloading is blocked, click <strong>"Copy Data"</strong> to copy Excel-formatted data directly to your clipboard.
            </span>
          </div>

          {/* Default Columns Section */}
          <div>
            <div className="flex items-center justify-between text-[11px] font-bold text-[#82B4FF] uppercase tracking-wider mb-2.5">
              <span>DEFAULT COLUMNS</span>
              <button
                onClick={selectAll}
                className="text-[10px] text-[#82B4FF] hover:underline bg-transparent border-0 cursor-pointer"
              >
                Select All
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {CONFIG.EXPORT_COLUMNS_DEFAULT.map(col => {
                const isChecked = checkedKeys.has(col.key);
                return (
                  <div
                    key={col.key}
                    onClick={() => toggleKey(col.key)}
                    className={`px-3 py-2.5 rounded-[12px] text-xs font-semibold cursor-pointer flex items-center gap-2.5 transition-all select-none ${
                      isChecked
                        ? 'bg-[#2777FF]/15 border border-[#2777FF] text-white shadow-sm'
                        : 'bg-[#2A2E39] border border-white/5 text-[#9CA3B6] hover:bg-white/5'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded flex items-center justify-center text-[10px] shrink-0 transition-colors ${
                      isChecked ? 'bg-[#2777FF] text-white' : 'bg-black/30 border border-white/20 text-transparent'
                    }`}>
                      {Icons.check}
                    </div>
                    <span className="truncate">{col.label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Optional Columns Section */}
          <div>
            <div className="text-[11px] font-bold text-[#82B4FF] uppercase tracking-wider mb-2.5 mt-4">
              OPTIONAL COLUMNS
            </div>

            <div className="grid grid-cols-2 gap-2">
              {CONFIG.EXPORT_COLUMNS_OPTIONAL.map(col => {
                const isChecked = checkedKeys.has(col.key);
                return (
                  <div
                    key={col.key}
                    onClick={() => toggleKey(col.key)}
                    className={`px-3 py-2.5 rounded-[12px] text-xs font-semibold cursor-pointer flex items-center gap-2.5 transition-all select-none ${
                      isChecked
                        ? 'bg-[#2777FF]/15 border border-[#2777FF] text-white shadow-sm'
                        : 'bg-[#2A2E39] border border-white/5 text-[#9CA3B6] hover:bg-white/5'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded flex items-center justify-center text-[10px] shrink-0 transition-colors ${
                      isChecked ? 'bg-[#2777FF] text-white' : 'bg-black/30 border border-white/20 text-transparent'
                    }`}>
                      {Icons.check}
                    </div>
                    <span className="truncate">{col.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Fixed Footer Action Bar */}
        <div className="px-6 py-4 border-t border-white/5 bg-[#363B48] flex items-center justify-between shrink-0 gap-3">
          <div className="px-3 py-1.5 rounded-full bg-[#2A2E39] border border-white/5 text-xs text-[#9CA3B6] font-semibold">
            📊 {logs.length} Questions
          </div>

          <div className="flex items-center gap-2">
            <button
              className="btn btn--secondary px-3.5 py-2 text-xs rounded-full inline-flex items-center gap-1.5"
              onClick={doCopy}
            >
              {Icons.copy}
              <span>Copy Data</span>
            </button>

            <button
              className="btn btn--primary px-4 py-2 text-xs rounded-full font-bold inline-flex items-center gap-1.5"
              onClick={doExport}
            >
              {Icons.download}
              <span>Download Excel</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
