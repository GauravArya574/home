export interface DockerService {
  id: string;
  name: string;
  icon: string; // URL to SVG or PNG icon
  localUrl: string; // e.g., "http://192.168.1.100:2283"
  remoteUrl: string; // e.g., "https://immich.mydomain.me"
  healthEndpoint?: string; // Optional custom endpoint for status check
}

export type HealthState = 'online' | 'degraded' | 'offline' | 'checking' | 'unknown';

export interface ServiceStatus {
  serviceId: string;
  state: HealthState;
  statusCode?: number;
  latencyMs?: number;
  lastChecked: number;
  uptimePercent?: number;
  consecutiveFailures?: number;
  message?: string;
}

export type NetworkMode = 'home' | 'remote';

export interface GatewayConfig {
  mode: NetworkMode; // 'home' | 'remote'
  homeGatewayIp: string; // e.g., "192.168.1.1" or "10.0.0.1"
  homeSubnetPrefix: string; // e.g., "192.168.1." or "10.0.0."
  probeLocalHost: string; // e.g., "http://192.168.1.1" or local server IP
  pingIntervalSeconds: number;
}

export interface DashboardSettings {
  theme: 'dark' | 'light' | 'system';
  refreshIntervalSeconds: number; // 10, 15, 30, 60, 300
  openInNewTab: boolean;
  customTitle: string;
  customSubtitle: string;
  gatewayConfig: GatewayConfig;
  backgroundImage?: string; // Custom background image URL or Base64 Data URL
  customPingProxyUrl?: string; // Optional custom Cloudflare Worker or proxy endpoint (defaults to /api/ping)
}

export interface DockerHostMetrics {
  host: {
    hostname: string;
    platform: string;
    arch: string;
    uptimeSeconds: number;
    cpuCount: number;
    cpuModel: string;
    loadAvg1m: number;
    totalMemoryBytes: number;
    usedMemoryBytes: number;
    freeMemoryBytes: number;
    memoryUsagePercent: number;
  };
  docker: {
    version: string;
    containersRunning: number;
    containersTotal: number;
    imagesTotal: number;
    volumesTotal: number;
    storageDriver: string;
  };
  timestamp: number;
}
