import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Icons } from '../components/Icons';
import { getAllQuestions } from '../api';
import { useToast } from '../components/Toast';

function parseDate(dateVal) {
  if (!dateVal) return new Date();
  if (dateVal instanceof Date) return dateVal;
  
  if (typeof dateVal === 'number') return new Date(dateVal);

  if (typeof dateVal === 'string') {
    let str = dateVal.trim();
    if (/^\d+$/.test(str)) {
      return new Date(parseInt(str, 10));
    }
    // If backend returns UTC ISO string without 'Z' or offset, append 'Z' so browser converts UTC to Local timezone
    if (!str.endsWith('Z') && !str.includes('+') && !/-\d{2}:\d{2}$/.test(str)) {
      str = str.replace(' ', 'T') + 'Z';
    }
    const d = new Date(str);
    if (!isNaN(d.getTime())) return d;
  }

  return new Date();
}

function formatTime(dateVal) {
  const date = parseDate(dateVal);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
}

function formatTimestamp(dateVal) {
  const date = parseDate(dateVal);
  return date.toLocaleString([], {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true
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

export default function DashboardView({ context, meetingInfo, onExport, onLogsUpdated }) {
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

  const meetingId = context?.meeting_id;

  const loadData = useCallback(async (showSpinner = false) => {
    if (!meetingId) return;
    if (showSpinner) setIsRefreshing(true);
    try {
      const data = await getAllQuestions(meetingId);
      if (data?.questions) {
        setLogs(data.questions);
        if (onLogsUpdated) onLogsUpdated(data.questions);
      }
    } catch (_) {
      if (showSpinner) toast.error('Failed to load questions');
    }
    if (showSpinner) setTimeout(() => setIsRefreshing(false), 500);
  }, [meetingId, toast, onLogsUpdated]);

  useEffect(() => {
    loadData();
    const handler = (e) => {
      if (e.detail) {
        const eventMeetingId = e.detail.meeting_id || e.detail.meetingUUID || e.detail.meetingId;
        const questionsList = Array.isArray(e.detail) ? e.detail : e.detail.questions;

        if (eventMeetingId && meetingId && eventMeetingId !== meetingId) return;

        if (questionsList) {
          setLogs(questionsList);
          if (onLogsUpdated) onLogsUpdated(questionsList);
        }
      }
    };
    window.addEventListener('mng-logs-updated', handler);
    return () => window.removeEventListener('mng-logs-updated', handler);
  }, [loadData, onLogsUpdated, meetingId]);

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
      onExport(filteredLogs);
    }
  };

  const statCards = [
    { key: 'all',        val: total,      label: 'TOTAL ASKED',  color: '#82B4FF', border: '#2777FF', activeBg: 'rgba(39, 119, 255, 0.18)', glow: 'rgba(39, 119, 255, 0.35)', icon: '📊' },
    { key: 'Resolved',   val: resolved,   label: 'RESOLVED',     color: '#32D74B', border: '#32D74B', activeBg: 'rgba(50, 215, 75, 0.18)',  glow: 'rgba(50, 215, 75, 0.35)',  icon: '✓' },
    { key: 'Partial',    val: partial,    label: 'PARTIAL',      color: '#F59E0B', border: '#F59E0B', activeBg: 'rgba(245, 158, 11, 0.18)', glow: 'rgba(245, 158, 11, 0.35)', icon: '⚠️' },
    { key: 'Unresolved', val: unresolved, label: 'UNRESOLVED',   color: '#E12A1F', border: '#E12A1F', activeBg: 'rgba(225, 42, 31, 0.18)',  glow: 'rgba(225, 42, 31, 0.35)',  icon: '✖' },
  ];

  return (
    <div className="dashboard bg-[#2B2D33] h-full flex flex-col min-w-0">
      {/* Stat Metric Filter Cards (2x2 on narrow Zoom sidebars, 4x1 on wider screens) */}
      <div className="grid grid-cols-2 min-[440px]:grid-cols-4 p-3 sm:p-5 pb-2 sm:pb-4 gap-2 sm:gap-3 shrink-0">
        {statCards.map(s => {
          const isActive = activeTab === s.key;
          return (
            <div
              key={s.key}
              onClick={() => switchTab(s.key)}
              style={{
                backgroundColor: isActive ? s.activeBg : '#363B48',
                border: isActive ? `2px solid ${s.border}` : '1px solid rgba(255, 255, 255, 0.06)',
                boxShadow: isActive ? `0 0 20px ${s.glow}` : 'none',
              }}
              className="cursor-pointer rounded-[14px] sm:rounded-[18px] p-2.5 sm:p-4 transition-all duration-200 relative overflow-hidden flex flex-col justify-between"
              title={'Filter questions: ' + s.label}
            >
              <div
                style={{ backgroundColor: s.border, opacity: isActive ? 1 : 0.4 }}
                className="absolute top-0 left-0 right-0 h-1"
              />

              <div className="flex items-center justify-between mb-1">
                <span style={{ color: s.color }} className="text-xl sm:text-[28px] font-extrabold leading-none">
                  {s.val}
                </span>
                <span className={`text-xs sm:text-sm ${isActive ? 'opacity-100' : 'opacity-60'}`}>
                  {s.icon}
                </span>
              </div>

              <div className={`text-[9px] sm:text-[11px] font-bold tracking-wider flex items-center justify-between gap-1 ${isActive ? 'text-white' : 'text-[#9CA3B6]'}`}>
                <span className="truncate">{s.label}</span>
                {isActive && (
                  <span style={{ color: s.color }} className="text-[9px] font-bold hidden sm:inline">ACTIVE</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Toolbar & Filters */}
      <div className="px-3 sm:px-5 pb-3 mt-4 flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex flex-wrap gap-2 items-center min-w-0">
          <select
            value={selectedUser}
            onChange={e => { setSelectedUser(e.target.value); setExpandedRow(null); }}
            className="bg-[#363B48] border border-white/10 rounded-full text-white text-[11px] sm:text-xs font-semibold px-3 sm:px-4 py-1.5 sm:py-2 cursor-pointer outline-none shadow-md"
          >
            <option value="all">👥 All Users</option>
            {userList.map(u => <option key={u} value={u}>👤 {u}</option>)}
          </select>

          {/* Visible Refresh Button */}
          <button
            className="btn btn--secondary px-3 sm:px-4 py-1.5 sm:py-2 text-[11px] sm:text-xs rounded-full inline-flex items-center gap-1.5 cursor-pointer"
            onClick={() => loadData(true)}
            title="Refresh Questions"
          >
            <span className={`inline-flex w-3 h-3 sm:w-3.5 sm:h-3.5 ${isRefreshing ? 'animate-spin' : ''}`}>
              {Icons.loader}
            </span>
            <span>Refresh</span>
          </button>
        </div>

        <button
          className="btn btn--primary px-3.5 sm:px-4.5 py-1.5 sm:py-2 text-[11px] sm:text-[13px] rounded-full shrink-0 flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
          onClick={handleExport}
          disabled={filteredLogs.length === 0}
          title={'Export ' + filteredLogs.length + ' questions'}
        >
          {Icons.download}
          <span>Excel Report ({filteredLogs.length})</span>
        </button>
      </div>

      {/* Data Table */}
      <div className="flex-1 px-3 sm:px-5 pb-4 overflow-y-auto overflow-x-auto">
        {filteredLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 sm:py-14 px-5 text-center bg-[#363B48] rounded-[20px] border border-white/5">
            <div className="text-[28px] sm:text-[36px] text-[#6C748A] mb-2 sm:mb-3">{Icons.inbox}</div>
            <h4 className="text-[15px] sm:text-[18px] font-bold text-white mb-1">No Questions Found</h4>
            <p className="text-[11px] sm:text-[13px] text-[#9CA3B6] max-w-[360px] leading-relaxed">
              {logs.length === 0 ? 'No questions asked in this session yet.' : 'No questions match active filters.'}
            </p>
          </div>
        ) : (
          <div className="w-full overflow-x-auto rounded-[16px] border border-white/5">
            <table className="data-table min-w-[340px] rounded-[16px] overflow-hidden bg-[#363B48]">
              <thead>
                <tr>
                  <th className="w-7 text-center">#</th>
                  <th className="w-[65px] sm:w-[90px] whitespace-nowrap">Time</th>
                  <th className="w-[80px] sm:w-[110px]">User</th>
                  <th>Question</th>
                  <th className="w-[85px] sm:w-[110px]">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((q, i) => {
                  const ns   = normalizeStatus(q.status);
                  const isEx = expandedRow === i;
                  return (
                    <>
                      <tr
                        key={q.id || i}
                        onClick={() => setExpandedRow(isEx ? null : i)}
                        className={`cursor-pointer transition-colors ${isEx ? 'bg-[#44495B]' : 'bg-transparent hover:bg-white/5'}`}
                      >
                        <td className="text-[#6C748A] text-[10px] sm:text-[11px] text-center font-semibold">{i + 1}</td>
                        <td className="text-[10px] sm:text-[11px] text-[#9CA3B6] whitespace-nowrap">{formatTime(q.timestamp)}</td>
                        <td className="font-semibold text-white text-[11px] sm:text-xs">{truncate(q.user_name || q.username || 'Participant', 10)}</td>
                        <td>
                          <span className="flex items-center gap-1">
                            <span className="flex-1 text-white text-[11px] sm:text-xs truncate">{truncate(q.question, 40)}</span>
                            <span className="text-[#82B4FF] text-[9px] sm:text-[10px]">{isEx ? '▲' : '▼'}</span>
                          </span>
                        </td>
                        <td>
                          <span className={'status-badge text-[9px] sm:text-[11px] px-1.5 sm:px-2 py-0.5 status-badge--' + ns.toLowerCase()}>
                            <span className="status-badge__icon inline-flex">{statusIcons[ns]}</span>{ns}
                          </span>
                        </td>
                      </tr>
                      {isEx && (
                        <tr key={'exp-' + i}>
                          <td colSpan="5" className="p-2.5 sm:p-4 bg-[#262933] border-b border-white/5">
                            <div className="bg-[#363B48] rounded-[14px] p-3.5 sm:p-5 border border-white/10 shadow-xl flex flex-col gap-3">
                              {/* Question Header & Body */}
                              <div>
                                <div className="flex items-center justify-between mb-1.5 flex-wrap gap-1">
                                  <div className="text-[#82B4FF] text-[10px] sm:text-[11px] font-bold uppercase tracking-wider flex items-center gap-1">
                                    <span>QUESTION BY ❓ : </span>
                                    <span className="text-white font-bold">{q.user_name || q.username || 'Participant'}</span>
                                  </div>
                                  <span className="text-[10px] sm:text-[11px] text-[#9CA3B6]">
                                    🕒 {formatTimestamp(q.timestamp)}
                                  </span>
                                </div>

                                <div className="text-[13px] sm:text-[14.5px] font-semibold text-white leading-relaxed bg-[#2A2E39] p-3 sm:p-3.5 rounded-[12px] border border-white/5">
                                  {q.question}
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
          </div>
        )}
      </div>
    </div>
  );
}
