import { useState, useEffect, useCallback } from 'react';

export interface PinnedShortcut {
  title: string;
  url: string;
  icon: string;
}

const STORAGE_KEY = 'pinned-shortcuts';

export const usePinnedShortcuts = () => {
  const [pinnedShortcuts, setPinnedShortcuts] = useState<PinnedShortcut[]>([]);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setPinnedShortcuts(JSON.parse(stored));
      } catch {
        setPinnedShortcuts([]);
      }
    }
  }, []);

  const saveToStorage = useCallback((shortcuts: PinnedShortcut[]) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(shortcuts));
    setPinnedShortcuts(shortcuts);
  }, []);

  const addPin = useCallback((shortcut: PinnedShortcut) => {
    setPinnedShortcuts(prev => {
      const exists = prev.some(s => s.url === shortcut.url);
      if (exists) return prev;
      const updated = [...prev, shortcut];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const removePin = useCallback((url: string) => {
    setPinnedShortcuts(prev => {
      const updated = prev.filter(s => s.url !== url);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const isPinned = useCallback((url: string) => {
    return pinnedShortcuts.some(s => s.url === url);
  }, [pinnedShortcuts]);

  const togglePin = useCallback((shortcut: PinnedShortcut) => {
    if (isPinned(shortcut.url)) {
      removePin(shortcut.url);
    } else {
      addPin(shortcut);
    }
  }, [isPinned, removePin, addPin]);

  return {
    pinnedShortcuts,
    addPin,
    removePin,
    isPinned,
    togglePin,
  };
};
