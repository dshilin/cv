import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { JobDetails, JobService } from '../../services/contracts'
import { emptyJobService } from '../../services/runtime-empty'
import { JobMetadata } from './JobsPage'
import { MatchExplanation } from './MatchExplanation'

export function JobDetailsPage({ jobService = emptyJobService }: { jobService?: JobService }) {
  const { id } = useParams()
  const [job, setJob] = useState<JobDetails | null>(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    let current = true
    setJob(null)
    setError(false)
    if (id) jobService.get(id).then((result) => { if (current) setJob(result) })
      .catch(() => { if (current) setError(true) })
    else setError(true)
    return () => { current = false }
  }, [id, jobService])

  if (error) return <section><h1>Вакансия не найдена</h1><Link to="/jobs">К очереди вакансий</Link></section>
  if (!job) return <p role="status">Загружаем вакансию…</p>
  return <article className="profile-page">
    <Link to="/jobs">К очереди вакансий</Link>
    <h1>{job.title}</h1>
    <p>{job.company}</p>
    <JobMetadata job={job} />
    <section className="profile-card" aria-label="Описание вакансии — текст источника">
      <h2>Описание вакансии — текст источника</h2>
      <p>Текст предоставлен источником вакансии.</p>
      <p style={{ whiteSpace: 'pre-wrap' }}>{job.description}</p>
    </section>
    <MatchExplanation requiredSkills={job.requiredSkills} confirmedMatches={job.confirmedMatches} gaps={job.gaps} />
    <Link to={`/applications?jobId=${encodeURIComponent(job.id)}`}>Подготовить отклик</Link>
  </article>
}
