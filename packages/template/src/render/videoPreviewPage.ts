import path from 'node:path'

import React from 'react'
import { renderToString } from 'react-dom/server'

import { PreviewLayout } from '../dev/preview/components/PreviewLayout'
import type { PreviewState as DevPreviewState } from '../dev/preview/types'
import { HtmlWrapper } from './HtmlWrapper'
import { ResourcePathManager } from './ResourcePathManager'
import type { TemplateResourcePaths } from './types'

export type VideoPreviewRenderOptions = {
  filename: string
  filePath: string
  videoUrl: string
  removeCache: boolean
  createdAt: number
  expireAt?: number
  eventsUrl?: string
  resourcePaths?: TemplateResourcePaths
}

type VideoPreviewState = DevPreviewState & {
  serverNow: number
}

const VideoPreviewApp: React.FC<{ state: VideoPreviewState }> = ({ state }) => {
  return React.createElement(PreviewLayout, { state })
}

const escapeVideoPreviewJson = (data: unknown): string => {
  return JSON.stringify(data).replace(/</g, '\\u003c')
}

export const renderVideoPreviewPage = (options: VideoPreviewRenderOptions): string => {
  const serverNow = Date.now()
  const remainingMs = options.removeCache && options.expireAt
    ? Math.max(options.expireAt - serverNow, 0)
    : null
  const state: VideoPreviewState = {
    ...options,
    eventsUrl: options.eventsUrl ?? '',
    serverNow,
    remainingMs,
    removed: false
  }
  const appHtml = renderToString(React.createElement(VideoPreviewApp, { state }))
  const serializedState = escapeVideoPreviewJson(state)
  const resourceManager = new ResourcePathManager(options.resourcePaths)
  const htmlWrapper = new HtmlWrapper(resourceManager)
  const cssContent = htmlWrapper.getInlineStyles(path.join(process.cwd(), 'video-preview.html'), false)

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>临时预览</title>
  <style>
    * { box-sizing: border-box; }
    :root { --preview-bg: #ffffff; --preview-fg: #0f172a; --preview-muted: #64748b; }
    @media (prefers-color-scheme: dark) {
      :root { --preview-bg: #050505; --preview-fg: #e2e8f0; --preview-muted: #94a3b8; }
    }
    body { margin: 0; font-family: "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; background: var(--preview-bg); color: var(--preview-fg); }
    .preview-noise { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)' opacity='0.25'/%3E%3C/svg%3E"); mix-blend-mode: soft-light; opacity: 0.8; }
    @media (max-width: 720px) {
      .max-w-6xl { padding-left: 16px; padding-right: 16px; }
    }
  </style>
  <style>${cssContent}</style>
</head>
<body>
  <div id="app">${appHtml}</div>
  <script>
    window.__VIDEO_PREVIEW__=${serializedState};
    (() => {
      const state = window.__VIDEO_PREVIEW__ || {};
      const countdownEl = document.getElementById('preview-countdown');
      if (!countdownEl) return;
      const format = (ms) => {
        const totalSeconds = Math.max(Math.floor(ms / 1000), 0);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        const pad = (value) => String(value).padStart(2, '0');
        return hours > 0 ? pad(hours) + ':' + pad(minutes) + ':' + pad(seconds) : pad(minutes) + ':' + pad(seconds);
      };
      const update = (payload) => {
        if (!payload.removeCache) {
          countdownEl.textContent = '不删除';
          return;
        }
        if (payload.removed) {
          countdownEl.textContent = '00:00';
          return;
        }
        const remainingMs = typeof payload.remainingMs === 'number'
          ? payload.remainingMs
          : (payload.expireAt ? Math.max(payload.expireAt - (payload.serverNow || Date.now()), 0) : null);
        if (remainingMs === null) {
          countdownEl.textContent = '--:--';
          return;
        }
        countdownEl.textContent = format(remainingMs);
      };
      update(state);
      if (state.eventsUrl) {
        const source = new EventSource(state.eventsUrl);
        source.onmessage = (event) => {
          try {
            update(JSON.parse(event.data));
          } catch {}
        };
      }
    })();
  </script>
</body>
</html>`
}
