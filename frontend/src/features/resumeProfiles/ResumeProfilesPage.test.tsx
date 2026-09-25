import { cleanup, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { renderApp } from '../../test/render'
import { fixtureProfileService, fixtureSearchService } from '../../services/fixtures'
import { fireEvent } from '@testing-library/react'

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

it('uses backend profile API without invoking legacy fixture services', async () => {
  const legacyProfile = vi.spyOn(fixtureProfileService, 'load')
  const legacySearch = vi.spyOn(fixtureSearchService, 'list')
  const fetchMock = vi.fn().mockResolvedValue(new Response('[]', { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
  renderApp('/resume-profiles')
  expect(screen.getByRole('heading', { name: 'Профили резюме' })).toBeVisible()
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/v1/profiles', expect.anything()))
  expect(legacyProfile).not.toHaveBeenCalled()
  expect(legacySearch).not.toHaveBeenCalled()
})

it('shows a clear import error without replacing the selected draft', async () => {
  const current = { draft_id: 'draft-1', state: 'needs_user_review', blocks: [] }
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(new Response('[]', { status: 200 }))
    .mockResolvedValueOnce(new Response('[]', { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify(current), { status: 201 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ detail: 'invalid document' }), { status: 422 }))
  vi.stubGlobal('fetch', fetchMock)
  renderApp('/resume-profiles')
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
  fireEvent.click(screen.getByRole('button', { name: 'Создать черновик' }))
  await waitFor(() => expect(screen.getByRole('heading', { name: /Черновик/ })).toBeVisible())
  const file = new File(['broken'], 'resume.pdf', { type: 'application/pdf' })
  fireEvent.change(screen.getByLabelText(/Импортировать PDF\/DOCX/), { target: { files: [file] } })
  expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось получить или распознать данные файла')
  expect(screen.getByRole('heading', { name: /изменения сохраняются/ })).toBeVisible()
})

it('creates a draft only on explicit action and adds experience text to that draft', async () => {
  const draft = { draft_id: 'draft-1', state: 'needs_user_review', blocks: [] }
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(new Response('[]', { status: 200 }))
    .mockResolvedValueOnce(new Response('[]', { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify(draft), { status: 201 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ ...draft, blocks: [{ id: 'block-1', kind: 'experience', heading: null, text: 'QA automation', ordinal: 0 }] }), { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
  renderApp('/resume-profiles')

  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/v1/profiles', expect.anything()))
  expect(fetchMock).toHaveBeenCalledTimes(2)
  fireEvent.click(screen.getByRole('button', { name: 'Создать черновик' }))
  await waitFor(() => expect(screen.getByRole('heading', { name: /Черновик/ })).toBeVisible())
  fireEvent.change(screen.getByLabelText('Текст блока опыта'), { target: { value: 'QA automation' } })
  fireEvent.click(screen.getByRole('button', { name: 'Добавить блок опыта' }))
  await waitFor(() => expect(screen.getByDisplayValue('QA automation')).toBeVisible())
  expect(fetchMock).toHaveBeenNthCalledWith(3, '/api/v1/resume-drafts', expect.objectContaining({ method: 'POST' }))
  expect(fetchMock).toHaveBeenNthCalledWith(4, '/api/v1/resume-drafts/draft-1/experience-blocks', expect.objectContaining({ method: 'POST' }))
})
