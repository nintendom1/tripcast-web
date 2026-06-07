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
