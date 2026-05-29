const OWNER_STORAGE_KEY = 'pst-platform-owner';
const DEFAULT_OWNER = 'qa';

export function loadOwnerPreference(): string {
  return window.localStorage.getItem(OWNER_STORAGE_KEY) || DEFAULT_OWNER;
}

export function saveOwnerPreference(owner: string): void {
  const normalized = owner.trim() || DEFAULT_OWNER;
  window.localStorage.setItem(OWNER_STORAGE_KEY, normalized);
}
