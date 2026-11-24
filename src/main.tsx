import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Development only: a service worker registered by an earlier dev session keeps
// serving a precached index.html (and its stale CSP), which makes the app look
// disconnected from the API. Remove those registrations and their caches so the
// dev server is always what the browser loads. Production is untouched.
if (import.meta.env.DEV && 'serviceWorker' in navigator) {
  void navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const registration of registrations) void registration.unregister()
  })
  if ('caches' in window) {
    void caches.keys().then((keys) => {
      for (const key of keys) void caches.delete(key)
    })
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
