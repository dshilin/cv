import type { SourceConnection } from '../../domain/search'

export const sourceNames: Record<string, string> = { 'example-board': 'Example Board' }
export const sourceName = (id: string) => sourceNames[id] ?? id

const statusLabels = {
  disconnected: 'не подключён', connected: 'подключён',
  reconnect_required: 'требует переподключения', error: 'ошибка',
}
const consentLabels = { missing: 'не предоставлено', granted: 'предоставлено', revoked: 'отозвано' }

export function SourceCard({ connection, onConnect, onCheck, onDisconnect }: {
  connection: SourceConnection
  onConnect: () => void
  onCheck: () => void
  onDisconnect: () => void
}) {
  return <section className="profile-card" aria-label={sourceName(connection.id)}>
    <h2>{sourceName(connection.id)}</h2>
    <p>Доступность интеграции: демонстрационный источник</p>
    <p>Назначение разрешения: поиск и чтение вакансий.</p>
    <p>Используемые данные: поисковые запросы и область поиска.</p>
    <p>Согласие на поиск: {consentLabels[connection.consent]}</p>
    <p>Подключение: {statusLabels[connection.status]}</p>
    <p>Токен площадки: {connection.status === 'connected' ? 'демонстрационное подключение' : 'не активен'}</p>
    {connection.status !== 'connected' && <button type="button" onClick={onConnect}>Подключить</button>}
    <button type="button" onClick={onCheck}>Проверить</button>
    {connection.status !== 'disconnected' && <button type="button" onClick={onDisconnect}>Отключить</button>}
  </section>
}
