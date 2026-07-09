const BASE = "/api";

// Start a meeting session on the backend
export async function startMeeting(meetingId, company) {
  const res = await fetch(`${BASE}/start_meeting`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ meeting_id: meetingId, company }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "Failed to start meeting");
  }
  return res.json();
}

// End a meeting session on the backend
export async function endMeeting(meetingId) {
  await fetch(`${BASE}/end_meeting`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ meeting_id: meetingId }),
  });
}

// Ask a question via HTTP (reliable, no WebSocket needed)
export async function askQuestion(meetingId, sessionId, question, userName, userRole) {
  const res = await fetch(`${BASE}/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      meeting_id: meetingId,
      session_id: sessionId,
      question:   question,
      user_name:  userName,
      user_role:  userRole,
    }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "Failed to get answer");
  }
  return res.json(); // { text, status }
}

// Get all logs for a meeting
export async function getMeetingLogs(meetingId) {
  const res = await fetch(`${BASE}/meeting/${meetingId}`);
  return res.json();
}
