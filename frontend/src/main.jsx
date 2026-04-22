import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'

function getInitialTheme() {
  try {
    const pref = localStorage.getItem('grillmind-theme-preference') || 'system';
    if (pref === 'system') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return pref;
  } catch {
    return 'light';
  }
}

document.documentElement.setAttribute('data-theme', getInitialTheme());

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
