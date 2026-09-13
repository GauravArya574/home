import React, { useState, useRef, useEffect } from 'react';
import { Server } from 'lucide-react';
import { DockerService, ServiceStatus, NetworkMode } from '../types';
import { getActiveServiceUrl } from '../utils/networkDetector';

interface ServiceCardProps {
  service: DockerService;
  status?: ServiceStatus;
  networkMode: NetworkMode;
  isHomeWifiDetected: boolean;
  openInNewTab: boolean;
  onEdit: (service: DockerService) => void;
  isReorderMode?: boolean;
}

export const ServiceCard: React.FC<ServiceCardProps> = ({
  service,
  status,
  networkMode,
  isHomeWifiDetected,
  openInNewTab,
  onEdit,
  isReorderMode = false,
}) => {
  const [imageError, setImageError] = useState(false);
  const [isPressing, setIsPressing] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const isLongPressedRef = useRef(false);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);

  const lastTouchTimeRef = useRef(0);

  const { url: activeUrl, isLocal } = getActiveServiceUrl(
    service,
    networkMode,
    isHomeWifiDetected
  );

  // Status indicators: green for online, red for offline, gray for checking
  const isOnline = status?.state === 'online' || status?.state === 'degraded';
  const isChecking = status?.state === 'checking';

  // Dot color styling: green / red / gray
  const dotClass = isOnline
    ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)] ring-emerald-500/30'
    : isChecking
    ? 'bg-slate-400 animate-pulse'
    : 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.9)] ring-rose-500/30';

  const statusLabel = isOnline
    ? 'Online'
    : isChecking
    ? 'Checking...'
    : 'Offline';

  const navigateToService = () => {
    if (!activeUrl) return;
    if (openInNewTab) {
      window.open(activeUrl, '_blank', 'noopener,noreferrer');
    } else {
      window.location.href = activeUrl;
    }
  };

  // Long press & tap handling with strict scrolling detection
  const handlePressStart = (clientX: number, clientY: number, isTouch = false) => {
    if (isTouch) {
      lastTouchTimeRef.current = Date.now();
    } else {
      // If a touch event just happened within 800ms, ignore the emulated synthetic mouse event
      if (Date.now() - lastTouchTimeRef.current < 800) {
        return;
      }
    }

    isLongPressedRef.current = false;
    startPosRef.current = { x: clientX, y: clientY };
    setIsPressing(true);

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      // Only fire long press if the user hasn't moved/scrolled
      if (startPosRef.current) {
        isLongPressedRef.current = true;
        setIsPressing(false);
        startPosRef.current = null;
        try {
          navigator.vibrate?.(50);
        } catch {
          // ignore
        }
        onEdit(service);
      }
    }, 500);
  };

  const handlePressEnd = (isTouch = false) => {
    if (!isTouch && Date.now() - lastTouchTimeRef.current < 800) {
      return;
    }

    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const wasLongPress = isLongPressedRef.current;
    const hadValidTouchStart = startPosRef.current !== null;
    setIsPressing(false);
    startPosRef.current = null;

    // Only open the service if it was a genuine, non-scrolling tap and not in reorder mode
    if (hadValidTouchStart && !wasLongPress && !isReorderMode) {
      navigateToService();
    }
  };

  const handlePressCancel = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    isLongPressedRef.current = false;
    setIsPressing(false);
    startPosRef.current = null; // Invalidate tap so touchEnd will NOT trigger navigateToService
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!startPosRef.current) return;
    const touch = e.touches[0];
    const diffX = Math.abs(touch.clientX - startPosRef.current.x);
    const diffY = Math.abs(touch.clientY - startPosRef.current.y);
    // If the finger moves more than 6px in any direction, user is scrolling: cancel the click & long-press!
    if (diffX > 6 || diffY > 6) {
      handlePressCancel();
    }
  };

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <div
      id={`service-item-${service.id}`}
      className="group relative flex flex-col items-center justify-start cursor-pointer select-none py-2 w-full max-w-[96px] sm:max-w-[116px] md:max-w-[128px]"
      title={`${service.name} (Remote URL: ${service.remoteUrl || 'N/A'})\nAvailability: ${statusLabel}${status?.latencyMs ? ` (${status.latencyMs}ms)` : ''}\nClick to open, hold to edit`}
      onContextMenu={(e) => {
        e.preventDefault();
        onEdit(service);
      }}
    >
      {/* Clickable Image Icon Itself (No square background or border boundary) */}
      <div
        className={`relative flex items-center justify-center w-20 h-20 xs:w-22 xs:h-22 sm:w-24 sm:h-24 md:w-28 md:h-28 transition-all duration-300 ${
          isPressing
            ? 'scale-90 opacity-80'
            : 'group-hover:scale-110 group-hover:-translate-y-1.5 group-active:scale-95'
        }`}
        onMouseDown={(e) => {
          if (e.button === 0) handlePressStart(e.clientX, e.clientY, false);
        }}
        onMouseUp={(e) => {
          if (e.button === 0) handlePressEnd(false);
        }}
        onMouseLeave={handlePressCancel}
        onTouchStart={(e) => {
          const touch = e.touches[0];
          handlePressStart(touch.clientX, touch.clientY, true);
        }}
        onTouchEnd={() => handlePressEnd(true)}
        onTouchCancel={handlePressCancel}
        onTouchMove={handleTouchMove}
      >
        {/* Soft Ambient Radial Glow Backdrop on Hover */}
        <div className="absolute inset-0 -m-3 rounded-full bg-indigo-500/0 group-hover:bg-indigo-500/25 group-hover:blur-xl transition-all duration-300 pointer-events-none opacity-0 group-hover:opacity-100 scale-75 group-hover:scale-110" />

        {/* Service Image Itself is the Icon with vibrant drop-shadow and glow */}
        {!imageError && service.icon ? (
          <img
            src={service.icon}
            alt={service.name}
            referrerPolicy="no-referrer"
            onError={() => setImageError(true)}
            className="w-full h-full object-contain pointer-events-none drop-shadow-[0_2px_12px_rgba(255,255,255,0.12)] filter group-hover:drop-shadow-[0_0_20px_rgba(99,102,241,0.5)] group-hover:scale-105 transition-all duration-300 relative z-10"
          />
        ) : (
          <div className="flex flex-col items-center justify-center p-2 text-indigo-400 drop-shadow-md group-hover:drop-shadow-[0_0_16px_rgba(99,102,241,0.6)] relative z-10">
            <Server className="w-14 h-14 sm:w-16 sm:h-16" />
          </div>
        )}

        {/* Green/Red Dot Indicator positioned relative to the icon image */}
        <span
          className="absolute top-0 right-0 flex items-center justify-center pointer-events-none z-20"
          title={`Status: ${statusLabel}${status?.latencyMs ? ` (${status.latencyMs}ms)` : ''}${status?.statusCode ? ` [HTTP ${status.statusCode}]` : ''}${status?.message ? ` - ${status.message}` : ''}`}
        >
          <span
            className={`w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full border-2 border-slate-950 ring-1 ${dotClass} transition-all duration-300 shadow-md group-hover:scale-110`}
          />
        </span>
      </div>

      {/* Name underneath image */}
      <span
        className="mt-2 text-xs sm:text-sm font-medium text-slate-300 group-hover:text-white text-center truncate w-full transition-colors tracking-tight drop-shadow-sm"
        title={service.name}
      >
        {service.name}
      </span>
    </div>
  );
};
