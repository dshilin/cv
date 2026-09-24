import { Link, Navigate, Route, Routes, useOutletContext, useParams } from 'react-router-dom'
import { AppShell } from './AppShell'
import { ProfilePage } from '../features/profile/ProfilePage'
import { SourcesPage } from '../features/sources/SourcesPage'
import { SearchProfilesPage } from '../features/search/SearchProfilesPage'
import { JobsPage } from '../features/jobs/JobsPage'
import { JobDetailsPage } from '../features/jobs/JobDetailsPage'
import { evaluateProfileReadiness } from '../domain/readiness'
import type { ExperienceProfile } from '../domain/profile'
import type { JobService, ProfileService } from '../services/contracts'

function PlaceholderPage({ title }: { title: string }) {
  return <h1>{title}</h1>
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

export function AppRoutes({ profileService, jobService }: { profileService?: ProfileService; jobService?: JobService } = {}) {
  return (
    <Routes>
      <Route element={<AppShell profileService={profileService} />}>
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/profile/readiness" element={<PlaceholderPage title="Готовность" />} />
        <Route path="/sources" element={<SourcesPage />} />
        <Route path="/search" element={<ReadySearchRoute />} />
        <Route path="/jobs" element={<JobsPage jobService={jobService} />} />
        <Route path="/jobs/:id" element={<JobDetailsRoute jobService={jobService} />} />
        <Route path="/applications" element={<PlaceholderPage title="Отклики" />} />
        <Route path="/settings" element={<PlaceholderPage title="Настройки" />} />
        <Route path="*" element={<Navigate to="/profile" replace />} />
      </Route>
    </Routes>
  )
}
