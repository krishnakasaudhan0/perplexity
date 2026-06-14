import { serve } from "bun";
import index from "./index.html";

const PORT = 5173;

const server = serve({
  port: 5173,
  routes: {
    // Serve index.html for all unmatched routes.
    "/*": index,

    "/api/hello": {
      async GET(req) {
        return Response.json({
          message: "Hello, world!",
          method: "GET",
        });
      },
      async PUT(req) {
        return Response.json({
          message: "Hello, world!",
          method: "PUT",
        });
      },
    },

    "/api/hello/:name": async req => {
      const name = req.params.name;
      return Response.json({
        message: `Hello, ${name}!`,
      });
    },
  },

  development: process.env.NODE_ENV !== "production" && {
    // Enable browser hot reloading in development
    hmr: true,

    // Echo console logs from the browser to the server
    console: true,
  },
});

console.log(`🚀 Server running at ${server.url}`);

// #region agent log
fetch('http://127.0.0.1:7833/ingest/7f676e1c-b05f-4680-8c7d-f7380404a8f7',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'22c8c9'},body:JSON.stringify({sessionId:'22c8c9',location:'frontend/src/index.ts:listen',message:'Frontend server started',data:{port:PORT,url:String(server.url)},timestamp:Date.now(),hypothesisId:'H1',runId:'post-fix'})}).catch(()=>{});
// #endregion
