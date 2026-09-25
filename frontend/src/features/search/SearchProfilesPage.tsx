import { useEffect, useState } from 'react'
import type { SearchProfile, SourceConnection, SearchActivationBlocker } from '../../domain/search'
import { validateSearchActivation } from '../../domain/search'
import type { SearchService, SourceService } from '../../services/contracts'
import { fixtureSearchService, fixtureSourceService } from '../../services/fixtures'
import { sourceName } from '../sources/SourceCard'
import { SearchProfileForm } from './SearchProfileForm'

const blockerLabels: Record<SearchActivationBlocker, string> = {
  source: 'Подключите хотя бы один выбранный источник с согласием на поиск.',
  query: 'Укажите должность или ключевой запрос.',
  scope: 'Выберите регион или удалённую работу.',
  mode: 'Выберите режим обработки.',
  revoked_consent: 'Согласие для одного из выбранных источников отозвано.',
}

function launchSummary(profile: SearchProfile, connections: SourceConnection[]): string {
  const role = profile.roles.join(', ') || profile.query || 'вакансии'
  const location = [profile.scope.remote ? 'на удалёнке' : '',
    profile.scope.regions.length ? `в регионах: ${profile.scope.regions.join(', ')}` : ''].filter(Boolean).join(' и ')
  const sources = profile.sources.map((id) => sourceName(id)).join(', ') || 'без источников'
  const mode = profile.mode === 'recommendations' ? 'только рекомендации'
    : profile.mode === 'prepare_after_confirmation' ? 'подготовка отклика после подтверждения' : 'режим не выбран'
  const available = validateSearchActivation(profile, connections).availableSourceIds
  const unavailable = profile.sources.filter((id) => !available.includes(id))
  return `Ищем ${role}${location ? ` ${location}` : ''} в источниках: ${sources}. Режим: ${mode}.` +
    (unavailable.length ? ` Источник ${unavailable.map(sourceName).join(', ')} недоступен для запуска.` : '')
}

export function SearchProfilesPage({ sourceService = fixtureSourceService, searchService = fixtureSearchService }: {
  sourceService?: SourceService
  searchService?: SearchService
}) {
  const [connections, setConnections] = useState<SourceConnection[]>([])
  const [profiles, setProfiles] = useState<SearchProfile[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    let current = true
    const unsubscribe = sourceService.subscribe((_before, after) => {
      if (!current) return
      setConnections(after)
      void searchService.list().then((saved) => { if (current) setProfiles(saved) })
        .catch(() => { if (current) setError('Не удалось обновить поисковые профили') })
    })
    Promise.all([sourceService.list(), searchService.list()]).then(([sources, saved]) => {
      if (current) { setConnections(sources); setProfiles(saved) }
    }).catch(() => { if (current) setError('Не удалось загрузить поисковые настройки') })
    return () => { current = false; unsubscribe() }
  }, [sourceService, searchService])

  async function save(profile: SearchProfile) {
    try { setProfiles(await searchService.save(profile)); setError(''); return true }
    catch { setError('Не удалось сохранить поисковый профиль'); return false }
  }
  async function refresh() {
    try { setConnections(await sourceService.list()); setError('') }
    catch { setError('Не удалось обновить состояния источников') }
  }
  async function activate(id: string) {
    try {
      const latest = await sourceService.list()
      setConnections(latest)
      setProfiles(await searchService.activate(id))
      setError('')
    } catch { setError('Поиск не запущен: проверьте профиль и состояние источников') }
  }

  return <div className="profile-page">
    <h1>Поисковые профили</h1>
    <p>Настройте поиск по подтверждённому профилю. Каждый поисковый профиль сохраняется отдельно.</p>
    {error && <p role="alert">{error}</p>}
    <SearchProfileForm connections={connections} existingIds={profiles.map(({ id }) => id)} onSave={save} />
    <h2>Сохранённые профили</h2>
    {profiles.length === 0 && <p>Поисковых профилей пока нет.</p>}
    <div className="profile-grid">
      {profiles.map((profile) => {
        const validation = validateSearchActivation(profile, connections)
        return <section className="profile-card" key={profile.id} aria-label={profile.roles.join(', ') || profile.query || profile.id}>
          <h3>{profile.roles.join(', ') || profile.query || 'Без запроса'}</h3>
          <p>{launchSummary(profile, connections)}</p>
          <p>Состояние: {profile.active && validation.canActivate ? 'поиск активен' : 'поиск не запущен'}</p>
          {validation.blockers.length > 0 && <ul>{validation.blockers.map((blocker) => <li key={blocker}>{blockerLabels[blocker]}</li>)}</ul>}
          <button type="button" onClick={() => { void refresh() }}>Обновить состояния</button>
          <button type="button" disabled={!validation.canActivate || profile.active} onClick={() => { void activate(profile.id) }}>Запустить поиск</button>
        </section>
      })}
    </div>
  </div>
}
