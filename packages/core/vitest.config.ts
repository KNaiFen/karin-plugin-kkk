import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: '@ikenxuan/amagi', replacement: resolve(__dirname, '../amagi/packages/core/src/index.ts') },
      { find: '@kkk/template-contracts', replacement: resolve(__dirname, '../template-contracts/src/index.ts') },
      { find: 'template/server', replacement: resolve(__dirname, '../template/src/server.ts') },
      { find: /^amagi\//, replacement: `${resolve(__dirname, '../amagi/packages/core/src')}/` },
      { find: /^@\//, replacement: `${resolve(__dirname, './src')}/` }
    ]
  },
  test: {
    include: ['test/**/*.test.ts']
  }
})
