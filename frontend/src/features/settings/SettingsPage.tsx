import { useEffect, useState } from 'react'
import type { SettingsService } from '../../services/contracts'
import { createFixtureApplicationService, createFixtureJobService, createFixtureProfileService, createFixtureSearchService, createFixtureSettingsService, createFixtureSourceService } from '../../services/fixtures'

const fixtureSettings = createFixtureSettingsService(
  createFixtureProfileService(),
  createFixtureSourceService(),
  createFixtureSearchService(createFixtureSourceService()),
  createFixtureJobService(),
  createFixtureApplicationService(createFixtureProfileService(), createFixtureJobService()),
)

export function SettingsPage({ service = fixtureSettings }: { service?: SettingsService }) {
  const [sourceCount, setSourceCount] = useState(0)
  const [status, setStatus] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  useEffect(() => { void service.listSources().then((sources) => setSourceCount(sources.length)) }, [service])
  async function revokeConsent() { await service.revokeConsent(); setStatus('Согласие отозвано') }
  async function disableAutomation() { await service.disableAutomation(); setStatus('Автоматизация отключена') }
  async function deleteData() { await service.deleteData(); setConfirmDelete(false); setStatus('Локальные данные удалены') }
  return <section className="profile-page">
    <h1>Настройки</h1>
    <p>Управление согласием на поиск, автоматизацией и локальными данными.</p>
    <p>Подключённых источников: {sourceCount}</p>
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
