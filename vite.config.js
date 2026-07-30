import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Vite plugin: multi-meeting relay.
 * 
 * Stores MULTIPLE active meetings keyed by meeting_id so participants
 * in different Zoom meetings (Biocon vs Pfizer) get routed correctly.
 * 
 * POST   /relay/meeting              → host registers { meeting_id, company, host_name }
 * GET    /relay/meeting?meeting_id=X  → lookup specific meeting by ID
 * GET    /relay/meeting               → list ALL active meetings
 * DELETE /relay/meeting?meeting_id=X  → remove specific meeting
 * DELETE /relay/meeting               → remove all meetings
 */
function meetingRelayPlugin() {
  // Map<meeting_id, { meeting_id, company, host_name, started_at }>
  const activeMeetings = new Map();

  return {
    name: "meeting-relay",
    configureServer(server) {
      server.middlewares.use("/relay/meeting", (req, res, next) => {
        const url = new URL(req.url, "http://localhost");
        const queryMeetingId = url.searchParams.get("meeting_id");

        if (req.method === "POST") {
          let body = "";
          req.on("data", (chunk) => (body += chunk));
          req.on("end", () => {
            try {
              const data = JSON.parse(body);
              if (!data.meeting_id) {
                res.writeHead(400, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: "meeting_id is required" }));
                return;
              }
              const entry = {
                meeting_id: data.meeting_id,
                company: data.company || "Meeting",
                host_name: data.host_name || "Host",
                started_at: new Date().toISOString(),
              };
              activeMeetings.set(data.meeting_id, entry);
              console.log(`📡 Relay: Meeting registered [${data.meeting_id}] → ${entry.company} (total: ${activeMeetings.size})`);
              res.writeHead(200, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ ok: true, ...entry }));
            } catch (e) {
              res.writeHead(400, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ error: "Invalid JSON" }));
            }
          });
        } else if (req.method === "GET") {
          if (queryMeetingId) {
            // Lookup by specific meeting_id
            const entry = activeMeetings.get(queryMeetingId);
            const result = entry
              ? { active: true, ...entry }
              : { active: false, meeting_id: queryMeetingId, company: null };
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify(result));
          } else {
            // Return ALL active meetings
            const all = Array.from(activeMeetings.values());
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ meetings: all, count: all.length }));
          }
        } else if (req.method === "DELETE") {
          if (queryMeetingId) {
            activeMeetings.delete(queryMeetingId);
            console.log(`📡 Relay: Meeting [${queryMeetingId}] removed (remaining: ${activeMeetings.size})`);
          } else {
            activeMeetings.clear();
            console.log("📡 Relay: All meetings cleared");
          }
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true, remaining: activeMeetings.size }));
        } else {
          next();
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // Load environment variables in the current directory
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [react(), meetingRelayPlugin()],
    server: {
      port: 5173,
      // Proxy /api requests to the backend to avoid CORS/mixed-content blocks
      proxy: {
        "/api": {
          target: env.VITE_BACKEND_URL || "http://71.241.245.11:41129",
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ""),
        },
      },
      // Allow any ngrok tunnel host so you can test with a fresh tunnel URL
      // without editing this file every time
      allowedHosts: [
        "localhost",
        ".ngrok-free.app",
        ".ngrok.io",
      ],
      headers: {
        // ✅ Skip ngrok free-tier interstitial warning page
        "ngrok-skip-browser-warning": "true",
        // OWASP security headers
        "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        // ✅ Zoom requires your app to be embeddable in an iframe.
        //    The old "X-Frame-Options: ALLOWALL" header is non-standard and ignored
        //    by modern browsers. The correct approach is CSP frame-ancestors.
        "Content-Security-Policy": [
          "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:",
          // Allow Zoom to embed your app in the sidebar iframe
          "frame-ancestors https://*.zoom.us https://*.zoom.com https://zoom.us",
        ].join("; "),
      },
    },
    // Use relative paths so the build works when served from any subdirectory
    base: "./",
  };
});
