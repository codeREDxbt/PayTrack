import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * The CSP in index.html only allows loopback API origins, which is right for
 * local development. A deployed client calls a remote API, so when
 * VITE_API_URL points somewhere else its origin is added to connect-src at
 * build time. Local builds are left untouched.
 */
function allowApiOriginInCsp(apiUrl?: string): Plugin {
  let origin = ''
  try {
    origin = apiUrl ? new URL(apiUrl).origin : ''
  } catch {
    origin = ''
  }
  const isLoopback = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)

  return {
    name: 'paytrack-csp-api-origin',
    transformIndexHtml(html) {
      if (!origin || isLoopback) return html
      return html.replace(
        "connect-src 'self' http://localhost:* http://127.0.0.1:*",
        `connect-src 'self' http://localhost:* http://127.0.0.1:* ${origin}`,
      )
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
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
      }),
      allowApiOriginInCsp(env.VITE_API_URL),
    ],
  }
})
