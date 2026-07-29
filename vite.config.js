import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  // Load environment variables in the current directory
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [react()],
    server: {
      port: 5173,
      // Proxy /api requests to the backend to avoid CORS/mixed-content blocks
      proxy: {
        "/api": {
          target: env.VITE_BACKEND_URL || "http://216.234.102.170:15637",
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
