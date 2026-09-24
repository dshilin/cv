import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './AppShell'

function PlaceholderPage({ title }: { title: string }) {
  return <h1>{title}</h1>
}

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/profile" element={<PlaceholderPage title="Профиль" />} />
        <Route path="/profile/readiness" element={<PlaceholderPage title="Готовность" />} />
        <Route path="/sources" element={<PlaceholderPage title="Сервисы" />} />
        <Route path="/search" element={<PlaceholderPage title="Поиск" />} />
        <Route path="/jobs" element={<PlaceholderPage title="Вакансии" />} />
        <Route path="/applications" element={<PlaceholderPage title="Отклики" />} />
        <Route path="/settings" element={<PlaceholderPage title="Настройки" />} />
        <Route path="*" element={<Navigate to="/profile" replace />} />
      </Route>
    </Routes>
  )
}
