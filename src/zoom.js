/* ============================================
   MNG Bot — Zoom Apps SDK Integration
   ============================================ */
import zoomSdk from '@zoom/appssdk';
import { isGenericName } from './utils/meetingStorage';

let _sdkReady = false;
let _configResult = null;
let _isGuestMode = false;
let _initError = null;

const _inIframe = window.self !== window.top;
const isInZoom = _inIframe;

export { isInZoom };

export async function initZoom() {
  try {
    _configResult = await zoomSdk.config({
      popoutSize: { width: 480, height: 720 },
      capabilities: [
        'getMeetingContext',
        'getUserContext',
        'getMeetingParticipants',
        'getUser',
        'getRunningContext',
        'getMeetingUUID',
        'onMeetingStarted',
        'onMeetingEnded',
        'onParticipantChange',
        'onUserContextChange',
        'expandApp',
        'openUrl',
      ],
    });
    _sdkReady = true;
    _initError = null;

    const authStatus = _configResult?.auth?.status;
    console.log('✅ Zoom SDK initialized. Config:', JSON.stringify(_configResult));

    if (authStatus === 'unauthenticated' || authStatus === 'unauthorized') {
      _isGuestMode = true;
    }

    return _configResult;
  } catch (error) {
    console.warn('⚠️ Zoom SDK initialization warning:', error.message);
    _sdkReady = false;
    _initError = error.message;
    return null;
  }
}

export function isZoomReady() { return _sdkReady; }
export function isGuestMode() { return _isGuestMode; }
export function getInitError() { return _initError; }

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * Determine if the role indicates host, participant, or unknown (null).
 * Returns: true (host), false (participant), null (unknown)
 */
function _evaluateRole(role) {
  if (role === undefined || role === null || role === '') return null;

  if (typeof role === 'number') {
    if (role === 1) return true;
    if (role === 0) return false;
    return null;
  }

  const norm = String(role).toLowerCase().trim();
  if (norm === 'host' || norm === 'cohost' || norm === 'co-host' || norm === 'owner') {
    return true;
  }
  if (norm === 'participant' || norm === 'attendee' || norm === 'guest') {
    return false;
  }
  return null;
}

/**
 * Try getUserContext with retry logic.
 */
async function _getUserContextWithRetry(maxAttempts = 2) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const user = await zoomSdk.getUserContext();
      console.log(`👤 getUserContext (attempt ${attempt}):`, JSON.stringify(user));
      if (user && Object.keys(user).length > 0) return user;
      if (attempt < maxAttempts) await sleep(500);
    } catch (e) {
      console.warn(`⚠️ getUserContext attempt ${attempt} failed:`, e.message);
      if (attempt < maxAttempts) await sleep(500);
    }
  }
  return {};
}

/**
 * Try getUser API with retry logic.
 */
async function _getUserWithRetry(maxAttempts = 2) {
  if (!_sdkReady || typeof zoomSdk.getUser !== 'function') return {};
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const user = await zoomSdk.getUser();
      console.log(`👤 getUser direct (attempt ${attempt}):`, JSON.stringify(user));
      if (user && Object.keys(user).length > 0) return user;
      if (attempt < maxAttempts) await sleep(500);
    } catch (e) {
      console.warn(`⚠️ getUser attempt ${attempt} failed:`, e.message);
      if (attempt < maxAttempts) await sleep(500);
    }
  }
  return {};
}

/**
 * Try getMeetingParticipants with retry logic.
 */
async function _getMeetingParticipantsWithRetry(maxAttempts = 2) {
  if (!_sdkReady || typeof zoomSdk.getMeetingParticipants !== 'function') return [];
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await zoomSdk.getMeetingParticipants();
      console.log(`👥 getMeetingParticipants (attempt ${attempt}):`, JSON.stringify(res));
      const list = res?.participants || res?.data || (Array.isArray(res) ? res : []);
      if (list.length > 0) return list;
      if (attempt < maxAttempts) await sleep(500);
    } catch (e) {
      console.warn(`⚠️ getMeetingParticipants attempt ${attempt} failed:`, e.message);
      if (attempt < maxAttempts) await sleep(500);
    }
  }
  return [];
}

/**
 * Try getMeetingContext / getMeetingUUID with retry logic.
 */
async function _getMeetingContextWithRetry(maxAttempts = 3) {
  let meetingContext = {};
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      meetingContext = await zoomSdk.getMeetingContext();
      console.log(`📋 getMeetingContext (attempt ${attempt}):`, JSON.stringify(meetingContext));
      const uuid = meetingContext?.meetingUUID || meetingContext?.meetingID || meetingContext?.meetingId;
      if (uuid) return meetingContext;

      if (typeof zoomSdk.getMeetingUUID === 'function') {
        try {
          const directUUID = await zoomSdk.getMeetingUUID();
          if (directUUID) {
            console.log(`📋 getMeetingUUID direct call (attempt ${attempt}):`, directUUID);
            const resUUID = typeof directUUID === 'string' ? directUUID : (directUUID?.meetingUUID || directUUID?.meetingId);
            if (resUUID) {
              return { ...meetingContext, meetingUUID: resUUID };
            }
          }
        } catch (e) {
          console.warn(`⚠️ getMeetingUUID direct attempt ${attempt} failed:`, e.message);
        }
      }

      if (attempt < maxAttempts) await sleep(500);
    } catch (e) {
      console.warn(`⚠️ getMeetingContext attempt ${attempt} failed:`, e.message);
      if (attempt < maxAttempts) await sleep(500);
    }
  }
  return meetingContext || {};
}

/**
 * Recursively search any object/array for screen name properties.
 */
function findScreenNameInObject(obj, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 4) return null;

  const keys = Object.keys(obj);
  for (const k of keys) {
    const val = obj[k];
    if (typeof val === 'string' && val.trim().length > 0 && !isGenericName(val)) {
      const lowerKey = k.toLowerCase();
      if (
        lowerKey.includes('screen') ||
        lowerKey.includes('display') ||
        lowerKey.includes('username') ||
        lowerKey.includes('user_name') ||
        lowerKey.includes('participant') ||
        lowerKey.includes('hostname') ||
        lowerKey.includes('host_name') ||
        lowerKey.includes('nickname') ||
        lowerKey === 'name'
      ) {
        return val.trim();
      }
    }
  }

  const first = (obj.firstName || obj.first_name || obj.givenName || obj.first || '').trim();
  const last = (obj.lastName || obj.last_name || obj.familyName || obj.last || '').trim();
  if ((first || last) && !isGenericName(`${first} ${last}`.trim())) {
    return `${first} ${last}`.trim();
  }

  for (const k of keys) {
    const val = obj[k];
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      const found = findScreenNameInObject(val, depth + 1);
      if (found) return found;
    } else if (Array.isArray(val)) {
      for (const item of val) {
        if (item && typeof item === 'object') {
          const found = findScreenNameInObject(item, depth + 1);
          if (found) return found;
        }
      }
    }
  }

  return null;
}

/**
 * Extract display name from all potential Zoom SDK objects, URL params, and local storage.
 */
function _resolveDisplayName(userContext = {}, meetingContext = {}, matchedParticipant = {}, configResult = {}, userObj = {}, participantsList = []) {
  const params = new URLSearchParams(window.location.search);
  const urlName = params.get('username') || params.get('user_name') || params.get('name') || params.get('screenName') || params.get('displayName') || params.get('participantName');
  if (urlName && !isGenericName(urlName)) {
    try { localStorage.setItem('mng_user_name', urlName.trim()); } catch { }
    return urlName.trim();
  }

  const sources = [
    userObj,
    matchedParticipant,
    userContext,
    participantsList,
    meetingContext,
    configResult,
  ];

  for (const src of sources) {
    if (src) {
      const found = findScreenNameInObject(src);
      if (found) {
        try { localStorage.setItem('mng_user_name', found); } catch { }
        return found;
      }
    }
  }

  try {
    const saved = localStorage.getItem('mng_user_name');
    if (saved && !isGenericName(saved)) {
      return saved.trim();
    }
  } catch { }

  return _isGuestMode ? 'Guest User' : 'Zoom User';
}

/**
 * Get full meeting + user context from Zoom SDK.
 */
export async function getMeetingContext() {
  if (!_sdkReady) return _getFallbackContext();

  try {
    const meetingContext = await _getMeetingContextWithRetry(3);
    const userContext = await _getUserContextWithRetry(2);
    const userObj = await _getUserWithRetry(2);
    const participants = await _getMeetingParticipantsWithRetry(2);

    let matchedParticipant = null;
    if (participants && participants.length > 0) {
      const myId = userContext.participantUUID || userContext.participantId || userContext.id || userObj.participantUUID || userObj.id;
      if (myId) {
        matchedParticipant = participants.find(p => {
          const pId = p.participantUUID || p.participantId || p.id || p.user_id || p.userId;
          return pId && String(pId).toLowerCase() === String(myId).toLowerCase();
        });
      }
      if (!matchedParticipant && participants.length === 1) {
        matchedParticipant = participants[0];
      }
    }

    let roleDecision = _evaluateRole(userContext.role);
    let roleSource = `userContext.role="${userContext.role}"`;

    if (roleDecision === null && matchedParticipant) {
      roleDecision = _evaluateRole(matchedParticipant.role);
      if (roleDecision !== null) roleSource = `matchedParticipant.role`;
    }

    if (roleDecision === null && userObj) {
      roleDecision = _evaluateRole(userObj.role);
      if (roleDecision !== null) roleSource = `userObj.role`;
    }

    if (roleDecision === null && meetingContext) {
      roleDecision = _evaluateRole(meetingContext.role || meetingContext.userRole);
      if (roleDecision !== null) roleSource = `meetingContext.role`;
    }

    if (roleDecision === null && userContext.status) {
      roleDecision = _evaluateRole(userContext.status);
      if (roleDecision !== null) roleSource = `userContext.status`;
    }

    if (roleDecision === null && meetingContext.hostUUID && (userContext.participantUUID || userContext.participantId)) {
      const pUUID = userContext.participantUUID || userContext.participantId;
      if (meetingContext.hostUUID === pUUID) {
        roleDecision = true;
        roleSource = `hostUUID match`;
      }
    }

    const displayName = _resolveDisplayName(userContext, meetingContext, matchedParticipant, _configResult, userObj, participants);
    let meetingNumber = meetingContext.meetingNumber || meetingContext.meeting_number || null;
    let zoomMeetingId =
      meetingContext.meetingUUID ||
      meetingContext.meeting_id ||
      meetingContext.meetingID ||
      meetingContext.meetingId ||
      (meetingNumber ? String(meetingNumber) : null);

    if (!zoomMeetingId && typeof zoomSdk.getMeetingUUID === 'function') {
      try {
        const directUUID = await zoomSdk.getMeetingUUID();
        if (directUUID) {
          zoomMeetingId = typeof directUUID === 'string' ? directUUID : (directUUID?.meetingUUID || directUUID?.meetingId);
        }
      } catch (_) {}
    }

    const meetingUUID = zoomMeetingId || (meetingNumber ? String(meetingNumber) : null);
    if (!meetingUUID) {
      console.warn("⚠️ Zoom meeting UUID not available from SDK context — using fallback context");
      return _getFallbackContext();
    }

    const pUUID = userContext.participantUUID || userContext.participantId || userObj.participantUUID || matchedParticipant?.participantUUID;
    const participantUUID = pUUID || 'participant_' + crypto.randomUUID();

    let session_id = sessionStorage.getItem("mng_session_id");
    if (!session_id) {
      session_id = crypto.randomUUID();
      sessionStorage.setItem("mng_session_id", session_id);
    }

    return {
      meetingUUID: meetingUUID,
      meeting_id: meetingUUID,
      session_id: session_id,
      participant_id: participantUUID,
      meetingNumber: meetingNumber,
      user_name: displayName,
      user_email: userContext.email || userObj.email || null,
      explicitRole: roleDecision,
      isHost: roleDecision === true,
      is_host: roleDecision === true,
      is_guest: _isGuestMode,
      _debug: {
        userContextRole: userContext.role,
        roleSource: roleSource,
        explicitRole: roleDecision,
        resolvedName: displayName,
      },
    };
  } catch (err) {
    console.warn('⚠️ getMeetingContext failed:', err.message);
    return _getFallbackContext();
  }
}

function _getFallbackContext() {
  const params = new URLSearchParams(window.location.search);
  const role = params.get('role') || '';
  const explicitRole = _evaluateRole(role);
  const userName = params.get('username') || params.get('user_name') || params.get('name') || params.get('screenName') || params.get('displayName') || params.get('participantName') || '';
  const meetingId = params.get('meeting_id') || 'dev_meeting_12345';

  let resolvedName = userName.trim();
  if (isGenericName(resolvedName)) {
    try {
      const saved = localStorage.getItem('mng_user_name');
      if (saved && !isGenericName(saved)) {
        resolvedName = saved.trim();
      }
    } catch { }
  }

  if (isGenericName(resolvedName)) {
    resolvedName = explicitRole === true ? 'Test Host' : 'Test User';
  }

  let session_id = sessionStorage.getItem("mng_session_id");
  if (!session_id) {
    session_id = crypto.randomUUID();
    sessionStorage.setItem("mng_session_id", session_id);
  }

  return {
    meeting_id: meetingId,
    meetingUUID: meetingId,
    participant_id: 'browser_participant',
    user_name: resolvedName,
    user_email: null,
    explicitRole: explicitRole,
    is_host: explicitRole === true,
    isHost: explicitRole === true,
    is_guest: true,
    is_browser: true,
    session_id: session_id,
    _debug: { roleSource: 'browser-fallback', userContextRole: role },
  };
}

export function onMeetingStarted(cb) {
  if (!_sdkReady) return () => { };
  try {
    zoomSdk.addEventListener('onMeetingStarted', cb);
    return () => {
      try { zoomSdk.removeEventListener('onMeetingStarted', cb); } catch { }
    };
  } catch (_) {
    return () => { };
  }
}

export function onMeetingEnded(cb) {
  if (!_sdkReady) return () => { };
  try {
    zoomSdk.addEventListener('onMeetingEnded', cb);
    return () => {
      try { zoomSdk.removeEventListener('onMeetingEnded', cb); } catch { }
    };
  } catch (_) {
    return () => { };
  }
}
