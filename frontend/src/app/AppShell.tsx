import { NavLink, Outlet } from 'react-router-dom'

const navigation = [
  { to: '/profile', label: 'Профиль', end: true },
  { to: '/profile/readiness', label: 'Готовность' },
  { to: '/sources', label: 'Сервисы' },
  { to: '/search', label: 'Поиск' },
  { to: '/jobs', label: 'Вакансии' },
  { to: '/applications', label: 'Отклики' },
  { to: '/settings', label: 'Настройки' },
]

export function AppShell() {
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
          <span>Профиль не готов</span>
          <span>Поиск не настроен</span>
          <span>Действий не ожидается</span>
        </header>
        <main id="content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
