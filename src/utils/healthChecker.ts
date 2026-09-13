import { DockerService, ServiceStatus } from '../types';

/**
 * Direct browser probe for client-side fallback.
 * Uses fetch with standard / no-cors mode, followed strictly by an Image element check.
 * Crucial fix: An error or rejection on fetch or image loading must NEVER be marked as "online" / "reachable".
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
    // Attempt standard fetch with cors first to read real HTTP status if headers allow
    const res = await fetch(targetUrl, {
      method: 'HEAD',
      cache: 'no-cache',
      credentials: 'omit',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    const latency = Math.round(performance.now() - startTime);
    const isOnline = res.status >= 200 && res.status < 400;
    return {
      online: isOnline,
      latency,
      statusCode: res.status,
      message: isOnline ? `HTTP ${res.status}` : `HTTP ${res.status} Error`,
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

    // Secondary test: Try loading an image asset (like favicon.ico or logo).
    // ONLY successful image load (onload) indicates the service is truly alive.
    // onerror or timeout means offline / unreachable.
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
        finish(false, 'Unreachable / Timeout');
      }, 3000);

      img.onload = () => {
        clearTimeout(fallbackTimer);
        finish(true, 'Online');
      };

      img.onerror = () => {
        clearTimeout(fallbackTimer);
        // CRITICAL FIX: An error loading an asset must NOT be assumed online.
        finish(false, 'Unreachable');
      };

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

    const contentType = res.headers.get('content-type') || '';

    if (res.ok && contentType.includes('application/json')) {
      const data = await res.json();
      const latency = data.latency || Math.round(performance.now() - startTime);
      const isOnline = Boolean(data.online && (!data.statusCode || (data.statusCode >= 200 && data.statusCode < 400)));

      // If ping proxy (e.g. Cloudflare Pages Function) cannot reach a private LAN IP from edge,
      // attempt direct browser probe only if the target is a private LAN IP
      if (!isOnline && data.isPrivateIp) {
        const directResult = await probeDirectBrowser(targetUrl);
        if (directResult.online) {
          return {
            serviceId: service.id,
            state: directResult.latency > 5000 ? 'degraded' : 'online',
            latencyMs: directResult.latency,
            lastChecked: Date.now(),
            message: 'Online (Direct LAN)',
          };
        }
        return {
          serviceId: service.id,
          state: 'offline',
          statusCode: data.statusCode,
          latencyMs: latency,
          lastChecked: Date.now(),
          message: directResult.message || 'LAN Unreachable',
        };
      }

      return {
        serviceId: service.id,
        state: isOnline ? (latency > 5000 ? 'degraded' : 'online') : 'offline',
        statusCode: data.statusCode,
        latencyMs: latency,
        lastChecked: Date.now(),
        message: isOnline ? (data.statusCode ? `HTTP ${data.statusCode} OK` : 'Online') : (data.error || `HTTP Error ${data.statusCode || 'Failed'}`),
      };
    }

    // If server returned non-JSON (e.g. static hosting returning HTML or 404/502),
    // fallback to direct client-side browser probe
    const directResult = await probeDirectBrowser(targetUrl);
    return {
      serviceId: service.id,
      state: directResult.online ? (directResult.latency > 5000 ? 'degraded' : 'online') : 'offline',
      latencyMs: directResult.latency,
      lastChecked: Date.now(),
      message: directResult.message || (directResult.online ? 'Online' : 'Offline'),
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
