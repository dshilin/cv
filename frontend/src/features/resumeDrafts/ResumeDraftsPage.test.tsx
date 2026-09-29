import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { renderApp } from '../../test/render'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const emptyDrafts: unknown[] = []
const draft = {
  draft_id: 'draft-1', title: 'Новый черновик', created_at: '2026-09-28T10:00:00Z',
  updated_at: '2026-09-28T10:00:00Z', state: 'needs_user_review',
  application_progress: 'none', applied_blocks: 0, total_blocks: 0, blocks: [],
}

it('keeps the selected draft visible when PDF import fails', async () => {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify([{ ...draft, title: 'Исходный черновик' }]), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify(draft), { status: 201 }))
    .mockResolvedValueOnce(new Response(JSON.stringify(emptyDrafts), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ detail: 'invalid document' }), { status: 422 }))
  vi.stubGlobal('fetch', fetchMock)
  renderApp('/resume-drafts')

  fireEvent.click(await screen.findByRole('button', { name: 'Создать черновик' }))
  await screen.findByRole('heading', { name: 'Редактирование черновика' })
  const file = new File(['broken'], 'resume.pdf', { type: 'application/pdf' })
  fireEvent.change(screen.getByLabelText(/Импортировать PDF\/DOCX/), { target: { files: [file] } })

  expect(await screen.findByRole('alert')).toHaveTextContent('Файл не удалось прочитать. Загрузите PDF с текстом или DOCX.')
  expect(screen.getByDisplayValue('Новый черновик')).toBeVisible()
})

it('creates a draft explicitly and adds a separate experience block', async () => {
  const listed = [{ ...draft }]
  const updated = {
    ...draft, total_blocks: 1,
    blocks: [{ id: 'block-1', kind: 'experience', heading: null, text: 'QA automation', ordinal: 0 }],
  }
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify(emptyDrafts), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify(draft), { status: 201 }))
    .mockResolvedValueOnce(new Response(JSON.stringify(listed), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify(updated), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify(listed), { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
  renderApp('/resume-drafts')

  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
  fireEvent.click(screen.getByRole('button', { name: 'Создать черновик' }))
  await screen.findByRole('heading', { name: 'Редактирование черновика' })
  fireEvent.change(screen.getByLabelText('Описание места работы'), { target: { value: 'QA automation' } })
  fireEvent.click(screen.getByRole('button', { name: 'Добавить блок опыта' }))

  expect(await screen.findByDisplayValue('QA automation')).toBeVisible()
  expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/v1/resume-drafts', expect.objectContaining({ method: 'POST' }))
  expect(fetchMock).toHaveBeenNthCalledWith(4, '/api/v1/resume-drafts/draft-1/experience-blocks', expect.objectContaining({ method: 'POST' }))
})
