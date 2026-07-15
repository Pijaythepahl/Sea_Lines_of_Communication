import { describe, expect, it } from 'vitest'
import { chooseAiAction, chooseAiPlay } from './ai'
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

  it('spielt bei bedrohter Hauptroute die Ausbaukarte', () => {
    const state = endTurn(createInitialState())
    state.hands.red = [{ instanceId: 'red-ai-detour', cardId: 'detour_expansion' }]
    state.regions.meridian_strait.resources.blue = { presence: 2, awareness: 0, access: 1, logistics: 0 }
    expect(chooseAiAction(state)).toMatchObject({ type: 'play-card', play: { instanceId: 'red-ai-detour' } })
  })

  it('kann einen wirksamen hybriden Auftrag verdeckt vorbereiten', () => {
    const state = endTurn(createInitialState())
    state.hands.red = [{ instanceId: 'red-ai-hybrid', cardId: 'hybrid_pressure' }]
    state.routeCapacity.red_detour = 5
    state.escalation = 6
    state.regions.central_basin.resources.red.awareness = 1
    state.regions.central_basin.resources.blue.awareness = 1
    state.regions.central_basin.resources.blue.logistics = 1
    const action = chooseAiAction(state)
    expect(action).toMatchObject({ type: 'play-card', play: { covert: true } })
  })
})
