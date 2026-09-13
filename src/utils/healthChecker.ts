import { DockerService, ServiceStatus } from '../types';

/**
 * Direct browser probe for standalone static hosting environments (e.g. Cloudflare Pages, Netlify, Vercel Static, S3).
 * Uses fetch with no-cors mode, falling back to favicon / image DOM probing.
 * In no-cors mode, a response (even opaque type 0) confirms network connectivity and active server socket.
 */
async function probeDirectBrowser(targetUrl: string, timeoutMs: number = 4000): Promise<{
  online: boolean;
  latency: number;
  statusCode?: number;
  message?: string;
}> {
  const startTime = performance.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // Attempt standard fetch with no-cors to handle cross-origin services gracefully
    await fetch(targetUrl, {
      method: 'GET',
      mode: 'no-cors',
      cache: 'no-cache',
      credentials: 'omit',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    const latency = Math.round(performance.now() - startTime);
    return {
      online: true,
      latency,
      message: 'Reachable',
    };
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    const errorObj = err as { name?: string };
    if (errorObj?.name === 'AbortError') {
      return {
        online: false,
        latency: Math.round(performance.now() - startTime),
        message: 'Timeout (> 4s)',
      };
    }

    // Secondary fallback: DOM element probe (favicons/images often bypass strict fetch restrictions)
    return new Promise((resolve) => {
      const imgStartTime = performance.now();
      const img = new Image();
      let resolved = false;

      const finish = (online: boolean, msg: string) => {
        if (!resolved) {
          resolved = true;
          img.onload = null;
          img.onerror = null;
          resolve({
            online,
            latency: Math.round(performance.now() - imgStartTime),
            message: msg,
          });
        }
      };

      const fallbackTimer = setTimeout(() => {
        finish(false, 'Unreachable');
      }, 2500);

      img.onload = () => {
        clearTimeout(fallbackTimer);
        finish(true, 'Online');
      };

      img.onerror = () => {
        clearTimeout(fallbackTimer);
        // An onerror on an image loaded from an HTTP server still indicates the host is reachable and responding with a socket/HTTP status (e.g. 404/403/HTML)
        const elapsed = performance.now() - imgStartTime;
        if (elapsed < 2000) {
          finish(true, 'Reachable');
        } else {
          finish(false, 'Unreachable');
        }
      };

      // Try appending /favicon.ico or ping with timestamp
      try {
        const parsed = new URL(targetUrl);
        parsed.pathname = '/favicon.ico';
        parsed.search = `_p=${Date.now()}`;
        img.src = parsed.toString();
      } catch {
        img.src = `${targetUrl}/favicon.ico?_p=${Date.now()}`;
      }
    });
  }
}

/**
 * Pings the remote URL of the service.
 * Supports both full-stack setups (via backend proxy `/api/ping`) and static deployment environments (e.g. Cloudflare Pages).
 */
export async function pingService(
  service: DockerService,
  _activeUrl?: string
): Promise<ServiceStatus> {
  // Only use the external (remote) URL as configured
  const targetUrl = service.remoteUrl?.trim() || service.localUrl?.trim();

  if (!targetUrl) {
    return {
      serviceId: service.id,
      state: 'offline',
      latencyMs: 0,
      lastChecked: Date.now(),
      message: 'No URL configured',
    };
  }

  const startTime = performance.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);

  try {
    // 1. First attempt the backend proxy if available (Full-stack mode)
    const res = await fetch('/api/ping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: targetUrl, timeout: 5500 }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      const latency = data.latency || Math.round(performance.now() - startTime);
      const isOnline = Boolean(data.online && (!data.statusCode || (data.statusCode >= 200 && data.statusCode < 400)));

      return {
        serviceId: service.id,
        state: isOnline ? (latency > 5000 ? 'degraded' : 'online') : 'offline',
        statusCode: data.statusCode,
        latencyMs: latency,
        lastChecked: Date.now(),
        message: isOnline ? (data.statusCode ? `HTTP ${data.statusCode} OK` : 'Online') : (data.error || `HTTP Error ${data.statusCode || 'Failed'}`),
      };
    }

    // If server returned 404 (static hosting without Express backend, e.g. Cloudflare Pages / Vercel static),
    // fallback to direct client-side browser probe
    if (res.status === 404 || res.status === 502) {
      const directResult = await probeDirectBrowser(targetUrl);
      return {
        serviceId: service.id,
        state: directResult.online ? (directResult.latency > 5000 ? 'degraded' : 'online') : 'offline',
        latencyMs: directResult.latency,
        lastChecked: Date.now(),
        message: directResult.message || (directResult.online ? 'Online' : 'Offline'),
      };
    }

    return {
      serviceId: service.id,
      state: 'offline',
      latencyMs: Math.round(performance.now() - startTime),
      lastChecked: Date.now(),
      message: 'Proxy Error ' + res.status,
    };
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    
    // If the fetch to /api/ping completely fails (e.g. static CDN host or network error), fallback directly to client-side probe
    try {
      const directResult = await probeDirectBrowser(targetUrl);
      return {
        serviceId: service.id,
        state: directResult.online ? (directResult.latency > 5000 ? 'degraded' : 'online') : 'offline',
        latencyMs: directResult.latency,
        lastChecked: Date.now(),
        message: directResult.message || (directResult.online ? 'Online' : 'Offline'),
      };
    } catch {
      return {
        serviceId: service.id,
        state: 'offline',
        latencyMs: Math.round(performance.now() - startTime),
        lastChecked: Date.now(),
        message: 'Unreachable',
      };
    }
  }
}
