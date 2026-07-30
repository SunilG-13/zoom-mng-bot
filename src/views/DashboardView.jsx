/* ============================================
   MNG Bot — Dashboard View (Host Only)
   Filter by Status + Filter by User + Excel Export
   ============================================ */
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Icons } from '../components/Icons';
import { getAllQuestions } from '../api';
import { useToast } from '../components/Toast';

function formatTime(date) {
  if (!(date instanceof Date)) date = new Date(date);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatTimestamp(date) {
  if (!(date instanceof Date)) date = new Date(date);
  return date.toLocaleString([], {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function truncate(str, maxLen = 45) {
  if (!str) return '';
  return str.length > maxLen ? str.substring(0, maxLen) + '...' : str;
}

const statusIcons = {
  Resolved:   Icons.checkCircle,
  Partial:    Icons.alertTriangle,
  Unresolved: Icons.xCircle,
};

function normalizeStatus(s) {
  if (!s) return 'Unresolved';
  const lower = String(s).toLowerCase().trim();
  if (lower === 'resolved')   return 'Resolved';
  if (lower === 'partial')    return 'Partial';
  if (lower === 'unresolved') return 'Unresolved';
  return 'Unresolved';
}

function exportToCSV(rows, headers, filename) {
  const escape = (val) => {
    const str = String(val ?? '');
    return (str.includes(',') || str.includes('"') || str.includes('\n'))
      ? '"' + str.replace(/"/g, '""') + '"' : str;
  };
  const csv = [headers.map(escape).join(','), ...rows.map(r => r.map(escape).join(','))].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

const TABS = [
  { key: 'all',        label: 'All' },
  { key: 'Resolved',   label: 'Resolved' },
  { key: 'Partial',    label: 'Partial' },
  { key: 'Unresolved', label: 'Unresolved' },
  { key: 'pending',    label: 'Pending' },
];

export default function DashboardView({ context, meetingInfo, onNavigate, onEndMeeting, onChangeCompany, onExport, onLogsUpdated, onClosePanel }) {
  const [activeTab,    setActiveTab]    = useState('all');
  const [selectedUser, setSelectedUser] = useState('all');
  const [logs,         setLogs]         = useState([]);
  const [expandedRow,  setExpandedRow]  = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const pollRef = useRef(null);
  const toast   = useToast();

  const resolved   = useMemo(() => logs.filter(q => normalizeStatus(q.status) === 'Resolved').length,   [logs]);
  const partial    = useMemo(() => logs.filter(q => normalizeStatus(q.status) === 'Partial').length,    [logs]);
  const unresolved = useMemo(() => logs.filter(q => normalizeStatus(q.status) === 'Unresolved').length, [logs]);
  const total      = logs.length;
  const pendingCount = partial + unresolved;

  const userList = useMemo(() => {
    const names = [...new Set(logs.map(q => q.user_name || q.username).filter(Boolean))];
    return names.sort();
  }, [logs]);

  const filteredLogs = useMemo(() => {
    let result = [...logs];
    if (activeTab === 'pending') {
      result = result.filter(q => { const s = normalizeStatus(q.status); return s === 'Partial' || s === 'Unresolved'; });
    } else if (activeTab !== 'all') {
      result = result.filter(q => normalizeStatus(q.status) === activeTab);
    }
    if (selectedUser !== 'all') {
      result = result.filter(q => (q.user_name || q.username) === selectedUser);
    }
    return result;
  }, [logs, activeTab, selectedUser]);

  const loadData = useCallback(async (showSpinner = false) => {
    if (showSpinner) setIsRefreshing(true);
    try {
      const data = await getAllQuestions(context.meeting_id);
      if (data?.questions) {
        setLogs(data.questions);
        if (onLogsUpdated) onLogsUpdated(data.questions);
      }
    } catch (_) {
      if (showSpinner) toast.error('Failed to load questions');
    }
    if (showSpinner) setTimeout(() => setIsRefreshing(false), 500);
  }, [context.meeting_id, toast, onLogsUpdated]);

  useEffect(() => {
    loadData();
    const handler = (e) => {
      if (e.detail) {
        // If event contains meeting_id, ensure it matches current meeting context
        const eventMeetingId = e.detail.meeting_id || e.detail.meetingId;
        const questionsList = Array.isArray(e.detail) ? e.detail : e.detail.questions;

        if (eventMeetingId && context?.meeting_id && eventMeetingId !== context.meeting_id) {
          console.log(`🛡️ DashboardView ignored mng-logs-updated event for meeting_id=${eventMeetingId} (current: ${context.meeting_id})`);
          return;
        }

        if (questionsList) {
          setLogs(questionsList);
          if (onLogsUpdated) onLogsUpdated(questionsList);
        }
      }
    };
    window.addEventListener('mng-logs-updated', handler);
    return () => window.removeEventListener('mng-logs-updated', handler);
  }, [loadData, onLogsUpdated, context?.meeting_id]);

  useEffect(() => {
    pollRef.current = setInterval(() => loadData(), 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [loadData]);

  const switchTab = (key) => { setActiveTab(key); setExpandedRow(null); };

  const handleExport = () => {
    if (filteredLogs.length === 0) {
      toast.warning('No questions to export');
      return;
    }
    if (onExport) {
      // Pass the filtered logs so the Excel download matches the current filters
      onExport(filteredLogs);
    }
  };

  return (
    <div className="dashboard">
      <div className="app-header">
        <div className="app-header__left">
          <div className="app-header__logo">{Icons.bot}</div>
          <div>
            <span className="app-header__title">Host Dashboard</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'var(--color-text-muted)', marginTop: 1 }}>
              <span>🏢 {meetingInfo?.companyName || 'Meeting'} &bull; {total} Q&A</span>
              {onChangeCompany && (
                <button
                  className="btn btn--ghost btn--xs"
                  onClick={onChangeCompany}
                  style={{ fontSize: 9, padding: '1px 5px', height: 'auto', color: 'var(--color-accent-blue)', border: '1px solid rgba(79,124,255,0.3)', borderRadius: 4 }}
                  title="Change Company Knowledge Base"
                >
                  ✏️ Change
                </button>
              )}
            </div>
          </div>
        </div>
        <div className="app-header__right">
          <button className="btn btn--secondary btn--sm" onClick={() => onNavigate('chat')} title="Back to Chat" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {Icons.messageSquare}<span>Chat</span>
          </button>
          <button className="btn btn--danger btn--sm" onClick={onEndMeeting} title="End Meeting">{Icons.power}<span>End</span></button>
          {onClosePanel && (<button className="btn btn--ghost" onClick={onClosePanel} style={{ padding: 4, marginLeft: 4 }}>{Icons.x}</button>)}
        </div>
      </div>

      <div className="dashboard__stats" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
        {[
          { key: 'all',        val: total,      label: 'ALL',        cls: 'stat-card--total' },
          { key: 'Resolved',   val: resolved,   label: 'RESOLVED',   cls: 'stat-card--resolved' },
          { key: 'Partial',    val: partial,    label: 'PARTIAL',    cls: 'stat-card--partial' },
          { key: 'Unresolved', val: unresolved, label: 'UNRESOLVED', cls: 'stat-card--unresolved' },
        ].map(s => (
          <div key={s.key}
            className={'stat-card ' + s.cls + (activeTab === s.key ? ' stat-card--active' : '')}
            onClick={() => switchTab(s.key)}
            style={{ cursor: 'pointer', outline: activeTab === s.key ? '2px solid var(--color-accent-blue)' : 'none' }}
            title={'Filter: ' + s.label}
          >
            <div className="stat-card__value">{s.val}</div>
            <div className="stat-card__label">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="dashboard__toolbar">
        <div className="dashboard__actions" style={{ gap: 6, width: '100%', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <select value={selectedUser} onChange={e => { setSelectedUser(e.target.value); setExpandedRow(null); }}
              style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-md)', color: 'var(--color-text-primary)', fontSize: 'var(--font-size-xs)', padding: '4px 8px', cursor: 'pointer', maxWidth: 130 }}>
              <option value="all">👥 All Users</option>
              {userList.map(u => <option key={u} value={u}>👤 {u}</option>)}
            </select>
            <button className={'btn btn--secondary btn--sm' + (isRefreshing ? ' animate-spin' : '')} onClick={() => loadData(true)} title="Refresh">{Icons.loader}</button>
          </div>
          {activeTab === 'all' && (
            <button className="btn btn--primary btn--sm" onClick={handleExport} disabled={filteredLogs.length === 0} title={'Export ' + filteredLogs.length + ' questions'}>
              {Icons.download}<span>Excel ({filteredLogs.length})</span>
            </button>
          )}
        </div>
      </div>

      {(activeTab !== 'all' || selectedUser !== 'all') && (
        <div style={{ padding: '3px 12px', fontSize: 11, color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>🔍</span>
          {activeTab !== 'all' && <span style={{ background: 'rgba(79,124,255,0.15)', borderRadius: 4, padding: '1px 6px', color: 'var(--color-accent-blue)' }}>{activeTab === 'pending' ? 'Partial + Unresolved' : activeTab}</span>}
          {selectedUser !== 'all' && <span style={{ background: 'rgba(79,124,255,0.15)', borderRadius: 4, padding: '1px 6px', color: 'var(--color-accent-blue)' }}>User: {selectedUser}</span>}
          <button style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: 11 }} onClick={() => { switchTab('all'); setSelectedUser('all'); }}>x Clear</button>
        </div>
      )}

      <div className="dashboard__table-wrap">
        {filteredLogs.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state__icon">{Icons.inbox}</div>
            <h4 className="empty-state__title">No Questions Found</h4>
            <p className="empty-state__text">{logs.length === 0 ? 'No questions have been asked yet.' : 'No questions match the current filters.'}</p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 32 }}>#</th>
                <th style={{ width: 50 }}>Time</th>
                <th style={{ width: 80 }}>User</th>
                <th>Question</th>
                <th style={{ width: 96 }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.map((q, i) => {
                const ns   = normalizeStatus(q.status);
                const isEx = expandedRow === i;
                return (
                  <>
                    <tr key={q.id || i} onClick={() => setExpandedRow(isEx ? null : i)} className="dash-row" title="Click to view answer">
                      <td style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>{i + 1}</td>
                      <td className="data-table__time">{formatTime(q.timestamp)}</td>
                      <td className="data-table__user" title={q.user_name || q.username}>{truncate(q.user_name || q.username || 'Participant', 12)}</td>
                      <td className="data-table__question" title={q.question}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ flex: 1 }}>{truncate(q.question)}</span>
                          <span style={{ color: 'var(--color-text-muted)', fontSize: 10 }}>{isEx ? '\u25b2' : '\u25bc'}</span>
                        </span>
                      </td>
                      <td>
                        <span className={'status-badge status-badge--' + ns.toLowerCase()}>
                          <span className="status-badge__icon">{statusIcons[ns]}</span>{ns}
                        </span>
                      </td>
                    </tr>
                    {isEx && (
                      <tr key={'exp-' + i} className="expanded-row">
                        <td colSpan="5">
                          <div className="expanded-row__content">
                            <div style={{ display: 'flex', gap: 'var(--space-4)' }}>
                              <div style={{ flex: 1 }}>
                                <div className="expanded-row__label">Question</div>
                                <p style={{ marginBottom: 'var(--space-3)', color: 'var(--color-text-primary)' }}>{q.question}</p>
                                <div className="expanded-row__label">Answer</div>
                                <p style={{ marginBottom: 0, lineHeight: 1.6 }}>{q.answer}</p>
                              </div>
                              <div style={{ minWidth: 110, fontSize: 11, color: 'var(--color-text-muted)' }}>
                                <div style={{ marginBottom: 4 }}>User: {q.user_name || q.username || 'Participant'}</div>
                                <div style={{ marginBottom: 6 }}>{formatTimestamp(q.timestamp)}</div>
                                <span className={'status-badge status-badge--' + ns.toLowerCase()} style={{ fontSize: 10 }}>
                                  {statusIcons[ns]} {ns}
                                </span>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div style={{ padding: '5px 12px', fontSize: 10, color: 'var(--color-text-muted)', borderTop: '1px solid var(--glass-border)', textAlign: 'center' }}>
        All meeting data (questions, answers, knowledge base) is permanently erased when you click "End Meeting"
      </div>
    </div>
  );
}
