import { screen } from '@testing-library/react'
import { it, expect } from 'vitest'
import { renderApp } from '../../test/render'

it('does not show demo vacancies at runtime', async () => {
  renderApp('/jobs')
  expect(await screen.findByRole('heading', { name: 'Вакансии' })).toBeVisible()
  expect(screen.queryByText('Senior Data Scientist')).not.toBeInTheDocument()
})
