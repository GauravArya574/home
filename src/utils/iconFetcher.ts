/**
 * Homelab Service Icon Auto-Fetcher
 * Automatically resolves high-resolution service logos from known homelab mappings
 * and the Walkxcode Dashboard-Icons repository.
 * Prefers -light (white / high-contrast) variants for dark theme visibility.
 */

const KNOWN_HOMELAB_ICONS: Record<string, string> = {
  immich: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/immich.png',
  jellyfin: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/jellyfin.png',
  plex: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/plex-light.png',
  'home-assistant': 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/home-assistant.png',
  homeassistant: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/home-assistant.png',
  hass: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/home-assistant.png',
  'pi-hole': 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/pi-hole.png',
  pihole: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/pi-hole.png',
  portainer: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/portainer.png',
  nextcloud: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/nextcloud.png',
  vaultwarden: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/vaultwarden-light.png',
  bitwarden: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/vaultwarden-light.png',
  github: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/github-light.png',
  paperless: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/paperless-light.png',
  'paperless-ngx': 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/paperless-light.png',
  glances: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/glances-light.png',
  tailscale: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/tailscale-light.png',
  miniflux: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/miniflux-light.png',
  ghost: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/ghost-light.png',
  navidrome: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/navidrome-light.png',
  esphome: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/esphome-light.png',
  'uptime-kuma': 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/uptime-kuma.png',
  uptimekuma: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/uptime-kuma.png',
  'nginx-proxy-manager': 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/nginx-proxy-manager.png',
  'nginx-proxy': 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/nginx-proxy-manager.png',
  npm: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/nginx-proxy-manager.png',
  grafana: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/grafana.png',
  prometheus: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/prometheus.png',
  qbittorrent: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/qbittorrent.png',
  qbit: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/qbittorrent.png',
  transmission: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/transmission.png',
  deluge: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/deluge.png',
  sabnzbd: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/sabnzbd.png',
  sonarr: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/sonarr.png',
  radarr: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/radarr.png',
  lidarr: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/lidarr.png',
  bazarr: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/bazarr.png',
  prowlarr: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/prowlarr.png',
  audiobookshelf: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/audiobookshelf.png',
  'calibre-web': 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/calibre-web.png',
  calibre: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/calibre.png',
  syncthing: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/syncthing.png',
  'adguard-home': 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/adguard-home.png',
  adguard: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/adguard-home.png',
  wireguard: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/wireguard.png',
  cloudflare: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/cloudflare.png',
  traefik: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/traefik.png',
  caddy: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/caddy.png',
  watchtower: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/watchtower.png',
  duplicati: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/duplicati.png',
  photoprism: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/photoprism.png',
  kavita: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/kavita.png',
  overseerr: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/overseerr.png',
  jellyseerr: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/jellyseerr.png',
  tautulli: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/tautulli.png',
  mealie: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/mealie.png',
  'stirling-pdf': 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/stirling-pdf.png',
  'speedtest-tracker': 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/speedtest-tracker.png',
  speedtest: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/speedtest-tracker.png',
  dozzle: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/dozzle.png',
  netdata: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/netdata.png',
  homer: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/homer.png',
  dashy: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/dashy.png',
  homepage: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/homepage.png',
  flame: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/flame.png',
  kasm: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/kasm.png',
  gitlab: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/gitlab.png',
  gitea: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/gitea.png',
  forgejo: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/forgejo.png',
  'node-red': 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/node-red.png',
  mosquitto: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/mosquitto.png',
  mqtt: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/mosquitto.png',
  zigbee2mqtt: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/zigbee2mqtt.png',
  'z-wave-js': 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/zwave-js.png',
  wled: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/wled.png',
  octoprint: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/octoprint.png',
  truenas: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/truenas.png',
  unraid: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/unraid.png',
  proxmox: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/proxmox-light.png',
  synology: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/synology-light.png',
  joplin: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/joplin.png',
  obsidian: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/obsidian.png',
  trilium: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/trilium.png',
  vikunja: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/vikunja.png',
  freshrss: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/freshrss.png',
  wallabag: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/wallabag.png',
  shlink: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/shlink.png',
  linkwarden: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/linkwarden.png',
  grocy: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/grocy.png',
  invoiceninja: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/invoiceninja-light.png',
  bookstack: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/bookstack.png',
  wordpress: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/wordpress.png',
  redis: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/redis.png',
  postgres: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/postgresql.png',
  postgresql: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/postgresql.png',
  mariadb: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/mariadb.png',
  mysql: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/mysql.png',
  mongodb: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/mongodb.png',
  docker: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/docker.png',
  kubernetes: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/kubernetes.png',
  authentik: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/authentik.png',
  authelia: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/authelia.png',
  emby: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/emby.png',
  komga: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/komga.png',
};

/**
 * Normalizes a service name into a clean slug (e.g., "Home Assistant" -> "home-assistant")
 */
export function normalizeServiceSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Auto-fetches or computes the best icon URL for a given service name.
 * Automatically resolves to white/light variants for dark backgrounds where available.
 */
export function autoFetchServiceIcon(name: string): string {
  if (!name || !name.trim()) {
    return 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/docker.png';
  }

  const slug = normalizeServiceSlug(name);

  // 1. Check known lookup dictionary
  if (KNOWN_HOMELAB_ICONS[slug]) {
    return KNOWN_HOMELAB_ICONS[slug];
  }

  // 2. Check direct variations (e.g. without hyphens)
  const noHyphen = slug.replace(/-/g, '');
  if (KNOWN_HOMELAB_ICONS[noHyphen]) {
    return KNOWN_HOMELAB_ICONS[noHyphen];
  }

  // 3. Fallback to standard Walkxcode repository path using normalized slug
  return `https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/${slug}.png`;
}
