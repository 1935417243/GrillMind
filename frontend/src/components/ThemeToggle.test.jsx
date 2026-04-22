import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, THEME_MODES } from '../store/ThemeContext';
import { ToastProvider } from './Toast';
import ThemeToggle from './ThemeToggle';

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

function renderWithProviders(ui) {
  window.matchMedia = createMatchMedia(false);
  return render(
    <ThemeProvider>
      <ToastProvider>
        {ui}
      </ToastProvider>
    </ThemeProvider>,
  );
}

describe('ThemeToggle', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    window.matchMedia = createMatchMedia(false);
  });

  it('渲染主题切换按钮', () => {
    renderWithProviders(<ThemeToggle />);
    expect(screen.getByLabelText('切换主题')).toBeInTheDocument();
  });

  it('显示当前主题标签', () => {
    renderWithProviders(<ThemeToggle />);
    expect(screen.getByText('跟随系统')).toBeInTheDocument();
  });

  it('点击按钮打开下拉菜单', () => {
    renderWithProviders(<ThemeToggle />);
    const btn = screen.getByLabelText('切换主题');
    fireEvent.click(btn);
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('下拉菜单包含三个主题选项', () => {
    renderWithProviders(<ThemeToggle />);
    const btn = screen.getByLabelText('切换主题');
    fireEvent.click(btn);
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(3);
  });

  it('选择浅色模式后关闭菜单并应用主题', () => {
    renderWithProviders(<ThemeToggle />);
    const btn = screen.getByLabelText('切换主题');
    fireEvent.click(btn);

    const lightOption = screen.getByRole('option', { name: /浅色模式/ });
    fireEvent.click(lightOption);

    expect(document.documentElement.getAttribute('data-theme')).toBe(THEME_MODES.LIGHT);
    expect(localStorage.getItem('grillmind-theme-preference')).toBe(THEME_MODES.LIGHT);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('选择深色模式后关闭菜单并应用主题', () => {
    renderWithProviders(<ThemeToggle />);
    const btn = screen.getByLabelText('切换主题');
    fireEvent.click(btn);

    const darkOption = screen.getByRole('option', { name: /深色模式/ });
    fireEvent.click(darkOption);

    expect(document.documentElement.getAttribute('data-theme')).toBe(THEME_MODES.DARK);
    expect(localStorage.getItem('grillmind-theme-preference')).toBe(THEME_MODES.DARK);
  });

  it('点击外部区域关闭下拉菜单', () => {
    renderWithProviders(
      <div>
        <div data-testid="outside">外部</div>
        <ThemeToggle />
      </div>,
    );

    const btn = screen.getByLabelText('切换主题');
    fireEvent.click(btn);
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByTestId('outside'));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('按 Escape 关闭下拉菜单', () => {
    renderWithProviders(<ThemeToggle />);
    const btn = screen.getByLabelText('切换主题');
    fireEvent.click(btn);
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('当前选中项有 active 状态', () => {
    renderWithProviders(<ThemeToggle />);
    const btn = screen.getByLabelText('切换主题');
    fireEvent.click(btn);

    const systemOption = screen.getByRole('option', { name: /跟随系统/ });
    expect(systemOption).toHaveAttribute('aria-selected', 'true');
  });
});
