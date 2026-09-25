import { afterEach, expect, it, vi } from 'vitest'
import { createResumeProfileApi } from './resume-profiles'

afterEach(() => vi.unstubAllGlobals())

it('sends profile creation to the backend API and returns the saved record', async () => {
  const profile = { id: 'p1', name: 'QA', target_roles: [], search_preferences: {}, headline: null,
    summary: null, section_order: [], text_overrides: {}, candidate_item_ids: [], skill_ids: [], tool_ids: [] }
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(profile), { status: 201 }))
  vi.stubGlobal('fetch', fetchMock)
  const api = createResumeProfileApi('/api/v1')
  await expect(api.create('QA')).resolves.toEqual(profile)
  expect(fetchMock).toHaveBeenCalledWith('/api/v1/profiles', expect.objectContaining({ method: 'POST' }))
})

it('sends profile edits to the backend instead of updating local-only fixtures', async () => {
  const profile = { id: 'p1', name: 'QA', headline: 'QA lead' }
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(profile), { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
  await createResumeProfileApi('/api/v1').update('p1', { headline: 'QA lead' })
  expect(fetchMock).toHaveBeenCalledWith('/api/v1/profiles/p1', expect.objectContaining({ method: 'PATCH' }))
})
