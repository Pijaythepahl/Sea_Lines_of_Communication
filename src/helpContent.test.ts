import { describe, expect, it } from 'vitest'
import { CARD_ORDER } from './data'
import {
  HELP_CARD_IDS,
  HELP_CHAPTER_IDS,
  HELP_STRATEGIC_DISCLAIMER,
  getHelpChapters,
  getStrategists,
  isCompleteHelpCardSet,
} from './helpContent'

describe('didaktische Spielanleitung', () => {
  it.each(['de', 'en'] as const)('liefert acht stabile und vollständig übersetzte Kapitel auf %s', (language) => {
    const chapters = getHelpChapters(language)

    expect(chapters.map((chapter) => chapter.id)).toEqual(HELP_CHAPTER_IDS)
    expect(new Set(chapters.map((chapter) => chapter.id)).size).toBe(8)
    for (const chapter of chapters) {
      expect(chapter.navLabel.trim()).not.toBe('')
      expect(chapter.title.trim()).not.toBe('')
      expect(chapter.subtitle.trim()).not.toBe('')
      expect(chapter.strategists.length).toBeGreaterThan(0)
    }
  })

  it('führt jede der elf Karten genau einmal in der Kartenreferenz', () => {
    expect(HELP_CARD_IDS).toHaveLength(CARD_ORDER.length)
    expect(new Set(HELP_CARD_IDS).size).toBe(CARD_ORDER.length)
    expect(new Set(HELP_CARD_IDS)).toEqual(new Set(CARD_ORDER))
    expect(isCompleteHelpCardSet()).toBe(true)
  })

  it.each(['de', 'en'] as const)('begrenzt Strategen-Markierungen auf den freigegebenen Denkrahmen auf %s', (language) => {
    const strategists = getStrategists(language)
    const approvedIds = new Set(Object.keys(strategists))

    for (const chapter of getHelpChapters(language)) {
      for (const strategistId of chapter.strategists) {
        expect(approvedIds.has(strategistId)).toBe(true)
        expect(strategists[strategistId].question).toMatch(/\?$/)
        expect(strategists[strategistId].idea.length).toBeGreaterThan(20)
      }
    }
    expect(HELP_STRATEGIC_DISCLAIMER(language).length).toBeGreaterThan(50)
  })
})
