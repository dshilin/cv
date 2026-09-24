import { useEffect, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import type { ExperienceProfile } from '../domain/profile'
import { evaluateProfileReadiness } from '../domain/readiness'
import type { ProfileService } from '../services/contracts'
import { fixtureProfileService } from '../services/fixtures'

const navigation = [
  { to: '/profile', label: 'Профиль', end: true },
  { to: '/profile/readiness', label: 'Готовность' },
  { to: '/sources', label: 'Сервисы' },
  { to: '/search', label: 'Поиск' },
  { to: '/jobs', label: 'Вакансии' },
  { to: '/applications', label: 'Отклики' },
  { to: '/settings', label: 'Настройки' },
]

export function AppShell({ profileService = fixtureProfileService }: { profileService?: ProfileService }) {
  const [profile, setProfile] = useState<ExperienceProfile | null>(null)
  const [profileLoaded, setProfileLoaded] = useState(false)
  useEffect(() => {
    let current = true
    profileService.load().then((loaded) => { if (current) { setProfile(loaded); setProfileLoaded(true) } })
      .catch(() => { if (current) setProfileLoaded(true) })
    return () => { current = false }
  }, [profileService])
  const profileReady = profile ? evaluateProfileReadiness(profile).ready : false
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">CV Maker</div>
        <nav aria-label="Основная навигация">
          {navigation.map(({ to, label, end }) => (
            <NavLink key={to} to={to} end={end}>
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="workspace">
        <header className="status-bar" aria-label="Состояние приложения">
          <span>{profileReady ? 'Профиль готов' : 'Профиль не готов'}</span>
          <span>Поиск не настроен</span>
          <span>Действий не ожидается</span>
        </header>
        <main id="content">
          <Outlet context={{ profileService, onProfileChange: setProfile, profile, profileLoaded }} />
        </main>
      </div>
    </div>
  )
}
