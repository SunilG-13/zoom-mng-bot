const MEETING_ID_KEY = "mng_last_meeting_id";
const MEETING_UUID_KEY = "mng_last_meeting_uuid";

export function getLastMeetingId() {
  try {
    return sessionStorage.getItem(MEETING_ID_KEY) || localStorage.getItem(MEETING_ID_KEY);
  } catch { return null; }
}

export function saveMeetingId(meetingId) {
  if (!meetingId) return;
  try {
    sessionStorage.setItem(MEETING_ID_KEY, meetingId);
    localStorage.setItem(MEETING_ID_KEY, meetingId);
  } catch {}
}

export function clearMeetingId() {
  try {
    sessionStorage.removeItem(MEETING_ID_KEY);
    localStorage.removeItem(MEETING_ID_KEY);
  } catch {}
}

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

export function detectNewMeeting(currentUUID) {
  if (!currentUUID) {
    return { isNew: true, previousUUID: null };
  }
  const lastUUID = getLastMeetingUUID();
  if (!lastUUID) {
    return { isNew: true, previousUUID: null };
  }
  if (lastUUID !== currentUUID) {
    return { isNew: true, previousUUID: lastUUID };
  }
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

export function completeSessionReset() {
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

  try {
    sessionStorage.removeItem('mng_host_started');
    sessionStorage.removeItem('mng_participant_joined');
    sessionStorage.clear();
  } catch {}
}

export function nuclearReset() {
  completeSessionReset();
  try { localStorage.removeItem(MEETING_UUID_KEY); } catch {}
}
