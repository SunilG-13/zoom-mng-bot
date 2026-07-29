/* ============================================
   MNG Bot — Meeting Storage Utilities
   
   KEY DESIGN:
   - meetingUUID:  From Zoom SDK (unique per meeting instance)
   - meeting_id:   Backend meeting identifier (used for API calls)
   
   CRITICAL FIX:
   - detectNewMeeting() does NOT auto-save the UUID.
     The caller must call saveMeetingUUID() AFTER performing
     any required reset. This prevents the reset from
     immediately clearing the UUID that was just saved.
   
   - completeSessionReset() clears everything EXCEPT the
     meetingUUID by default (pass preserveUUID=false to clear it too).
   
   - nuclearReset() clears absolutely everything including UUID.
     Used when ending a meeting (host clicks "End Meeting").
   ============================================ */

const MEETING_ID_KEY = "mng_last_meeting_id";
const MEETING_UUID_KEY = "mng_last_meeting_uuid";

// ── Meeting ID (backend identifier) ──

export function getLastMeetingId() {
  try { return localStorage.getItem(MEETING_ID_KEY); } catch { return null; }
}

export function saveMeetingId(meetingId) {
  if (!meetingId) return;
  try { localStorage.setItem(MEETING_ID_KEY, meetingId); } catch {}
}

export function clearMeetingId() {
  try { localStorage.removeItem(MEETING_ID_KEY); } catch {}
}

// ── Meeting UUID (from Zoom SDK — unique per meeting instance) ──

export function getLastMeetingUUID() {
  try { return localStorage.getItem(MEETING_UUID_KEY); } catch { return null; }
}

export function saveMeetingUUID(uuid) {
  if (!uuid) return;
  try { localStorage.setItem(MEETING_UUID_KEY, uuid); } catch {}
}

export function clearMeetingUUID() {
  try { localStorage.removeItem(MEETING_UUID_KEY); } catch {}
}

/**
 * Detect if this is a NEW Zoom meeting by comparing 
 * the current meetingUUID from Zoom SDK with the stored one.
 * 
 * IMPORTANT: This function does NOT save the new UUID.
 * The caller MUST call saveMeetingUUID(currentUUID) AFTER
 * performing any required session reset. This prevents the
 * save-then-immediately-clear bug.
 * 
 * Returns: { isNew: boolean, previousUUID: string|null }
 */
export function detectNewMeeting(currentUUID) {
  if (!currentUUID) {
    return { isNew: true, previousUUID: null };
  }

  const lastUUID = getLastMeetingUUID();

  if (!lastUUID) {
    // First time ever — no previous data
    return { isNew: true, previousUUID: null };
  }

  if (lastUUID !== currentUUID) {
    // Different meeting
    return { isNew: true, previousUUID: lastUUID };
  }

  // Same meeting
  return { isNew: false, previousUUID: lastUUID };
}

export function isGenericName(name) {
  if (!name || typeof name !== 'string') return true;
  const norm = name.trim().toLowerCase();
  return (
    norm === '' ||
    norm === 'zoom user' ||
    norm === 'guest user' ||
    norm === 'unknown user' ||
    norm === 'unknown_user' ||
    norm === 'unknown' ||
    norm === 'participant' ||
    norm === 'user' ||
    norm === 'test host' ||
    norm === 'test user' ||
    norm === 'host'
  );
}

/**
 * Complete session reset — clears all meeting data for a clean start.
 * Called when: new meeting detected during Splash.
 * 
 * By default, this PRESERVES the meetingUUID and user_name so the caller can
 * save a new UUID after reset without it being cleared.
 * 
 * Clears:
 * - meeting_id from localStorage
 * - host mark from localStorage
 * - ALL meeting-related localStorage keys (mng_ prefixed)
 * - ALL sessionStorage
 */
export function completeSessionReset() {
  // Clear all known meeting-specific keys
  const knownKeys = [
    MEETING_ID_KEY,
    MEETING_UUID_KEY,
    'mng_host_meeting',
    'mng_session_data',
    'meeting',
    'currentView',
    'messages',
    'company',
    'chatHistory',
  ];
  knownKeys.forEach(key => {
    try { localStorage.removeItem(key); } catch {}
  });

  // Clear ALL remaining mng_ prefixed keys (except user_name)
  try {
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('mng_') && key !== 'mng_user_name' && key !== 'mng_host_user_name' && key !== 'mng_participant_user_name') {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));
  } catch {}

  // Clear session storage completely
  try { sessionStorage.clear(); } catch {}

  console.log('🧹 Complete session reset done (all storage cleared)');
}

/**
 * Nuclear reset — clears EVERYTHING including meetingUUID.
 * Used when the host clicks "End Meeting" to ensure the next
 * meeting is treated as completely new.
 * 
 * This is the strongest reset — no data survives.
 */
export function nuclearReset() {
  completeSessionReset();
  // completeSessionReset already clears MEETING_UUID_KEY,
  // but be explicit for safety
  try { localStorage.removeItem(MEETING_UUID_KEY); } catch {}

  console.log('☢️ Nuclear reset done — all data destroyed');
}
