import { Link, Navigate, Route, Routes, useOutletContext, useParams, useSearchParams } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { AppShell } from './AppShell'
import { ProfilePage } from '../features/profile/ProfilePage'
import { SourcesPage } from '../features/sources/SourcesPage'
import { SearchProfilesPage } from '../features/search/SearchProfilesPage'
import { JobsPage } from '../features/jobs/JobsPage'
import { JobDetailsPage } from '../features/jobs/JobDetailsPage'
import { ApplicationReviewPage } from '../features/applications/ApplicationReviewPage'
import { SettingsPage } from '../features/settings/SettingsPage'
import { ResumeProfilesPage } from '../features/resumeProfiles/ResumeProfilesPage'
import { ResumeDraftsPage } from '../features/resumeDrafts/ResumeDraftsPage'
import { AuthPage } from '../features/auth/AuthPage'
import { evaluateProfileReadiness } from '../domain/readiness'
import type { ExperienceProfile } from '../domain/profile'
import type { ApplicationService, JobService, ProfileService } from '../services/contracts'

function PlaceholderPage({ title }: { title: string }) {
  return <h1>{title}</h1>
}

function ProtectedApp({ profileService }: { profileService?: ProfileService }) {
  const [state, setState] = useState<'loading' | 'authenticated' | 'anonymous' | 'error'>('loading')
  useEffect(() => {
    if (import.meta.env.MODE === 'test') {
      setState('authenticated')
      return
    }
    let active = true
    fetch('/api/v1/auth/me', { credentials: 'include' }).then(async response => {
      if (!response.ok) throw new Error('Auth status unavailable')
      const data = await response.json() as { authenticated: boolean }
      if (active) setState(data.authenticated ? 'authenticated' : 'anonymous')
    }).catch(() => { if (active) setState('error') })
    return () => { active = false }
  }, [])
  if (state === 'loading') return <p role="status">Проверяем вход…</p>
  if (state === 'anonymous') return <Navigate to="/login" replace />
  if (state === 'error') return <p role="alert">Не удалось проверить вход. Обновите страницу.</p>
  return <AppShell profileService={profileService} />
}

function ReadySearchRoute() {
  const { profile, profileLoaded } = useOutletContext<{ profile: ExperienceProfile | null; profileLoaded: boolean }>()
  if (!profileLoaded) return <p role="status">Проверяем готовность профиля…</p>
  if (!profile || !evaluateProfileReadiness(profile).ready) return <section>
    <h1>Поиск пока недоступен</h1>
    <p>Сначала завершите профиль и устраните блокеры готовности.</p>
    <Link to="/profile">Открыть профиль</Link>
  </section>
  return <SearchProfilesPage />
}

function JobDetailsRoute({ jobService }: { jobService?: JobService }) {
  const { id } = useParams()
  return <JobDetailsPage key={id} jobService={jobService} />
}

function ApplicationRoute({ applicationService, jobService }: { applicationService?: ApplicationService; jobService?: JobService }) {
  const [searchParams] = useSearchParams()
  const jobId = searchParams.get('jobId')
  return <ApplicationReviewPage key={jobId} jobId={jobId} applicationService={applicationService} jobService={jobService} />
}

export function AppRoutes({ profileService, jobService, applicationService }: { profileService?: ProfileService; jobService?: JobService; applicationService?: ApplicationService } = {}) {
  return (
    <Routes>
      <Route path="/login" element={<AuthPage />} />
      <Route element={<ProtectedApp profileService={profileService} />}>
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/resume-profiles" element={<ResumeProfilesPage />} />
        <Route path="/resume-drafts" element={<ResumeDraftsPage />} />
        <Route path="/profile/readiness" element={<PlaceholderPage title="Готовность" />} />
        <Route path="/sources" element={<SourcesPage />} />
        <Route path="/search" element={<ReadySearchRoute />} />
        <Route path="/jobs" element={<JobsPage jobService={jobService} />} />
        <Route path="/jobs/:id" element={<JobDetailsRoute jobService={jobService} />} />
        <Route path="/applications" element={<ApplicationRoute applicationService={applicationService} jobService={jobService} />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/profile" replace />} />
      </Route>
    </Routes>
  )
}
