interface PingRequestBody {
  url?: string;
  timeout?: number;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function onRequestOptions(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

export async function onRequestPost(context: { request: Request }): Promise<Response> {
  const { request } = context;

  let body: PingRequestBody;
  try {
    body = (await request.json()) as PingRequestBody;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const { url, timeout = 5500 } = body || {};

  if (!url || typeof url !== "string") {
    return new Response(JSON.stringify({ error: "Missing or invalid 'url' parameter" }), {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return new Response(JSON.stringify({ error: "Invalid URL provided" }), {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  // Check if target is a private network / local subnet address
  const hostname = parsedUrl.hostname;
  const isPrivateIp = /^(127\.|192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|localhost|::1)/i.test(hostname);

  if (isPrivateIp) {
    return new Response(
      JSON.stringify({
        online: false,
        isPrivateIp: true,
        error: "Private LAN IP cannot be reached from Cloudflare edge. Fallback to direct client ping.",
        url,
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
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const probeRes = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept":
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      },
      redirect: "follow",
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const latency = Date.now() - startTime;
    const statusCode = probeRes.status;

    // Discard body to free edge resources
    try {
      await probeRes.body?.cancel();
    } catch {
      // Ignore
    }

    const isOnline = statusCode >= 200 && statusCode < 400;

    return new Response(
      JSON.stringify({
        online: isOnline,
        statusCode,
        latency,
        url,
        error: isOnline ? undefined : `HTTP Error ${statusCode}`,
        timestamp: Date.now(),
      }),
      {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      }
    );
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    const latency = Date.now() - startTime;
    const errorObj = err as { name?: string; message?: string };
    const isTimeout = errorObj?.name === "AbortError" || latency >= timeout;

    return new Response(
      JSON.stringify({
        online: false,
        error: isTimeout ? "Connection timed out" : (errorObj?.message || "Unreachable"),
        latency: isTimeout ? timeout : latency,
        url,
        timestamp: Date.now(),
      }),
      {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      }
    );
  }
}

// Support GET requests as well (e.g. /api/ping?url=https://...)
export async function onRequestGet(context: { request: Request }): Promise<Response> {
  const { request } = context;
  const reqUrl = new URL(request.url);
  const targetUrl = reqUrl.searchParams.get("url");

  if (!targetUrl) {
    return new Response(JSON.stringify({ status: "ok", message: "Ping service endpoint ready" }), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const mockReq = new Request(request.url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: targetUrl }),
  });
  return onRequestPost({ request: mockReq });
}
