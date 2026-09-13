import { supabase, isSupabaseConfigured } from './supabase';
import { DockerService, GatewayConfig, DashboardSettings } from '../types';

export interface DatabaseServiceRow {
  id: string;
  name: string;
  icon: string;
  local_url: string;
  remote_url: string;
  health_endpoint: string | null;
  created_at?: string;
  updated_at?: string;
}

/**
 * Maps Supabase DB row (snake_case) to DockerService (camelCase).
 */
export function mapRowToService(row: DatabaseServiceRow): DockerService {
  return {
    id: row.id,
    name: row.name,
    icon: row.icon,
    localUrl: row.local_url,
    remoteUrl: row.remote_url,
    healthEndpoint: row.health_endpoint || undefined,
  };
}

/**
 * Maps DockerService (camelCase) to Supabase DB payload (snake_case).
 */
export function mapServiceToRow(service: DockerService): DatabaseServiceRow {
  return {
    id: service.id,
    name: service.name,
    icon: service.icon,
    local_url: service.localUrl,
    remote_url: service.remoteUrl,
    health_endpoint: service.healthEndpoint || null,
    updated_at: new Date().toISOString(),
  };
}

/**
 * Fetches all services from Supabase.
 */
export async function fetchServices(): Promise<DockerService[]> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase environment variables (VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY) are not configured.');
  }

  const { data, error } = await supabase
    .from('services')
    .select('*')
    .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching services from Supabase:', error);
      const detail = error.message || error.details || error.hint || JSON.stringify(error);
      throw new Error(`Supabase Query Failed: ${detail}`);
    }

  return (data || [])
    .filter((row: DatabaseServiceRow) => row.id !== APP_CONFIG_ROW_ID && row.name !== '__SYSTEM_SETTINGS__')
    .map((row: DatabaseServiceRow) => mapRowToService(row));
}

/**
 * Inserts a new service into Supabase.
 */
export async function createService(service: DockerService): Promise<DockerService> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured.');
  }

  const payload = {
    id: service.id || `svc_${Date.now()}`,
    name: service.name,
    icon: service.icon,
    local_url: service.localUrl,
    remote_url: service.remoteUrl,
    health_endpoint: service.healthEndpoint || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('services')
    .insert([payload])
    .select()
    .single();

  if (error) {
    console.error('Error creating service in Supabase:', error);
    throw error;
  }

  return mapRowToService(data as DatabaseServiceRow);
}

/**
 * Updates an existing service row in Supabase.
 */
export async function updateService(service: DockerService): Promise<DockerService> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured.');
  }

  const payload: Partial<DatabaseServiceRow> = {
    name: service.name,
    icon: service.icon,
    local_url: service.localUrl,
    remote_url: service.remoteUrl,
    health_endpoint: service.healthEndpoint || null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('services')
    .update(payload)
    .eq('id', service.id)
    .select()
    .single();

  if (error) {
    console.error('Error updating service in Supabase:', error);
    throw error;
  }

  return mapRowToService(data as DatabaseServiceRow);
}

/**
 * Deletes a service row from Supabase.
 */
export async function deleteService(id: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured.');
  }

  const { error } = await supabase
    .from('services')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting service from Supabase:', error);
    throw error;
  }
}

/**
 * Batch migrates or batch upserts multiple services into Supabase.
 */
export async function batchUpsertServices(servicesList: DockerService[]): Promise<DockerService[]> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured.');
  }

  if (servicesList.length === 0) return [];

  const now = new Date().toISOString();
  const rows = servicesList.map((svc) => ({
    id: svc.id || `svc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    name: svc.name,
    icon: svc.icon,
    local_url: svc.localUrl,
    remote_url: svc.remoteUrl,
    health_endpoint: svc.healthEndpoint || null,
    created_at: now,
    updated_at: now,
  }));

  const { data, error } = await supabase
    .from('services')
    .upsert(rows, { onConflict: 'id' })
    .select();

  if (error) {
    console.error('Error batch upserting services into Supabase:', error);
    throw error;
  }

  return (data || []).map((row: DatabaseServiceRow) => mapRowToService(row));
}

export const APP_CONFIG_ROW_ID = 'app_global_settings';

// In-memory cache of the latest fetched or saved configuration to avoid partial overwrites
let cachedFullConfig: AppConfigPayload = {
  gatewayConfig: undefined,
  settings: undefined,
};

/**
 * Clears all services from Supabase (protecting system configuration row).
 */
export async function clearAllServices(): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured.');
  }

  const { error } = await supabase
    .from('services')
    .delete()
    .neq('id', APP_CONFIG_ROW_ID)
    .neq('name', '__SYSTEM_SETTINGS__');

  if (error) {
    console.error('Error clearing services from Supabase:', error);
    throw error;
  }
}

export interface AppConfigPayload {
  gatewayConfig?: Partial<GatewayConfig>;
  settings?: Partial<DashboardSettings>;
}

/**
 * Loads gateway and dashboard settings from Supabase.
 * Checks for a special configuration record in 'settings' table or fallback record in 'services' table.
 */
export async function fetchAppSettings(): Promise<{
  gatewayConfig?: Partial<GatewayConfig>;
  settings?: Partial<DashboardSettings>;
} | null> {
  if (!isSupabaseConfigured || !supabase) return null;

  try {
    // 1. Try fetching from a dedicated 'settings' table if user created it
    const { data: settingsData, error: settingsError } = await supabase
      .from('settings')
      .select('*')
      .eq('id', APP_CONFIG_ROW_ID)
      .maybeSingle();

    if (!settingsError && settingsData) {
      const result = {
        gatewayConfig: settingsData.gateway_config || settingsData.gatewayConfig,
        settings: settingsData.dashboard_settings || settingsData.settings,
      };
      cachedFullConfig = {
        gatewayConfig: { ...cachedFullConfig.gatewayConfig, ...result.gatewayConfig },
        settings: { ...cachedFullConfig.settings, ...result.settings },
      };
      return result;
    }
  } catch {
    // Dedicated settings table might not exist; try fallback record
  }

  try {
    // 2. Fallback: check special metadata row in 'services' table where id = 'app_global_settings'
    const { data: serviceRow, error: serviceError } = await supabase
      .from('services')
      .select('*')
      .eq('id', APP_CONFIG_ROW_ID)
      .maybeSingle();

    if (!serviceError && serviceRow && serviceRow.health_endpoint) {
      try {
        const parsed = JSON.parse(serviceRow.health_endpoint);
        cachedFullConfig = {
          gatewayConfig: { ...cachedFullConfig.gatewayConfig, ...parsed.gatewayConfig },
          settings: { ...cachedFullConfig.settings, ...parsed.settings },
        };
        return parsed;
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore
  }

  return null;
}

/**
 * Saves gateway config and dashboard settings to Supabase.
 */
export async function saveAppSettings(
  payload: AppConfigPayload
): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return;

  // Merge with cached config so partial saves never drop fields (like customPingProxyUrl)
  cachedFullConfig = {
    gatewayConfig: {
      ...cachedFullConfig.gatewayConfig,
      ...payload.gatewayConfig,
    },
    settings: {
      ...cachedFullConfig.settings,
      ...payload.settings,
    },
  };

  const payloadToSave: AppConfigPayload = {
    gatewayConfig: cachedFullConfig.gatewayConfig,
    settings: cachedFullConfig.settings,
  };

  const now = new Date().toISOString();

  // 1. Try saving to 'settings' table first
  try {
    const { error: settingsError } = await supabase
      .from('settings')
      .upsert({
        id: APP_CONFIG_ROW_ID,
        gateway_config: payloadToSave.gatewayConfig,
        dashboard_settings: payloadToSave.settings,
        updated_at: now,
      }, { onConflict: 'id' });

    if (!settingsError) return;
  } catch {
    // fallback below
  }

  // 2. Fallback: Upsert into 'services' table with a reserved config row ID so it works on any standard 'services' table schema
  try {
    const configRow = {
      id: APP_CONFIG_ROW_ID,
      name: '__SYSTEM_SETTINGS__',
      icon: 'Settings',
      local_url: 'http://localhost',
      remote_url: 'http://localhost',
      health_endpoint: JSON.stringify(payloadToSave),
      created_at: now,
      updated_at: now,
    };

    await supabase
      .from('services')
      .upsert(configRow, { onConflict: 'id' });
  } catch (err) {
    console.warn('Could not persist app settings to Supabase:', err);
  }
}

// In-flight queue and timer for debounced settings saving
let pendingConfigPayload: AppConfigPayload = {};
let debouncedSaveTimeout: ReturnType<typeof setTimeout> | null = null;

/**
 * Debounced save mechanism for settings to prevent rapid concurrent database writes
 * during user input, slider changes, or rapid configuration updates.
 */
export function debouncedSaveAppSettings(
  payload: AppConfigPayload,
  delayMs: number = 500
): Promise<void> {
  // Merge incoming payload into the pending queue
  pendingConfigPayload = {
    gatewayConfig: {
      ...pendingConfigPayload.gatewayConfig,
      ...payload.gatewayConfig,
    },
    settings: {
      ...pendingConfigPayload.settings,
      ...payload.settings,
    },
  };

  if (debouncedSaveTimeout) {
    clearTimeout(debouncedSaveTimeout);
  }

  return new Promise((resolve) => {
    debouncedSaveTimeout = setTimeout(async () => {
      debouncedSaveTimeout = null;
      const toSave = { ...pendingConfigPayload };
      pendingConfigPayload = {};
      try {
        await saveAppSettings(toSave);
      } finally {
        resolve();
      }
    }, delayMs);
  });
}

/**
 * Immediately flushes any pending debounced settings writes to Supabase.
 */
export async function flushAppSettingsSave(): Promise<void> {
  if (debouncedSaveTimeout) {
    clearTimeout(debouncedSaveTimeout);
    debouncedSaveTimeout = null;
  }

  if (pendingConfigPayload.gatewayConfig || pendingConfigPayload.settings) {
    const toSave = { ...pendingConfigPayload };
    pendingConfigPayload = {};
    await saveAppSettings(toSave);
  }
}


