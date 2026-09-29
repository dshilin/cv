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

it('saves a title and multiple edited blocks in one backend request', async () => {
  const fullDraft = {
    ...draft, total_blocks: 2,
    blocks: [
      { id: 'block-1', kind: 'experience', heading: null, text: 'Old role', ordinal: 0 },
      { id: 'block-2', kind: 'skills', heading: 'Навыки', text: 'Python', ordinal: 1 },
    ],
  }
  const savedDraft = {
    ...fullDraft, title: 'Updated resume',
    blocks: [
      { ...fullDraft.blocks[0], text: 'New role' },
      { ...fullDraft.blocks[1], text: 'Python, SQL' },
    ],
  }
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify([{ ...draft, blocks: undefined }]), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify(fullDraft), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify(savedDraft), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify([savedDraft]), { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
  renderApp('/resume-drafts')

  fireEvent.click(await screen.findByRole('button', { name: /Новый черновик/ }))
  await screen.findByRole('heading', { name: 'Редактирование черновика' })
  fireEvent.change(screen.getByLabelText('Название черновика'), { target: { value: 'Updated resume' } })
  fireEvent.change(screen.getByLabelText('Текст раздела', { selector: '#draft-block-1' }), { target: { value: 'New role' } })
  fireEvent.change(screen.getByLabelText('Текст раздела', { selector: '#draft-block-2' }), { target: { value: 'Python, SQL' } })
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить черновик' }))

  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4))
  expect(fetchMock).toHaveBeenNthCalledWith(3, '/api/v1/resume-drafts/draft-1', expect.objectContaining({
    method: 'PATCH',
    body: JSON.stringify({
      title: 'Updated resume',
      blocks: [{ id: 'block-1', text: 'New role' }, { id: 'block-2', text: 'Python, SQL' }],
    }),
  }))
  expect(await screen.findByText('Сохранено')).toBeVisible()
})

it('offers contacts from unparsed text for explicit confirmation and preserves the source block', async () => {
  const unparsedText = 'Кандидат: Ada Lovelace\nEmail: ada@example.test'
  const fullDraft = {
    ...draft, total_blocks: 1,
    blocks: [{ id: 'block-raw', kind: 'unparsed', heading: null, text: unparsedText, ordinal: 0 }],
  }
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify([{ ...draft, total_blocks: 1 }]), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify(fullDraft), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'contact-1', kind: 'contact', label: 'Электронная почта', value: 'ada@example.test', status: 'confirmed' }), { status: 201 }))
  vi.stubGlobal('fetch', fetchMock)
  renderApp('/resume-drafts')

  fireEvent.click(await screen.findByRole('button', { name: /Новый черновик/ }))
  const source = await screen.findByLabelText('Текст раздела')
  expect(source).toHaveValue(unparsedText)
  const addContact = await screen.findByRole('button', { name: 'Добавить в общие контакты' })
  fireEvent.click(addContact)

  await waitFor(() => expect(fetchMock).toHaveBeenNthCalledWith(3, '/api/v1/candidate-base/contacts', expect.objectContaining({
    method: 'POST', body: JSON.stringify({ kind: 'contact', label: 'Электронная почта', value: 'ada@example.test' }),
  })))
  expect(source).toHaveValue(unparsedText)
  expect(await screen.findByRole('button', { name: 'Добавлено в общие контакты' })).toBeDisabled()
})
