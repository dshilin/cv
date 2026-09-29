import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { SettingsPage } from './SettingsPage'
import type { LLMConnectionService, LLMConnectionSummary } from '../../services/llm-connections'

const newConnection: LLMConnectionSummary = {
  id: 'llm-1', provider: 'gigachat', settings: { scope: 'B2B' },
  default_model: 'GigaChat-Pro', status: 'pending', last_tested_at: null,
  created_at: '2026-09-28T09:00:00Z', updated_at: '2026-09-28T09:00:00Z',
}

it('saves and tests a GigaChat key, then clears the secret field and shows verified status', async () => {
  const service: LLMConnectionService = {
    list: vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([{ ...newConnection, status: 'verified' }]),
    create: vi.fn().mockResolvedValue(newConnection),
    testConnection: vi.fn().mockResolvedValue({
      id: 'llm-1', provider: 'gigachat', model: 'GigaChat-Pro', ok: true,
      status: 'verified', error_category: null, tested_at: '2026-09-28T10:00:00Z',
    }),
  }
  render(<SettingsPage llmService={service} />)

  expect(await screen.findByRole('heading', { name: 'Подключение LLM' })).toBeVisible()
  fireEvent.change(screen.getByLabelText('Провайдер'), { target: { value: 'gigachat' } })
  fireEvent.change(screen.getByLabelText('Ключ авторизации GigaChat'), { target: { value: 'private-key' } })
  fireEvent.change(screen.getByLabelText('Область доступа'), { target: { value: 'B2B' } })
  fireEvent.change(screen.getByLabelText('Модель'), { target: { value: 'GigaChat-Pro' } })
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить и проверить' }))

  await waitFor(() => expect(service.testConnection).toHaveBeenCalledWith('llm-1'))
  expect(service.create).toHaveBeenCalledWith({
    provider: 'gigachat', settings: { scope: 'B2B' },
    credentials: { authorization_key: 'private-key' }, default_model: 'GigaChat-Pro',
  })
  expect(await screen.findByRole('status')).toHaveTextContent('Подключение проверено')
  expect(screen.getByLabelText('Ключ авторизации GigaChat')).toHaveValue('')
  expect(screen.getByRole('listitem')).toHaveTextContent('GigaChat-Pro')
  expect(screen.getByRole('listitem')).toHaveTextContent('Проверено')
})

it('shows only provider-specific OpenAI-compatible fields and maps failed test categories', async () => {
  const service: LLMConnectionService = {
    list: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({
      ...newConnection, provider: 'openai_compatible', settings: { base_url: 'https://llm.example/v1' },
    }),
    testConnection: vi.fn().mockResolvedValue({
      id: 'llm-1', provider: 'openai_compatible', model: 'model-x', ok: false,
      status: 'failed', error_category: 'invalid_credentials', tested_at: '2026-09-28T10:00:00Z',
    }),
  }
  render(<SettingsPage llmService={service} />)

  await screen.findByRole('heading', { name: 'Подключение LLM' })
  fireEvent.change(screen.getByLabelText('Провайдер'), { target: { value: 'openai_compatible' } })

  expect(screen.getByLabelText('HTTPS URL API')).toBeVisible()
  expect(screen.getByLabelText('API-ключ')).toBeVisible()
  expect(screen.queryByLabelText('Folder ID')).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Ключ авторизации GigaChat')).not.toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('HTTPS URL API'), { target: { value: 'https://llm.example/v1' } })
  fireEvent.change(screen.getByLabelText('API-ключ'), { target: { value: 'bad-key' } })
  fireEvent.change(screen.getByLabelText('Модель'), { target: { value: 'model-x' } })
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить и проверить' }))

  expect(await screen.findByRole('alert')).toHaveTextContent('Провайдер отклонил ключ. Проверьте его и права доступа.')
  expect(screen.getByLabelText('API-ключ')).toHaveValue('')
})

it.each([
  { provider: 'openai' as const, keyLabel: 'API-ключ', credentialName: 'api_key', settings: {}, field: null },
  { provider: 'yandexgpt' as const, keyLabel: 'API-ключ', credentialName: 'api_key', settings: { folder_id: 'folder-123' }, field: ['Folder ID', 'folder-123'] },
])('submits $provider with backend credential and setting field names', async ({ provider, keyLabel, credentialName, settings, field }) => {
  const service: LLMConnectionService = {
    list: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({ ...newConnection, provider, settings }),
    testConnection: vi.fn().mockResolvedValue({
      id: 'llm-1', provider, model: 'model-x', ok: true,
      status: 'verified', error_category: null, tested_at: '2026-09-28T10:00:00Z',
    }),
  }
  render(<SettingsPage llmService={service} />)
  await screen.findByRole('heading', { name: 'Подключение LLM' })
  fireEvent.change(screen.getByLabelText('Провайдер'), { target: { value: provider } })
  if (field) fireEvent.change(screen.getByLabelText(field[0]), { target: { value: field[1] } })
  fireEvent.change(screen.getByLabelText(keyLabel), { target: { value: 'provider-key' } })
  fireEvent.change(screen.getByLabelText('Модель'), { target: { value: 'model-x' } })
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить и проверить' }))

  await waitFor(() => expect(service.create).toHaveBeenCalledWith({
    provider, settings, credentials: { [credentialName]: 'provider-key' }, default_model: 'model-x',
  }))
})

it('does not present unimplemented fixture automation or data deletion as real settings', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('backend unavailable')))
  render(<SettingsPage />)

  expect(await screen.findByRole('heading', { name: 'Настройки' })).toBeVisible()
  expect(screen.getByText(/станут доступны после подключения соответствующих сервисов/)).toBeVisible()
  expect(screen.queryByRole('button', { name: 'Отключить автоматизацию' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Отозвать согласие' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Удалить данные' })).not.toBeInTheDocument()
})
