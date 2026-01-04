// client/vite-plugin-firebase.js
export default function firebasePlugin() {
  return {
    name: 'vite-plugin-firebase',
    
    transformIndexHtml(html) {
      // Inject script to block Firebase auto-config
      return html.replace(
        '</head>',
        `<script>
          // Block Firebase auto-configuration
          window.__FIREBASE_DEFAULTS__ = { config: null };
          Object.defineProperty(window, 'FIREBASE_APPCHECK_DEBUG_TOKEN', {
            value: true,
            writable: false
          });
        </script>
        </head>`
      );
    },
    
    configureServer(server) {
      // Block requests to Firebase init.json
      server.middlewares.use((req, res, next) => {
        if (req.url.includes('__/firebase/init.json')) {
          console.log('🚫 Blocked Firebase auto-config request:', req.url);
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Auto-config disabled' }));
          return;
        }
        next();
      });
    }
  };
}