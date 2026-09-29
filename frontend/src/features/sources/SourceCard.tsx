import type { SourceConnection } from '../../domain/search'

export const sourceName = (id: string) => id

const statusLabels = {
  disconnected: 'не подключён', connected: 'подключён',
  reconnect_required: 'требует переподключения', error: 'ошибка',
}
const consentLabels = { missing: 'не предоставлено', granted: 'предоставлено', revoked: 'отозвано' }
const tokenLabels = {
  absent: 'отсутствует', valid: 'действителен',
  expired: 'истёк', error: 'ошибка проверки',
}

export function SourceCard({ connection, onConnect, onCheck, onDisconnect }: {
  connection: SourceConnection
  onConnect: () => void
  onCheck: () => void
  onDisconnect: () => void
}) {
  return <section className="profile-card" aria-label={sourceName(connection.id)}>
    <h2>{sourceName(connection.id)}</h2>
    <p>Состояние подключения к источнику вакансий.</p>
    <p>Назначение разрешения: поиск и чтение вакансий.</p>
    <p>Используемые данные: поисковые запросы и область поиска.</p>
    <p>Согласие на поиск: {consentLabels[connection.consent]}</p>
    <p>Подключение: {statusLabels[connection.status]}</p>
    <p>Токен площадки: {tokenLabels[connection.tokenStatus]}</p>
    {(connection.status !== 'connected' || connection.consent !== 'granted' || connection.tokenStatus !== 'valid') &&
      <button type="button" onClick={onConnect}>Подключить</button>}
    <button type="button" onClick={onCheck}>Проверить</button>
    {connection.status !== 'disconnected' && <button type="button" onClick={onDisconnect}>Отключить</button>}
  </section>
}
