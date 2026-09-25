import { useState, type FormEvent } from 'react'
import type { SearchFilters, SearchMode, SearchProfile, SourceConnection } from '../../domain/search'
import { sourceName } from '../sources/SourceCard'

const splitList = (value: string) => value.split(',').map((part) => part.trim()).filter(Boolean)

export function SearchProfileForm({ connections, existingIds, onSave }: {
  connections: SourceConnection[]
  existingIds: string[]
  onSave: (profile: SearchProfile) => Promise<boolean>
}) {
  const [roles, setRoles] = useState('')
  const [query, setQuery] = useState('')
  const [sources, setSources] = useState<string[]>([])
  const [regions, setRegions] = useState('')
  const [remote, setRemote] = useState(false)
  const [mode, setMode] = useState<SearchMode>('')
  const [filters, setFilters] = useState<SearchFilters>({
    requiredSkills: [], desiredSkills: [], seniority: '', salaryMinimum: '',
    employmentType: '', stopWords: [], schedule: '', timezone: '', dailyLimit: '',
  })
  const [filterText, setFilterText] = useState({ requiredSkills: '', desiredSkills: '', stopWords: '' })
  const [counter, setCounter] = useState(1)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    let nextId = counter
    while (existingIds.includes(`search-${nextId}`)) nextId += 1
    const nextFilters = { ...filters, requiredSkills: splitList(filterText.requiredSkills), desiredSkills: splitList(filterText.desiredSkills), stopWords: splitList(filterText.stopWords) }
    const saved = await onSave({
      id: `search-${nextId}`, roles: splitList(roles), query: query.trim(), sources,
      scope: { regions: splitList(regions), remote }, mode, active: false, filters: nextFilters,
    })
    if (!saved) return
    setCounter(nextId + 1)
    setRoles(''); setQuery(''); setSources([]); setRegions(''); setRemote(false); setMode(''); setFilters({ ...filters, requiredSkills: [], desiredSkills: [], stopWords: [] }); setFilterText({ requiredSkills: '', desiredSkills: '', stopWords: '' })
  }

  return <form className="profile-card" onSubmit={(event) => { void submit(event) }}>
    <h2>Новый поисковый профиль</h2>
    <label>Должности и синонимы <input value={roles} onChange={(event) => setRoles(event.target.value)} placeholder="Через запятую" /></label>
    <label>Ключевой запрос <input value={query} onChange={(event) => setQuery(event.target.value)} /></label>
    <fieldset>
      <legend>Источники</legend>
      {connections.map((connection) => <label key={connection.id}>
        <input type="checkbox" checked={sources.includes(connection.id)} onChange={(event) => setSources((current) =>
          event.target.checked ? [...current, connection.id] : current.filter((id) => id !== connection.id))} />
        {sourceName(connection.id)}
      </label>)}
    </fieldset>
    <label>Регионы <input value={regions} onChange={(event) => setRegions(event.target.value)} placeholder="Через запятую" /></label>
    <label><input type="checkbox" checked={remote} onChange={(event) => setRemote(event.target.checked)} />Удалённая работа</label>
    <label>Режим обработки <select value={mode} onChange={(event) => setMode(event.target.value as SearchMode)}>
      <option value="">Выберите режим</option>
      <option value="recommendations">Только рекомендации</option>
      <option value="prepare_after_confirmation">Подготовка отклика после подтверждения</option>
    </select></label>
    <details>
      <summary>Расширенные фильтры</summary>
      <label>Обязательные навыки <input value={filterText.requiredSkills} onChange={(event) => setFilterText({ ...filterText, requiredSkills: event.target.value })} /></label>
      <label>Желательные навыки <input value={filterText.desiredSkills} onChange={(event) => setFilterText({ ...filterText, desiredSkills: event.target.value })} /></label>
      <label>Уровень <input value={filters.seniority} onChange={(event) => setFilters({ ...filters, seniority: event.target.value })} /></label>
      <label>Зарплата от <input value={filters.salaryMinimum} onChange={(event) => setFilters({ ...filters, salaryMinimum: event.target.value })} /></label>
      <label>Тип занятости <input value={filters.employmentType} onChange={(event) => setFilters({ ...filters, employmentType: event.target.value })} /></label>
      <label>Стоп-слова <input value={filterText.stopWords} onChange={(event) => setFilterText({ ...filterText, stopWords: event.target.value })} /></label>
      <label>Расписание <input value={filters.schedule} onChange={(event) => setFilters({ ...filters, schedule: event.target.value })} /></label>
      <label>Часовой пояс <input value={filters.timezone} onChange={(event) => setFilters({ ...filters, timezone: event.target.value })} /></label>
      <label>Дневной лимит <input type="number" min="1" value={filters.dailyLimit} onChange={(event) => setFilters({ ...filters, dailyLimit: event.target.value })} /></label>
    </details>
    <button type="submit">Сохранить профиль</button>
  </form>
}
