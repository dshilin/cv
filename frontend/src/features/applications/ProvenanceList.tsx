import type { ProfileFact } from '../../domain/profile'

export function ProvenanceList({ facts }: { facts: ProfileFact[] }) {
  return <section className="profile-card" aria-label="Использованные факты">
    <h2>Использованные факты</h2>
    {facts.length ? <ul>{facts.map((fact) => <li key={fact.id}>
      <span>{fact.value}</span> · <span>Источник: {fact.provenance}</span> · <span>Подтверждён</span>
    </li>)}</ul> : <p>Подтверждённых использованных фактов нет.</p>}
  </section>
}
