import React, { useRef, useState } from 'react';
import { 
  X, 
  Settings as SettingsIcon, 
  Download, 
  Upload, 
  RotateCcw, 
  RefreshCw, 
  ExternalLink,
  ShieldCheck,
  CheckCircle,
  FileJson,
  Image as ImageIcon,
  Trash2,
  Link,
  Sparkles
} from 'lucide-react';
import { motion } from 'motion/react';
import { DashboardSettings, DockerService } from '../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: DashboardSettings;
  onUpdateSettings: (newSettings: Partial<DashboardSettings>) => void;
  services: DockerService[];
  onImportServices: (importedServices: DockerService[]) => void;
  onResetDefaultServices: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
  services,
  onImportServices,
  onResetDefaultServices,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bgFileInputRef = useRef<HTMLInputElement>(null);

  const [importStatus, setImportStatus] = useState<{ success: boolean; message: string } | null>(null);
  const [imageUrlInput, setImageUrlInput] = useState('');
  const [isProcessingImage, setIsProcessingImage] = useState(false);

  if (!isOpen) return null;

  const handleExportJson = () => {
    const backupData = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      settings,
      services,
    };
    const blob = new Blob([JSON.stringify(backupData, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `homelab-docker-dashboard-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        if (Array.isArray(json.services)) {
          onImportServices(json.services);
          if (json.settings) {
            onUpdateSettings(json.settings);
          }
          setImportStatus({ success: true, message: `Successfully imported ${json.services.length} services to database!` });
        } else if (Array.isArray(json)) {
          onImportServices(json);
          setImportStatus({ success: true, message: `Successfully imported ${json.length} services to database!` });
        } else {
          setImportStatus({ success: false, message: 'Invalid backup format. Expected a JSON file with services list.' });
        }
      } catch {
        setImportStatus({ success: false, message: 'Failed to parse backup JSON file.' });
      }
    };
    reader.readAsText(file);
  };

  // Helper to compress uploaded images on canvas before storing Base64 URL
  const handleImageFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessingImage(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        // Max dimension 1920px for crisp high-def display while keeping data payload lightweight
        const maxDim = 1920;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.85);
          onUpdateSettings({ backgroundImage: compressedDataUrl });
        } else {
          onUpdateSettings({ backgroundImage: event.target?.result as string });
        }
        setIsProcessingImage(false);
      };
      img.onerror = () => {
        onUpdateSettings({ backgroundImage: event.target?.result as string });
        setIsProcessingImage(false);
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleApplyUrl = () => {
    if (imageUrlInput.trim()) {
      onUpdateSettings({ backgroundImage: imageUrlInput.trim() });
      setImageUrlInput('');
    }
  };

  const handleRemoveBackground = () => {
    onUpdateSettings({ backgroundImage: '' });
  };

  return (
    <motion.div
      id="settings-modal"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 pt-16 sm:pt-20 pb-8 bg-slate-950/80 backdrop-blur-sm overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        transition={{ type: 'spring', damping: 25, stiffness: 350 }}
        className="relative w-full max-w-xl max-h-[85vh] flex flex-col rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden my-auto"
      >
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-300">
              <SettingsIcon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-base text-slate-100">
                Dashboard Settings & Backup
              </h2>
              <p className="text-xs text-slate-400">
                Customize wallpaper, refresh rates, and sync options via Supabase
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 p-6 space-y-6 overflow-y-auto">
          {/* Background Image Settings */}
          <div className="space-y-3">
            <label className="block text-xs font-semibold uppercase text-slate-400">
              Dashboard Background Image
            </label>

            {/* Current Background Preview */}
            {settings.backgroundImage ? (
              <div className="relative rounded-2xl overflow-hidden border border-slate-800 bg-slate-950 p-2 flex items-center gap-3">
                <div className="relative w-24 h-16 rounded-xl overflow-hidden shrink-0 border border-slate-800">
                  <img
                    src={settings.backgroundImage}
                    alt="Background Preview"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-slate-200">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>Custom Image Active</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                    Saved and synchronized across all devices via Supabase.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleRemoveBackground}
                  title="Remove Custom Background"
                  className="p-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/20 transition-colors shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="p-3.5 rounded-2xl border border-dashed border-slate-800 bg-slate-950/40 text-center">
                <p className="text-xs text-slate-400">No custom background image uploaded (using default gradient theme).</p>
              </div>
            )}

            {/* Upload & Image URL Controls */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                disabled={isProcessingImage}
                onClick={() => bgFileInputRef.current?.click()}
                className="flex items-center justify-center gap-2 p-3 rounded-xl bg-indigo-600/15 hover:bg-indigo-600/25 border border-indigo-500/30 text-xs font-medium text-indigo-200 transition-colors disabled:opacity-50"
              >
                {isProcessingImage ? (
                  <RefreshCw className="w-4 h-4 text-indigo-400 animate-spin" />
                ) : (
                  <ImageIcon className="w-4 h-4 text-indigo-400" />
                )}
                <span>{isProcessingImage ? 'Optimizing Image...' : 'Upload Image File'}</span>
              </button>
              <input
                type="file"
                ref={bgFileInputRef}
                onChange={handleImageFileUpload}
                accept="image/*"
                className="hidden"
              />

              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={imageUrlInput}
                  onChange={(e) => setImageUrlInput(e.target.value)}
                  placeholder="https://... (Image URL)"
                  className="flex-1 px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 focus:border-indigo-500 outline-none"
                />
                <button
                  type="button"
                  onClick={handleApplyUrl}
                  disabled={!imageUrlInput.trim()}
                  className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-xs font-semibold text-slate-200 transition-colors"
                >
                  Apply
                </button>
              </div>
            </div>
          </div>

          {/* Auto Refresh Interval */}
          <div className="pt-2">
            <label className="block text-xs font-semibold uppercase text-slate-400 mb-2">
              Status Auto-Refresh Interval
            </label>
            <div className="grid grid-cols-4 gap-2">
              {[5, 10, 15, 30].map((interval) => (
                <button
                  key={interval}
                  type="button"
                  onClick={() => onUpdateSettings({ refreshIntervalSeconds: interval })}
                  className={`py-2 px-3 rounded-xl border text-xs font-medium transition-all ${
                    settings.refreshIntervalSeconds === interval
                      ? 'bg-indigo-600 border-indigo-500 text-white shadow-md'
                      : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  {interval}s
                </button>
              ))}
            </div>
            <p className="text-[11px] text-slate-500 mt-1.5">
              How often the dashboard pings remote URLs to test availability and update status indicators.
            </p>
          </div>

          {/* Navigation & Link Behavior */}
          <div className="space-y-3 pt-2">
            <label className="block text-xs font-semibold uppercase text-slate-400">
              Link & Display Preferences
            </label>

            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950/50 border border-slate-800">
              <div>
                <span className="text-xs font-medium text-slate-200 block">
                  Open Service Links in New Tab
                </span>
                <span className="text-[11px] text-slate-400">
                  When clicking a service icon, open target URL in a new browser tab.
                </span>
              </div>
              <input
                type="checkbox"
                checked={settings.openInNewTab}
                onChange={(e) => onUpdateSettings({ openInNewTab: e.target.checked })}
                className="w-4 h-4 rounded text-indigo-600 bg-slate-900 border-slate-700 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Backup & Restore */}
          <div className="space-y-3 pt-2">
            <label className="block text-xs font-semibold uppercase text-slate-400">
              Backup & Data Management
            </label>

            {/* Import feedback status */}
            {importStatus && (
              <div
                className={`p-3 rounded-xl border text-xs flex items-center justify-between ${
                  importStatus.success
                    ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-200'
                    : 'bg-rose-500/15 border-rose-500/30 text-rose-200'
                }`}
              >
                <span>{importStatus.message}</span>
                <button
                  type="button"
                  onClick={() => setImportStatus(null)}
                  className="text-slate-400 hover:text-slate-200 ml-2"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={handleExportJson}
                className="flex items-center justify-center gap-2 p-3 rounded-xl bg-slate-950/70 border border-slate-800 hover:border-slate-700 text-xs font-medium text-slate-200 transition-colors"
              >
                <Download className="w-4 h-4 text-indigo-400" />
                <span>Export JSON Backup</span>
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center justify-center gap-2 p-3 rounded-xl bg-slate-950/70 border border-slate-800 hover:border-slate-700 text-xs font-medium text-slate-200 transition-colors"
              >
                <Upload className="w-4 h-4 text-emerald-400" />
                <span>Import JSON Backup</span>
              </button>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileImport}
                accept=".json"
                className="hidden"
              />
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => {
                  onResetDefaultServices();
                  onClose();
                }}
                className="w-full flex items-center justify-center gap-2 p-2.5 rounded-xl border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-xs font-medium text-rose-300 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Clear All Services (Clean Slate)</span>
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 flex items-center justify-end px-6 py-4 border-t border-slate-800 bg-slate-950/50">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/20"
          >
            Done
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};
