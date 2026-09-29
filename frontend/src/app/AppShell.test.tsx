import { screen } from '@testing-library/react'
import { it, expect } from 'vitest'
import { renderApp } from '../test/render'

it('renders the required navigation and global indicators', () => {
  renderApp('/profile')
  expect(screen.getByRole('link', { name: 'Профиль' })).toBeVisible()
  expect(screen.getByRole('link', { name: 'Вакансии' })).toBeVisible()
  expect(screen.getByText('Профиль не готов')).toBeVisible()
  expect(screen.queryByText('Example Person')).not.toBeInTheDocument()
  expect(screen.queryByText('TypeScript')).not.toBeInTheDocument()
})
