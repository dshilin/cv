import { afterEach, expect, it, vi } from 'vitest'
import { createLLMConnectionApi } from './llm-connections'

afterEach(() => vi.unstubAllGlobals())

it('loads owner connection summaries without requesting or returning credentials', async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([{
    id: 'connection-1', provider: 'openai', settings: {}, default_model: 'gpt-test',
    status: 'verified', last_tested_at: '2026-09-28T10:00:00Z',
    created_at: '2026-09-28T09:00:00Z', updated_at: '2026-09-28T10:00:00Z',
  }]), { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)

  const connections = await createLLMConnectionApi('/api/v1').list()

  expect(fetchMock).toHaveBeenCalledWith('/api/v1/llm-connections', expect.objectContaining({ method: 'GET' }))
  expect(connections[0]).toMatchObject({ provider: 'openai', status: 'verified' })
  expect(connections[0]).not.toHaveProperty('credentials')
})

it('creates a provider connection with its provider-specific settings and tests the saved connection', async () => {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({
      id: 'connection-2', provider: 'gigachat', settings: { scope: 'B2B' },
      default_model: 'GigaChat-Pro', status: 'pending', last_tested_at: null,
      created_at: '2026-09-28T09:00:00Z', updated_at: '2026-09-28T09:00:00Z',
    }), { status: 201 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({
      id: 'connection-2', provider: 'gigachat', model: 'GigaChat-Pro',
      ok: true, status: 'verified', error_category: null, tested_at: '2026-09-28T10:00:00Z',
    }), { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
  const api = createLLMConnectionApi('/api/v1')

  const created = await api.create({
    provider: 'gigachat', settings: { scope: 'B2B' },
    credentials: { authorization_key: 'private-key' }, default_model: 'GigaChat-Pro',
  })
  const testResult = await api.testConnection(created.id)

  expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/v1/llm-connections', expect.objectContaining({
    method: 'POST',
    body: JSON.stringify({
      provider: 'gigachat', settings: { scope: 'B2B' },
      credentials: { authorization_key: 'private-key' }, default_model: 'GigaChat-Pro',
    }),
  }))
  expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/v1/llm-connections/connection-2/test', expect.objectContaining({ method: 'POST' }))
  expect(testResult.ok).toBe(true)
})

it('raises an HTTP status error without exposing an untrusted response body', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('private-key-from-upstream', { status: 503 })))

  await expect(createLLMConnectionApi('/api/v1').list()).rejects.toMatchObject({ status: 503 })
  await expect(createLLMConnectionApi('/api/v1').list()).rejects.not.toThrow('private-key-from-upstream')
})
