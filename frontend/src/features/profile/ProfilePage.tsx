import { useEffect, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import type { ExperienceProfile, ProfileSection } from '../../domain/profile'
import { evaluateProfileReadiness, type ReadinessBlocker } from '../../domain/readiness'
import type { ProfileService } from '../../services/contracts'
import { emptyProfileService } from '../../services/runtime-empty'
import { ProfileSectionCard, sectionLabels } from './ProfileSectionCard'
import { CandidateIdentityCard } from './CandidateIdentityCard'

const sections: ProfileSection[] = [
  'basics', 'employment', 'projects', 'skills', 'education', 'languages', 'additional',
]

type ProfileOutletContext = { profileService: ProfileService; onProfileChange: (profile: ExperienceProfile) => void }
type Props = { service?: ProfileService; onProfileChange?: (profile: ExperienceProfile) => void }

function blockerLink(blocker: ReadinessBlocker, profile: ExperienceProfile): { href: string; label: string } {
  if (blocker.code === 'required_section') {
    return { href: `#section-${blocker.section}`, label: `Проверить раздел «${sectionLabels[blocker.section]}»` }
  }
  if (blocker.code === 'not_reproducible') {
    return { href: '#section-skills', label: 'Подтвердить содержательный факт для резюме' }
  }
  if (blocker.code === 'mandatory_question') {
    return { href: `#question-${blocker.id}`, label: `Ответить на обязательный вопрос ${blocker.id}` }
  }
  const fact = profile.facts.find(({ id }) => id === blocker.id)
  const href = fact ? `#fact-${blocker.id}` : `#conflict-${blocker.id}`
  const label = blocker.code === 'missing_provenance' ? 'Указать источник факта'
    : blocker.code === 'conflict' ? 'Разрешить противоречие' : 'Проверить статус факта'
  return { href, label }
}

export function ProfilePage({ service, onProfileChange }: Props) {
  const outlet = useOutletContext<ProfileOutletContext | null>()
  const profileService = service ?? outlet?.profileService ?? emptyProfileService
  const notifyProfileChange = onProfileChange ?? outlet?.onProfileChange
  const [profile, setProfile] = useState<ExperienceProfile | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    profileService.load().then((loaded) => {
      if (active) {
        setProfile(loaded)
        notifyProfileChange?.(loaded)
      }
    }).catch(() => { if (active) setError('Не удалось загрузить профиль') })
    return () => { active = false }
  }, [profileService, notifyProfileChange])

  async function run(change: () => Promise<ExperienceProfile>) {
    try {
      const next = await change()
      setProfile(next)
      notifyProfileChange?.(next)
      setError('')
      return true
    } catch {
      setError('Не удалось сохранить изменение')
      return false
    }
  }

  async function resolveIssue(kind: 'conflict' | 'question', id: string, resolution: string) {
    return run(() => profileService.resolveIssue({ kind, id, resolution }))
  }

  if (!profile) return <p role="status">{error || 'Загрузка профиля…'}</p>
  const readiness = evaluateProfileReadiness(profile)

  return (
    <div className="profile-page">
      <h1>Профиль</h1>
      <p>Факт — утверждение о кандидате для будущего резюме. Источник показывает, откуда оно взялось и как проверить его точность.</p>
      <CandidateIdentityCard />
      {error && <p role="alert">{error}</p>}
      {readiness.ready ? (
        <div className="readiness-summary">
          <p>Профиль готов — можно настроить поиск</p>
          <Link to="/search">Настроить поиск</Link>
        </div>
      ) : (
        <section className="readiness-summary" aria-label="Готовность профиля">
          <h2>Что нужно сделать</h2>
          <ul>
            {readiness.blockers.map((blocker, index) => {
              const link = blockerLink(blocker, profile)
              return <li key={`${blocker.code}-${index}`}><a href={link.href}>{link.label}</a></li>
            })}
          </ul>
        </section>
      )}
      {profile.facts.length === 0 && profile.conflicts.length === 0 && profile.questions.length === 0 ? (
        <section className="readiness-summary" aria-label="Профиль опыта пока пуст">
          <h2>Профиль опыта пока пуст</h2>
          <p>Загрузите резюме в черновики, чтобы проверить и перенести подтверждённые сведения в базу кандидата.</p>
          <Link to="/resume-drafts">Открыть черновики резюме</Link>
        </section>
      ) : null}
      {(profile.conflicts.length > 0 || profile.questions.length > 0) && (
        <section className="profile-card" aria-label="Противоречия и вопросы">
          <h2>Противоречия и вопросы</h2>
          <ul>
            {profile.conflicts.map(({ id, resolved, resolution }) => (
              <li key={`conflict-${id}`} id={`conflict-${id}`} aria-label={`Противоречие: ${id}`}>
                <p>Противоречие: {id}</p>
                {resolved ? <p>Решение: {resolution}</p> : (
                  <form onSubmit={async (event) => {
                    event.preventDefault()
                    const form = event.currentTarget
                    const value = new FormData(form).get('resolution')?.toString() ?? ''
                    if (await resolveIssue('conflict', id, value)) form.reset()
                  }}>
                    <label>Решение противоречия <input name="resolution" required /></label>
                    <button type="submit">Сохранить решение</button>
                  </form>
                )}
              </li>
            ))}
            {profile.questions.map(({ id, resolved, resolution }) => (
              <li key={`question-${id}`} id={`question-${id}`} aria-label={`Обязательный вопрос: ${id}`}>
                <p>Обязательный вопрос: {id}</p>
                {resolved ? <p>Ответ: {resolution}</p> : (
                  <form onSubmit={async (event) => {
                    event.preventDefault()
                    const form = event.currentTarget
                    const value = new FormData(form).get('answer')?.toString() ?? ''
                    if (await resolveIssue('question', id, value)) form.reset()
                  }}>
                    <label>Ответ на вопрос <input name="answer" required /></label>
                    <button type="submit">Сохранить ответ</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      {profile.facts.length > 0 && <div className="profile-grid">
        {sections.map((section) => (
          <ProfileSectionCard
            key={section}
            section={section}
            status={profile.sections[section]}
            facts={profile.facts.filter((fact) => fact.section === section)}
            onConfirm={async (id) => { await run(() => profileService.reviewFact({ id, decision: 'confirm' })) }}
            onReject={async (id) => { await run(() => profileService.reviewFact({ id, decision: 'reject' })) }}
            onRestore={async (id) => { await run(() => profileService.reviewFact({ id, decision: 'restore' })) }}
            onUpdate={(id, value) => {
              const fact = profile.facts.find((item) => item.id === id)
              return fact ? run(() => profileService.updateFact({ id, value, provenance: fact.provenance })) : Promise.resolve(false)
            }}
          />
        ))}
      </div>}
    </div>
  )
}
