// 主题管理 Context
import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';

const ThemeContext = createContext(null);

const THEME_MODES = {
  LIGHT: 'light',
  DARK: 'dark',
  SYSTEM: 'system',
};

const STORAGE_KEY = 'grillmind-theme-preference';

function getSystemTheme() {
  if (typeof window === 'undefined') return THEME_MODES.LIGHT;
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? THEME_MODES.DARK
    : THEME_MODES.LIGHT;
}

function getStoredPreference() {
  try {
    return localStorage.getItem(STORAGE_KEY) || THEME_MODES.SYSTEM;
  } catch {
    return THEME_MODES.SYSTEM;
  }
}

function setStoredPreference(preference) {
  try {
    localStorage.setItem(STORAGE_KEY, preference);
  } catch {
    // localStorage 不可用时静默失败
  }
}

function applyThemeToDOM(theme, withTransition = false) {
  const root = document.documentElement;
  if (withTransition) {
    root.setAttribute('data-theme-transitioning', '');
  }
  root.setAttribute('data-theme', theme);
  if (withTransition) {
    setTimeout(() => {
      root.removeAttribute('data-theme-transitioning');
    }, 300);
  }
}

export function ThemeProvider({ children }) {
  const [preference, setPreference] = useState(getStoredPreference);
  const [resolvedTheme, setResolvedTheme] = useState(() => {
    const pref = getStoredPreference();
    return pref === THEME_MODES.SYSTEM ? getSystemTheme() : pref;
  });
  const [isTransitioning, setIsTransitioning] = useState(false);
  const preferenceRef = useRef(preference);

  useEffect(() => {
    preferenceRef.current = preference;
  }, [preference]);

  useEffect(() => {
    applyThemeToDOM(resolvedTheme);
  }, [resolvedTheme]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    function handleSystemThemeChange() {
      if (preferenceRef.current === THEME_MODES.SYSTEM) {
        const newTheme = getSystemTheme();
        setResolvedTheme(newTheme);
      }
    }

    mediaQuery.addEventListener('change', handleSystemThemeChange);
    return () => mediaQuery.removeEventListener('change', handleSystemThemeChange);
  }, []);

  const setTheme = useCallback((newPreference) => {
    setIsTransitioning(true);

    setStoredPreference(newPreference);
    setPreference(newPreference);
    preferenceRef.current = newPreference;

    const newResolved = newPreference === THEME_MODES.SYSTEM
      ? getSystemTheme()
      : newPreference;

    setResolvedTheme(newResolved);
    applyThemeToDOM(newResolved, true);

    setTimeout(() => setIsTransitioning(false), 300);
  }, []);

  const toggleTheme = useCallback(() => {
    const currentPref = preferenceRef.current;
    const nextPreference = currentPref === THEME_MODES.LIGHT
      ? THEME_MODES.DARK
      : currentPref === THEME_MODES.DARK
        ? THEME_MODES.SYSTEM
        : THEME_MODES.LIGHT;
    setTheme(nextPreference);
  }, [setTheme]);

  const value = {
    preference,
    resolvedTheme,
    isTransitioning,
    setTheme,
    toggleTheme,
    isDark: resolvedTheme === THEME_MODES.DARK,
    isLight: resolvedTheme === THEME_MODES.LIGHT,
    isSystem: preference === THEME_MODES.SYSTEM,
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

export { THEME_MODES };

export function getInitialTheme() {
  const pref = getStoredPreference();
  if (pref === THEME_MODES.SYSTEM) {
    return getSystemTheme();
  }
  return pref;
}
