import express from "express";
import path from "path";
import app from "./api/index.js"; // Import Express app containing all API endpoints

const PORT = 3000;

// Robust environment detection
const isServerless = !!(
  process.env.VERCEL ||
  process.env.LAMBDA_TASK_ROOT ||
  process.env.AWS_EXECUTION_ENV ||
  process.env._HANDLER
);

// Setup dev server and production static hosting only when not on Vercel or other serverless hosting
async function setupServer() {
  if (!isServerless) {
    if (process.env.NODE_ENV !== "production") {
      try {
        console.log("[Server] Running in DEVELOPMENT mode.");
        const viteModuleName = "vite";
        const { createServer: createViteServer } = await import(viteModuleName);
        const vite = await createViteServer({
          server: { middlewareMode: true },
          appType: "spa",
        });
        app.use(vite.middlewares);
        console.log("[Server] Vite middleware mounted successfully.");
      } catch (err) {
        console.error("[Server] Error mounting Vite middleware dynamically:", err);
      }
    } else {
      console.log("[Server] Running in PRODUCTION mode.");
      const distPath = path.join(process.cwd(), "dist");
      app.use(express.static(distPath));
      app.get("*", (req, res) => {
        res.sendFile(path.join(distPath, "index.html"));
      });
    }

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  } else {
    console.log("[Server] Running in serverless/Vercel environment. Listening bypassed.");
  }
}

setupServer();

export default app;
