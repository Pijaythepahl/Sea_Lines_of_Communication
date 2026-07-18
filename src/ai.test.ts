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

  it('nutzt als Autokratie das Eskalationsfenster für einen versorgten Vorposten', () => {
    const state = endTurn(createInitialState(6, { blue: 'democracy', red: 'autocracy' }))
    state.escalation = 2
    state.regions.central_basin.resources.red.access = 1
    state.regions.central_basin.resources.red.logistics = 1
    state.hands.red = [{ instanceId: 'red-ai-forward', cardId: 'forward_deployment' }]

    expect(chooseAiAction(state)).toMatchObject({
      type: 'play-card',
      play: { instanceId: 'red-ai-forward', regions: ['central_basin'] },
    })
  })

  it('überschreitet als Demokratie nicht ohne ausreichenden Nutzen ihr ruhiges Eskalationsfenster', () => {
    const state = endTurn(createInitialState(6, { blue: 'democracy', red: 'democracy' }))
    state.escalation = 2
    state.regions.central_basin.resources.red.access = 1
    state.regions.central_basin.resources.red.logistics = 1
    state.hands.red = [{ instanceId: 'red-ai-forward', cardId: 'forward_deployment' }]

    expect(chooseAiAction(state)).toBeNull()
  })

  it('hält als Autokratie Eskalation drei, statt den eigenen Bonus unnötig aufzugeben', () => {
    const state = endTurn(createInitialState(6, { blue: 'democracy', red: 'autocracy' }))
    state.escalation = 3
    state.hands.red = [{ instanceId: 'red-ai-deescalation', cardId: 'deescalation_channel' }]

    expect(chooseAiAction(state)).toBeNull()
  })

  it('nutzt eine gültige Zwei-Felder-Verlegung in einen strategischen Kernraum', () => {
    const state = endTurn(createInitialState())
    state.regions.northeast_passage.resources.red.presence = 0
    state.hands.red = [{ instanceId: 'red-ai-patrol', cardId: 'patrol_group' }]

    expect(chooseAiAction(state)).toMatchObject({
      type: 'play-card',
      play: { instanceId: 'red-ai-patrol', regions: ['eastern_sea', 'central_basin'] },
    })
  })

  it('vervollständigt früh eine maritime Zugang-Logistik-Kette', () => {
    const state = endTurn(createInitialState(6, { blue: 'democracy', red: 'autocracy' }))
    state.regions.freeport_sea.resources.red.access = 0
    state.regions.central_basin.resources.red.access = 1
    state.hands.red = [{ instanceId: 'red-ai-base', cardId: 'forward_base' }]

    expect(chooseAiAction(state)).toMatchObject({
      type: 'play-card',
      play: { instanceId: 'red-ai-base', regions: ['central_basin'] },
    })
  })
})
