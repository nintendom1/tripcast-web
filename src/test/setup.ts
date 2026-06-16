import "@testing-library/jest-dom";

function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
  };
}

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

class IntersectionObserverMock {
  readonly root: Element | Document | null = null;
  readonly rootMargin = "0px";
  readonly scrollMargin = "0px";
  readonly thresholds: ReadonlyArray<number> = [];

  constructor(
    _callback?: IntersectionObserverCallback,
    _options?: IntersectionObserverInit,
  ) {}

  disconnect() {}
  observe() {}
  takeRecords() {
    return [];
  }
  unobserve() {}
}

// Minimal IndexedDB stub for jsdom (which has no native IDB).
// Stores all data in a Map per database name so put/delete/getAll round-trip correctly.
if (typeof globalThis.indexedDB === "undefined") {
  const _stores: Record<string, Map<string, unknown>> = {};
  const fakeRequest = <T>(resultFn: () => T) => {
    const req: { onsuccess: ((e: any) => void) | null; onerror: ((e: any) => void) | null; result: T | undefined; error: null } =
      { onsuccess: null, onerror: null, result: undefined, error: null };
    Promise.resolve().then(() => {
      req.result = resultFn();
      req.onsuccess?.({ target: req });
    });
    return req;
  };
  const fakeDB = (name: string) => ({
    transaction(_store: string, _mode: string) {
      const map = _stores[name] ?? (_stores[name] = new Map());
      return {
        objectStore(_name: string) {
          return {
            put(value: any) { return fakeRequest(() => { map.set(String(value.id), value); }); },
            delete(key: string) { return fakeRequest(() => { map.delete(key); }); },
            getAll() { return fakeRequest(() => [...map.values()]); },
          };
        },
      };
    },
    objectStoreNames: { contains: () => true },
    createObjectStore() { return {}; },
  });
  Object.defineProperty(globalThis, "indexedDB", {
    configurable: true,
    value: {
      open(name: string, _version?: number) {
        const req: any = fakeRequest(() => fakeDB(name));
        req.onupgradeneeded = null;
        return req;
      },
    },
  });
}

if (typeof window !== "undefined") {
  window.ResizeObserver = ResizeObserverMock;
  window.IntersectionObserver = IntersectionObserverMock;
  const local = typeof window.localStorage?.clear === "function"
    ? window.localStorage
    : createMemoryStorage();
  const session = typeof window.sessionStorage?.clear === "function"
    ? window.sessionStorage
    : createMemoryStorage();

  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: local,
  });
  Object.defineProperty(window, "sessionStorage", {
    configurable: true,
    value: session,
  });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: local,
  });
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: session,
  });
}
