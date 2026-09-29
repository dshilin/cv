import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { renderApp } from '../../test/render'
import { fixtureProfileService, fixtureSearchService } from '../../services/fixtures'

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

const emptyCandidateBase = { full_name: null, contacts: [] }

it('uses backend profile and candidate APIs without legacy fixture services', async () => {
  const legacyProfile = vi.spyOn(fixtureProfileService, 'load')
  const legacySearch = vi.spyOn(fixtureSearchService, 'list')
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(new Response('[]', { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify(emptyCandidateBase), { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
  renderApp('/resume-profiles')

  expect(screen.getByRole('heading', { name: 'Профили специализации' })).toBeVisible()
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/v1/profiles', expect.anything()))
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/v1/candidate-base', expect.anything()))
  expect(legacyProfile).not.toHaveBeenCalled()
  expect(legacySearch).not.toHaveBeenCalled()
})

it('saves the candidate name to the shared candidate base', async () => {
  const savedCandidateBase = { full_name: 'Ada Lovelace', contacts: [] }
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(new Response('[]', { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify(emptyCandidateBase), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify(savedCandidateBase), { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
  renderApp('/resume-profiles')

  const name = await screen.findByLabelText('Имя кандидата, которое будет показано в резюме')
  fireEvent.change(name, { target: { value: 'Ada Lovelace' } })
  fireEvent.blur(name)
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/v1/candidate-base', expect.objectContaining({
    method: 'PATCH', body: JSON.stringify({ full_name: 'Ada Lovelace' }),
  })))
})

it('creates a specialization profile through the backend', async () => {
  const profile = {
    id: 'profile-1', name: 'AI Engineer', target_roles: [], search_preferences: {},
    headline: null, summary: null, section_order: [], text_overrides: {},
    candidate_item_ids: [], skill_ids: [], tool_ids: [],
  }
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(new Response('[]', { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify(emptyCandidateBase), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify(profile), { status: 201 }))
  vi.stubGlobal('fetch', fetchMock)
  renderApp('/resume-profiles')

  fireEvent.change(await screen.findByLabelText('Название профиля'), { target: { value: 'AI Engineer' } })
  fireEvent.click(screen.getByRole('button', { name: 'Создать профиль' }))
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/v1/profiles', expect.objectContaining({
    method: 'POST', body: JSON.stringify({ name: 'AI Engineer' }),
  })))
  expect(screen.getByDisplayValue('AI Engineer')).toBeVisible()
})
