import type { ConfirmedMatch } from '../../services/contracts'

export function MatchExplanation({ confirmedMatches, gaps, requiredSkills }: {
  confirmedMatches: ConfirmedMatch[]
  gaps: string[]
  requiredSkills?: string[]
}) {
  return <section aria-label="Сопоставление с профилем">
    <h2>Сопоставление с профилем</h2>
    {requiredSkills && <>
      <h3>Обязательные навыки из вакансии</h3>
      <ul>{requiredSkills.map((skill) => <li key={skill}>{skill}</li>)}</ul>
    </>}
    <h3>Подтверждённые совпадения</h3>
    {confirmedMatches.length ? <ul>{confirmedMatches.map(({ requirement, fact, factId }) =>
      <li key={`${requirement}-${factId}`}>{requirement}: {fact} <small>Факт профиля: {factId}</small></li>)}</ul>
      : <p>Подтверждённых совпадений пока нет.</p>}
    <h3>Пробелы</h3>
    {gaps.length ? <ul>{gaps.map((gap) => <li key={gap}>{gap}</li>)}</ul>
      : <p>Пробелов не обнаружено.</p>}
  </section>
}
