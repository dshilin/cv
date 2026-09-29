import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { ApplicationPackage } from '../../domain/application'
import type { ApplicationService, JobService } from '../../services/contracts'
import { emptyJobService, unavailableApplicationService } from '../../services/runtime-empty'
import { DocumentDiff } from './DocumentDiff'
import { ProvenanceList } from './ProvenanceList'
import { SendConfirmation } from './SendConfirmation'

export function ApplicationReviewPage({ jobId, applicationService = unavailableApplicationService, jobService = emptyJobService }: {
  jobId: string | null
  applicationService?: ApplicationService
  jobService?: JobService
}) {
  const [pkg, setPkg] = useState<ApplicationPackage | null>(null)
  const [jobTitle, setJobTitle] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!jobId) return
    let current = true
    Promise.all([applicationService.prepare(jobId), jobService.get(jobId)])
      .then(([prepared, job]) => { if (current) { setPkg(prepared); setJobTitle(`${job.title} — ${job.company}`) } })
      .catch(() => { if (current) setError('Не удалось подготовить комплект для выбранной вакансии.') })
    return () => { current = false }
  }, [jobId, applicationService, jobService])

  if (!jobId) return <section><h1>Выберите вакансию</h1><Link to="/jobs">К вакансиям</Link></section>
  if (error && !pkg) return <section><h1>Комплект недоступен</h1><p role="alert">{error}</p><Link to="/jobs">К вакансиям</Link></section>
  if (!pkg) return <p role="status">Подготавливаем комплект отклика…</p>

  const resume = pkg.documents.find((document) => document.kind === 'resume')
  async function update(action: () => Promise<ApplicationPackage>) {
    setBusy(true)
    setError('')
    try { setPkg(await action()) } catch { setError('Не удалось подтвердить содержание. Попробуйте ещё раз.') } finally { setBusy(false) }
  }
  async function send() {
    if (!pkg) return
    setBusy(true)
    setError('')
    try {
      await applicationService.send(pkg.id, `send-${pkg.id}`)
      setPkg({ ...pkg, sendState: 'sent' })
    } catch { setError('Отправка заблокирована. Проверьте факты и подготовьте комплект заново.') } finally { setBusy(false) }
  }

  return <article className="profile-page application-review">
    <Link to={`/jobs/${encodeURIComponent(jobId)}`}>К вакансии</Link>
    <h1>Отклик: {jobTitle}</h1>
    {pkg.documents.map((document) => <section key={document.kind} className="profile-card" aria-label={document.title}>
      <h2>{document.title}</h2><pre className="application-text">{document.content}</pre>
    </section>)}
    {resume && <DocumentDiff resume={resume} />}
    <ProvenanceList facts={pkg.usedFacts} />
    <section className="profile-card" aria-label="Предупреждения"><h2>Предупреждения</h2>
      {pkg.warnings.length ? <ul>{pkg.warnings.map((warning) => <li key={warning.id}>{warning.message}</li>)}</ul> : <p>Предупреждений нет.</p>}
    </section>
    <section className="profile-card" aria-label="Блокеры отправки"><h2>Блокеры отправки</h2>
      {pkg.blockers.length ? <ul>{pkg.blockers.map((blocker, index) => <li key={`${blocker.kind}-${blocker.factId ?? index}`}>
        {blocker.message} {blocker.factId && <Link to="/profile">Проверить факт в профиле</Link>}
      </li>)}</ul> : <p>Блокеров нет.</p>}
    </section>
    {error && <p role="alert">{error}</p>}
    {pkg.sendState === 'sent' ? <p role="status">Отклик отправлен.</p> :
      <SendConfirmation pkg={pkg} busy={busy} onConfirmContent={() => update(() => applicationService.confirmContent(pkg.id))} onSend={send} />}
  </article>
}
