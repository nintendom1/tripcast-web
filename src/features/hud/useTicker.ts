import { useState, useEffect, useCallback, useMemo } from "react";
import {
  TickerSettings,
  DEFAULT_TICKER_SETTINGS,
  TICKER_STORAGE_KEY,
  TickerMessage
} from "./tickerTypes";
import { log as debugLog } from "../../debug/debugLogger";

export function useTicker() {
  const [settings, setSettings] = useState<TickerSettings>(() => {
    try {
      const stored = localStorage.getItem(TICKER_STORAGE_KEY);
      if (stored) {
        return { ...DEFAULT_TICKER_SETTINGS, ...JSON.parse(stored) };
      }
    } catch (e) {
      console.error("Failed to load ticker settings", e);
    }
    return DEFAULT_TICKER_SETTINGS;
  });

  const [currentMessage, setCurrentMessage] = useState<TickerMessage | null>(null);
  const [isPriority, setIsPriority] = useState(false);

  const saveSettings = useCallback((newSettings: TickerSettings) => {
    setSettings(newSettings);
    try {
      localStorage.setItem(TICKER_STORAGE_KEY, JSON.stringify(newSettings));
    } catch (e) {
      console.error("Failed to save ticker settings", e);
    }
    debugLog("info", "useTicker", "ticker:settings_updated", "ui");
  }, []);

  const updateSettings = useCallback((patch: Partial<TickerSettings>) => {
    saveSettings({ ...settings, ...patch });
  }, [saveSettings, settings]);

  const addPriorityMessage = useCallback((text: string) => {
    const newMessage: TickerMessage = { id: crypto.randomUUID(), text };
    updateSettings({ priorityMessages: [...settings.priorityMessages, newMessage] });
    debugLog("info", "useTicker", "ticker:priority_message_added", "ui");
  }, [settings.priorityMessages, updateSettings]);

  const removePriorityMessage = (id: string) => {
    updateSettings({ priorityMessages: settings.priorityMessages.filter(m => m.id !== id) });
  };

  const addFunFact = useCallback((text: string) => {
    const newMessage: TickerMessage = { id: crypto.randomUUID(), text };
    updateSettings({ funFacts: [...settings.funFacts, newMessage] });
    debugLog("info", "useTicker", "ticker:fun_fact_added", "ui");
  }, [settings.funFacts, updateSettings]);

  const removeFunFact = (id: string) => {
    updateSettings({ funFacts: settings.funFacts.filter(m => m.id !== id) });
  };

  const clearAll = useCallback(() => {
    updateSettings({ priorityMessages: [], funFacts: [] });
    debugLog("info", "useTicker", "ticker:clear_all", "ui");
  }, [updateSettings]);

  // Rotation logic
  useEffect(() => {
    if (!settings.enabled) {
      setCurrentMessage(null);
      return;
    }

    let timer: ReturnType<typeof setTimeout>;

    const rotate = (isInterval = false) => {
      if (settings.priorityMessages.length > 0) {
        setIsPriority(true);
        setCurrentMessage(prev => {
          if (prev && settings.priorityMessages.find(m => m.id === prev.id)) {
            if (!isInterval) return prev;
            const idx = settings.priorityMessages.findIndex(m => m.id === prev.id);
            return settings.priorityMessages[(idx + 1) % settings.priorityMessages.length];
          }
          return settings.priorityMessages[0];
        });
        // We'll let the component handle the "end of scroll" event to trigger next message if we want,
        // or just use a fixed interval if they loop.
        // The requirement says "Priority messages should take precedence... loop them."
      } else if (settings.funFactsEnabled && settings.funFacts.length > 0) {
        setIsPriority(false);
        const now = Date.now();
        const intervalMs = settings.funFactIntervalMinutes * 60 * 1000;

        if (now - settings.lastFunFactAt >= intervalMs) {
          // Time to show a fun fact
          const nextIdx = Math.floor(Math.random() * settings.funFacts.length);
          setCurrentMessage(settings.funFacts[nextIdx]);
          // Note: we don't update lastFunFactAt yet, we should do it when it FINISHES scrolling
          // or just when it starts. Let's do it when it starts to avoid double triggers.
          // But wait, if I update settings here, it re-renders.
        } else {
          setCurrentMessage(null);
        }
      } else {
        setCurrentMessage(null);
      }
    };

    rotate();
    timer = setInterval(() => rotate(true), 30000); // Check every 30s as a fallback

    return () => clearInterval(timer);
  }, [settings]);

  const onFunFactComplete = useCallback(() => {
    if (!isPriority && currentMessage) {
      updateSettings({ lastFunFactAt: Date.now() });
      setCurrentMessage(null);
      debugLog("info", "useTicker", "ticker:fun_fact_completed", "ui");
    }
  }, [currentMessage, isPriority, updateSettings]);

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
