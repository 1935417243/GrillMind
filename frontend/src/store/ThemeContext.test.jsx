import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { ThemeProvider, useTheme, THEME_MODES, getInitialTheme } from './ThemeContext';

function createMatchMedia(prefersDark) {
  return (query) => ({
    matches: query === '(prefers-color-scheme: dark)' ? prefersDark : false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  });
}

describe('ThemeContext', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-theme-transitioning');
  });

  describe('ThemeProvider', () => {
    it('默认使用 system 模式', () => {
      window.matchMedia = createMatchMedia(false);
      const { result } = renderHook(() => useTheme(), { wrapper: ThemeProvider });
      expect(result.current.preference).toBe(THEME_MODES.SYSTEM);
    });

    it('system 模式下根据系统偏好解析为 light', () => {
      window.matchMedia = createMatchMedia(false);
      const { result } = renderHook(() => useTheme(), { wrapper: ThemeProvider });
      expect(result.current.resolvedTheme).toBe(THEME_MODES.LIGHT);
      expect(result.current.isLight).toBe(true);
      expect(result.current.isDark).toBe(false);
    });

    it('system 模式下根据系统偏好解析为 dark', () => {
      window.matchMedia = createMatchMedia(true);
      const { result } = renderHook(() => useTheme(), { wrapper: ThemeProvider });
      expect(result.current.resolvedTheme).toBe(THEME_MODES.DARK);
      expect(result.current.isDark).toBe(true);
      expect(result.current.isLight).toBe(false);
    });

    it('从 localStorage 恢复用户偏好', () => {
      localStorage.setItem('grillmind-theme-preference', THEME_MODES.DARK);
      window.matchMedia = createMatchMedia(false);
      const { result } = renderHook(() => useTheme(), { wrapper: ThemeProvider });
      expect(result.current.preference).toBe(THEME_MODES.DARK);
      expect(result.current.resolvedTheme).toBe(THEME_MODES.DARK);
    });
  });

  describe('setTheme', () => {
    it('切换到浅色模式', () => {
      window.matchMedia = createMatchMedia(false);
      const { result } = renderHook(() => useTheme(), { wrapper: ThemeProvider });

      act(() => {
        result.current.setTheme(THEME_MODES.LIGHT);
      });

      expect(result.current.preference).toBe(THEME_MODES.LIGHT);
      expect(result.current.resolvedTheme).toBe(THEME_MODES.LIGHT);
      expect(result.current.isLight).toBe(true);
      expect(localStorage.getItem('grillmind-theme-preference')).toBe(THEME_MODES.LIGHT);
    });

    it('切换到深色模式', () => {
      window.matchMedia = createMatchMedia(false);
      const { result } = renderHook(() => useTheme(), { wrapper: ThemeProvider });

      act(() => {
        result.current.setTheme(THEME_MODES.DARK);
      });

      expect(result.current.preference).toBe(THEME_MODES.DARK);
      expect(result.current.resolvedTheme).toBe(THEME_MODES.DARK);
      expect(result.current.isDark).toBe(true);
      expect(localStorage.getItem('grillmind-theme-preference')).toBe(THEME_MODES.DARK);
    });

    it('切换到跟随系统模式', () => {
      window.matchMedia = createMatchMedia(true);
      const { result } = renderHook(() => useTheme(), { wrapper: ThemeProvider });

      act(() => {
        result.current.setTheme(THEME_MODES.SYSTEM);
      });

      expect(result.current.preference).toBe(THEME_MODES.SYSTEM);
      expect(result.current.isSystem).toBe(true);
      expect(result.current.resolvedTheme).toBe(THEME_MODES.DARK);
      expect(localStorage.getItem('grillmind-theme-preference')).toBe(THEME_MODES.SYSTEM);
    });

    it('设置 data-theme 属性到 documentElement', () => {
      window.matchMedia = createMatchMedia(false);
      const { result } = renderHook(() => useTheme(), { wrapper: ThemeProvider });

      act(() => {
        result.current.setTheme(THEME_MODES.DARK);
      });

      expect(document.documentElement.getAttribute('data-theme')).toBe(THEME_MODES.DARK);
    });

    it('切换时触发过渡效果', () => {
      vi.useFakeTimers();
      window.matchMedia = createMatchMedia(false);
      const { result } = renderHook(() => useTheme(), { wrapper: ThemeProvider });

      act(() => {
        result.current.setTheme(THEME_MODES.DARK);
      });

      expect(result.current.isTransitioning).toBe(true);
      expect(document.documentElement.hasAttribute('data-theme-transitioning')).toBe(true);

      act(() => {
        vi.advanceTimersByTime(300);
      });

      expect(result.current.isTransitioning).toBe(false);
      expect(document.documentElement.hasAttribute('data-theme-transitioning')).toBe(false);

      vi.useRealTimers();
    });
  });

  describe('toggleTheme', () => {
    it('从 light 循环切换到 dark', () => {
      window.matchMedia = createMatchMedia(false);
      const { result } = renderHook(() => useTheme(), { wrapper: ThemeProvider });

      act(() => {
        result.current.setTheme(THEME_MODES.LIGHT);
      });

      act(() => {
        result.current.toggleTheme();
      });

      expect(result.current.preference).toBe(THEME_MODES.DARK);
    });

    it('从 dark 循环切换到 system', () => {
      window.matchMedia = createMatchMedia(false);
      const { result } = renderHook(() => useTheme(), { wrapper: ThemeProvider });

      act(() => {
        result.current.setTheme(THEME_MODES.DARK);
      });

      act(() => {
        result.current.toggleTheme();
      });

      expect(result.current.preference).toBe(THEME_MODES.SYSTEM);
    });

    it('从 system 循环切换到 light', () => {
      window.matchMedia = createMatchMedia(false);
      const { result } = renderHook(() => useTheme(), { wrapper: ThemeProvider });

      act(() => {
        result.current.setTheme(THEME_MODES.SYSTEM);
      });

      act(() => {
        result.current.toggleTheme();
      });

      expect(result.current.preference).toBe(THEME_MODES.LIGHT);
    });
  });

  describe('getInitialTheme', () => {
    it('无存储时返回系统偏好', () => {
      window.matchMedia = createMatchMedia(true);
      expect(getInitialTheme()).toBe(THEME_MODES.DARK);
    });

    it('有存储偏好时返回存储值', () => {
      localStorage.setItem('grillmind-theme-preference', THEME_MODES.LIGHT);
      window.matchMedia = createMatchMedia(true);
      expect(getInitialTheme()).toBe(THEME_MODES.LIGHT);
    });

    it('localStorage 不可用时返回 light', () => {
      const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('SecurityError');
      });
      window.matchMedia = createMatchMedia(false);
      expect(getInitialTheme()).toBe(THEME_MODES.LIGHT);
      spy.mockRestore();
    });
  });

  describe('useTheme', () => {
    it('在 ThemeProvider 外使用时抛出错误', () => {
      expect(() => {
        renderHook(() => useTheme());
      }).toThrow('useTheme must be used within a ThemeProvider');
    });
  });

  describe('THEME_MODES', () => {
    it('包含三种模式', () => {
      expect(THEME_MODES.LIGHT).toBe('light');
      expect(THEME_MODES.DARK).toBe('dark');
      expect(THEME_MODES.SYSTEM).toBe('system');
    });
  });
});
