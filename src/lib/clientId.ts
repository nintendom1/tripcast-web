const STORAGE_KEY = "tripcast.clientId";

function createClientId() {
  if (globalThis.crypto?.randomUUID) {
    return `tc_${globalThis.crypto.randomUUID()}`;
  }

  return `tc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function getClientId() {
  const existingClientId = localStorage.getItem(STORAGE_KEY);
  if (existingClientId) {
    return existingClientId;
  }

  const clientId = createClientId();
  localStorage.setItem(STORAGE_KEY, clientId);
  return clientId;
}
