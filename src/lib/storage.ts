/**
 * localStorage-backed persistence for the configurator.
 * Saves the "current" part config plus the BOM cart together as a named slot.
 */
import type { BomItem, PartConfig, SavedConfig } from "./part-types";

const STORAGE_KEY = "scaffold-configurator:v1";

interface StorageShape {
  configs: SavedConfig[];
  /** The id of the most recently used config (auto-saved on every change). */
  activeId?: string;
}

function read(): StorageShape {
  if (typeof window === "undefined") return { configs: [] };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { configs: [] };
    const parsed = JSON.parse(raw) as StorageShape;
    if (!parsed.configs || !Array.isArray(parsed.configs)) {
      return { configs: [] };
    }
    return parsed;
  } catch {
    return { configs: [] };
  }
}

function write(data: StorageShape): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Quota / privacy mode — silently ignore.
  }
}

export function listSavedConfigs(): SavedConfig[] {
  return read().configs.sort((a, b) => b.savedAt - a.savedAt);
}

export function saveConfig(
  name: string,
  current: PartConfig,
  bom: BomItem[],
): SavedConfig {
  const data = read();
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const entry: SavedConfig = {
    id,
    name,
    savedAt: Date.now(),
    current,
    bom,
  };
  data.configs.push(entry);
  data.activeId = id;
  write(data);
  return entry;
}

export function deleteConfig(id: string): void {
  const data = read();
  data.configs = data.configs.filter((c) => c.id !== id);
  if (data.activeId === id) data.activeId = undefined;
  write(data);
}

export function loadConfig(id: string): SavedConfig | undefined {
  const data = read();
  return data.configs.find((c) => c.id === id);
}
