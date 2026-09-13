import React, { useState, useEffect } from 'react';
import { 
  Activity, 
  Trash2, 
  Copy, 
  Check, 
  ChevronDown, 
  ChevronUp, 
  Globe, 
  Server, 
  AlertCircle, 
  ExternalLink,
  ShieldCheck,
  ShieldAlert,
  Search,
  X
} from 'lucide-react';
import { pingLogger, PingLogEntry } from '../utils/pingLogger';

interface DiagnosticLogsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DiagnosticLogsModal: React.FC<DiagnosticLogsModalProps> = ({ isOpen, onClose }) => {
  const [logs, setLogs] = useState<PingLogEntry[]>([]);
  const [filter, setFilter] = useState<'all' | 'offline' | 'online'>('all');
  const [search, setSearch] = useState('');
  const [copied, setCopied] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = pingLogger.subscribe((newLogs) => {
      setLogs(newLogs);
    });
    return () => unsubscribe();
  }, []);

  if (!isOpen) return null;

  const filteredLogs = logs.filter((log) => {
    if (filter === 'online' && log.status !== 'online') return false;
    if (filter === 'offline' && log.status !== 'offline') return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        log.serviceName.toLowerCase().includes(q) ||
        log.targetUrl.toLowerCase().includes(q) ||
        log.message.toLowerCase().includes(q) ||
        (log.statusCode && log.statusCode.toString().includes(q))
      );
    }
    return true;
  });

  const handleCopyLogs = () => {
    const exportData = JSON.stringify(logs, null, 2);
    navigator.clipboard.writeText(exportData);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div 
        id="diagnostic-logs-modal"
        className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden text-slate-100"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
                Live Ping & Diagnostic Inspector
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 font-normal">
                  {logs.length} entries
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Detailed insight into HTTP response codes, proxy paths, and error causes on Cloudflare & Preview
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              id="copy-logs-btn"
              onClick={handleCopyLogs}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors border border-slate-700"
              title="Copy JSON to clipboard"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied' : 'Export JSON'}</span>
            </button>
            <button
              id="clear-logs-btn"
              onClick={() => pingLogger.clear()}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 transition-colors border border-rose-500/20"
              title="Clear all logs"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear</span>
            </button>
            <button
              id="close-diagnostic-modal-btn"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-100 rounded-lg hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Filters Bar */}
        <div className="px-6 py-3 border-b border-slate-800 bg-slate-900/30 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center space-x-2">
            <span className="text-slate-400 font-medium">Filter:</span>
            <button
              onClick={() => setFilter('all')}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                filter === 'all'
                  ? 'bg-slate-700 text-white font-medium'
                  : 'bg-slate-800/60 text-slate-400 hover:text-slate-200'
              }`}
            >
              All ({logs.length})
            </button>
            <button
              onClick={() => setFilter('online')}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                filter === 'online'
                  ? 'bg-emerald-500/20 text-emerald-300 font-medium border border-emerald-500/30'
                  : 'bg-slate-800/60 text-slate-400 hover:text-slate-200'
              }`}
            >
              Online ({logs.filter((l) => l.status === 'online').length})
            </button>
            <button
              onClick={() => setFilter('offline')}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                filter === 'offline'
                  ? 'bg-rose-500/20 text-rose-300 font-medium border border-rose-500/30'
                  : 'bg-slate-800/60 text-slate-400 hover:text-slate-200'
              }`}
            >
              Offline ({logs.filter((l) => l.status === 'offline').length})
            </button>
          </div>

          <div className="relative min-w-[220px]">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Search service, code, or URL..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        {/* Logs Table / List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2 font-mono text-xs">
          {filteredLogs.length === 0 ? (
            <div className="py-12 text-center text-slate-500 font-sans">
              <Activity className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p>No ping events recorded yet.</p>
              <p className="text-xs text-slate-600 mt-1">Click the refresh button on any service card or top bar to trigger pings.</p>
            </div>
          ) : (
            filteredLogs.map((entry) => {
              const isExpanded = expandedId === entry.id;
              const isOnline = entry.status === 'online';

              return (
                <div
                  key={entry.id}
                  className={`border rounded-lg transition-all ${
                    isOnline
                      ? 'border-emerald-500/20 bg-emerald-950/10 hover:border-emerald-500/40'
                      : 'border-rose-500/20 bg-rose-950/10 hover:border-rose-500/40'
                  }`}
                >
                  <div
                    onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                    className="p-3 flex items-center justify-between cursor-pointer gap-2 select-none"
                  >
                    <div className="flex items-center space-x-3 min-w-0">
                      <span className="text-slate-500 text-[11px] whitespace-nowrap">
                        {entry.timestamp}
                      </span>

                      <div className="flex items-center space-x-1.5">
                        {isOnline ? (
                          <span className="flex items-center text-emerald-400 font-bold bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded text-[10px]">
                            ONLINE
                          </span>
                        ) : (
                          <span className="flex items-center text-rose-400 font-bold bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded text-[10px]">
                            OFFLINE
                          </span>
                        )}
                        {entry.statusCode ? (
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                              entry.statusCode >= 200 && entry.statusCode < 400
                                ? 'bg-emerald-500/20 text-emerald-300'
                                : 'bg-rose-500/20 text-rose-300'
                            }`}
                          >
                            HTTP {entry.statusCode}
                          </span>
                        ) : null}
                      </div>

                      <span className="font-semibold text-slate-200 truncate font-sans">
                        {entry.serviceName}
                      </span>

                      <span className="text-slate-400 truncate max-w-xs text-[11px]" title={entry.targetUrl}>
                        {entry.targetUrl}
                      </span>
                    </div>

                    <div className="flex items-center space-x-3 shrink-0">
                      <span className="text-slate-400 text-[11px]">
                        {entry.latencyMs}ms
                      </span>

                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full border ${
                          entry.method === 'cloudflare_function'
                            ? 'bg-amber-500/10 text-amber-300 border-amber-500/20'
                            : entry.method === 'express_backend'
                            ? 'bg-indigo-500/10 text-indigo-300 border-indigo-500/20'
                            : 'bg-cyan-500/10 text-cyan-300 border-cyan-500/20'
                        }`}
                      >
                        {entry.method === 'cloudflare_function'
                          ? 'CF Function'
                          : entry.method === 'express_backend'
                          ? 'Node Server'
                          : 'Browser Fetch'}
                      </span>

                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-slate-400" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                      )}
                    </div>
                  </div>

                  {/* Expanded Diagnostic Details */}
                  {isExpanded && (
                    <div className="px-4 pb-3 pt-1 border-t border-slate-800/60 bg-slate-950/40 text-xs text-slate-300 space-y-2">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-2 text-[11px]">
                        <div>
                          <span className="text-slate-500 block">Service:</span>
                          <span className="font-semibold text-slate-200">{entry.serviceName}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block">Target URL:</span>
                          <a
                            href={entry.targetUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-indigo-400 hover:underline inline-flex items-center gap-1 truncate max-w-full"
                          >
                            {entry.targetUrl}
                            <ExternalLink className="w-3 h-3 shrink-0" />
                          </a>
                        </div>
                        <div>
                          <span className="text-slate-500 block">Result Message:</span>
                          <span className={isOnline ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>
                            {entry.message}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500 block">Round-Trip Latency:</span>
                          <span>{entry.latencyMs} ms</span>
                        </div>
                      </div>

                      {entry.details && (
                        <div className="mt-2 p-2 bg-slate-900 rounded border border-slate-800 text-[11px] overflow-x-auto">
                          <span className="text-slate-400 block font-sans font-semibold mb-1 text-[10px] uppercase tracking-wider">
                            Detailed Payload & Diagnostics:
                          </span>
                          <pre className="text-slate-300">
                            {JSON.stringify(entry.details, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-900/50 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>Logs stream live with every automatic or manual service ping.</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
