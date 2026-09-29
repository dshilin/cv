import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'

type AuthStatus = 'loading' | 'authenticated' | 'anonymous' | 'unavailable'

export function AuthPage() {
  const [status, setStatus] = useState<AuthStatus>('loading')
  useEffect(() => {
    let active = true
    fetch('/api/v1/auth/me', { credentials: 'include' })
      .then(async (response) => {
        if (!response.ok) throw new Error('auth status unavailable')
        const result = await response.json() as { authenticated: boolean }
        if (active) setStatus(result.authenticated ? 'authenticated' : 'anonymous')
      })
      .catch(() => { if (active) setStatus('unavailable') })
    return () => { active = false }
  }, [])

  if (status === 'loading') return <main className="auth-page"><p role="status">Проверяем вход…</p></main>
  if (status === 'authenticated') return <Navigate to="/profile" replace />
  return <main className="auth-page">
    <section className="auth-card">
      <div className="brand">CV Maker</div>
      <h1>Вход в CV Maker</h1>
      <p>Войдите через VK ID, чтобы открыть профиль и настройки.</p>
      {status === 'unavailable' && <p role="alert">Не удалось проверить вход. Обновите страницу и попробуйте снова.</p>}
      <a className="button button-primary" href="/api/v1/auth/vk/start">Войти через VK ID</a>
    </section>
  </main>
}
