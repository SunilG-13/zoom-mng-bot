import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Vite plugin: lightweight meeting relay.
 * 
 * The backend's /active_meeting endpoint is broken (always returns active:false),
 * but /status/{meeting_id} works if you know the ID.
 * 
 * This relay stores the host's meeting info in-memory so participants
 * (who go through the same Vite/ngrok server) can discover it.
 * 
 * POST /relay/meeting  → host registers { meeting_id, company, host_name }
 * GET  /relay/meeting  → participant discovers the active meeting
 * DELETE /relay/meeting → host ends meeting (clears relay)
 */
function meetingRelayPlugin() {
  let activeMeeting = null; // { meeting_id, company, host_name, started_at }

  return {
    name: "meeting-relay",
    configureServer(server) {
      // POST — host registers active meeting
      server.middlewares.use("/relay/meeting", (req, res, next) => {
        if (req.method === "POST") {
          let body = "";
          req.on("data", (chunk) => (body += chunk));
          req.on("end", () => {
            try {
              const data = JSON.parse(body);
              activeMeeting = {
                meeting_id: data.meeting_id,
                company: data.company || "Meeting",
                host_name: data.host_name || "Host",
                started_at: new Date().toISOString(),
              };
              console.log("📡 Relay: Meeting registered →", JSON.stringify(activeMeeting));
              res.writeHead(200, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ ok: true, ...activeMeeting }));
            } catch (e) {
              res.writeHead(400, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ error: "Invalid JSON" }));
            }
          });
        } else if (req.method === "GET") {
          // GET — participant discovers active meeting
          const result = activeMeeting
            ? { active: true, ...activeMeeting }
            : { active: false, meeting_id: null, company: null };
          console.log("📡 Relay: Discovery query →", JSON.stringify(result));
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(result));
        } else if (req.method === "DELETE") {
          // DELETE — host ends meeting
          console.log("📡 Relay: Meeting cleared");
          activeMeeting = null;
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
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
