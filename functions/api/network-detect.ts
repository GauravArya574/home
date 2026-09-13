const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function onRequestOptions(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

export async function onRequestGet(context: { request: Request }): Promise<Response> {
  const { request } = context;
  const clientIp = request.headers.get("cf-connecting-ip") || "127.0.0.1";
  const isPrivateIp = /^(::f{4}:)?(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|127\.|fe80::|::1)/.test(clientIp);

  return new Response(
    JSON.stringify({
      clientIp,
      isPrivateIp,
      headers: {
        host: request.headers.get("host"),
        userAgent: request.headers.get("user-agent"),
      },
      serverTime: Date.now(),
      platform: "cloudflare-pages",
    }),
    {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "application/json",
      },
    }
  );
}
