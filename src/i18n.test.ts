import { describe, expect, it } from 'vitest'
import { cardText, formatLogEntry, formatWinnerReason, governmentPairingText, governmentText, regionText } from './i18n'

describe('Lokalisierung', () => {
  it('übersetzt Karten und Kartenorte ohne den Spielzustand zu verändern', () => {
    expect(cardText('forward_deployment', 'en').title).toBe('Forward Deployment')
    expect(cardText('forward_deployment', 'en').description).toMatch(/Awareness/)
    expect(regionText('meridian_strait', 'en').name).toBe('Meridian Strait')
  })

  it('formatiert strukturierte Operationsmeldungen je Sprache', () => {
    const entry = {
      id: 'test', round: 3, message: 'Deutscher Rückfalltext', code: 'evaluation',
      params: { blue: 5, red: -1, escalation: 4 },
    }
    expect(formatLogEntry(entry, 'de')).toBe('Deutscher Rückfalltext')
    expect(formatLogEntry(entry, 'en')).toBe('Economic evaluation: Blue +5 · Red -1 · Crisis')
  })

  it('übersetzt Siegerbegründungen für jede lokale Ansicht', () => {
    const winner = { faction: 'blue' as const, reason: 'Deutscher Rückfalltext', reasonCode: 'economy' as const }
    expect(formatWinnerReason(winner, 'en')).toBe('Blue Coalition achieves the higher total economic yield.')
  })

  it('beschreibt Staatsformen und Paarungen in beiden Sprachen', () => {
    expect(governmentText('democracy', 'de').benefit).toContain('0–2')
    expect(governmentText('autocracy', 'en').name).toBe('Autocracy')
    expect(governmentPairingText({ blue: 'autocracy', red: 'democracy' }, 'en')).toBe('Autocracy vs Democracy')
  })
})
