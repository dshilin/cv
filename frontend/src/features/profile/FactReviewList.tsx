import { useState } from 'react'
import type { ProfileFact } from '../../domain/profile'

type Props = {
  facts: ProfileFact[]
  onConfirm: (id: string) => Promise<void>
  onReject: (id: string) => Promise<void>
  onUpdate: (id: string, value: string, provenance: string) => Promise<boolean>
}

const statusLabels = {
  needs_input: 'Нужно заполнить', needs_review: 'Ожидает проверки',
  confirmed: 'Подтверждено', conflict: 'Противоречие',
  not_applicable: 'Не применимо', rejected: 'Отклонено',
}

export function FactReviewList({ facts, onConfirm, onReject, onUpdate }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [draftSource, setDraftSource] = useState('')

  return (
    <ul className="fact-list">
      {facts.map((fact) => (
        <li key={fact.id} id={`fact-${fact.id}`} aria-label={fact.value}>
          <p>{fact.value}</p>
          <p>Статус: {statusLabels[fact.status]}</p>
          <p>Источник: {fact.provenance || 'не указан'}</p>
          {editingId === fact.id ? (
            <form onSubmit={async (event) => {
              event.preventDefault()
              if (await onUpdate(fact.id, draft, draftSource)) setEditingId(null)
            }}>
              <label>Текст факта <input value={draft} onChange={(event) => setDraft(event.target.value)} required /></label>
              <label>Источник факта <input value={draftSource} onChange={(event) => setDraftSource(event.target.value)} required /></label>
              <button type="submit">Сохранить исправление</button>
              <button type="button" onClick={() => setEditingId(null)}>Отмена</button>
            </form>
          ) : (
            <div className="fact-actions">
              {fact.status !== 'confirmed' && fact.status !== 'rejected' && (
                <button type="button" onClick={() => void onConfirm(fact.id)}>Подтвердить</button>
              )}
              {fact.status !== 'rejected' && (
                <button type="button" onClick={() => {
                  setDraft(fact.value)
                  setDraftSource(fact.provenance)
                  setEditingId(fact.id)
                }}>Исправить</button>
              )}
              {fact.status !== 'rejected' && (
                <button type="button" onClick={() => void onReject(fact.id)}>Отклонить</button>
              )}
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}
