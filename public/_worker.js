/**
 * Cloudflare Pages Advanced Mode _worker.js
 * Placed in public/ so Vite automatically copies it to dist/_worker.js.
 * This ensures /api/ping works on ALL Cloudflare Pages deployments (Git, Wrangler CLI, and Direct Upload).
 */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept",
};

async function handlePingRequest(targetUrl, timeoutMs = 5500) {
  if (!targetUrl || typeof targetUrl !== "string") {
    return new Response(JSON.stringify({ error: "Missing or invalid 'url' parameter" }), {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(targetUrl);
  } catch {
    return new Response(JSON.stringify({ error: "Invalid URL provided" }), {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const hostname = parsedUrl.hostname;
  const isPrivateIp = /^(127\.|192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|localhost|::1)/i.test(hostname);

  if (isPrivateIp) {
    return new Response(
      JSON.stringify({
        online: false,
        isPrivateIp: true,
        error: "Private LAN IP cannot be reached from Cloudflare edge.",
        url: targetUrl,
        timestamp: Date.now(),
      }),
      {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      }
    );
  }

  const startTime = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const probeRes = await fetch(targetUrl, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 HomelabHealthBot/1.0",
        "Accept": "*/*",
      },
      signal: controller.signal,
      redirect: "follow",
    });

    clearTimeout(timeoutId);
    const latency = Date.now() - startTime;
    const statusCode = probeRes.status;
    const isOnline = statusCode >= 200 && statusCode < 400;

    return new Response(
      JSON.stringify({
        online: isOnline,
        statusCode,
        latency,
        url: targetUrl,
        platform: "cloudflare-worker",
        error: isOnline ? undefined : `HTTP Error ${statusCode}`,
        timestamp: Date.now(),
      }),
      {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    clearTimeout(timeoutId);
    const latency = Date.now() - startTime;
    const isTimeout = err?.name === "AbortError" || latency >= timeoutMs;

    return new Response(
      JSON.stringify({
        online: false,
        platform: "cloudflare-worker",
        error: isTimeout ? "Connection timed out" : (err?.message || "Unreachable"),
        latency: isTimeout ? timeoutMs : latency,
        url: targetUrl,
        timestamp: Date.now(),
      }),
      {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      }
    );
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS,
      });
    }

    // Intercept /api/ping
    if (url.pathname === "/api/ping" || url.pathname.startsWith("/api/ping/")) {
      if (request.method === "GET") {
        const targetUrl = url.searchParams.get("url");
        const timeoutParam = url.searchParams.get("timeout");
        const timeout = timeoutParam ? parseInt(timeoutParam, 10) : 5500;
        return handlePingRequest(targetUrl, isNaN(timeout) ? 5500 : timeout);
      }

      if (request.method === "POST") {
        try {
          const body = await request.json();
          const { url: targetUrl, timeout = 5500 } = body || {};
          return handlePingRequest(targetUrl, timeout);
        } catch {
          return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
            status: 400,
            headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
          });
        }
      }
    }

    // Delegate all other routes to static asset serving (React SPA)
    if (env && env.ASSETS && typeof env.ASSETS.fetch === "function") {
      return env.ASSETS.fetch(request);
    }

    return new Response("Not found", { status: 404 });
  },
};
