import { describe, expect, it } from 'vitest'
import { chooseAiPlay } from './ai'
import { createInitialState, endTurn, playCard } from './engine'

describe('Rote KI', () => {
  it('erzeugt ausschließlich vom Regelkern akzeptierte Kartenaktionen', () => {
    const state = endTurn(createInitialState())
    state.hands.red = [{ instanceId: 'red-ai-isr', cardId: 'isr_recon' }]
    const decision = chooseAiPlay(state)
    expect(decision).not.toBeNull()
    expect(() => playCard(state, decision!)).not.toThrow()
  })

  it('versucht bei Eskalation null keine unnötige Krisenkommunikation', () => {
    const state = endTurn(createInitialState())
    state.hands.red = [{ instanceId: 'red-ai-deescalation', cardId: 'deescalation_channel' }]
    expect(chooseAiPlay(state)).toBeNull()
  })
})
