import type { GeneratedDocument } from '../../domain/application'

export function DocumentDiff({ resume }: { resume: GeneratedDocument }) {
  return <section className="profile-card" aria-label="Различия резюме">
    <h2>Различия резюме</h2>
    <div className="profile-grid">
      <div><h3>Базовый текст</h3><pre className="application-text">{resume.baseContent || 'Базовый текст отсутствует'}</pre></div>
      <div><h3>Под вакансию</h3><pre className="application-text">{resume.content}</pre></div>
    </div>
  </section>
}
