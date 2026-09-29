import { screen } from '@testing-library/react'
import { it, expect } from 'vitest'
import { renderApp } from '../../test/render'

it('does not show demo source records at runtime', async () => {
  renderApp('/sources')
  expect(await screen.findByRole('heading', { name: 'Сервисы поиска' })).toBeVisible()
  expect(screen.queryByText(/Example Board/)).not.toBeInTheDocument()
})
