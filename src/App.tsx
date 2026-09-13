import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  FolderOpen,
  Plus,
  Wifi,
  Globe,
  GripHorizontal,
  Check,
  AlertTriangle,
  Loader2,
  RefreshCw,
  X
} from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { 
  DockerService, 
  ServiceStatus, 
  GatewayConfig, 
  DashboardSettings, 
  NetworkMode
} from './types';
import { AnimatePresence, motion } from 'motion/react';
import { DEFAULT_SERVICES } from './data/defaultServices';
import { getActiveServiceUrl } from './utils/networkDetector';
import { pingService } from './utils/healthChecker';
import { supabase, isSupabaseConfigured } from './lib/supabase';
import { 
  fetchServices, 
  createService, 
  updateService, 
  deleteService, 
  batchUpsertServices,
  clearAllServices,
  fetchAppSettings,
  saveAppSettings,
  debouncedSaveAppSettings,
  flushAppSettingsSave,
  DatabaseServiceRow,
  mapRowToService 
} from './lib/services';
import { Navbar } from './components/Navbar';
import { ServiceCard } from './components/ServiceCard';
import { SortableServiceCard } from './components/SortableServiceCard';
import { ServiceModal } from './components/ServiceModal';
import { SettingsModal } from './components/SettingsModal';

const DEFAULT_GATEWAY_CONFIG: GatewayConfig = {
  mode: 'remote',
  homeGatewayIp: '192.168.0.1',
  homeSubnetPrefix: '192.168.0.',
  probeLocalHost: 'http://192.168.0.1',
  pingIntervalSeconds: 5,
};

const DEFAULT_SETTINGS: DashboardSettings = {
  theme: 'dark',
  refreshIntervalSeconds: 5,
  openInNewTab: true,
  customTitle: 'Homelab Docker',
  customSubtitle: 'Self-hosted Service Directory',
  gatewayConfig: DEFAULT_GATEWAY_CONFIG,
};

export default function App() {
  // 1. Database & Services State (Supabase ONLY)
  const [services, setServices] = useState<DockerService[]>([]);
  const [isLoadingServices, setIsLoadingServices] = useState(true);
  const [dbError, setDbError] = useState<string | null>(null);

  // 2. Gateway Config State (In-Memory Runtime)
  const [gatewayConfig, setGatewayConfig] = useState<GatewayConfig>(DEFAULT_GATEWAY_CONFIG);

  // 3. Settings State (In-Memory Runtime)
  const [settings, setSettings] = useState<DashboardSettings>(DEFAULT_SETTINGS);

  // 4. Live Health & Refresh State (Runtime only, not stored in DB)
  const [serviceStatuses, setServiceStatuses] = useState<Record<string, ServiceStatus>>({});
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);

  // 5. Modals & Reorder Mode
  const [isServiceModalOpen, setIsServiceModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [serviceToEdit, setServiceToEdit] = useState<DockerService | null>(null);
  const [isReorderMode, setIsReorderMode] = useState(false);

  // DnD-Kit Sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Fetch Services & App Settings directly from Supabase (Strictly no localStorage)
  const loadServicesFromDb = useCallback(async () => {
    setIsLoadingServices(true);
    setDbError(null);

    if (!isSupabaseConfigured || !supabase) {
      setIsLoadingServices(false);
      setDbError(
        'Supabase is not configured. Please define VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.'
      );
      return;
    }

    try {
      // 1. Load Services
      const fetched = await fetchServices();
      setServices(fetched);

      // 2. Load App Gateway Config & Settings from Supabase
      const appSettings = await fetchAppSettings();
      if (appSettings) {
        if (appSettings.gatewayConfig) {
          setGatewayConfig((prev) => ({
            ...prev,
            ...appSettings.gatewayConfig,
          }));
        }
        if (appSettings.settings) {
          setSettings((prev) => ({
            ...prev,
            ...appSettings.settings,
          }));
        }
      }
    } catch (err: unknown) {
      let errorMsg = 'Failed to connect to Supabase database.';
      if (err instanceof Error) {
        errorMsg = err.message;
      } else if (typeof err === 'object' && err !== null) {
        const anyErr = err as { message?: string; details?: string; hint?: string; code?: string };
        errorMsg = anyErr.message || anyErr.details || anyErr.hint || JSON.stringify(err);
      }
      console.error('Failed to load services from Supabase:', err);
      setDbError(errorMsg);
    } finally {
      setIsLoadingServices(false);
    }
  }, []);

  // Initial Boot: Load DB and detect gateway
  useEffect(() => {
    loadServicesFromDb();
  }, [loadServicesFromDb]);

  // Realtime Cross-Device Synchronization via Supabase Postgres Changes
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;

    const channel = supabase
      .channel('public:services_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'services',
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newSvc = mapRowToService(payload.new as DatabaseServiceRow);
            setServices((prev) => {
              if (prev.some((s) => s.id === newSvc.id)) return prev;
              return [...prev, newSvc];
            });
          } else if (payload.eventType === 'UPDATE') {
            const updatedSvc = mapRowToService(payload.new as DatabaseServiceRow);
            setServices((prev) =>
              prev.map((s) => (s.id === updatedSvc.id ? updatedSvc : s))
            );
          } else if (payload.eventType === 'DELETE') {
            const deletedId = (payload.old as { id?: string })?.id;
            if (deletedId) {
              setServices((prev) => prev.filter((s) => s.id !== deletedId));
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setServices((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id);
        const newIndex = items.findIndex((i) => i.id === over.id);
        if (oldIndex !== -1 && newIndex !== -1) {
          return arrayMove(items, oldIndex, newIndex);
        }
        return items;
      });
    }
  };

  // Handle Theme Sync
  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === 'dark') {
      root.classList.add('dark');
    } else if (settings.theme === 'light') {
      root.classList.remove('dark');
    } else {
      const isSystemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (isSystemDark) {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
    }
  }, [settings.theme]);

  // Single Service Health Probe
  const probeSingleService = useCallback(
    async (service: DockerService) => {
      setServiceStatuses((prev) => ({
        ...prev,
        [service.id]: {
          serviceId: service.id,
          state: 'checking',
          lastChecked: Date.now(),
        },
      }));

      const status = await pingService(service);

      setServiceStatuses((prev) => ({
        ...prev,
        [service.id]: status,
      }));
    },
    []
  );

  // Refresh All Services Health simultaneously
  const refreshAllStatuses = useCallback(async () => {
    if (isRefreshing || services.length === 0) return;
    setIsRefreshing(true);

    await Promise.all(
      services.map(async (svc) => {
        const status = await pingService(svc);
        setServiceStatuses((prev) => ({
          ...prev,
          [svc.id]: status,
        }));
      })
    );

    setIsRefreshing(false);
  }, [isRefreshing, services]);

  // Run probe once services are fetched or network mode changes
  useEffect(() => {
    if (services.length > 0) {
      refreshAllStatuses();
    }
  }, [services.length, gatewayConfig.mode]);

  // Auto-refresh interval
  useEffect(() => {
    if (!autoRefreshEnabled || services.length === 0) return;

    const interval = setInterval(() => {
      refreshAllStatuses();
    }, settings.refreshIntervalSeconds * 1000);

    return () => clearInterval(interval);
  }, [autoRefreshEnabled, settings.refreshIntervalSeconds, refreshAllStatuses, services.length]);

  // Service CRUD handlers: Direct Database Operations with optimistic fallback & error prevention
  const handleSaveService = async (service: DockerService) => {
    setDbError(null);
    const isExisting = services.some((s) => s.id === service.id);

    try {
      if (isSupabaseConfigured && supabase) {
        let savedService: DockerService;
        if (isExisting) {
          savedService = await updateService(service);
        } else {
          savedService = await createService(service);
        }

        setServices((prev) => {
          const index = prev.findIndex((s) => s.id === savedService.id);
          if (index >= 0) {
            const updated = [...prev];
            updated[index] = savedService;
            return updated;
          }
          return [...prev, savedService];
        });
        setTimeout(() => probeSingleService(savedService), 100);
      } else {
        // Unconfigured Supabase: preserve locally
        setServices((prev) => {
          const index = prev.findIndex((s) => s.id === service.id);
          if (index >= 0) {
            const updated = [...prev];
            updated[index] = service;
            return updated;
          }
          return [...prev, service];
        });
        setTimeout(() => probeSingleService(service), 100);
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to save service to Supabase.';
      console.error('Error in handleSaveService:', err);
      setDbError(errorMsg);
      throw err; // Re-throw to inform modal that save failed
    }
  };

  const handleDeleteService = async (serviceId: string) => {
    setDbError(null);
    try {
      if (isSupabaseConfigured && supabase) {
        await deleteService(serviceId);
      }
      setServices((prev) => prev.filter((s) => s.id !== serviceId));
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to delete service from Supabase.';
      console.error('Error in handleDeleteService:', err);
      setDbError(errorMsg);
      throw err;
    }
  };

  const handleImportServices = async (importedList: DockerService[]) => {
    setDbError(null);
    try {
      if (isSupabaseConfigured && supabase) {
        const saved = await batchUpsertServices(importedList);
        setServices(saved);
      } else {
        setServices(importedList);
      }
      refreshAllStatuses();
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to import services into Supabase.';
      console.error('Error in handleImportServices:', err);
      setDbError(errorMsg);
    }
  };

  const handleResetServices = async () => {
    setDbError(null);
    try {
      if (isSupabaseConfigured && supabase) {
        await clearAllServices();
      }
      setServices([]);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to clear services in Supabase.';
      console.error('Error in handleResetServices:', err);
      setDbError(errorMsg);
    }
  };

  const handleOpenEditModal = (service: DockerService) => {
    setServiceToEdit(service);
    setIsServiceModalOpen(true);
  };

  const handleOpenAddModal = () => {
    setServiceToEdit(null);
    setIsServiceModalOpen(true);
  };

  const handleSetNetworkMode = (mode: NetworkMode) => {
    setGatewayConfig((prev) => {
      const updated = { ...prev, mode };
      saveAppSettings({ gatewayConfig: updated });
      return updated;
    });
  };

  return (
    <div className="relative min-h-screen w-full overflow-x-hidden bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500 selection:text-white">
      {/* Custom Image or Default Gradient Background */}
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none select-none">
        {settings.backgroundImage ? (
          <img
            src={settings.backgroundImage}
            alt="Custom Dashboard Background"
            className="absolute inset-0 w-full h-full object-cover object-center brightness-[0.8] contrast-[1.05]"
          />
        ) : (
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-slate-950" />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950/50 via-slate-950/20 to-slate-950/80" />
        <div className="absolute inset-0 bg-slate-950/20 backdrop-brightness-95" />
      </div>

      {/* Top Bar with Wi-Fi Status Indicator */}
      <div className="relative z-40">
        <Navbar
          gatewayConfig={gatewayConfig}
          onOpenSettingsModal={() => setIsSettingsModalOpen(true)}
          onRefreshAll={refreshAllStatuses}
          isRefreshing={isRefreshing}
          autoRefreshEnabled={autoRefreshEnabled}
          onToggleAutoRefresh={() => setAutoRefreshEnabled(!autoRefreshEnabled)}
          onSetNetworkMode={handleSetNetworkMode}
        />
      </div>

      {/* Database Error Banner (Non-destructive) */}
      {dbError && (
        <div className="relative z-30 max-w-7xl w-full mx-auto px-4 sm:px-6 pt-4">
          <div className="flex items-center justify-between p-3.5 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-200 text-xs backdrop-blur-md shadow-lg">
            <div className="flex items-center gap-2.5">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>
                <strong className="font-semibold text-rose-100">Database Sync Error:</strong> {dbError}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={loadServicesFromDb}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-100 font-medium transition-colors"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Retry</span>
              </button>
              <button
                onClick={() => setDbError(null)}
                className="p-1 rounded-lg hover:bg-rose-500/20 text-rose-400 hover:text-rose-200"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area: Service Icons Grid */}
      <main className="relative z-10 flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-8 sm:py-12 flex flex-col justify-start">
        {isLoadingServices ? (
          <div
            id="loading-services-state"
            className="flex flex-col items-center justify-center p-16 text-center rounded-3xl border border-slate-800/50 bg-slate-900/20 backdrop-blur-sm my-8"
          >
            <Loader2 className="w-9 h-9 text-indigo-400 animate-spin mb-3" />
            <h3 className="font-semibold text-sm text-slate-200">Loading Docker Services</h3>
            <p className="text-xs text-slate-400 mt-1">Connecting to Supabase database...</p>
          </div>
        ) : services.length === 0 ? (
          <div
            id="empty-services-state"
            className="flex flex-col items-center justify-center p-12 text-center rounded-3xl border border-dashed border-slate-800 bg-slate-900/30 my-8"
          >
            <div className="p-4 rounded-2xl bg-slate-800/80 text-slate-400 mb-3">
              <FolderOpen className="w-8 h-8" />
            </div>
            <h3 className="font-bold text-base text-slate-200">No Services Configured</h3>
            <p className="text-xs text-slate-400 max-w-sm mt-1 mb-4">
              Add your first self-hosted docker service to sync it to Supabase across all devices.
            </p>
            <button
              onClick={handleOpenAddModal}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white shadow-md shadow-indigo-600/20 transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Add Docker Service</span>
            </button>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <div
              id="services-icon-launcher"
              className="w-full grid grid-cols-3 xs:grid-cols-4 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-x-4 gap-y-8 sm:gap-x-8 sm:gap-y-10 justify-items-center"
            >
              <SortableContext items={services.map((s) => s.id)} strategy={rectSortingStrategy}>
                {services.map((service) => (
                  <SortableServiceCard
                    key={service.id}
                    service={service}
                    status={serviceStatuses[service.id]}
                    networkMode={gatewayConfig.mode}
                    isHomeWifiDetected={gatewayConfig.isHomeWifiDetected}
                    openInNewTab={settings.openInNewTab}
                    onEdit={handleOpenEditModal}
                    isReorderMode={isReorderMode}
                  />
                ))}
              </SortableContext>

              {/* Add Service Action */}
              <div
                id="add-service-tile"
                onClick={handleOpenAddModal}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleOpenAddModal();
                  }
                }}
                className="group relative flex flex-col items-center justify-start cursor-pointer select-none py-2 w-full max-w-[96px] sm:max-w-[116px] md:max-w-[128px]"
                title="Add New Service"
              >
                <div className="absolute inset-0 -m-3 rounded-full bg-indigo-500/0 group-hover:bg-indigo-500/20 group-hover:blur-xl transition-all duration-300 pointer-events-none opacity-0 group-hover:opacity-100" />
                <div
                  className="flex items-center justify-center w-20 h-20 xs:w-22 xs:h-22 sm:w-24 sm:h-24 md:w-28 md:h-28 rounded-3xl border-2 border-dashed border-slate-800 hover:border-indigo-500/80 bg-slate-900/30 hover:bg-indigo-950/20 text-slate-500 hover:text-indigo-400 transition-all duration-300 group-hover:scale-110 group-hover:-translate-y-1.5 group-active:scale-95 group-hover:shadow-[0_0_24px_rgba(99,102,241,0.25)] relative z-10"
                >
                  <Plus className="w-10 h-10 sm:w-12 sm:h-12 transition-transform group-hover:rotate-90 duration-300" />
                </div>
                <span className="mt-2 text-xs sm:text-sm font-medium text-slate-400 group-hover:text-indigo-300 text-center truncate w-full transition-colors tracking-tight">
                  Add
                </span>
              </div>

              {/* Drag-and-Drop Reorder Action */}
              <div
                id="reorder-services-tile"
                onClick={() => setIsReorderMode((prev) => !prev)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setIsReorderMode((prev) => !prev);
                  }
                }}
                className="group relative flex flex-col items-center justify-start cursor-pointer select-none py-2 w-full max-w-[96px] sm:max-w-[116px] md:max-w-[128px]"
                title={isReorderMode ? 'Finish Reordering' : 'Reorder Docker Services'}
              >
                <div className="absolute inset-0 -m-3 rounded-full bg-indigo-500/0 group-hover:bg-indigo-500/20 group-hover:blur-xl transition-all duration-300 pointer-events-none opacity-0 group-hover:opacity-100" />
                <div
                  className={`flex items-center justify-center w-20 h-20 xs:w-22 xs:h-22 sm:w-24 sm:h-24 md:w-28 md:h-28 rounded-3xl border-2 transition-all duration-300 relative z-10 ${
                    isReorderMode
                      ? 'border-indigo-500 bg-indigo-600 text-white shadow-lg shadow-indigo-500/40 scale-105'
                      : 'border-slate-800/80 bg-slate-900/30 text-slate-500 hover:text-indigo-400 hover:border-slate-700 hover:bg-slate-900/60 group-hover:scale-110 group-hover:-translate-y-1.5 group-active:scale-95 group-hover:shadow-[0_0_24px_rgba(99,102,241,0.25)]'
                  }`}
                >
                  {isReorderMode ? (
                    <Check className="w-9 h-9 sm:w-10 sm:h-10 text-white animate-scaleIn" />
                  ) : (
                    <GripHorizontal className="w-9 h-9 sm:w-10 sm:h-10 transition-transform group-hover:scale-110 duration-200" />
                  )}
                </div>
                <span
                  className={`mt-2 text-xs sm:text-sm font-medium text-center truncate w-full transition-colors tracking-tight ${
                    isReorderMode
                      ? 'text-indigo-400 font-semibold'
                      : 'text-slate-400 group-hover:text-slate-200'
                  }`}
                >
                  {isReorderMode ? 'Done' : 'Reorder'}
                </span>
              </div>
            </div>
          </DndContext>
        )}
      </main>

      {/* Modals */}
      <AnimatePresence mode="wait">
        {isServiceModalOpen && (
          <ServiceModal
            key="service-modal"
            isOpen={isServiceModalOpen}
            onClose={() => {
              setIsServiceModalOpen(false);
              setServiceToEdit(null);
            }}
            onSave={handleSaveService}
            onDelete={handleDeleteService}
            serviceToEdit={serviceToEdit}
          />
        )}

        {isSettingsModalOpen && (
          <SettingsModal
            key="settings-modal"
            isOpen={isSettingsModalOpen}
            onClose={() => setIsSettingsModalOpen(false)}
            settings={settings}
            onUpdateSettings={(newSettings) => {
              setSettings((prev) => {
                const updated = { ...prev, ...newSettings };
                debouncedSaveAppSettings({ settings: updated }, 400);
                return updated;
              });
            }}
            services={services}
            onImportServices={handleImportServices}
            onResetDefaultServices={handleResetServices}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

