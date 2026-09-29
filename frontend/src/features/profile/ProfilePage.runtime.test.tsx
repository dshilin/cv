import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { renderApp } from '../../test/render'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it('loads the real candidate identity and never renders the bundled example profile', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
    full_name: 'Ada Lovelace', contacts: [{ id: 'contact-1', kind: 'contact', label: 'Email', value: 'ada@example.test', status: 'confirmed' }],
  }), { status: 200 })))
  renderApp('/profile')

  expect(await screen.findByDisplayValue('Ada Lovelace')).toBeVisible()
  expect(screen.getByDisplayValue('ada@example.test')).toBeVisible()
  expect(screen.queryByText('Example Person')).not.toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Профиль опыта пока пуст' })).toBeVisible()
}, 15_000)

it('saves the candidate name from the profile page to the shared candidate base', async () => {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ full_name: null, contacts: [] }), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ full_name: 'Ada Lovelace', contacts: [] }), { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
  renderApp('/profile')

  const name = await screen.findByLabelText('Имя кандидата, которое будет показано в резюме')
  fireEvent.change(name, { target: { value: 'Ada Lovelace' } })
  fireEvent.blur(name)
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/v1/candidate-base', expect.objectContaining({
    method: 'PATCH', body: JSON.stringify({ full_name: 'Ada Lovelace' }),
  })))
})

it('adds a shared contact from the profile page through the candidate base API', async () => {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ full_name: 'Ada Lovelace', contacts: [] }), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'contact-1', kind: 'contact', label: 'Email', value: 'ada@example.test', status: 'confirmed' }), { status: 201 }))
  vi.stubGlobal('fetch', fetchMock)
  renderApp('/profile')

  fireEvent.change(await screen.findByLabelText('Тип'), { target: { value: 'Email' } })
  fireEvent.change(screen.getByLabelText('Контакт'), { target: { value: 'ada@example.test' } })
  fireEvent.click(screen.getByRole('button', { name: 'Добавить контакт' }))
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/v1/candidate-base/contacts', expect.objectContaining({
    method: 'POST', body: JSON.stringify({ kind: 'contact', label: 'Email', value: 'ada@example.test' }),
  })))
  expect(await screen.findByDisplayValue('ada@example.test')).toBeVisible()
})
