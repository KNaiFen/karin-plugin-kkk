import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ fetchData: vi.fn() }))

vi.mock('amagi/model/networks', () => ({
  fetchData: state.fetchData,
  isNetworkErrorResult: () => false
}))

vi.mock('../../amagi/packages/core/src/platform/xiaohongshu/sign', () => ({
  xiaohongshuSign: {
    generateXSPost: () => 'test-sign',
    extractA1FromCookie: () => 'test-a1',
    generateXSCommon: () => 'test-common',
    generateXT: () => '1'
  }
}))

const { fetchNoteDetail } = await import('../../amagi/packages/core/src/model/fetchers/xiaohongshu/note')

describe('amagi xiaohongshu note detail request', () => {
  const options = { note_id: 'note-1', xsec_token: 'test-token' }

  beforeEach(() => {
    state.fetchData.mockReset()
  })

  it('returns a usable API note without requesting the HTML fallback', async () => {
    const apiDetail = {
      code: 0,
      success: true,
      data: { items: [{ note_card: { note_id: 'note-1', title: 'API 笔记' } }] }
    }
    state.fetchData.mockResolvedValueOnce(apiDetail)

    const result = await fetchNoteDetail(options)

    expect(result.success).toBe(true)
    expect(result.data).toBe(apiDetail)
    expect(state.fetchData).toHaveBeenCalledTimes(1)
  })

  it.each(['<html>', '<html lang="zh-CN">'])('uses the HTML note when the API is empty (%s)', async (htmlTag) => {
    const pageState = {
      note: {
        noteDetailMap: {
          'note-1': {
            note: { noteId: 'note-1', title: '网页笔记', type: 'video' }
          }
        }
      }
    }
    state.fetchData
      .mockResolvedValueOnce({ code: 0, success: true, data: { items: [] } })
      .mockResolvedValueOnce(`<!DOCTYPE html>${htmlTag}<script>window.__INITIAL_STATE__=${JSON.stringify(pageState)}</script></html>`)

    const result = await fetchNoteDetail(options)

    expect(result.success).toBe(true)
    expect(result.data.data.items[0]?.note_card).toMatchObject({
      note_id: 'note-1',
      title: '网页笔记',
      xsec_token: 'test-token'
    })
    expect(state.fetchData).toHaveBeenCalledTimes(2)
    expect(state.fetchData.mock.calls[1][0]).toMatchObject({
      method: 'GET',
      url: 'https://www.xiaohongshu.com/discovery/item/note-1?xsec_token=test-token'
    })
  })

  it('keeps the API failure when the fallback page has no note', async () => {
    state.fetchData
      .mockResolvedValueOnce({ code: 300012, msg: '网络连接异常' })
      .mockResolvedValueOnce('<html lang="zh-CN"><body>暂时无法访问</body></html>')

    const result = await fetchNoteDetail(options)

    expect(result.success).toBe(false)
    expect(result.error).toMatchObject({
      errorDescription: expect.stringContaining('网络连接异常')
    })
    expect(state.fetchData).toHaveBeenCalledTimes(2)
  })

  it.each(['User-Agent', 'user-agent'])('aligns API and HTML Client Hints with the configured %s', async (headerName) => {
    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0'
    const pageState = {
      note: { noteDetailMap: { 'note-1': { note: { noteId: 'note-1', title: '网页笔记', type: 'video' } } } }
    }
    state.fetchData
      .mockResolvedValueOnce({ code: 0, success: false, data: {}, msg: '' })
      .mockResolvedValueOnce(`<html><script>window.__INITIAL_STATE__=${JSON.stringify(pageState)}</script></html>`)

    const result = await fetchNoteDetail(options, 'test-cookie', { headers: { [headerName]: userAgent } })

    expect(result.data.data.items[0]?.note_card?.note_id).toBe('note-1')
    expect(state.fetchData).toHaveBeenCalledTimes(2)
    for (const [config] of state.fetchData.mock.calls) {
      expect(config.headers['user-agent']).toBe(userAgent)
      expect(config.headers['sec-ch-ua']).toBe('"Not_A Brand";v="99", "Chromium";v="149", "Google Chrome";v="149"')
    }
  })
})
