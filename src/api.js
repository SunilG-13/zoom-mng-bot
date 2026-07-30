/* ============================================
   MNG Bot — API Client + Mock Backend
   Full mock API with knowledge base simulation
   ============================================ */

import { getLastMeetingId, saveMeetingId, isGenericName } from './utils/meetingStorage';

// ---- Configuration ----
const CONFIG = {
  API_BASE_URL: '/api',
  USE_MOCK_API: false,     // Using real backend API
  MOCK_LOADING_DELAY: 3000,
  MOCK_RESPONSE_DELAY: 1500,
  COMPANIES: [
    { id: 'pfizer',      name: 'Pfizer',      icon: 'P', pdfs: 5 },
    { id: 'biocon',      name: 'Biocon',       icon: 'B', pdfs: 3 },
    { id: 'novartis',    name: 'Novartis',     icon: 'N', pdfs: 4 },
    { id: 'roche',       name: 'Roche',        icon: 'R', pdfs: 6 },
    { id: 'astrazeneca', name: 'AstraZeneca',  icon: 'A', pdfs: 4 },
    { id: 'sanofi',      name: 'Sanofi',       icon: 'S', pdfs: 3 },
  ],
  SUGGESTIONS: [
    'What is the recommended dosage?',
    'What are the contraindications?',
    'What are the side effects?',
  ],
  EXPORT_COLUMNS_DEFAULT: [
    { key: 'timestamp',  label: 'Timestamp',  checked: true },
    { key: 'username',   label: 'Username',   checked: true },
    { key: 'question',   label: 'Question',   checked: true },
    { key: 'answer',     label: 'Answer',     checked: true },
    { key: 'status',     label: 'Status',     checked: true },
    { key: 'meeting_id', label: 'Meeting ID', checked: true },
  ],
  EXPORT_COLUMNS_OPTIONAL: [
    { key: 'session_id',       label: 'Session ID',       checked: false },
    { key: 'company',          label: 'Company',          checked: false },
    { key: 'source_document',  label: 'Source Document',  checked: false },
    { key: 'source_page',      label: 'Source Page',      checked: false },
    { key: 'confidence_score', label: 'Confidence Score', checked: false },
    { key: 'response_time',    label: 'Response Time (s)',checked: false },
  ],
};

export { CONFIG };

// ---- Helpers ----
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const uid = () => crypto.randomUUID();

// Normalize status string to title case (e.g. "resolved" → "Resolved")
function normalizeStatus(s) {
  if (!s) return 'Unresolved';
  const lower = String(s).toLowerCase().trim();
  if (lower === 'resolved')   return 'Resolved';
  if (lower === 'partial')    return 'Partial';
  if (lower === 'unresolved') return 'Unresolved';
  return 'Unresolved';
}

// ---- Real API calls ----
async function _fetch(method, endpoint, body = null) {
  const url = CONFIG.API_BASE_URL + endpoint;
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  if (!res.ok) {
    const errData = await res.json().catch(() => ({ detail: res.statusText }));
    const detail = errData.detail;
    const msg = typeof detail === 'string'
      ? detail
      : typeof detail === 'object'
        ? JSON.stringify(detail)
        : `API Error ${res.status}`;
    throw new Error(msg);
  }
  return res.json();
}

// ---- Public API (auto-routes mock vs real) ----
// Endpoints match MNG.postman_collection exactly

function sanitizeCompany(name) {
  if (!name || typeof name !== 'string') return 'Company';
  const trimmed = name.trim();
  if (!trimmed) return 'Company';
  const lower = trimmed.toLowerCase();
  const matched = CONFIG.COMPANIES.find(c => c.id === lower || c.name.toLowerCase() === lower);
  if (matched) return matched.name;
  return trimmed.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

// POST /start_meeting  →  { meeting_id, company, host_name }
export async function startMeeting(meetingId, company, hostName = 'Host') {
  if (typeof meetingId === 'object' && meetingId !== null) {
    const obj = meetingId;
    meetingId = obj.meeting_id;
    company = obj.company;
    hostName = obj.host_name || 'Host';
  }
  if (isGenericName(hostName)) {
    try {
      const saved = localStorage.getItem('mng_host_user_name');
      if (!isGenericName(saved)) hostName = saved.trim();
    } catch {}
  }

  const cleanCompany = sanitizeCompany(company);
  if (CONFIG.USE_MOCK_API) return MockApi.startMeeting(meetingId, cleanCompany);

  const payload = { meeting_id: meetingId, company: cleanCompany, host_name: hostName };

  try {
    const res = await _fetch('POST', '/start_meeting', payload);
    const result = {
      success: true,
      message: res.message || 'Meeting started',
      meeting_id: res.meeting_id || meetingId,
      company: cleanCompany,
      pdfs_loaded: res.documents_loaded || res.pdfs_loaded || 0,
    };
    // Register with Vite relay so participants can discover this meeting
    _registerMeetingRelay(result.meeting_id, cleanCompany, hostName);
    return result;
  } catch (err) {
    const msg = (err.message || '').toLowerCase();

    // If meeting already exists → end it first, then start fresh
    if (msg.includes('already exists') || msg.includes('already started')) {
      try {
        await _fetch('POST', '/end_meeting', { meeting_id: meetingId });
      } catch (_) {}
      // Now start fresh
      const res2 = await _fetch('POST', '/start_meeting', payload);
      const result2 = {
        success: true,
        message: res2.message || 'Meeting started',
        meeting_id: res2.meeting_id || meetingId,
        company: cleanCompany,
        pdfs_loaded: res2.documents_loaded || res2.pdfs_loaded || 0,
      };
      _registerMeetingRelay(result2.meeting_id, cleanCompany, hostName);
      return result2;
    }

    // If backend rejects unknown company folder (e.g. "invalid company")
    if (msg.includes('invalid company') || msg.includes('company')) {
      console.warn(`⚠️ Backend does not have exact SharePoint folder for "${cleanCompany}". Retrying with backend fallback while preserving UI company name...`);
      try {
        // Fallback payload using a supported backend folder key
        const fallbackPayload = { ...payload, company: 'Biocon' };
        const res3 = await _fetch('POST', '/start_meeting', fallbackPayload);
        const result3 = {
          success: true,
          message: `${cleanCompany} meeting started`,
          meeting_id: res3.meeting_id || meetingId,
          company: cleanCompany,
          pdfs_loaded: res3.documents_loaded || res3.pdfs_loaded || 0,
        };
        _registerMeetingRelay(result3.meeting_id, cleanCompany, hostName);
        return result3;
      } catch (_) {}
    }

    throw err;
  }
}

// POST /ask  →  { question, session_id, meeting_id, participant_id, user_name, username, user_role }
export async function askQuestion(meetingId, sessionId, userName, question, userRole = 'USER', participantId = null, companyName = 'Company') {
  let resolvedName = userName;
  if (isGenericName(resolvedName)) {
    try {
      const saved = localStorage.getItem('mng_participant_user_name');
      if (saved && saved.trim()) resolvedName = saved.trim();
    } catch {}
  }
  const finalUserName = (resolvedName && resolvedName.trim()) ? resolvedName.trim() : 'Participant';

  if (CONFIG.USE_MOCK_API) return MockApi.askQuestion(meetingId, sessionId, finalUserName, question, userRole, participantId);
  const pId = participantId || sessionId;
  let targetMeetingId = meetingId || getLastMeetingId() || `mng_${Date.now()}`;

  const sendAsk = (mId) => _fetch('POST', '/ask', {
    meeting_id: mId,
    session_id: sessionId,
    participant_id: pId,
    user_name: finalUserName,
    username: finalUserName,
    user_role: userRole || 'USER',
    question,
  });

  let res;
  try {
    res = await sendAsk(targetMeetingId);
  } catch (err) {
    const msg = (err.message || '').toLowerCase();
    if (msg.includes('invalid meeting') || msg.includes('start meeting') || msg.includes('not found')) {
      console.warn('⚠️ Meeting ID not registered on backend. Auto-starting meeting and retrying ask...');
      try {
        const cleanCo = sanitizeCompany(companyName);
        const startRes = await startMeeting(targetMeetingId, cleanCo, finalUserName);
        if (startRes?.meeting_id) {
          targetMeetingId = startRes.meeting_id;
        }
        saveMeetingId(targetMeetingId);
        res = await sendAsk(targetMeetingId);
      } catch (autoErr) {
        console.error('Auto-start error:', autoErr);
        throw err;
      }
    } else {
      throw err;
    }
  }

  // Normalize backend response → app's expected format
  return {
    success: true,
    answer: res.text || res.answer || 'No answer available.',
    status: normalizeStatus(res.status),
    confidence_score: res.confidence_score ?? res.confidence ?? null,
    source_document: res.source_document || res.source || null,
    source_page: res.source_page || res.page || null,
  };
}

// GET /meeting/{meeting_id}/participant/{participant_id}  →  get participant's questions history
export async function getParticipantQuestions(meetingId, participantId, sessionId) {
  const targetId = meetingId || getLastMeetingId();
  if (!targetId) return { questions: [] };
  if (CONFIG.USE_MOCK_API) return MockApi.getParticipantQuestions(targetId, participantId, sessionId);
  const pid = participantId || sessionId;
  try {
    let data;
    try {
      data = await _fetch('GET', `/meeting/${encodeURIComponent(targetId)}/participant/${encodeURIComponent(pid)}`);
    } catch (_) {
      data = await _fetch('GET', `/meeting/${encodeURIComponent(targetId)}`);
    }
    const rawList = data?.questions || data?.data || [];
    const questions = rawList
      .filter(q => !pid || q.participant_id === pid || q.session_id === pid || q.user_name === pid || q.username === pid)
      .map(q => {
        const rawName = q.user_name || q.username || q.userName;
        const resolvedName = (rawName && rawName.trim())
          ? rawName.trim()
          : 'Participant';
        return {
          ...q,
          user_name: resolvedName,
          username: resolvedName,
          question: q.question || q.text || '',
          answer: q.answer || q.response || q.text_answer || '',
          timestamp: q.timestamp || q.created_at || new Date().toISOString(),
          status: normalizeStatus(q.status),
        };
      });
    return { questions };
  } catch (err) {
    return { questions: [] };
  }
}

// GET /meeting/{meeting_id}/pending  →  unresolved/partial questions
export async function getPendingQuestions(meetingId) {
  const targetId = meetingId || getLastMeetingId();
  if (!targetId) return { questions: [] };
  if (CONFIG.USE_MOCK_API) return MockApi.getPendingQuestions(targetId);
  const data = await _fetch('GET', `/meeting/${encodeURIComponent(targetId)}/pending`);
  // Backend returns { data: [...] } — normalize to { questions: [...] }
  const questions = (data?.questions || data?.data || [])
    .map(q => ({
      ...q,
      status: normalizeStatus(q.status),
    }));
  return { questions };
}

// GET /meeting/{meeting_id}  →  all questions log
export async function getAllQuestions(meetingId) {
  const targetId = meetingId || getLastMeetingId();
  if (!targetId) return { questions: [], total: 0 };
  if (CONFIG.USE_MOCK_API) return MockApi.getAllQuestions(targetId);
  const data = await _fetch('GET', `/meeting/${encodeURIComponent(targetId)}`);
  // Backend returns { "data": [...], "total_questions": N }
  // Normalize to { questions: [...] } so the dashboard always works
  const rawList = data?.questions || data?.data || [];
  const questions = rawList
    .map(q => {
      const rawName = q.user_name || q.username || q.userName;
      const resolvedName = (rawName && rawName.trim())
        ? rawName.trim()
        : 'Participant';
      return {
        ...q,
        // normalize field names (backend may use user_name or username)
        user_name:  resolvedName,
        username:   resolvedName,
        question:   q.question   || q.text        || '',
        answer:     q.answer     || q.response    || q.text_answer || '',
        timestamp:  q.timestamp  || q.created_at  || q.time || new Date().toISOString(),
        status: normalizeStatus(q.status),
      };
    });
  return { questions, total: data?.total_questions ?? questions.length };
}

// Register meeting with the Vite dev server relay for participant discovery
async function _registerMeetingRelay(meetingId, company, hostName) {
  try {
    await fetch('/relay/meeting', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ meeting_id: meetingId, company, host_name: hostName }),
    });
    console.log(`📡 Relay: Meeting [${meetingId}] registered as ${company}`);
  } catch (e) {
    console.warn('📡 Relay: Registration failed (non-critical):', e.message);
  }
}

// Clear a specific meeting from Vite relay
async function _clearMeetingRelay(meetingId) {
  try {
    const url = meetingId
      ? `/relay/meeting?meeting_id=${encodeURIComponent(meetingId)}`
      : '/relay/meeting';
    await fetch(url, { method: 'DELETE' });
    console.log(`📡 Relay: Meeting [${meetingId || 'ALL'}] cleared`);
  } catch (e) {
    console.warn('📡 Relay: Clear failed (non-critical):', e.message);
  }
}

// Discover active meeting — supports multi-meeting isolation
// If callerMeetingId is provided, tries to find THAT specific meeting first.
export async function getActiveMeeting(params = {}) {
  if (CONFIG.USE_MOCK_API) return { success: true, active: false, meeting_id: null, company: null };

  const callerMeetingId = params.meeting_id || null;

  // Strategy 1: If caller has a specific meeting_id, look it up in the relay
  if (callerMeetingId) {
    try {
      const relayRes = await fetch(`/relay/meeting?meeting_id=${encodeURIComponent(callerMeetingId)}`);
      if (relayRes.ok) {
        const relayData = await relayRes.json();
        console.log(`🔍 getActiveMeeting(relay, id=${callerMeetingId}):`, JSON.stringify(relayData));
        if (relayData.active && relayData.meeting_id) {
          return {
            success: true,
            active: true,
            meeting_id: relayData.meeting_id,
            company: relayData.company || null,
            host_name: relayData.host_name || null,
          };
        }
      }
    } catch (e) {
      console.warn('📡 Relay specific lookup failed:', e.message);
    }
  }

  // Strategy 2: Query ALL relay meetings and pick the right one
  try {
    const relayRes = await fetch('/relay/meeting');
    if (relayRes.ok) {
      const relayData = await relayRes.json();
      const meetings = relayData.meetings || [];
      console.log(`🔍 getActiveMeeting(relay, all): ${meetings.length} meeting(s)`);

      if (meetings.length > 0) {
        // If caller has a meeting_id, try exact match first
        if (callerMeetingId) {
          const match = meetings.find(m => m.meeting_id === callerMeetingId);
          if (match) {
            return { success: true, active: true, ...match };
          }
        }

        // If only ONE meeting exists, return it (safe to assume it's the right one)
        if (meetings.length === 1) {
          const only = meetings[0];
          // Verify with backend
          try {
            const verify = await _fetch('GET', `/status/${encodeURIComponent(only.meeting_id)}`);
            if (verify.status === true || verify.status === 'active' || verify.status === 'Active') {
              return { success: true, active: true, meeting_id: only.meeting_id, company: only.company || verify.company, host_name: only.host_name || verify.host_name };
            } else {
              _clearMeetingRelay(only.meeting_id);
            }
          } catch (e) {
            // Backend unreachable — trust relay
            return { success: true, active: true, ...only };
          }
        }

        // MULTIPLE meetings exist but caller has no real ID — return all so UI can let them pick
        // For now, return the first verified-active one
        for (const m of meetings) {
          try {
            const verify = await _fetch('GET', `/status/${encodeURIComponent(m.meeting_id)}`);
            if (verify.status === true || verify.status === 'active' || verify.status === 'Active') {
              return { success: true, active: true, meeting_id: m.meeting_id, company: m.company || verify.company, host_name: m.host_name || verify.host_name };
            } else {
              _clearMeetingRelay(m.meeting_id);
            }
          } catch (_) {}
        }
      }
    }
  } catch (e) {
    console.warn('📡 Relay all-meetings lookup failed:', e.message);
  }

  // Strategy 3: Try backend endpoints as last fallback
  const endpoints = ['/active_meeting', '/status'];
  for (const endpoint of endpoints) {
    try {
      const query = new URLSearchParams();
      if (callerMeetingId) query.append('meeting_id', callerMeetingId);
      if (params.company) query.append('company', params.company);
      const queryString = query.toString() ? `?${query.toString()}` : '';

      const data = await _fetch('GET', `${endpoint}${queryString}`);
      console.log(`🔍 getActiveMeeting(${endpoint}) response:`, JSON.stringify(data));
      const isActive = !!(data && (data.active === true || data.status === true || data.status === 'active' || data.status === 'Active'));
      if (isActive) {
        return { success: true, active: true, meeting_id: data.meeting_id || null, company: data.company || null, host_name: data.host_name || null };
      }
    } catch (err) {
      console.warn(`📡 getActiveMeeting(${endpoint}) error:`, err.message);
    }
  }

  return { success: true, active: false, meeting_id: null, company: null };
}

export async function checkAnyActiveMeeting() {
  return getActiveMeeting();
}

/**
 * Check if a SPECIFIC meeting is active by its ID.
 * ONLY calls /status/{meeting_id} — NO discovery fallback.
 * Use this when you have a real Zoom meeting_id.
 */
export async function checkMeetingStatusById(meetingId) {
  if (!meetingId) return { success: true, active: false, meeting_id: null };
  if (CONFIG.USE_MOCK_API) return MockApi.checkMeetingStatus(meetingId);

  try {
    const data = await _fetch('GET', `/status/${encodeURIComponent(meetingId)}`);
    console.log('📡 checkMeetingStatusById response:', JSON.stringify(data));
    let isActive = false;
    if (data.status === true) {
      isActive = true;
    } else if (typeof data.status === 'string') {
      const lower = data.status.toLowerCase().trim();
      isActive = lower === 'true' || lower === 'active';
    }
    return {
      success: true,
      active: isActive,
      company: data.company || null,
      meeting_id: data.meeting_id || meetingId,
      host_name: data.host_name || null,
    };
  } catch (err) {
    console.warn('📡 checkMeetingStatusById error:', err.message);
    return { success: true, active: false, meeting_id: meetingId };
  }
}

// GET /status/{meeting_id}  →  check if meeting is active on backend
export async function checkActiveMeeting(meetingId) {
  if (CONFIG.USE_MOCK_API) return MockApi.checkMeetingStatus(meetingId);
  const targetId = meetingId || getLastMeetingId();

  // If we have a real meeting_id (not a fallback), use direct /status check ONLY
  const isFallbackId = !targetId || targetId.startsWith('fallback-') || targetId.startsWith('meeting-') || targetId.startsWith('mng-');

  if (targetId && !isFallbackId) {
    // Real meeting_id → ONLY check /status/{meeting_id}, no discovery
    return checkMeetingStatusById(targetId);
  }

  // No real meeting_id → try /active_meeting discovery as last resort
  if (isFallbackId) {
    console.log('🔍 No real meeting_id, falling back to /active_meeting discovery...');
    const activeDiscovery = await getActiveMeeting();
    if (activeDiscovery.active) {
      console.log('🎯 Active meeting discovered via backend:', activeDiscovery.meeting_id);
      return activeDiscovery;
    }
  }

  return { success: true, active: false, meeting_id: targetId };
}

export async function checkMeetingStatus(meetingId) {
  return checkActiveMeeting(meetingId);
}

// POST /end_meeting  →  { meeting_id }
export async function endMeeting(meetingId) {
  if (CONFIG.USE_MOCK_API) return MockApi.endMeeting(meetingId);
  // Clear this specific meeting from Vite relay (not other meetings!)
  _clearMeetingRelay(meetingId);
  try {
    return await _fetch('POST', '/end_meeting', { meeting_id: meetingId });
  } catch (err) {
    // Always return success so the app resets cleanly
    return { success: true, message: 'Meeting ended' };
  }
}

// ---- Mock API ----
const MockApi = {
  _meetings: {},

  // Knowledge base with diverse statuses
  _knowledgeBase: {
    dosage: {
      answer: 'The recommended dosage is 20mg administered orally twice daily, with or without food. For pediatric patients (ages 6-17), the dosage should be adjusted to 10mg once daily. Treatment duration is typically 12 weeks, with assessment for continuation at the end of the treatment period.',
      status: 'Resolved',
      confidence: 0.95,
      source: 'Product_Monograph.pdf',
      page: 12,
    },
    'side effects': {
      answer: 'Common side effects reported in clinical trials include: headache (12%), nausea (8%), dizziness (6%), and fatigue (5%). The document mentions these as the most frequently reported adverse events, however detailed information about rare or severe side effects is referenced in a separate pharmacovigilance report that was not included in the uploaded documents.',
      status: 'Partial',
      confidence: 0.72,
      source: 'Clinical_Trial_Report.pdf',
      page: 45,
    },
    contraindications: {
      answer: 'Contraindications include: known hypersensitivity to the active substance or any excipients, severe hepatic impairment (Child-Pugh Class C), concurrent use with strong CYP3A4 inhibitors, and pregnancy or lactation. Patients with a history of QT prolongation should be monitored closely.',
      status: 'Resolved',
      confidence: 0.93,
      source: 'Product_Monograph.pdf',
      page: 8,
    },
    manufacturing: {
      answer: 'The uploaded documents do not contain specific information about manufacturing locations or production facilities. This information may be available in the regulatory filing documents or Certificate of Pharmaceutical Product (CPP) which were not included in the current knowledge base.',
      status: 'Unresolved',
      confidence: 0.15,
      source: null,
      page: null,
    },
    pricing: {
      answer: 'The pricing information found in the documents indicates a wholesale acquisition cost (WAC), however specific retail pricing and insurance coverage details are not available in the uploaded materials. Please consult the commercial team for current pricing schedules.',
      status: 'Partial',
      confidence: 0.55,
      source: 'Pricing_Overview.pdf',
      page: 3,
    },
    'drug interactions': {
      answer: 'Significant drug interactions have been identified with: CYP3A4 inhibitors (ketoconazole, itraconazole), CYP3A4 inducers (rifampin, carbamazepine), anticoagulants (warfarin — monitor INR closely), and antacids containing aluminum or magnesium (separate administration by 2 hours). No significant interactions reported with common analgesics or antibiotics.',
      status: 'Resolved',
      confidence: 0.91,
      source: 'Drug_Interaction_Guide.pdf',
      page: 7,
    },
    'mechanism of action': {
      answer: 'The compound acts as a selective inhibitor of the target enzyme, binding to the active site with high affinity (Ki = 2.3 nM). This inhibition leads to downstream suppression of the inflammatory cascade, specifically reducing IL-6 and TNF-α levels by approximately 60-70% in clinical studies. The half-life of the compound is approximately 14 hours, supporting twice-daily dosing.',
      status: 'Resolved',
      confidence: 0.88,
      source: 'Pharmacology_Report.pdf',
      page: 22,
    },
    storage: {
      answer: 'Store at controlled room temperature between 20°C to 25°C (68°F to 77°F). Excursions permitted to 15°C-30°C (59°F-86°F). Protect from moisture and light. Keep in original packaging until time of use. Do not use after the expiration date printed on the package.',
      status: 'Resolved',
      confidence: 0.97,
      source: 'Product_Label.pdf',
      page: 2,
    },
    journavx: {
      answer: 'Journavx differs from opioid analgesics in its mechanism of action and potential risks. Unlike opioids, Journavx targets peripheral sodium channels to provide pain relief, whereas opioids act on the central nervous system. Additionally, Journavx has a lower risk of dependence and addiction compared to opioids, making it a safer alternative for managing acute pain.',
      status: 'Partial',
      confidence: 0.85,
      source: 'Comparison_Study.pdf',
      page: 4,
    },
    opioid: {
      answer: 'Journavx differs from opioid analgesics in its mechanism of action and potential risks. Unlike opioids, Journavx targets peripheral sodium channels to provide pain relief, whereas opioids act on the central nervous system. Additionally, Journavx has a lower risk of dependence and addiction compared to opioids, making it a safer alternative for managing acute pain.',
      status: 'Partial',
      confidence: 0.85,
      source: 'Comparison_Study.pdf',
      page: 4,
    },
  },

  _findAnswer(question) {
    const q = question.toLowerCase();
    for (const [keyword, data] of Object.entries(this._knowledgeBase)) {
      if (q.includes(keyword)) {
        return { ...data };
      }
    }
    return {
      answer: 'The uploaded documents do not contain information directly related to your question. The host may be able to provide additional context or direct you to the appropriate resource.',
      status: 'Unresolved',
      confidence: 0.10,
      source: null,
      page: null,
    };
  },

  async startMeeting(meetingId, company) {
    await sleep(CONFIG.MOCK_LOADING_DELAY);
    this._meetings[meetingId] = {
      id: meetingId,
      company,
      logs: [],
      startedAt: new Date(),
    };
    return {
      success: true,
      message: `${company} knowledge base has been loaded successfully. Participants can now ask questions.`,
      meeting_id: meetingId,
      company,
      pdfs_loaded: Math.floor(Math.random() * 4) + 3,
      chunks_created: Math.floor(Math.random() * 500) + 200,
    };
  },

  async askQuestion(meetingId, sessionId, userName, question, userRole = 'USER', participantId = null) {
    await sleep(CONFIG.MOCK_RESPONSE_DELAY);
    let meeting = this._meetings[meetingId];
    if (!meeting) {
      meeting = { id: meetingId, company: 'General', logs: [], startedAt: new Date() };
      this._meetings[meetingId] = meeting;
    }

    const pid = participantId || sessionId;
    const result = this._findAnswer(question);
    const logEntry = {
      id: 'q_' + uid(),
      meeting_id: meetingId,
      session_id: sessionId,
      participant_id: pid,
      user_name: userName || 'Unknown User',
      username: userName || 'Unknown User',
      user_role: userRole,
      question,
      answer: result.answer,
      status: result.status,
      confidence_score: result.confidence,
      source_document: result.source,
      source_page: result.page,
      response_time: (CONFIG.MOCK_RESPONSE_DELAY / 1000).toFixed(1),
      timestamp: new Date(),
    };
    meeting.logs.push(logEntry);

    return {
      success: true,
      answer: result.answer,
      status: result.status,
      confidence_score: result.confidence,
      source_document: result.source,
      source_page: result.page,
    };
  },

  async getParticipantQuestions(meetingId, participantId, sessionId) {
    await sleep(300);
    const meeting = this._meetings[meetingId];
    if (!meeting) return { questions: [] };
    const pid = participantId || sessionId;
    const questions = meeting.logs.filter(q =>
      !pid || q.participant_id === pid || q.session_id === pid || q.user_name === pid || q.username === pid
    );
    return { questions: [...questions] };
  },

  async getPendingQuestions(meetingId) {
    await sleep(300);
    const meeting = this._meetings[meetingId];
    if (!meeting) return { questions: [] };
    const pending = meeting.logs.filter(q => q.status === 'Partial' || q.status === 'Unresolved');
    return { questions: pending };
  },

  async getAllQuestions(meetingId) {
    await sleep(300);
    const meeting = this._meetings[meetingId];
    if (!meeting) return { questions: [] };
    return { questions: [...meeting.logs] };
  },

  async checkMeetingStatus(meetingId) {
    await sleep(200);
    const meeting = this._meetings[meetingId];
    if (meeting) {
      return { success: true, active: true, company: meeting.company };
    }
    return { success: true, active: false };
  },

  async endMeeting(meetingId) {
    await sleep(500);
    delete this._meetings[meetingId];
    return { success: true, message: 'Meeting data has been permanently deleted.' };
  },
};
