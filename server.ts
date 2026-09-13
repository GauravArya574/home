import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import http from "http";
import https from "https";
import os from "os";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json());

// API health endpoint
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Network detection endpoint: analyzes client IP and connection details
app.get("/api/network-detect", (req, res) => {
  const forwardedFor = req.headers["x-forwarded-for"];
  const clientIp = typeof forwardedFor === "string" 
    ? forwardedFor.split(",")[0].trim() 
    : req.socket.remoteAddress || "127.0.0.1";

  // Check if client IP is private/local subnet
  const isPrivateIp = /^(::f{4}:)?(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|127\.|fe80::|::1)/.test(clientIp);

  res.json({
    clientIp,
    isPrivateIp,
    headers: {
      host: req.headers.host,
      userAgent: req.headers["user-agent"],
    },
    serverTime: Date.now(),
    serverInterfaces: os.networkInterfaces()
  });
});

// Fast HTTP/HTTPS agents with keep-alive to avoid socket reconnect overhead
const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 50, timeout: 6000 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 50, timeout: 6000, rejectUnauthorized: false });

// Service Ping Proxy endpoint: tests remote HTTP/HTTPS service with timeout > 5000ms
const handleServerPing = async (req: express.Request, res: express.Response) => {
  const url = (req.method === "GET" ? req.query.url : req.body?.url) as string;
  const rawTimeout = req.method === "GET" ? req.query.timeout : req.body?.timeout;
  const timeout = rawTimeout ? parseInt(String(rawTimeout), 10) : 5500;

  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "Missing or invalid 'url' parameter" });
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return res.status(400).json({ error: "Invalid URL provided" });
  }

  const startTime = Date.now();
  const isHttps = parsedUrl.protocol === "https:";
  const protocol = isHttps ? https : http;
  const agent = isHttps ? httpsAgent : httpAgent;

  let responded = false;
  const sendResponse = (payload: any) => {
    if (responded || res.headersSent) return;
    responded = true;
    res.json(payload);
  };

  const executeProbe = (method: "GET" | "HEAD", redirectCount = 0) => {
    const requestOptions = {
      method,
      host: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + (parsedUrl.search || ""),
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Connection": "keep-alive",
      },
      timeout,
      agent,
      rejectUnauthorized: false, // Homelab services frequently use self-signed certificates
    };

    const probeReq = protocol.request(requestOptions, (probeRes) => {
      const latency = Date.now() - startTime;
      const statusCode = probeRes.statusCode || 0;

      // Handle HTTP redirects (301, 302, 303, 307, 308) up to 3 times
      if (
        [301, 302, 303, 307, 308].includes(statusCode) &&
        probeRes.headers.location &&
        redirectCount < 3
      ) {
        probeRes.destroy();
        try {
          const redirectUrl = new URL(probeRes.headers.location, url);
          parsedUrl = redirectUrl;
          return executeProbe(method, redirectCount + 1);
        } catch {
          // If redirect URL parsing fails, 3xx is still a successful redirect response
        }
      }
      
      // If HEAD was rejected with 405 Method Not Allowed, retry with GET once to be sure
      if (method === "HEAD" && statusCode === 405) {
        probeRes.destroy();
        executeProbe("GET", redirectCount);
        return;
      }

      // Drain stream immediately to prevent socket hang
      probeRes.resume();

      // STRICT CHECK: 2xx and 3xx are Online. Any HTTP Error (4xx client error or 5xx server error) is Offline.
      const isOnline = statusCode >= 200 && statusCode < 400;

      sendResponse({
        online: isOnline,
        statusCode,
        latency,
        url,
        error: isOnline ? undefined : `HTTP Error ${statusCode}`,
        timestamp: Date.now(),
      });
    });

    probeReq.on("timeout", () => {
      probeReq.destroy();
      sendResponse({
        online: false,
        error: "Connection timed out",
        latency: timeout,
        url,
        timestamp: Date.now(),
      });
    });

    probeReq.on("error", (err) => {
      // If HEAD errored (some servers immediately close connection on HEAD), try GET
      if (method === "HEAD") {
        executeProbe("GET", redirectCount);
        return;
      }
      sendResponse({
        online: false,
        error: err?.message || "Unreachable",
        latency: Date.now() - startTime,
        url,
        timestamp: Date.now(),
      });
    });

    probeReq.end();
  };

  try {
    executeProbe("HEAD");
  } catch (err: any) {
    sendResponse({
      online: false,
      error: err?.message || "Probe failed",
      latency: Date.now() - startTime,
      url,
      timestamp: Date.now(),
    });
  }
};

app.post("/api/ping", handleServerPing);
app.get("/api/ping", handleServerPing);

// Mock / Live Docker Host Metrics
app.get("/api/docker-metrics", (_req, res) => {
  const cpus = os.cpus();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const loadAvg = os.loadavg();
  const uptime = os.uptime();

  res.json({
    host: {
      hostname: os.hostname(),
      platform: os.platform(),
      arch: os.arch(),
      uptimeSeconds: uptime,
      cpuCount: cpus.length,
      cpuModel: cpus[0]?.model || "Docker Host CPU",
      loadAvg1m: loadAvg[0] ? Number(loadAvg[0].toFixed(2)) : 0.45,
      totalMemoryBytes: totalMem,
      usedMemoryBytes: usedMem,
      freeMemoryBytes: freeMem,
      memoryUsagePercent: Math.round((usedMem / totalMem) * 100),
    },
    docker: {
      version: "27.3.1",
      containersRunning: 14,
      containersTotal: 16,
      imagesTotal: 28,
      volumesTotal: 19,
      storageDriver: "overlay2",
    },
    timestamp: Date.now(),
  });
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Homelab Dashboard] Server running on http://0.0.0.0:${PORT}`);
  });
}

process.on("uncaughtException", (err) => {
  console.error("[Server] Uncaught Exception:", err);
});

process.on("unhandledRejection", (reason) => {
  console.error("[Server] Unhandled Rejection:", reason);
});

startServer().catch((err) => {
  console.error("[Server] Failed to start server:", err);
  process.exit(1);
});
