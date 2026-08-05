import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

function meetingRelayPlugin() {
  const activeMeetings = new Map();

  function findMeeting(queryId) {
    if (!queryId) return null;
    if (activeMeetings.has(queryId)) return activeMeetings.get(queryId);

    for (const entry of activeMeetings.values()) {
      if (entry.zoom_meeting_id && entry.zoom_meeting_id === queryId) return entry;
    }

    for (const entry of activeMeetings.values()) {
      if (entry.meeting_id.includes(queryId) || queryId.includes(entry.meeting_id)) return entry;
      if (entry.zoom_meeting_id && (entry.zoom_meeting_id.includes(queryId) || queryId.includes(entry.zoom_meeting_id))) return entry;
    }
    return null;
  }

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
                zoom_meeting_id: data.zoom_meeting_id || null,
                company: data.company || "Meeting",
                host_name: data.host_name || "Host",
                started_at: new Date().toISOString(),
              };
              activeMeetings.set(data.meeting_id, entry);
              if (data.zoom_meeting_id && data.zoom_meeting_id !== data.meeting_id) {
                activeMeetings.set(data.zoom_meeting_id, entry);
              }
              console.log(`Relay: Meeting registered [${data.meeting_id}]${data.zoom_meeting_id ? ` (zoom: ${data.zoom_meeting_id})` : ''} -> ${entry.company}`);
              res.writeHead(200, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ ok: true, ...entry }));
            } catch (e) {
              res.writeHead(400, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ error: "Invalid JSON" }));
            }
          });
        } else if (req.method === "GET") {
          if (queryMeetingId) {
            const entry = findMeeting(queryMeetingId);
            const result = entry
              ? { active: true, ...entry }
              : { active: false, meeting_id: queryMeetingId, company: null };
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify(result));
          } else {
            const seen = new Set();
            const all = [];
            for (const entry of activeMeetings.values()) {
              if (!seen.has(entry.meeting_id)) {
                seen.add(entry.meeting_id);
                all.push(entry);
              }
            }
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ meetings: all, count: all.length }));
          }
        } else if (req.method === "DELETE") {
          if (queryMeetingId) {
            activeMeetings.delete(queryMeetingId);
            for (const [key, entry] of activeMeetings.entries()) {
              if (entry.meeting_id === queryMeetingId || entry.zoom_meeting_id === queryMeetingId) {
                activeMeetings.delete(key);
              }
            }
            console.log(`Relay: Meeting [${queryMeetingId}] removed`);
          } else {
            activeMeetings.clear();
            console.log("Relay: All meetings cleared");
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
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [react(), tailwindcss(), meetingRelayPlugin()],
    server: {
      port: 5173,
      proxy: {
        "/api": {
          target: env.VITE_BACKEND_URL || "http://87.106.223.150:30122",
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ""),
        },
      },
      allowedHosts: [
        "localhost",
        ".ngrok-free.app",
        ".ngrok.io",
      ],
      headers: {
        "ngrok-skip-browser-warning": "true",
        "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "Content-Security-Policy": [
          "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:",
          "frame-ancestors https://*.zoom.us https://*.zoom.com https://zoom.us",
        ].join("; "),
      },
    },
    base: "./",
  };
});
