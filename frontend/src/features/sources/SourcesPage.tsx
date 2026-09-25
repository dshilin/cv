import { useEffect, useState } from 'react'
import type { SourceConnection } from '../../domain/search'
import type { SourceService } from '../../services/contracts'
import { fixtureSourceService } from '../../services/fixtures'
import { SourceCard } from './SourceCard'

export function SourcesPage({ service = fixtureSourceService }: { service?: SourceService }) {
  const [connections, setConnections] = useState<SourceConnection[]>([])
  const [error, setError] = useState('')
  useEffect(() => {
    let current = true
    service.list().then((next) => { if (current) setConnections(next) })
      .catch(() => { if (current) setError('Не удалось загрузить источники') })
    return () => { current = false }
  }, [service])

  async function run(change: () => Promise<SourceConnection[]>) {
    try { setConnections(await change()); setError('') }
    catch { setError('Не удалось изменить подключение') }
  }

  return <div className="profile-page">
    <h1>Сервисы поиска</h1>
    <p>Разрешение на поиск в источнике отдельно от входа в CV Maker и разрешения на отправку отклика.</p>
    <p>Example Board — локальная демонстрация. Кнопка подключения не запускает внешний OAuth.</p>
    {error && <p role="alert">{error}</p>}
    <div className="profile-grid">
      {connections.map((connection) => <SourceCard key={connection.id} connection={connection}
        onConnect={() => { void run(() => service.connect(connection.id)) }}
        onCheck={() => { void run(() => service.check(connection.id)) }}
        onDisconnect={() => { void run(() => service.disconnect(connection.id)) }} />)}
    </div>
  </div>
}
