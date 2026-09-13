export interface PingLogEntry {
  id: string;
  timestamp: string;
  serviceId: string;
  serviceName: string;
  targetUrl: string;
  method: 'cloudflare_function' | 'express_backend' | 'direct_fetch' | 'error';
  status: 'online' | 'offline' | 'degraded';
  statusCode?: number;
  latencyMs: number;
  message: string;
  details?: {
    proxyResponseContentType?: string;
    proxyStatus?: number;
    errorName?: string;
    errorMessage?: string;
    rawResponse?: Record<string, unknown>;
  };
}

type LogListener = (logs: PingLogEntry[]) => void;

class PingLogger {
  private logs: PingLogEntry[] = [];
  private listeners: Set<LogListener> = new Set();
  private maxLogs: number = 100;

  public log(entry: Omit<PingLogEntry, 'id' | 'timestamp'>) {
    const fullEntry: PingLogEntry = {
      ...entry,
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toLocaleTimeString(),
    };

    this.logs = [fullEntry, ...this.logs].slice(0, this.maxLogs);
    this.notify();
    
    // Also log to browser console for DevTools visibility
    console.log(`[PingLogger] ${fullEntry.serviceName} (${fullEntry.targetUrl}) -> ${fullEntry.status.toUpperCase()} (${fullEntry.statusCode || fullEntry.message})`, fullEntry);
  }

  public getLogs(): PingLogEntry[] {
    return this.logs;
  }

  public clear() {
    this.logs = [];
    this.notify();
  }

  public subscribe(listener: LogListener): () => void {
    this.listeners.add(listener);
    listener(this.logs);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    this.listeners.forEach((listener) => listener(this.logs));
  }
}

export const pingLogger = new PingLogger();
