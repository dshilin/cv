import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import type { ExperienceProfile } from '../domain/profile'
import { evaluateProfileReadiness } from '../domain/readiness'
import type { ProfileService } from '../services/contracts'
import { emptyProfileService, emptySearchService } from '../services/runtime-empty'

const navigation = [
  { to: '/profile', label: 'Профиль', end: true },
  { to: '/resume-profiles', label: 'Профили специализации' },
  { to: '/resume-drafts', label: 'Черновики резюме' },
  { to: '/profile/readiness', label: 'Готовность' },
  { to: '/sources', label: 'Сервисы' },
  { to: '/search', label: 'Поиск' },
  { to: '/jobs', label: 'Вакансии' },
  { to: '/applications', label: 'Отклики' },
  { to: '/settings', label: 'Настройки' },
]

export function AppShell({ profileService = emptyProfileService }: { profileService?: ProfileService }) {
  const [profile, setProfile] = useState<ExperienceProfile | null>(null)
  const [profileLoaded, setProfileLoaded] = useState(false)
  const [searchActive, setSearchActive] = useState(false)
  const location = useLocation()
  useEffect(() => {
    if (location.pathname.startsWith('/resume-profiles') || location.pathname.startsWith('/resume-drafts')) {
      setProfileLoaded(true)
      return
    }
    let current = true
    profileService.load().then((loaded) => { if (current) { setProfile(loaded); setProfileLoaded(true) } })
      .catch(() => { if (current) setProfileLoaded(true) })
    return () => { current = false }
  }, [location.pathname, profileService])
  useEffect(() => {
    if (location.pathname.startsWith('/resume-profiles') || location.pathname.startsWith('/resume-drafts')) {
      setSearchActive(false)
      return
    }
    let current = true
    emptySearchService.list().then((profiles) => { if (current) setSearchActive(profiles.some((item) => item.active)) })
    return () => { current = false }
  }, [location.key, location.pathname])
  const profileReady = profile ? evaluateProfileReadiness(profile).ready : false
  const pendingActions = Boolean(profile?.facts.some((fact) => fact.status === 'needs_review' || fact.status === 'needs_input') ||
    profile?.questions.some((question) => question.mandatory && !question.resolved))
  function guardNavigation(event: React.MouseEvent<HTMLAnchorElement>) {
    const request = new CustomEvent('cv:before-route-change', { detail: { allow: true } })
    window.dispatchEvent(request)
    if (!request.detail.allow) event.preventDefault()
  }
  return (
    <div className="app-shell">
      <a className="skip-link" href="#content">Перейти к содержимому</a>
      <aside className="sidebar">
        <div className="brand">CV Maker</div>
        <nav aria-label="Основная навигация">
          {navigation.map(({ to, label, end }) => (
            <NavLink key={to} to={to} end={end} onClick={guardNavigation}>
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
          <a href="/api/v1/auth/logout" onClick={async (event) => {
            event.preventDefault()
            const csrf = document.cookie.split('; ').find((part) => part.startsWith('cv_csrf='))?.split('=').slice(1).join('=')
            if (csrf) await fetch('/api/v1/auth/logout', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ csrf_token: decodeURIComponent(csrf) }) })
            window.location.assign('/login')
          }}>Выйти</a>
        </header>
        <main id="content" tabIndex={-1}>
          <Outlet context={{ profileService, onProfileChange: setProfile, profile, profileLoaded }} />
        </main>
      </div>
    </div>
  )
}
