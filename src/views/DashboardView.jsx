/* ============================================
   MNG Bot — Dashboard View (Host Only)
   Matched 1:1 with D:\E drive\All Projects\mng-meeting-room
   ============================================ */
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
    <div className="dashboard bg-[#2B2D33] h-full flex flex-col">
      {/* Stat Metric Filter Cards */}
      <div className="grid grid-cols-4 p-5 pb-4 gap-3">
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
              className="cursor-pointer rounded-[18px] p-4 transition-all duration-200 relative overflow-hidden"
              title={'Filter questions: ' + s.label}
            >
              <div
                style={{ backgroundColor: s.border, opacity: isActive ? 1 : 0.4 }}
                className="absolute top-0 left-0 right-0 h-1"
              />

              <div className="flex items-center justify-between mb-1">
                <span style={{ color: s.color }} className="text-[28px] font-extrabold leading-none">
                  {s.val}
                </span>
                <span className={`text-sm ${isActive ? 'opacity-100' : 'opacity-60'}`}>
                  {s.icon}
                </span>
              </div>

              <div className={`text-[11px] font-bold tracking-wider flex items-center justify-between ${isActive ? 'text-white' : 'text-[#9CA3B6]'}`}>
                <span>{s.label}</span>
                {isActive && (
                  <span style={{ color: s.color }} className="text-[10px] font-bold">ACTIVE</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Toolbar & Filters */}
      <div className="px-5 pb-3.5 flex items-center justify-between">
        <div className="flex gap-2.5 items-center">
          <select
            value={selectedUser}
            onChange={e => { setSelectedUser(e.target.value); setExpandedRow(null); }}
            className="bg-[#363B48] border border-white/10 rounded-full text-white text-xs font-semibold px-4 py-2 cursor-pointer outline-none shadow-md"
          >
            <option value="all">👥 All Users</option>
            {userList.map(u => <option key={u} value={u}>👤 {u}</option>)}
          </select>

          {/* Visible Refresh Button */}
          <button
            className="btn btn--secondary px-4 py-2 text-xs rounded-full inline-flex items-center gap-1.5"
            onClick={() => loadData(true)}
            title="Refresh Questions"
          >
            <span className={`inline-flex w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`}>
              {Icons.loader}
            </span>
            <span>Refresh</span>
          </button>
        </div>

        <button
          className="btn btn--primary px-4.5 py-2 text-[13px] rounded-full"
          onClick={handleExport}
          disabled={filteredLogs.length === 0}
          title={'Export ' + filteredLogs.length + ' questions'}
        >
          {Icons.download}<span>Excel Report ({filteredLogs.length})</span>
        </button>
      </div>

      {/* Data Table */}
      <div className="flex-1 px-5 pb-5 overflow-y-auto">
        {filteredLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 px-5 text-center bg-[#363B48] rounded-[20px] border border-white/5">
            <div className="text-[36px] text-[#6C748A] mb-3">{Icons.inbox}</div>
            <h4 className="text-[18px] font-bold text-white mb-1.5">No Questions Found</h4>
            <p className="text-[13px] text-[#9CA3B6] max-w-[360px] leading-relaxed">
              {logs.length === 0 ? 'No questions asked in this session yet.' : 'No questions match active filters.'}
            </p>
          </div>
        ) : (
          <table className="data-table rounded-[16px] overflow-hidden bg-[#363B48]">
            <thead>
              <tr>
                <th className="w-9 text-center">#</th>
                <th className="w-[90px] whitespace-nowrap">Time</th>
                <th className="w-[110px]">User</th>
                <th>Question</th>
                <th className="w-[110px]">Status</th>
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
                      <td className="text-[#6C748A] text-[11px] text-center font-semibold">{i + 1}</td>
                      <td className="text-[11px] text-[#9CA3B6] whitespace-nowrap">{formatTime(q.timestamp)}</td>
                      <td className="font-semibold text-white">{truncate(q.user_name || q.username || 'Participant', 14)}</td>
                      <td>
                        <span className="flex items-center gap-1.5">
                          <span className="flex-1 text-white">{truncate(q.question, 50)}</span>
                          <span className="text-[#82B4FF] text-[10px]">{isEx ? '▲' : '▼'}</span>
                        </span>
                      </td>
                      <td>
                        <span className={'status-badge status-badge--' + ns.toLowerCase()}>
                          <span className="status-badge__icon">{statusIcons[ns]}</span>{ns}
                        </span>
                      </td>
                    </tr>
                    {isEx && (
                      <tr key={'exp-' + i}>
                        <td colSpan="5" className="p-4 bg-[#262933] border-b border-white/5">
                          <div className="bg-[#363B48] rounded-[16px] p-5 border border-white/10 shadow-xl flex flex-col gap-4">
                            {/* Question Header & Body */}
                            <div>
                              <div className="flex items-center justify-between mb-1.5">
                                <div className="text-[#82B4FF] text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5">
                                  <span>QUESTION ASKED BY ❓ : </span>
                                  <span className="text-white font-bold">{q.user_name || q.username || 'Participant'}</span>
                                </div>
                                <span className="text-[11px] text-[#9CA3B6]">
                                  🕒 {formatTimestamp(q.timestamp)}
                                </span>
                              </div>

                              <div className="text-[14.5px] font-semibold text-white leading-relaxed bg-[#2A2E39] p-3.5 rounded-[12px] border border-white/5">
                                {q.question}
                              </div>
                            </div>

                            {/* AI Answer Section */}
                            {/* {q.answer && (
                              <div>
                                <div className="flex items-center justify-between mb-1.5">
                                  <div className="text-[#32D74B] text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5">
                                    <span>🤖 AI CLINICAL RESPONSE</span>
                                  </div>
                                  {q.confidence_score && (
                                    <span className="text-[11px] font-bold text-[#82B4FF] bg-[#2777FF]/15 px-2 py-0.5 rounded-md">
                                      🎯 {Math.round(q.confidence_score * 100)}% match
                                    </span>
                                  )}
                                </div>

                                <div className="text-[13.5px] leading-relaxed text-white/95 bg-[#2A2E39] p-4 rounded-[12px] border border-white/5 whitespace-pre-wrap">
                                  {q.answer} || ytftfghy
                                </div>
                              </div>
                            )} */}

                            {/* Metadata Footer: Source Document & Status */}
                            {/* <div className="flex items-center justify-between pt-2 border-t border-white/5 text-xs">
                              <div className="flex items-center gap-3 text-[#9CA3B6]">
                                {q.source_document && (
                                  <span className="px-2.5 py-0.5 rounded-md bg-white/5 border border-white/10 text-[#82B4FF] text-[11px] font-semibold">
                                    📄 {q.source_document} {q.source_page ? `(p. ${q.source_page})` : ''}
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center gap-2.5">
                                <span className={'status-badge status-badge--' + ns.toLowerCase()}>
                                  {statusIcons[ns]} {ns}
                                </span>
                              </div>
                            </div> */}
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
    </div>
  );
}
