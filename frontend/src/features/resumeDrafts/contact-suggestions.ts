export type ContactSuggestion = { label: string; value: string }

export function findContactSuggestions(text: string): ContactSuggestion[] {
  const found: Array<ContactSuggestion & { index: number }> = []
  const addMatches = (pattern: RegExp, label: string, clean: (value: string) => string = (value) => value) => {
    for (const match of text.matchAll(pattern)) {
      const value = clean(match[0])
      if (value) found.push({ label, value, index: match.index ?? 0 })
    }
  }

  addMatches(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, 'Электронная почта')
  addMatches(/(?<!\w)(?:\+?\d[\s().-]*){10,15}(?!\d)/g, 'Телефон', (value) => value.trim())
  addMatches(/(?<![\w.+-])@[a-z0-9_]{5,32}\b/gi, 'Telegram', (value) => {
    const isPartOfEmail = found.some((item) => item.label === 'Электронная почта'
      && item.index <= text.indexOf(value) && item.index + item.value.length >= text.indexOf(value))
    return isPartOfEmail ? '' : value
  })
  addMatches(/\b(?:https?:\/\/|www\.)[^\s<>"']+/gi, 'Ссылка', (value) => value.replace(/[),.!?;:]+$/, ''))

  const seen = new Set<string>()
  return found.sort((left, right) => left.index - right.index).flatMap(({ label, value }) => {
    const key = `${label}:${value.toLocaleLowerCase()}`
    if (!value || seen.has(key)) return []
    seen.add(key)
    return [{ label, value }]
  })
}
