import zoomSdk from "@zoom/appssdk";

let _sdkReady = false;
let _configResult = null;

/**
 * Initialize Zoom Apps SDK.
 * Must be called once, early in the app lifecycle.
 */
export async function initZoom() {
  try {
    _configResult = await zoomSdk.config({
      // The sidebar panel size Zoom will allocate
      popoutSize: { width: 480, height: 720 },
      // ✅ Correct capability names for Zoom Apps SDK v0.16+
      capabilities: [
        "getMeetingContext",
        "getUserContext",
        "onMeetingStarted",
        "onMeetingEnded",
        "expandApp",
        "openUrl",
      ],
    });
    _sdkReady = true;
    console.log("✅ Zoom SDK initialized:", _configResult);
    return _configResult;
  } catch (err) {
    console.warn("⚠️ Zoom SDK not available (running outside Zoom):", err.message);
    _sdkReady = false;
    return null;
  }
}

/** Returns true if the Zoom SDK initialized successfully */
export function isZoomReady() {
  return _sdkReady;
}

/**
 * Get meeting ID + user info from Zoom.
 * Falls back to safe test values when running in a plain browser.
 */
export async function getMeetingContext() {
  if (!_sdkReady) {
    return _getFallbackContext();
  }

  try {
    // Both calls run in parallel for speed
    const [ctx, user] = await Promise.all([
      zoomSdk.getMeetingContext(),
      zoomSdk.getUserContext(),
    ]);

    return {
      meeting_id: ctx.meetingID || ctx.meetingId || `fallback-${Date.now()}`,
      user_name:  user.screenName || user.displayName || "Unknown User",
      user_role:  user.role       || "attendee",
    };
  } catch (err) {
    console.warn("⚠️ getMeetingContext failed, using fallback:", err.message);
    return _getFallbackContext();
  }
}

function _getFallbackContext() {
  return {
    meeting_id: `test-meeting-${Date.now()}`,
    user_name:  "Test User",
    user_role:  "host",
  };
}

/**
 * Listen for the Zoom meeting-started event.
 * NOTE: This fires only when the meeting STARTS while your app is already open.
 * If the meeting is already running when the app opens, this will NOT fire.
 * Use getMeetingContext() directly for that case.
 */
export function onMeetingStarted(cb) {
  if (!_sdkReady) return;
  try {
    zoomSdk.addEventListener("onMeetingStarted", cb);
  } catch (e) {
    console.warn("onMeetingStarted not available:", e.message);
  }
}

/** Listen for the Zoom meeting-ended event */
export function onMeetingEnded(cb) {
  if (!_sdkReady) return;
  try {
    zoomSdk.addEventListener("onMeetingEnded", cb);
  } catch (e) {
    console.warn("onMeetingEnded not available:", e.message);
  }
}
