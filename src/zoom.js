/* ============================================
   MNG Bot — Zoom Apps SDK Integration
   
   KEY DESIGN:
   - Role detection from Zoom SDK with multiple fallback methods
   - Retry logic for getUserContext() (SDK may not be ready immediately)
   - Checks getMeetingContext, getUserContext, AND config result for role
   - Fetches real Display Name from multiple SDK fields
   - Event listeners return cleanup functions
   ============================================ */
import zoomSdk from '@zoom/appssdk';

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
        'onMeetingStarted',
        'onMeetingEnded',
        'expandApp',
        'openUrl',
      ],
    });
    _sdkReady = true;
    _initError = null;

    const authStatus = _configResult?.auth?.status;
    console.log('✅ Zoom SDK initialized. Full config result:', JSON.stringify(_configResult));

    if (authStatus === 'unauthenticated' || authStatus === 'unauthorized') {
      _isGuestMode = true;
      console.log('👤 Guest mode — app will work normally');
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
 * Determine if the user is a host from the Zoom SDK role value.
 * Handles all known formats from different SDK versions:
 *   - String: "host", "coHost", "co-host", "owner" 
 *   - Numeric: 1 (host), 0 (attendee)
 *   - Missing/undefined: returns false
 */
function _isHostRole(role) {
  if (role === undefined || role === null || role === '') return false;
  
  // Numeric check (some SDK versions return 1 for host)
  if (typeof role === 'number') return role === 1;
  
  // String check — normalize and compare
  const normalized = String(role).toLowerCase().trim();
  return (
    normalized === 'host' ||
    normalized === 'cohost' ||
    normalized === 'co-host' ||
    normalized === 'owner'
  );
}

/**
 * Try getUserContext with retry logic.
 * The Zoom SDK sometimes isn't ready immediately after config().
 */
async function _getUserContextWithRetry(maxAttempts = 3) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const user = await zoomSdk.getUserContext();
      console.log(`👤 getUserContext (attempt ${attempt}):`, JSON.stringify(user));
      
      // If we got a valid role, return immediately
      if (user && (user.role !== undefined && user.role !== null && user.role !== '')) {
        return user;
      }
      
      // Got a response but no role — try again after delay
      if (attempt < maxAttempts) {
        console.log(`⚠️ getUserContext returned no role (attempt ${attempt}), retrying in 1s...`);
        await sleep(1000);
      }
      
      // Return whatever we got on last attempt
      if (attempt === maxAttempts) return user || {};
    } catch (e) {
      console.warn(`⚠️ getUserContext failed (attempt ${attempt}/${maxAttempts}):`, e.message);
      if (attempt < maxAttempts) await sleep(1000);
    }
  }
  return {};
}

/**
 * Extract the best display name from user context.
 * Tries multiple fields in priority order.
 * NEVER returns generic labels like "Host" or "Participant".
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
 * 
 * Uses MULTIPLE methods to detect host role:
 *   1. getUserContext().role (primary)
 *   2. getMeetingContext() fields (some SDK versions include role here)
 *   3. Config result (may contain role info)
 */
export async function getMeetingContext() {
  if (!_sdkReady) return _getFallbackContext();

  try {
    // ── Get meeting context ──
    let meetingContext = {};
    try {
      meetingContext = await zoomSdk.getMeetingContext();
      console.log('📋 getMeetingContext:', JSON.stringify(meetingContext));
    } catch (e) {
      console.warn('⚠️ getMeetingContext failed:', e.message);
    }

    // ── Get user context (with retry) ──
    const userContext = await _getUserContextWithRetry(3);

    // ══════════════════════════════════════════════════════════
    // ROLE DETECTION — try multiple sources
    // ══════════════════════════════════════════════════════════

    // Method 1: getUserContext().role (primary)
    let isHost = _isHostRole(userContext.role);
    let roleSource = `getUserContext.role="${userContext.role}"`;

    // Method 2: Check meetingContext for role fields
    if (!isHost && meetingContext) {
      const meetingRole = meetingContext.role || meetingContext.userRole;
      if (meetingRole !== undefined) {
        isHost = _isHostRole(meetingRole);
        if (isHost) roleSource = `meetingContext.role="${meetingRole}"`;
      }
    }

    // Method 3: Check userContext.status (some SDK versions use "host" as status)
    if (!isHost && userContext.status) {
      const statusRole = _isHostRole(userContext.status);
      if (statusRole) {
        isHost = true;
        roleSource = `userContext.status="${userContext.status}"`;
      }
    }

    // Method 4: Check config result for role
    if (!isHost && _configResult) {
      const configRole = _configResult.role || _configResult.userRole;
      if (configRole !== undefined) {
        isHost = _isHostRole(configRole);
        if (isHost) roleSource = `configResult.role="${configRole}"`;
      }
    }

    // ── Display Name ──
    const displayName = _resolveDisplayName(userContext);

    // ── Meeting UUID ──
    const meetingUUID = meetingContext.meetingUUID 
      || meetingContext.meetingID 
      || meetingContext.meetingId 
      || '';

    console.log('═══════════════════════════════════════════');
    console.log(`🎯 FINAL ROLE DECISION: isHost=${isHost}`);
    console.log(`   Source: ${roleSource}`);
    console.log(`   Display Name: "${displayName}"`);
    console.log(`   Meeting UUID: "${meetingUUID}"`);
    console.log(`   getUserContext keys: ${Object.keys(userContext).join(', ')}`);
    console.log(`   getMeetingContext keys: ${Object.keys(meetingContext).join(', ')}`);
    if (_configResult) console.log(`   configResult keys: ${Object.keys(_configResult).join(', ')}`);
    console.log('═══════════════════════════════════════════');

    return {
      meeting_id: meetingUUID || `fallback-${Date.now()}`,
      meetingUUID: meetingUUID,
      participant_id: userContext.participantUUID || userContext.participantId || null,
      user_name: displayName,
      user_email: userContext.email || null,
      user_role: isHost ? 'host' : 'participant',
      isHost,
      is_host: isHost,
      is_guest: _isGuestMode,
      session_id: 'zoom_' + (userContext.participantUUID || userContext.participantId || crypto.randomUUID()),
      // Include raw debug data so SplashView can display it
      _debug: {
        userContextRole: userContext.role,
        roleSource: roleSource,
        userContextKeys: Object.keys(userContext),
        meetingContextKeys: Object.keys(meetingContext),
      },
    };
  } catch (err) {
    console.warn('⚠️ getMeetingContext failed:', err.message);
    return _getFallbackContext();
  }
}

/**
 * Fallback context for browser/preview mode.
 * Uses URL params for testing ONLY.
 */
function _getFallbackContext() {
  const params = new URLSearchParams(window.location.search);
  const role = params.get('role') || 'attendee';
  const isHost = role === 'host' || role === 'coHost';
  const userName = params.get('username') || '';
  const meetingId = params.get('meeting_id') || 'mng-' + Date.now().toString(36);
  
  console.log(`🔄 Using fallback context (browser mode): meetingId=${meetingId}, role=${role}, name=${userName}`);

  return {
    meeting_id: meetingId,
    meetingUUID: meetingId,
    participant_id: null,
    user_name: userName || (isHost ? 'Test Host' : 'Test User'),
    user_email: null,
    user_role: isHost ? 'host' : 'participant',
    is_host: isHost,
    isHost,
    is_guest: true,
    is_browser: true,
    session_id: 'browser_' + crypto.randomUUID(),
    _debug: { roleSource: 'browser-fallback', userContextRole: role },
  };
}

/**
 * Listen for Zoom meeting started event.
 * Returns a cleanup function to remove the listener.
 */
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

/**
 * Listen for Zoom meeting ended event.
 * Returns a cleanup function to remove the listener.
 */
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
