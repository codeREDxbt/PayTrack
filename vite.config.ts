import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      // No service worker in dev: a precached index.html there keeps serving an
      // old document (and its old CSP), so the client can appear unable to reach
      // the API until the registration is cleared. Production builds still ship
      // the PWA.
      devOptions: {
        enabled: false
      },

      manifest: {
        name: 'Salary Tracker v1.4',
        short_name: 'PayTrack',
        description: 'Employee attendance and payroll management',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone',
        icons: [
          {
            src: '/vite.svg',
            sizes: '192x192',
            type: 'image/svg+xml'
          },
          {
            src: '/vite.svg',
            sizes: '512x512',
            type: 'image/svg+xml'
          }
        ]
      }
    })
  ],
})
