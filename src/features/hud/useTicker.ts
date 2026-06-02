import { useState, useEffect, useCallback, useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { tripcastApi } from "../../convex/tripcastApi";
import {
  TickerSettings,
  DEFAULT_TICKER_SETTINGS,
  TickerMessage
} from "./tickerTypes";
import { log as debugLog } from "../../debug/debugLogger";

const LAST_FUN_FACT_STORAGE_KEY = "tripcast.ticker_last_fun_fact_at";

export function useTicker(token?: string) {
  const remoteSettings = useQuery(tripcastApi.ticker.getTickerSettings, token ? { token } : "skip");
  const updateRemoteSettings = useMutation(tripcastApi.ticker.updateTickerSettings);
  const addRemoteMessage = useMutation(tripcastApi.ticker.addTickerMessage);
  const removeRemoteMessage = useMutation(tripcastApi.ticker.removeTickerMessage);
  const clearRemoteAll = useMutation(tripcastApi.ticker.clearAllTickerMessages);

  // Rotation timing — persisted across refreshes so the ticker doesn't
  // immediately fire a fresh fact when the page reloads inside the interval
  // window (which would exhaust the fun-fact pool with frequent refreshes).
  const [lastFunFactAt, setLastFunFactAt] = useState<number>(() => {
    if (typeof window === "undefined") return 0;
    const raw = window.localStorage.getItem(LAST_FUN_FACT_STORAGE_KEY);
    const parsed = raw ? Number(raw) : 0;
    return Number.isFinite(parsed) ? parsed : 0;
  });

  useEffect(() => {
    debugLog("info", "useTicker", "ticker:last_fun_fact_restored", "ui", {
      lastFunFactAt,
      elapsedMs: Date.now() - lastFunFactAt,
    });
    // Mount-only — restored value never changes after init.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const settings: TickerSettings = useMemo(() => {
    if (!remoteSettings) return DEFAULT_TICKER_SETTINGS;
    return {
      ...remoteSettings,
      lastFunFactAt // Local to this session
    };
  }, [remoteSettings, lastFunFactAt]);

  const [currentMessage, setCurrentMessage] = useState<TickerMessage | null>(null);
  const [isPriority, setIsPriority] = useState(false);

  const updateSettings = useCallback(async (patch: Partial<TickerSettings>) => {
    if (!token) return;
    try {
      await updateRemoteSettings({ token, ...patch });
      debugLog("info", "useTicker", "ticker:settings_updated", "ui");
    } catch (e) {
      console.error("Failed to update ticker settings", e);
    }
  }, [token, updateRemoteSettings]);

  const addPriorityMessage = useCallback(async (text: string) => {
    if (!token) return;
    try {
      await addRemoteMessage({ token, type: "priority", text });
      debugLog("info", "useTicker", "ticker:priority_message_added", "ui");
    } catch (e) {
      console.error("Failed to add priority message", e);
    }
  }, [token, addRemoteMessage]);

  const removePriorityMessage = useCallback(async (id: string) => {
    if (!token) return;
    try {
      await removeRemoteMessage({ token, messageId: id });
    } catch (e) {
      console.error("Failed to remove priority message", e);
    }
  }, [token, removeRemoteMessage]);

  const addFunFact = useCallback(async (text: string) => {
    if (!token) return;
    try {
      await addRemoteMessage({ token, type: "fact", text });
      debugLog("info", "useTicker", "ticker:fun_fact_added", "ui");
    } catch (e) {
      console.error("Failed to add fun fact", e);
    }
  }, [token, addRemoteMessage]);

  const removeFunFact = useCallback(async (id: string) => {
    if (!token) return;
    try {
      await removeRemoteMessage({ token, messageId: id });
    } catch (e) {
      console.error("Failed to remove fun fact", e);
    }
  }, [token, removeRemoteMessage]);

  const clearAll = useCallback(async () => {
    if (!token) return;
    try {
      await clearRemoteAll({ token });
      debugLog("info", "useTicker", "ticker:clear_all", "ui");
    } catch (e) {
      console.error("Failed to clear ticker messages", e);
    }
  }, [token, clearRemoteAll]);

  // Priority cycling: when there are priority messages, rotate through them
  // every 30s. Preserves the current message across re-renders by id.
  useEffect(() => {
    if (!settings.enabled || settings.priorityMessages.length === 0) return;
    setIsPriority(true);
    setCurrentMessage(prev => {
      if (prev && settings.priorityMessages.find(m => m.id === prev.id)) return prev;
      return settings.priorityMessages[0];
    });
    const id = setInterval(() => {
      setCurrentMessage(prev => {
        const i = prev ? settings.priorityMessages.findIndex(m => m.id === prev.id) : -1;
        return settings.priorityMessages[(i + 1) % settings.priorityMessages.length];
      });
    }, 30000);
    return () => clearInterval(id);
  }, [settings.enabled, settings.priorityMessages]);

  // Fun-fact scheduling: a single setTimeout fires `intervalMinutes` after the
  // last fact ended. The effect re-runs when `lastFunFactAt` updates (via
  // onFunFactComplete), and short-circuits while a fact is already playing so
  // the timer doesn't overwrite it mid-scroll.
  useEffect(() => {
    if (!settings.enabled) { setCurrentMessage(null); return; }
    if (settings.priorityMessages.length > 0) return; // priority effect owns the message
    if (!settings.funFactsEnabled || settings.funFacts.length === 0) {
      setCurrentMessage(null);
      return;
    }
    setIsPriority(false);
    if (currentMessage) return; // don't interrupt a playing fact
    const intervalMs = settings.funFactIntervalMinutes * 60 * 1000;
    const waitMs = Math.max(0, intervalMs - (Date.now() - lastFunFactAt));
    const id = setTimeout(() => {
      const nextIdx = Math.floor(Math.random() * settings.funFacts.length);
      setCurrentMessage(settings.funFacts[nextIdx]);
    }, waitMs);
    return () => clearTimeout(id);
  }, [settings, lastFunFactAt, currentMessage]);

  const onFunFactComplete = useCallback(() => {
    if (!isPriority && currentMessage) {
      const now = Date.now();
      setLastFunFactAt(now);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(LAST_FUN_FACT_STORAGE_KEY, String(now));
      }
      setCurrentMessage(null);
      debugLog("info", "useTicker", "ticker:fun_fact_completed", "ui", { lastFunFactAt: now });
    }
  }, [currentMessage, isPriority]);

  return {
    settings,
    currentMessage,
    isPriority,
    updateSettings,
    addPriorityMessage,
    removePriorityMessage,
    addFunFact,
    removeFunFact,
    clearAll,
    onFunFactComplete
  };
}
