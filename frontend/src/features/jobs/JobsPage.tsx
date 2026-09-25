import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { JobService, JobStatus, JobSummary } from '../../services/contracts'
import { fixtureJobService } from '../../services/fixtures'
import { MatchExplanation } from './MatchExplanation'

export const jobStatusLabels: Record<JobStatus, string> = {
  new: 'Новая', suitable: 'Подходит', needs_review: 'Нужно проверить',
  saved: 'Отложена', rejected: 'Отклонена', preparing: 'Готовится отклик', sent: 'Отправлена',
}

export function JobMetadata({ job }: { job: JobSummary }) {
  return <p>Статус: {jobStatusLabels[job.status]} · Источник: {job.source} · Дата: {new Date(`${job.publishedAt}T00:00:00Z`).toLocaleDateString('ru-RU', { timeZone: 'UTC' })} · Оценка: {job.score}/100</p>
}

export function JobsPage({ jobService = fixtureJobService }: { jobService?: JobService }) {
  const [jobs, setJobs] = useState<JobSummary[] | null>(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    let current = true
    jobService.list().then((result) => { if (current) setJobs(result) })
      .catch(() => { if (current) setError(true) })
    return () => { current = false }
  }, [jobService])

  return <section>
    <h1>Вакансии</h1>
    {error ? <p role="alert">Не удалось загрузить вакансии.</p> : jobs === null ? <p role="status">Загружаем вакансии…</p> :
      jobs.length === 0 ? <p>Найденных вакансий пока нет.</p> :
        <div className="profile-grid">{jobs.map((job) => <article key={job.id} aria-label={job.title} className="profile-card">
          <h2><Link to={`/jobs/${encodeURIComponent(job.id)}`}>{job.title}</Link></h2>
          <p>{job.company}</p>
          <MatchExplanation confirmedMatches={job.confirmedMatches} gaps={job.gaps} />
          <JobMetadata job={job} />
        </article>)}</div>}
  </section>
}
