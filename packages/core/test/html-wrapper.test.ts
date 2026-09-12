import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { HtmlWrapper } from '../../template/src/render/HtmlWrapper'

const createWrapper = (cssDir: string, imageDir: string) => {
  return new HtmlWrapper({
    getResourcePaths: () => ({ cssDir, imageDir })
  } as any)
}

describe('HtmlWrapper', () => {
  it('falls back to main.css when the legacy karin-plugin-kkk.css file is absent', () => {
    const workspaceDir = mkdtempSync(path.join(tmpdir(), 'kkk-html-wrapper-'))
    const cssDir = path.join(workspaceDir, 'css')
    const imageDir = path.join(workspaceDir, 'image')

    mkdirSync(cssDir, { recursive: true })
    mkdirSync(imageDir, { recursive: true })
    writeFileSync(path.join(cssDir, 'main.css'), '.external-post { color: rgb(17, 24, 39); }', 'utf8')

    const wrapper = createWrapper(cssDir, imageDir)
    const styles = wrapper.getInlineStyles(path.join(workspaceDir, 'external-post.html'), false)

    expect(styles).toContain('.external-post { color: rgb(17, 24, 39); }')
  })

  it('wraps rendered pages with a white default body background', () => {
    const workspaceDir = mkdtempSync(path.join(tmpdir(), 'kkk-html-wrapper-'))
    const cssDir = path.join(workspaceDir, 'css')
    const imageDir = path.join(workspaceDir, 'image')

    mkdirSync(cssDir, { recursive: true })
    mkdirSync(imageDir, { recursive: true })
    writeFileSync(path.join(cssDir, 'main.css'), '', 'utf8')

    const wrapper = createWrapper(cssDir, imageDir)
    const html = wrapper.wrapContent('<div id="container">content</div>', path.join(workspaceDir, 'external-post.html'), false)

    expect(html).toContain('background: #ffffff !important;')
  })

  it('strips remote HarmonyOS font faces and falls back to the local system font stack', () => {
    const workspaceDir = mkdtempSync(path.join(tmpdir(), 'kkk-html-wrapper-'))
    const cssDir = path.join(workspaceDir, 'css')
    const imageDir = path.join(workspaceDir, 'image')

    mkdirSync(cssDir, { recursive: true })
    mkdirSync(imageDir, { recursive: true })
    writeFileSync(
      path.join(cssDir, 'main.css'),
      [
        '@font-face {',
        '  font-family: HarmonyOSHans-Regular;',
        '  src: url("http://localhost:3780/config/commonResource/font/HarmonyOS_Sans_SC_Light.1.woff2") format("woff2");',
        '}',
        '.external-post {',
        '  font-family: HarmonyOSHans-Regular, bilifont, fansmedal-num;',
        '}'
      ].join('\n'),
      'utf8'
    )

    const wrapper = createWrapper(cssDir, imageDir)
    const styles = wrapper.getInlineStyles(path.join(workspaceDir, 'external-post.html'), false)
    const html = wrapper.wrapContent('<div id="container">content</div>', path.join(workspaceDir, 'external-post.html'), false)

    expect(styles).not.toContain('http://localhost:3780/config/commonResource/font/')
    expect(styles).not.toContain('@font-face')
    expect(styles).toContain('font-family: var(--kkk-sans-font), bilifont, fansmedal-num;')
    expect(html).toContain('--kkk-sans-font:')
    expect(html).toContain('font-family: var(--kkk-sans-font);')
  })
})
