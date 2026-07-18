import { describe, expect, it } from 'vitest'
import { getMusicTrackForEscalation, MUSIC_TRACKS } from './music'

describe('escalation music', () => {
  it.each([0, 1, 2])('uses the stability theme at escalation %i', (escalation) => {
    expect(getMusicTrackForEscalation(escalation)).toBe(MUSIC_TRACKS.title)
  })

  it.each([3, 4, 5])('uses the controlled-tension theme at escalation %i', (escalation) => {
    expect(getMusicTrackForEscalation(escalation)).toBe(MUSIC_TRACKS.high)
  })

  it.each([6, 7, 8])('uses the maximum-crisis theme at escalation %i', (escalation) => {
    expect(getMusicTrackForEscalation(escalation)).toBe(MUSIC_TRACKS.maximum)
  })
})
