import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/export/richtext.ts'],
  format: ['esm'],
  target: 'es2022',
  outDir: 'lib/core_chunk',
  root: 'src/export',
  deps: {
    onlyBundle: false,
    neverBundle: ['axios']
  },
  dts: {
    emitDtsOnly: true,
    build: false,
    resolver: 'oxc',
    tsconfig: false,
    compilerOptions: {
      baseUrl: '.',
      moduleResolution: 'bundler',
      paths: {
        '@kkk/richtext': ['../richtext/src/index.ts'],
        '@kkk/template-contracts': ['../template-contracts/src/index.ts'],
        'template/server': ['../template/src/server.ts']
      }
    }
  },
  clean: false
})
