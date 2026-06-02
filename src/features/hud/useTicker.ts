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

function normalizeSettings(settings: Partial<TickerSettings> | null | undefined, lastFunFactAt: number): TickerSettings {
  return {
    ...DEFAULT_TICKER_SETTINGS,
    ...settings,
    tips: settings?.tips ?? DEFAULT_TICKER_SETTINGS.tips,
    tipsEnabled: settings?.tipsEnabled ?? DEFAULT_TICKER_SETTINGS.tipsEnabled,
    funFactWeight: settings?.funFactWeight ?? DEFAULT_TICKER_SETTINGS.funFactWeight,
    tipWeight: settings?.tipWeight ?? DEFAULT_TICKER_SETTINGS.tipWeight,
    showPriorityToFollowers: settings?.showPriorityToFollowers ?? DEFAULT_TICKER_SETTINGS.showPriorityToFollowers,
    showFunFactsToFollowers: settings?.showFunFactsToFollowers ?? DEFAULT_TICKER_SETTINGS.showFunFactsToFollowers,
    showTipsToFollowers: settings?.showTipsToFollowers ?? DEFAULT_TICKER_SETTINGS.showTipsToFollowers,
    lastFunFactAt,
  };
}

function chooseNonAlertMessage(settings: TickerSettings): TickerMessage | null {
  const pools: Array<{ weight: number; messages: TickerMessage[]; kind: "fact" | "tip" }> = [];
  if (settings.funFactsEnabled && settings.funFactWeight > 0 && settings.funFacts.length > 0) {
    pools.push({ weight: settings.funFactWeight, messages: settings.funFacts, kind: "fact" });
  }
  if (settings.tipsEnabled && settings.tipWeight > 0 && settings.tips.length > 0) {
    pools.push({ weight: settings.tipWeight, messages: settings.tips, kind: "tip" });
  }
  const totalWeight = pools.reduce((sum, pool) => sum + pool.weight, 0);
  if (totalWeight <= 0) return null;

  let cursor = Math.random() * totalWeight;
  const selectedPool = pools.find((pool) => {
    cursor -= pool.weight;
    return cursor < 0;
  }) ?? pools[pools.length - 1];
  const selectedMessage = selectedPool.messages[Math.floor(Math.random() * selectedPool.messages.length)];
  return { ...selectedMessage, kind: selectedPool.kind };
}

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
    return normalizeSettings(remoteSettings, lastFunFactAt);
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

  const addTip = useCallback(async (text: string) => {
    if (!token) return;
    try {
      await addRemoteMessage({ token, type: "tip", text });
      debugLog("info", "useTicker", "ticker:tip_added", "ui");
    } catch (e) {
      console.error("Failed to add tip", e);
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

  const removeTip = useCallback(async (id: string) => {
    if (!token) return;
    try {
      await removeRemoteMessage({ token, messageId: id });
    } catch (e) {
      console.error("Failed to remove tip", e);
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
      if (prev && settings.priorityMessages.find(m => m.id === prev.id)) return { ...prev, kind: "alert" };
      return { ...settings.priorityMessages[0], kind: "alert" };
    });
    const id = setInterval(() => {
      setCurrentMessage(prev => {
        const i = prev ? settings.priorityMessages.findIndex(m => m.id === prev.id) : -1;
        return { ...settings.priorityMessages[(i + 1) % settings.priorityMessages.length], kind: "alert" };
      });
    }, 30000);
    return () => clearInterval(id);
  }, [settings.enabled, settings.priorityMessages]);

  // Non-alert scheduling: fun facts and tips share one timer and use weights
  // to decide which section owns the next open ticker slot.
  useEffect(() => {
    if (!settings.enabled) { setCurrentMessage(null); return; }
    if (settings.priorityMessages.length > 0) return; // priority effect owns the message
    if (isPriority) {
      setIsPriority(false);
      setCurrentMessage(null);
      return;
    }
    setIsPriority(false);
    if (currentMessage) return; // don't interrupt a playing non-alert item
    const intervalMs = settings.funFactIntervalMinutes * 60 * 1000;
    const waitMs = Math.max(0, intervalMs - (Date.now() - lastFunFactAt));
    const id = setTimeout(() => {
      setCurrentMessage(chooseNonAlertMessage(settings));
    }, waitMs);
    return () => clearTimeout(id);
  }, [settings, lastFunFactAt, currentMessage, isPriority]);

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
    addTip,
    removeTip,
    clearAll,
    onFunFactComplete
  };
}
