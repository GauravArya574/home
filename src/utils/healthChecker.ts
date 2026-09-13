import { DockerService, ServiceStatus } from '../types';
import { pingLogger } from './pingLogger';

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
 * Pings the remote URL of the service to determine if it is online or offline.
 * Only the remote URL (wanUrl/remoteUrl) is probed.
 * If the URL returns any error code (e.g. 404, 502, 504, 521, etc.) or connection fails,
 * the service is strictly marked as offline.
 */
export async function pingService(
  service: DockerService,
  _activeUrl?: string
): Promise<ServiceStatus> {
  // Strictly use the remote/WAN URL of the service
  const targetUrl = service.remoteUrl?.trim();

  if (!targetUrl) {
    return {
      serviceId: service.id,
      state: 'offline',
      latencyMs: 0,
      lastChecked: Date.now(),
      message: 'No remote URL configured',
    };
  }

  const startTime = performance.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);

  try {
    // 1. First attempt the backend/edge proxy (/api/ping)
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
      const statusCode = data.statusCode;
      
      // STRICT REQUIREMENT: Only HTTP 2xx and 3xx are online.
      // Any error code (404, 500, 502, 504, 521, 522, etc.) is strictly OFFLINE.
      const isOnline = Boolean(
        data.online &&
        typeof statusCode === 'number' &&
        statusCode >= 200 &&
        statusCode < 400
      );

      const statusState = isOnline ? (latency > 5000 ? 'degraded' : 'online') : 'offline';
      const statusMsg = isOnline
        ? `HTTP ${statusCode} OK`
        : (statusCode ? `HTTP ${statusCode} Error` : (data.error || 'Offline'));

      pingLogger.log({
        serviceId: service.id,
        serviceName: service.name,
        targetUrl,
        method: data.platform === 'cloudflare-pages' ? 'cloudflare_function' : 'express_backend',
        status: statusState,
        statusCode,
        latencyMs: latency,
        message: statusMsg,
        details: {
          proxyStatus: res.status,
          proxyResponseContentType: contentType,
          rawResponse: data,
        },
      });

      if (isOnline) {
        return {
          serviceId: service.id,
          state: statusState,
          statusCode,
          latencyMs: latency,
          lastChecked: Date.now(),
          message: statusMsg,
        };
      }

      // Any HTTP error code or failure -> mark strictly OFFLINE
      return {
        serviceId: service.id,
        state: 'offline',
        statusCode,
        latencyMs: latency,
        lastChecked: Date.now(),
        message: statusMsg,
      };
    }

    // If server returned non-JSON (e.g. static hosting returning HTML or 404/502 on /api/ping),
    // fallback to direct browser probe of the remote URL
    const directResult = await probeDirectBrowser(targetUrl);
    const directState = directResult.online ? (directResult.latency > 5000 ? 'degraded' : 'online') : 'offline';
    const directMsg = directResult.online
      ? (directResult.statusCode ? `HTTP ${directResult.statusCode} OK` : 'Online (Direct Fetch)')
      : (directResult.statusCode ? `HTTP ${directResult.statusCode} Error` : (directResult.message || 'Offline (Direct Fetch)'));

    pingLogger.log({
      serviceId: service.id,
      serviceName: service.name,
      targetUrl,
      method: 'direct_fetch',
      status: directState,
      statusCode: directResult.statusCode,
      latencyMs: directResult.latency,
      message: directMsg,
      details: {
        proxyStatus: res.status,
        proxyResponseContentType: contentType,
        errorMessage: `/api/ping returned non-JSON (${res.status} ${contentType}), fell back to direct browser fetch`,
      },
    });

    return {
      serviceId: service.id,
      state: directState,
      statusCode: directResult.statusCode,
      latencyMs: directResult.latency,
      lastChecked: Date.now(),
      message: directMsg,
    };
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    
    // If /api/ping network fails, fallback to direct browser probe of remote URL
    try {
      const directResult = await probeDirectBrowser(targetUrl);
      const directState = directResult.online ? (directResult.latency > 5000 ? 'degraded' : 'online') : 'offline';
      const directMsg = directResult.online
        ? (directResult.statusCode ? `HTTP ${directResult.statusCode} OK` : 'Online (Direct Fetch)')
        : (directResult.statusCode ? `HTTP ${directResult.statusCode} Error` : (directResult.message || 'Offline (Direct Fetch)'));

      pingLogger.log({
        serviceId: service.id,
        serviceName: service.name,
        targetUrl,
        method: 'direct_fetch',
        status: directState,
        statusCode: directResult.statusCode,
        latencyMs: directResult.latency,
        message: directMsg,
        details: {
          errorMessage: `/api/ping fetch threw error: ${(err as Error)?.message || String(err)}`,
        },
      });

      return {
        serviceId: service.id,
        state: directState,
        statusCode: directResult.statusCode,
        latencyMs: directResult.latency,
        lastChecked: Date.now(),
        message: directMsg,
      };
    } catch (fallbackErr) {
      const latency = Math.round(performance.now() - startTime);
      pingLogger.log({
        serviceId: service.id,
        serviceName: service.name,
        targetUrl,
        method: 'error',
        status: 'offline',
        latencyMs: latency,
        message: 'Unreachable',
        details: {
          errorMessage: (fallbackErr as Error)?.message || String(fallbackErr),
        },
      });

      return {
        serviceId: service.id,
        state: 'offline',
        latencyMs: latency,
        lastChecked: Date.now(),
        message: 'Unreachable',
      };
    }
  }
}
