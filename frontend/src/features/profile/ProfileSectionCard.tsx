import type { FactStatus, ProfileFact, ProfileSection } from '../../domain/profile'
import { FactReviewList } from './FactReviewList'

export const sectionLabels: Record<ProfileSection, string> = {
  basics: 'Основное', employment: 'Опыт работы', projects: 'Проекты',
  skills: 'Навыки и технологии', education: 'Образование и сертификаты',
  languages: 'Языки', additional: 'Дополнительные сведения',
}

const statusLabels: Record<FactStatus, string> = {
  needs_input: 'Нужно заполнить', needs_review: 'Ожидает проверки',
  confirmed: 'Подтверждено', conflict: 'Противоречие',
  not_applicable: 'Не применимо', rejected: 'Отклонено',
}

type Props = {
  section: ProfileSection
  status: FactStatus
  facts: ProfileFact[]
  onConfirm: (id: string) => Promise<void>
  onReject: (id: string) => Promise<void>
  onUpdate: (id: string, value: string, provenance: string) => Promise<boolean>
}

export function ProfileSectionCard({ section, status, facts, onConfirm, onReject, onUpdate }: Props) {
  const label = sectionLabels[section]
  return (
    <section className="profile-card" id={`section-${section}`} aria-label={label}>
      <h2>{label}</h2>
      <p className="section-status">{statusLabels[status]}</p>
      <FactReviewList facts={facts} onConfirm={onConfirm} onReject={onReject} onUpdate={onUpdate} />
    </section>
  )
}
