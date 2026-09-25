import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import type { ExperienceProfile } from '../domain/profile'
import { evaluateProfileReadiness } from '../domain/readiness'
import type { ProfileService } from '../services/contracts'
import { fixtureProfileService, fixtureSearchService } from '../services/fixtures'

const navigation = [
  { to: '/profile', label: 'Профиль', end: true },
  { to: '/resume-profiles', label: 'Профили резюме' },
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
  const [searchActive, setSearchActive] = useState(false)
  const location = useLocation()
  useEffect(() => {
    if (location.pathname.startsWith('/resume-profiles')) {
      setProfileLoaded(true)
      return
    }
    let current = true
    profileService.load().then((loaded) => { if (current) { setProfile(loaded); setProfileLoaded(true) } })
      .catch(() => { if (current) setProfileLoaded(true) })
    return () => { current = false }
  }, [location.pathname, profileService])
  useEffect(() => {
    if (location.pathname.startsWith('/resume-profiles')) {
      setSearchActive(false)
      return
    }
    let current = true
    fixtureSearchService.list().then((profiles) => { if (current) setSearchActive(profiles.some((item) => item.active)) })
    return () => { current = false }
  }, [location.key, location.pathname])
  const profileReady = profile ? evaluateProfileReadiness(profile).ready : false
  const pendingActions = Boolean(profile?.facts.some((fact) => fact.status === 'needs_review' || fact.status === 'needs_input') ||
    profile?.questions.some((question) => question.mandatory && !question.resolved))
  return (
    <div className="app-shell">
      <a className="skip-link" href="#content">Перейти к содержимому</a>
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
          <span>{searchActive ? 'Поиск активен' : 'Поиск не настроен'}</span>
          <span>{pendingActions ? 'Есть ожидающие действия' : 'Действий не ожидается'}</span>
        </header>
        <main id="content" tabIndex={-1}>
          <Outlet context={{ profileService, onProfileChange: setProfile, profile, profileLoaded }} />
        </main>
      </div>
    </div>
  )
}
