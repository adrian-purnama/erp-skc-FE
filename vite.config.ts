import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const root = path.dirname(fileURLToPath(import.meta.url))

const config = defineConfig({
  resolve: {
    tsconfigPaths: true,
    // frappe-gantt only exposes CSS via exports["."].style, not a subpath
    alias: {
      'frappe-gantt-css': path.resolve(
        root,
        'node_modules/frappe-gantt/dist/frappe-gantt.css',
      ),
    },
  },
  plugins: [devtools(), tailwindcss(), tanstackStart(), viteReact()],
})

export default config
