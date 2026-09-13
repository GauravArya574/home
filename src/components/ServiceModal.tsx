import React, { useState, useEffect } from 'react';
import { X, Server, Trash2, Check, RefreshCw, Link as LinkIcon, ExternalLink } from 'lucide-react';
import { motion } from 'motion/react';
import { DockerService } from '../types';
import { autoFetchServiceIcon } from '../utils/iconFetcher';

interface ServiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (service: DockerService) => void | Promise<void>;
  onDelete?: (serviceId: string) => void | Promise<void>;
  serviceToEdit?: DockerService | null;
}

export const ServiceModal: React.FC<ServiceModalProps> = ({
  isOpen,
  onClose,
  onSave,
  onDelete,
  serviceToEdit,
}) => {
  const [name, setName] = useState('');
  const [localUrl, setLocalUrl] = useState('');
  const [remoteUrl, setRemoteUrl] = useState('');
  const [customIcon, setCustomIcon] = useState('');
  const [iconError, setIconError] = useState(false);
  const [showCustomIconField, setShowCustomIconField] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Auto-derived or custom icon
  const computedIcon = customIcon.trim() ? customIcon.trim() : autoFetchServiceIcon(name);

  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  useEffect(() => {
    setIsConfirmingDelete(false);
    setModalError(null);
    setIsSubmitting(false);
    if (serviceToEdit) {
      setName(serviceToEdit.name);
      setLocalUrl(serviceToEdit.localUrl);
      setRemoteUrl(serviceToEdit.remoteUrl || '');
      // If the icon is not the default auto-fetched one, set customIcon
      const autoIcon = autoFetchServiceIcon(serviceToEdit.name);
      if (serviceToEdit.icon && serviceToEdit.icon !== autoIcon) {
        setCustomIcon(serviceToEdit.icon);
        setShowCustomIconField(true);
      } else {
        setCustomIcon('');
        setShowCustomIconField(false);
      }
    } else {
      setName('');
      setLocalUrl('http://192.168.1.100:');
      setRemoteUrl('');
      setCustomIcon('');
      setShowCustomIconField(false);
    }
    setIconError(false);
  }, [serviceToEdit, isOpen]);

  // Reset icon error on icon change
  useEffect(() => {
    setIconError(false);
  }, [computedIcon]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (!localUrl.trim()) return;

    const finalService: DockerService = {
      id: serviceToEdit?.id || `svc_${Date.now()}`,
      name: name.trim(),
      icon: computedIcon,
      localUrl: localUrl.trim(),
      remoteUrl: remoteUrl.trim() || localUrl.trim(),
    };

    setIsSubmitting(true);
    setModalError(null);
    try {
      await onSave(finalService);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save service.';
      setModalError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (serviceToEdit && onDelete) {
      setIsSubmitting(true);
      setModalError(null);
      try {
        await onDelete(serviceToEdit.id);
        onClose();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to delete service.';
        setModalError(msg);
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  return (
    <motion.div
      id="service-edit-modal"
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
        className="relative w-full max-w-md max-h-[85vh] flex flex-col rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden my-auto"
      >
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-slate-800 border border-slate-700/80 overflow-hidden shadow-inner">
              {!iconError && computedIcon ? (
                <img
                  src={computedIcon}
                  alt="Icon Preview"
                  referrerPolicy="no-referrer"
                  onError={() => setIconError(true)}
                  className="w-7 h-7 object-contain"
                />
              ) : (
                <Server className="w-5 h-5 text-indigo-400" />
              )}
            </div>
            <div>
              <h2 className="font-bold text-base text-slate-100">
                {serviceToEdit ? 'Edit Service' : 'Add Docker Service'}
              </h2>
              <p className="text-xs text-slate-400">
                Icon auto-fetches instantly as you type the name
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 p-6 space-y-4 overflow-y-auto flex flex-col">
          {/* Database error banner */}
          {modalError && (
            <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-200 text-xs flex items-center justify-between">
              <span>{modalError}</span>
              <button
                type="button"
                onClick={() => setModalError(null)}
                className="text-rose-400 hover:text-rose-200 ml-2"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Service Name & Auto-Fetched Icon Preview */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              Service Name
            </label>
            <div className="flex items-center gap-3">
              <input
                id="service-name-input"
                type="text"
                required
                placeholder="e.g. Immich, Jellyfin, Pi-hole..."
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="flex-1 px-3.5 py-2 text-sm bg-slate-950 border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl text-slate-100 placeholder:text-slate-500 transition-all outline-none"
              />
              <div
                className="relative flex items-center justify-center w-11 h-11 rounded-xl bg-slate-950 border border-slate-800 shadow-sm shrink-0"
                title="Auto-fetched icon based on service name"
              >
                {!iconError && computedIcon ? (
                  <img
                    src={computedIcon}
                    alt="Icon"
                    referrerPolicy="no-referrer"
                    onError={() => setIconError(true)}
                    className="w-8 h-8 object-contain"
                  />
                ) : (
                  <Server className="w-5 h-5 text-slate-500" />
                )}
              </div>
            </div>
            <p className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
              <span>Auto-detects homelab logo from service name</span>
              <button
                type="button"
                onClick={() => setShowCustomIconField(!showCustomIconField)}
                className="text-indigo-400 hover:text-indigo-300 underline text-[11px]"
              >
                {showCustomIconField ? 'Hide custom URL' : 'Custom icon URL?'}
              </button>
            </p>
          </div>

          {/* Optional Custom Icon URL */}
          {showCustomIconField && (
            <div className="pt-1">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                Custom Icon URL
              </label>
              <input
                type="url"
                placeholder="https://.../icon.png (overrides auto-fetch)"
                value={customIcon}
                onChange={(e) => setCustomIcon(e.target.value)}
                className="w-full px-3.5 py-2 text-xs bg-slate-950 border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl text-slate-200 placeholder:text-slate-500 transition-all outline-none"
              />
            </div>
          )}

          {/* Local LAN URL */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              Local Wi-Fi / LAN URL
            </label>
            <div className="relative">
              <input
                id="service-localurl-input"
                type="text"
                required
                placeholder="http://192.168.1.100:2283"
                value={localUrl}
                onChange={(e) => setLocalUrl(e.target.value)}
                className="w-full pl-3.5 pr-8 py-2 text-sm bg-slate-950 border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl text-slate-100 font-mono text-xs placeholder:text-slate-600 transition-all outline-none"
              />
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Used when connected to your Home Wi-Fi gateway.
            </p>
          </div>

          {/* Remote WAN URL */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              Remote WAN / Domain URL
            </label>
            <div className="relative">
              <input
                id="service-remoteurl-input"
                type="text"
                placeholder="https://photos.homelab.me or Tailscale IP"
                value={remoteUrl}
                onChange={(e) => setRemoteUrl(e.target.value)}
                className="w-full pl-3.5 pr-8 py-2 text-sm bg-slate-950 border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl text-slate-100 font-mono text-xs placeholder:text-slate-600 transition-all outline-none"
              />
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Used when away from home or connected remotely.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="shrink-0 flex items-center justify-between pt-4 border-t border-slate-800/80 mt-auto">
            {serviceToEdit && onDelete ? (
              isConfirmingDelete ? (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={handleDelete}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 disabled:opacity-50 rounded-lg shadow-sm transition-all"
                  >
                    {isSubmitting ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" />
                    )}
                    <span>{isSubmitting ? 'Deleting...' : 'Confirm Delete'}</span>
                  </button>
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => setIsConfirmingDelete(false)}
                    className="px-2 py-1.5 text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => setIsConfirmingDelete(true)}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-rose-400 hover:bg-rose-500/10 rounded-xl transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Delete</span>
                </button>
              )
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex items-center gap-1.5 px-5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-xl shadow-lg shadow-indigo-600/25 active:scale-95 transition-all"
              >
                {isSubmitting ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
                <span>{isSubmitting ? 'Saving...' : 'Save'}</span>
              </button>
            </div>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
};
