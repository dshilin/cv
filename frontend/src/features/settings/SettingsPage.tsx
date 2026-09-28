import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import type { SettingsService } from '../../services/contracts'
import { createFixtureApplicationService, createFixtureJobService, createFixtureProfileService, createFixtureSearchService, createFixtureSettingsService, createFixtureSourceService } from '../../services/fixtures'
import { createLLMConnectionApi, LLMApiError } from '../../services/llm-connections'
import type { LLMConnectionInput, LLMConnectionService, LLMConnectionSummary, LLMProvider } from '../../services/llm-connections'

const fixtureSettings = createFixtureSettingsService(
  createFixtureProfileService(),
  createFixtureSourceService(),
  createFixtureSearchService(createFixtureSourceService()),
  createFixtureJobService(),
  createFixtureApplicationService(createFixtureProfileService(), createFixtureJobService()),
)

const defaultLLMService = createLLMConnectionApi()

const providerNames: Record<LLMProvider, string> = {
  openai: 'OpenAI',
  openai_compatible: 'OpenAI-compatible API',
  yandexgpt: 'YandexGPT',
  gigachat: 'GigaChat',
}

const statusNames: Record<LLMConnectionSummary['status'], string> = {
  pending: 'Не проверено',
  verified: 'Проверено',
  failed: 'Ошибка проверки',
  disabled: 'Отключено',
}

const testErrorMessages: Record<string, string> = {
  invalid_credentials: 'Провайдер отклонил ключ. Проверьте его и права доступа.',
  model_unavailable: 'Модель не найдена или недоступна для этого аккаунта.',
  quota_exceeded: 'У провайдера исчерпана квота или баланс.',
  rate_limited: 'Провайдер ограничил частоту запросов. Повторите позже.',
  timeout: 'Провайдер не ответил вовремя. Повторите проверку.',
  provider_error: 'Провайдер временно недоступен. Повторите проверку позже.',
  invalid_response: 'Провайдер вернул неожиданный ответ.',
  invalid_request: 'Провайдер отклонил параметры подключения.',
}

function apiErrorMessage(error: unknown) {
  if (!(error instanceof LLMApiError)) return 'Не удалось связаться с backend. Проверьте соединение и повторите попытку.'
  if (error.status === 401) return 'Для управления подключениями необходимо войти в аккаунт.'
  if (error.status === 403) return 'У вас нет доступа к этому подключению.'
  if (error.status === 422) return 'Проверьте обязательные поля и формат настроек провайдера.'
  if (error.status === 503) return 'Подключение временно недоступно. Проверьте backend и настройку шифрования ключей.'
  return 'Backend не смог выполнить запрос. Повторите попытку.'
}

export function SettingsPage({ service = fixtureSettings, llmService = defaultLLMService }: { service?: SettingsService; llmService?: LLMConnectionService }) {
  const [sourceCount, setSourceCount] = useState(0)
  const [status, setStatus] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [connections, setConnections] = useState<LLMConnectionSummary[]>([])
  const [connectionLoadError, setConnectionLoadError] = useState('')
  const [provider, setProvider] = useState<LLMProvider>('openai')
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [folderId, setFolderId] = useState('')
  const [scope, setScope] = useState('PERS')
  const [model, setModel] = useState('')
  const [connectionBusy, setConnectionBusy] = useState(false)
  const [checkingId, setCheckingId] = useState<string | null>(null)
  const [connectionNotice, setConnectionNotice] = useState<{ text: string; error: boolean } | null>(null)
  useEffect(() => { void service.listSources().then((sources) => setSourceCount(sources.length)) }, [service])
  useEffect(() => {
    let current = true
    llmService.list().then((items) => { if (current) { setConnections(items); setConnectionLoadError('') } })
      .catch((error: unknown) => { if (current) setConnectionLoadError(apiErrorMessage(error)) })
    return () => { current = false }
  }, [llmService])
  async function revokeConsent() { await service.revokeConsent(); setStatus('Согласие отозвано') }
  async function disableAutomation() { await service.disableAutomation(); setStatus('Автоматизация отключена') }
  async function deleteData() { await service.deleteData(); setConfirmDelete(false); setStatus('Локальные данные удалены') }

  function resetProviderFields(nextProvider: LLMProvider) {
    setProvider(nextProvider)
    setApiKey('')
    setBaseUrl('')
    setFolderId('')
    setScope('PERS')
    setModel('')
    setConnectionNotice(null)
  }

  async function refreshConnections() {
    const items = await llmService.list()
    setConnections(items)
    setConnectionLoadError('')
  }

  async function checkSavedConnection(id: string) {
    setCheckingId(id)
    setConnectionNotice(null)
    try {
      const result = await llmService.testConnection(id)
      await refreshConnections()
      setConnectionNotice(result.ok
        ? { text: 'Подключение проверено', error: false }
        : { text: testErrorMessages[result.error_category ?? 'provider_error'] ?? 'Проверка не пройдена. Проверьте настройки и повторите попытку.', error: true })
    } catch (error) {
      setConnectionNotice({ text: apiErrorMessage(error), error: true })
    } finally {
      setCheckingId(null)
    }
  }

  async function addConnection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setConnectionBusy(true)
    setConnectionNotice(null)
    const settings: Record<string, string> = {}
    if (provider === 'openai_compatible') settings.base_url = baseUrl.trim()
    if (provider === 'yandexgpt') settings.folder_id = folderId.trim()
    if (provider === 'gigachat') settings.scope = scope
    const credentials: Record<string, string> = provider === 'gigachat'
      ? { authorization_key: apiKey }
      : { api_key: apiKey }
    const input: LLMConnectionInput = { provider, settings, credentials, default_model: model.trim() }
    try {
      const connection = await llmService.create(input)
      setApiKey('')
      setConnections((items) => [connection, ...items.filter((item) => item.id !== connection.id)])
      setConnectionNotice({ text: 'Ключ сохранён. Проверяем подключение…', error: false })
      await checkSavedConnection(connection.id)
    } catch (error) {
      setApiKey('')
      setConnectionNotice({ text: apiErrorMessage(error), error: true })
    } finally {
      setConnectionBusy(false)
    }
  }

  return <section className="profile-page">
    <h1>Настройки</h1>
    <p>Управление согласием на поиск, автоматизацией и локальными данными.</p>
    <p>Подключённых источников: {sourceCount}</p>
    <div className="profile-card llm-connections">
      <h2>Подключение LLM</h2>
      <p>Ключ хранится зашифрованным на сервере. После сохранения его нельзя просмотреть повторно.</p>
      <form className="profile-card llm-connection-form" onSubmit={(event) => { void addConnection(event) }}>
        <label>Провайдер
          <select value={provider} onChange={(event) => resetProviderFields(event.target.value as LLMProvider)}>
            {Object.entries(providerNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        {provider === 'openai_compatible' && <label>HTTPS URL API
          <input type="url" required value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://llm.example/v1" />
        </label>}
        {provider === 'yandexgpt' && <label>Folder ID
          <input required value={folderId} onChange={(event) => setFolderId(event.target.value)} />
        </label>}
        {provider === 'gigachat' && <label>Область доступа
          <select value={scope} onChange={(event) => setScope(event.target.value)}>
            <option value="PERS">Личный аккаунт (PERS)</option>
            <option value="B2B">Бизнес (B2B)</option>
            <option value="CORP">Корпоративный (CORP)</option>
          </select>
        </label>}
        <label>{provider === 'gigachat' ? 'Ключ авторизации GigaChat' : 'API-ключ'}
          <input type="password" autoComplete="new-password" required value={apiKey} onChange={(event) => setApiKey(event.target.value)} />
        </label>
        <label>Модель
          <input required value={model} onChange={(event) => setModel(event.target.value)} placeholder="Введите идентификатор модели" />
        </label>
        <button type="submit" disabled={connectionBusy || !apiKey.trim() || !model.trim()}>
          {connectionBusy ? 'Сохраняем и проверяем…' : 'Сохранить и проверить'}
        </button>
      </form>
      {connectionNotice && <p role={connectionNotice.error ? 'alert' : 'status'}>{connectionNotice.text}</p>}
      <h3>Сохранённые подключения</h3>
      {connectionLoadError && <p role="alert">{connectionLoadError}</p>}
      {!connectionLoadError && connections.length === 0 && <p>Подключений пока нет.</p>}
      {connections.length > 0 && <ul className="llm-connection-list">
        {connections.map((connection) => <li key={connection.id}>
          <div><strong>{providerNames[connection.provider]}</strong> · {connection.default_model} · {statusNames[connection.status]}</div>
          <button type="button" disabled={checkingId === connection.id || connection.status === 'disabled'} onClick={() => { void checkSavedConnection(connection.id) }}>
            {checkingId === connection.id ? 'Проверяем…' : 'Проверить'}
          </button>
        </li>)}
      </ul>}
    </div>
    <div className="profile-card">
      <h2>Контроль доступа и автоматизации</h2>
      <button type="button" onClick={() => { void revokeConsent() }}>Отозвать согласие</button>
      <button type="button" onClick={() => { void disableAutomation() }}>Отключить автоматизацию</button>
    </div>
    <div className="profile-card">
      <h2>Удаление данных</h2>
      <p>Удаляет локальные fixture-данные, поисковые профили, вакансии и черновики откликов.</p>
      {!confirmDelete && <button type="button" onClick={() => setConfirmDelete(true)}>Удалить данные</button>}
      {confirmDelete && <div role="alertdialog" aria-label="Подтверждение удаления">
        <p>Это действие нельзя отменить.</p>
        <button type="button" onClick={() => { void deleteData() }}>Подтвердить удаление</button>
        <button type="button" onClick={() => setConfirmDelete(false)}>Отмена</button>
      </div>}
    </div>
    {status && <p role="status">{status}</p>}
  </section>
}
