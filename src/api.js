/* ============================================
   MNG Bot — API Client + Mock Backend
   Full mock API with knowledge base simulation
   ============================================ */

import { getLastMeetingId, saveMeetingId } from './utils/meetingStorage';

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
  if (!name) return 'Biocon';
  const lower = String(name).toLowerCase().trim();
  if (lower.includes('pfizer')) return 'Pfizer';
  return 'Biocon';
}

// POST /start_meeting  →  { meeting_id, company, host_name }
export async function startMeeting(meetingId, company, hostName = 'Host') {
  if (typeof meetingId === 'object' && meetingId !== null) {
    const obj = meetingId;
    meetingId = obj.meeting_id;
    company = obj.company;
    hostName = obj.host_name || 'Host';
  }
  const cleanCompany = sanitizeCompany(company);
  if (CONFIG.USE_MOCK_API) return MockApi.startMeeting(meetingId, cleanCompany);

  const payload = { meeting_id: meetingId, company: cleanCompany, host_name: hostName };

  try {
    const res = await _fetch('POST', '/start_meeting', payload);
    return {
      success: true,
      message: res.message || 'Meeting started',
      meeting_id: res.meeting_id || meetingId,
      company: cleanCompany,
      pdfs_loaded: res.documents_loaded || res.pdfs_loaded || 0,
    };
  } catch (err) {
    const msg = (err.message || '').toLowerCase();

    // If meeting already exists → end it first, then start fresh
    if (msg.includes('already exists') || msg.includes('already started')) {
      try {
        await _fetch('POST', '/end_meeting', { meeting_id: meetingId });
      } catch (_) {
        // Try ending any active meeting
        try {
          const active = await _fetch('GET', '/meeting/active');
          if (active?.meeting_id) {
            await _fetch('POST', '/end_meeting', { meeting_id: active.meeting_id });
          }
        } catch (_) {}
      }
      // Now start fresh
      const res2 = await _fetch('POST', '/start_meeting', payload);
      return {
        success: true,
        message: res2.message || 'Meeting started',
        meeting_id: res2.meeting_id || meetingId,
        company: cleanCompany,
        pdfs_loaded: res2.documents_loaded || res2.pdfs_loaded || 0,
      };
    }

    throw err;
  }
}

// POST /ask  →  { question, session_id, meeting_id, participant_id, user_name, username, user_role }
export async function askQuestion(meetingId, sessionId, userName, question, userRole = 'USER', participantId = null, companyName = 'Biocon') {
  if (CONFIG.USE_MOCK_API) return MockApi.askQuestion(meetingId, sessionId, userName, question, userRole, participantId);
  const pId = participantId || sessionId;
  let targetMeetingId = meetingId || getLastMeetingId() || `mng_${Date.now()}`;

  const sendAsk = (mId) => _fetch('POST', '/ask', {
    meeting_id: mId,
    session_id: sessionId,
    participant_id: pId,
    user_name: userName || 'Unknown User',
    username: userName || 'Unknown User',
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
        const startRes = await startMeeting(targetMeetingId, cleanCo, userName);
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
  if (CONFIG.USE_MOCK_API) return MockApi.getParticipantQuestions(meetingId, participantId, sessionId);
  const pid = participantId || sessionId;
  try {
    let data;
    try {
      data = await _fetch('GET', `/meeting/${meetingId}/participant/${pid}`);
    } catch (_) {
      data = await _fetch('GET', `/meeting/${meetingId}`);
    }
    const rawList = data?.questions || data?.data || [];
    const questions = rawList
      .filter(q => !pid || q.participant_id === pid || q.session_id === pid || q.user_name === pid || q.username === pid)
      .map(q => ({
        ...q,
        user_name: q.user_name || q.username || 'Unknown User',
        username: q.user_name || q.username || 'Unknown User',
        question: q.question || q.text || '',
        answer: q.answer || q.response || q.text_answer || '',
        timestamp: q.timestamp || q.created_at || new Date().toISOString(),
        status: normalizeStatus(q.status),
      }));
    return { questions };
  } catch (err) {
    return { questions: [] };
  }
}

// GET /meeting/{meeting_id}/pending  →  unresolved/partial questions
export async function getPendingQuestions(meetingId) {
  if (CONFIG.USE_MOCK_API) return MockApi.getPendingQuestions(meetingId);
  const data = await _fetch('GET', `/meeting/${meetingId}/pending`);
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
  if (CONFIG.USE_MOCK_API) return MockApi.getAllQuestions(meetingId);
  const data = await _fetch('GET', `/meeting/${meetingId}`);
  // Backend returns { "data": [...], "total_questions": N }
  // Normalize to { questions: [...] } so the dashboard always works
  const rawList = data?.questions || data?.data || [];
  const questions = rawList
    .map(q => ({
      ...q,
      // normalize field names (backend may use user_name or username)
      user_name:  q.user_name  || q.username   || q.userName || 'Unknown User',
      username:   q.user_name  || q.username   || q.userName || 'Unknown User',
      question:   q.question   || q.text        || '',
      answer:     q.answer     || q.response    || q.text_answer || '',
      timestamp:  q.timestamp  || q.created_at  || q.time || new Date().toISOString(),
      status: normalizeStatus(q.status),
    }));
  return { questions, total: data?.total_questions ?? questions.length };
}

// GET /active_meeting  →  discover any active meeting on backend
export async function getActiveMeeting() {
  if (CONFIG.USE_MOCK_API) return { success: true, active: false, meeting_id: null, company: null };
  try {
    const data = await _fetch('GET', '/active_meeting');
    console.log('🔍 getActiveMeeting response:', JSON.stringify(data));
    const isActive = !!(data && (data.active === true || data.status === true));
    return {
      success: true,
      active: isActive,
      meeting_id: data.meeting_id || null,
      company: data.company || null,
      host_name: data.host_name || null,
    };
  } catch (err) {
    console.warn('📡 getActiveMeeting error:', err.message);
    return { success: true, active: false, meeting_id: null, company: null };
  }
}

export async function checkAnyActiveMeeting() {
  return getActiveMeeting();
}

// GET /status/{meeting_id}  →  check if meeting is active on backend
// Uses the dedicated /status endpoint with fallback to /active_meeting discovery
export async function checkActiveMeeting(meetingId) {
  if (CONFIG.USE_MOCK_API) return MockApi.checkMeetingStatus(meetingId);
  const targetId = meetingId || getLastMeetingId();
  
  const isFallbackId = !targetId || targetId.startsWith('fallback-') || targetId.startsWith('meeting-') || targetId.startsWith('mng-');

  if (!isFallbackId) {
    try {
      const data = await _fetch('GET', `/status/${targetId}`);
      console.log('📡 checkActiveMeeting response:', JSON.stringify(data));
      let isActive = false;
      if (data.status === true) {
        isActive = true;
      } else if (typeof data.status === 'string') {
        const lower = data.status.toLowerCase().trim();
        isActive = lower === 'true' || lower === 'active';
      }
      if (isActive) {
        return {
          success: true,
          active: true,
          company: data.company || null,
          meeting_id: data.meeting_id || targetId,
        };
      }
    } catch (err) {
      console.warn('📡 checkActiveMeeting specific check error:', err.message);
    }
  }

  // Fallback: Query /active_meeting to discover active meeting if ID mismatch or fallback
  console.log('🔍 Falling back to /active_meeting discovery...');
  const activeDiscovery = await getActiveMeeting();
  if (activeDiscovery.active) {
    console.log('🎯 Active meeting discovered via backend:', activeDiscovery.meeting_id);
    return activeDiscovery;
  }

  return { success: true, active: false, meeting_id: targetId };
}

export async function checkMeetingStatus(meetingId) {
  return checkActiveMeeting(meetingId);
}

// POST /end_meeting  →  { meeting_id }
export async function endMeeting(meetingId) {
  if (CONFIG.USE_MOCK_API) return MockApi.endMeeting(meetingId);
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
