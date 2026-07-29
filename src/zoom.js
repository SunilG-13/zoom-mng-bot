/* ============================================
   MNG Bot — Zoom Apps SDK Integration
   ============================================ */
import zoomSdk from '@zoom/appssdk';
import { getLastMeetingId } from './utils/meetingStorage';

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
        'getRunningContext',
        'getMeetingUUID',
        'onMeetingStarted',
        'onMeetingEnded',
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
  } catch (err) {
    console.warn('⚠️ Zoom SDK not available:', err.message);
    _sdkReady = false;
    _initError = err.message;
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
      
      // If getMeetingUUID capability is present, try calling it directly
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
 * Extract display name from user context.
 */
function _resolveDisplayName(userContext) {
  const candidates = [
    userContext?.screenName,
    userContext?.displayName,
    (() => {
      const first = (userContext?.firstName || '').trim();
      const last = (userContext?.lastName || '').trim();
      return (first || last) ? `${first} ${last}`.trim() : null;
    })(),
    userContext?.email,
    userContext?.username,
  ];

  for (const name of candidates) {
    if (name && name.trim().length > 0) {
      return name.trim();
    }
  }

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

    // Evaluate role from all available SDK fields
    let roleDecision = _evaluateRole(userContext.role);
    let roleSource = `userContext.role="${userContext.role}"`;

    if (roleDecision === null && meetingContext) {
      roleDecision = _evaluateRole(meetingContext.role || meetingContext.userRole);
      if (roleDecision !== null) roleSource = `meetingContext.role`;
    }

    if (roleDecision === null && userContext.status) {
      roleDecision = _evaluateRole(userContext.status);
      if (roleDecision !== null) roleSource = `userContext.status`;
    }

    // Check hostUUID vs participantUUID match
    if (roleDecision === null && meetingContext.hostUUID && userContext.participantUUID) {
      if (meetingContext.hostUUID === userContext.participantUUID) {
        roleDecision = true;
        roleSource = `hostUUID match`;
      }
    }

    const displayName = _resolveDisplayName(userContext);
    let meetingUUID = meetingContext.meetingUUID || meetingContext.meetingID || meetingContext.meetingId || '';

    // If still missing, check stored meeting ID before falling back to timestamp
    if (!meetingUUID) {
      const saved = getLastMeetingId();
      if (saved && !saved.startsWith('fallback-') && !saved.startsWith('mng-') && !saved.startsWith('meeting-')) {
        meetingUUID = saved;
        console.log(`📌 Recovered meetingUUID from local storage: ${meetingUUID}`);
      }
    }

    return {
      meeting_id: meetingUUID || `meeting-${Date.now()}`,
      meetingUUID: meetingUUID,
      participant_id: userContext.participantUUID || userContext.participantId || null,
      user_name: displayName,
      user_email: userContext.email || null,
      // explicitRole is true (host), false (participant), or null (unknown)
      explicitRole: roleDecision,
      isHost: roleDecision === true,
      is_host: roleDecision === true,
      is_guest: _isGuestMode,
      // Include timestamp to ensure unique session per meeting instance
      // (participantUUID alone is static — reused across meetings)
      session_id: 'zoom_' + (userContext.participantUUID || crypto.randomUUID()) + '_' + Date.now(),
      _debug: {
        userContextRole: userContext.role,
        roleSource: roleSource,
        explicitRole: roleDecision,
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
  const userName = params.get('username') || '';
  const meetingId = params.get('meeting_id') || 'mng-' + Date.now().toString(36);
  
  return {
    meeting_id: meetingId,
    meetingUUID: meetingId,
    participant_id: null,
    user_name: userName || (explicitRole === true ? 'Test Host' : 'Test User'),
    user_email: null,
    explicitRole: explicitRole,
    is_host: explicitRole === true,
    isHost: explicitRole === true,
    is_guest: true,
    is_browser: true,
    session_id: 'browser_' + crypto.randomUUID(),
    _debug: { roleSource: 'browser-fallback', userContextRole: role },
  };
}

export function onMeetingStarted(cb) {
  if (!_sdkReady) return () => {};
  try { 
    zoomSdk.addEventListener('onMeetingStarted', cb);
    return () => {
      try { zoomSdk.removeEventListener('onMeetingStarted', cb); } catch {}
    };
  } catch (_) {
    return () => {};
  }
}

export function onMeetingEnded(cb) {
  if (!_sdkReady) return () => {};
  try { 
    zoomSdk.addEventListener('onMeetingEnded', cb);
    return () => {
      try { zoomSdk.removeEventListener('onMeetingEnded', cb); } catch {}
    };
  } catch (_) {
    return () => {};
  }
}
