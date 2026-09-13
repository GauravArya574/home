import { GatewayConfig, NetworkMode } from '../types';

/**
 * Normalizes a subnet prefix or gateway IP into a standard 3-octet prefix (e.g., "192.168.0.")
 */
export function normalizeSubnetPrefix(input?: string): string {
  if (!input || !input.trim()) return '192.168.0.';
  const cleaned = input
    .trim()
    .replace(/^https?:\/\//i, '')
    .split('/')[0]
    .replace(/\.x$/i, '.')
    .replace(/\*$/, '');

  const parts = cleaned.split('.').filter(Boolean);
  if (parts.length >= 3) {
    return `${parts[0]}.${parts[1]}.${parts[2]}.`;
  }
  return cleaned.endsWith('.') ? cleaned : `${cleaned}.`;
}

/**
 * Checks if a given IP belongs to the specified subnet prefix
 */
export function isIpInSubnetRange(ip?: string, subnetPrefix?: string): boolean {
  if (!ip || !subnetPrefix) return false;
  const targetPrefix = normalizeSubnetPrefix(subnetPrefix);
  return ip.trim().startsWith(targetPrefix);
}

/**
 * Attempts to extract local IPv4 network interface addresses via WebRTC ICE Candidates.
 */
export async function detectLocalIpViaWebRTC(): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const RTCPeerConnection =
        window.RTCPeerConnection ||
        (window as unknown as { webkitRTCPeerConnection?: typeof window.RTCPeerConnection }).webkitRTCPeerConnection ||
        (window as unknown as { mozRTCPeerConnection?: typeof window.RTCPeerConnection }).mozRTCPeerConnection;

      if (!RTCPeerConnection) {
        return resolve(null);
      }

      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      });

      let detectedIp: string | null = null;
      let resolved = false;

      const finish = (ip: string | null) => {
        if (!resolved) {
          resolved = true;
          try {
            pc.close();
          } catch {
            // ignore
          }
          resolve(ip);
        }
      };

      // Timeout after 1.5 seconds if WebRTC is blocked or mDNS masked
      const timer = setTimeout(() => {
        finish(detectedIp);
      }, 1500);

      pc.createDataChannel('gateway-detect');

      pc.onicecandidate = (event) => {
        if (!event || !event.candidate) {
          return;
        }

        const candidateStr = event.candidate.candidate;
        // Search for IPv4 patterns
        const ipv4Regex = /([0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3})/;
        const match = candidateStr.match(ipv4Regex);

        if (match && match[1]) {
          const ip = match[1];
          // Check if private IP range
          if (
            ip.startsWith('192.168.') ||
            ip.startsWith('10.') ||
            /^(172\.(1[6-9]|2[0-9]|3[0-1]))\./.test(ip)
          ) {
            detectedIp = ip;
            clearTimeout(timer);
            finish(ip);
          }
        }
      };

      pc.createOffer()
        .then((offer) => pc.setLocalDescription(offer))
        .catch(() => {
          clearTimeout(timer);
          finish(null);
        });
    } catch {
      resolve(null);
    }
  });
}

/**
 * Derives the typical default gateway IP from a local device IP
 * e.g., "192.168.0.145" -> "192.168.0.1", "10.0.0.32" -> "10.0.0.1"
 */
export function deriveGatewayFromIp(localIp: string, preferredGateway?: string): string {
  if (preferredGateway && preferredGateway.trim()) {
    const prefPrefix = normalizeSubnetPrefix(preferredGateway);
    if (localIp.startsWith(prefPrefix)) {
      return preferredGateway.trim();
    }
  }

  const parts = localIp.split('.');
  if (parts.length === 4) {
    return `${parts[0]}.${parts[1]}.${parts[2]}.1`;
  }
  return '192.168.0.1';
}

/**
 * Checks connectivity to a local gateway or host via multi-vector fetch & image timing probe
 */
export async function probeHostReachable(
  hostUrl: string,
  timeoutMs: number = 2000
): Promise<{ reachable: boolean; latencyMs: number }> {
  const startTime = performance.now();

  return new Promise((resolve) => {
    let resolved = false;

    const cleanupAndResolve = (reachable: boolean) => {
      if (!resolved) {
        resolved = true;
        const latencyMs = Math.round(performance.now() - startTime);
        resolve({ reachable, latencyMs });
      }
    };

    const timer = setTimeout(() => {
      cleanupAndResolve(false);
    }, timeoutMs);

    let cleanUrl = hostUrl.trim().replace(/\/+$/, '');
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      cleanUrl = `http://${cleanUrl}`;
    }

    // 1. Vector 1: Image DOM Element Probe (Favicon & root)
    try {
      const img = new Image();
      img.onload = () => {
        clearTimeout(timer);
        cleanupAndResolve(true);
      };
      img.onerror = () => {
        // When server sends 404/200 HTML or closes socket, onerror fires quickly (< 800ms) on LAN
        const elapsed = performance.now() - startTime;
        if (elapsed < timeoutMs - 200) {
          clearTimeout(timer);
          cleanupAndResolve(true);
        }
      };
      img.src = `${cleanUrl}/favicon.ico?_t=${Date.now()}`;
    } catch {
      // Ignore
    }

    // 2. Vector 2: Fetch Probe in no-cors mode
    if (typeof fetch !== 'undefined') {
      const controller = new AbortController();
      const fetchTimer = setTimeout(() => controller.abort(), timeoutMs);

      fetch(cleanUrl, {
        method: 'GET',
        mode: 'no-cors',
        cache: 'no-store',
        credentials: 'omit',
        signal: controller.signal,
      })
        .then(() => {
          // Opaque response received -> socket is alive and answered
          clearTimeout(fetchTimer);
          clearTimeout(timer);
          cleanupAndResolve(true);
        })
        .catch((err: unknown) => {
          clearTimeout(fetchTimer);
          const errorObj = err as { name?: string };
          // If aborted due to timeout -> offline. If TypeError occurs quickly before timeout -> local network host responded
          if (errorObj?.name !== 'AbortError') {
            const elapsed = performance.now() - startTime;
            if (elapsed < timeoutMs - 250) {
              clearTimeout(timer);
              cleanupAndResolve(true);
            }
          }
        });
    }
  });
}

/**
 * Returns the active URL for a service based on current network mode (Home LAN vs Remote WAN)
 * Remote WAN is the default.
 */
export function getActiveServiceUrl(
  service: { localUrl: string; remoteUrl: string },
  mode: NetworkMode,
  _isHomeDetected?: boolean
): { url: string; isLocal: boolean; label: 'LAN' | 'WAN' } {
  if (mode === 'home') {
    return { url: service.localUrl || service.remoteUrl, isLocal: true, label: 'LAN' };
  }
  // Default: WAN / Remote mode
  return { url: service.remoteUrl || service.localUrl, isLocal: false, label: 'WAN' };
}

