import type { ApplicationPackage } from '../../domain/application'
import { canSendApplication } from '../../domain/application'

export function SendConfirmation({ pkg, busy, onConfirmContent, onSend }: {
  pkg: ApplicationPackage
  busy: boolean
  onConfirmContent: () => void
  onSend: () => void
}) {
  return <section className="profile-card" aria-label="Подтверждение отправки">
    <h2>Подтверждение</h2>
    <p>Отправка доступна после проверки содержания и устранения блокеров.</p>
    <button type="button" disabled={busy || pkg.sendState !== 'draft'} onClick={onConfirmContent}>Подтвердить содержание</button>
    <button type="button" disabled={busy || !canSendApplication(pkg)} onClick={onSend}>Подтвердить и отправить</button>
  </section>
}
