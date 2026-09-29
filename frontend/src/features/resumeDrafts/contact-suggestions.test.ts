import { describe, expect, it } from 'vitest'
import { findContactSuggestions } from './contact-suggestions'

describe('findContactSuggestions', () => {
  it('extracts email, Russian phone, Telegram handles, and URLs without changing source text', () => {
    const source = 'Email: Person@example.com\n+7 (999) 123-45-67\nTelegram: @person_handle\nhttps://github.com/person'
    expect(findContactSuggestions(source)).toEqual([
      { label: 'Электронная почта', value: 'Person@example.com' },
      { label: 'Телефон', value: '+7 (999) 123-45-67' },
      { label: 'Telegram', value: '@person_handle' },
      { label: 'Ссылка', value: 'https://github.com/person' },
    ])
    expect(source).toContain('Person@example.com')
  })

  it('deduplicates repeated values and does not treat email usernames as Telegram contacts', () => {
    expect(findContactSuggestions('person@example.com person@example.com @person @person'))
      .toEqual([
        { label: 'Электронная почта', value: 'person@example.com' },
        { label: 'Telegram', value: '@person' },
      ])
  })

  it('does not suggest ordinary numbers, dates, or unsupported short handles', () => {
    expect(findContactSuggestions('2024-2025, 12345, @abc')).toEqual([])
  })
})
