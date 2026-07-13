import { describe, expect, it } from 'vitest'
import {
  calculateRouteYield,
  createInitialState,
  endTurn,
  evaluateChokepoint,
  getEffectiveResources,
  getUsability,
  playCard,
} from './engine'
import type { CardId, CardInstance, GameState } from './types'

const putCardInBlueHand = (state: GameState, cardId: CardId): CardInstance => {
  const existing = state.hands.blue.find((card) => card.cardId === cardId)
  if (existing) return existing
  const deckIndex = state.decks.blue.findIndex((card) => card.cardId === cardId)
  const card = state.decks.blue.splice(deckIndex, 1)[0]
  state.hands.blue.push(card)
  return card
}

describe('relative Nutzbarkeit', () => {
  it('lässt gleich starke Seiten denselben Raum frei nutzen', () => {
    const state = createInitialState()
    expect(getUsability(state, 'central_basin', 'blue')).toBe('free')
    expect(getUsability(state, 'central_basin', 'red')).toBe('free')
  })

  it('unterscheidet umkämpfte und verwehrte Räume', () => {
    const state = createInitialState()
    state.regions.central_basin.resources.blue.presence = 1
    expect(getUsability(state, 'central_basin', 'red')).toBe('contested')
    state.regions.central_basin.resources.blue.presence = 3
    expect(getUsability(state, 'central_basin', 'red')).toBe('denied')
  })
})

describe('Engpass und Handelsrouten', () => {
  it('sperrt die gegnerische Hauptroute, aber nicht deren Ausweichroute', () => {
    const state = createInitialState()
    state.regions.meridian_strait.resources.red.presence = 2
    state.regions.meridian_strait.resources.red.access = 1
    expect(evaluateChokepoint(state)).toBe('red')
    expect(calculateRouteYield(state, 'blue_main').blocked).toBe(true)
    expect(calculateRouteYield(state, 'blue_detour')).toMatchObject({ blocked: false, yield: 3 })
  })

  it('reduziert den Malus einer umkämpften Route durch Konvoisicherung', () => {
    const state = createInitialState()
    state.regions.central_basin.resources.red.presence = 1
    expect(calculateRouteYield(state, 'blue_main').yield).toBe(5)
    state.protections.push({ id: 'test', faction: 'blue', routeId: 'blue_main', amount: 1, expiresAfterRound: 1 })
    expect(calculateRouteYield(state, 'blue_main').yield).toBe(6)
  })
})

describe('Karten und Rundenfolge', () => {
  it('suspendiert gegnerische Ressourcen nur bis zur nächsten Wirtschaftsauswertung', () => {
    const state = createInitialState()
    state.regions.central_basin.resources.red.logistics = 1
    const card = putCardInBlueHand(state, 'hybrid_pressure')
    const pressured = playCard(state, { instanceId: card.instanceId, regions: ['central_basin'], resource: 'logistics' })
    expect(getEffectiveResources(pressured, 'central_basin', 'red').logistics).toBe(0)
    expect(pressured.escalation).toBe(2)
    expect(pressured.roundEscalation.blue).toBe(2)
    const redTurn = endTurn(pressured)
    const nextRound = endTurn(redTurn)
    expect(nextRound.round).toBe(2)
    expect(getEffectiveResources(nextRound, 'central_basin', 'red').logistics).toBe(1)
  })

  it('preist globale Eskalation und eigene Verantwortung in den Routenertrag ein', () => {
    const state = createInitialState()
    state.escalation = 4
    state.roundEscalation.blue = 1
    expect(calculateRouteYield(state, 'blue_main')).toMatchObject({
      yield: 3,
      escalationPenalty: 2,
      responsibilityPenalty: 1,
    })
    expect(calculateRouteYield(state, 'red_main')).toMatchObject({
      yield: 4,
      escalationPenalty: 2,
      responsibilityPenalty: 0,
    })
  })

  it('senkt Eskalation mit der Karte Krisenkommunikation gegen einen Aktionspunkt', () => {
    const state = createInitialState()
    state.escalation = 3
    const card = putCardInBlueHand(state, 'deescalation_channel')
    const calmer = playCard(state, { instanceId: card.instanceId })
    expect(calmer.escalation).toBe(2)
    expect(calmer.actionPoints).toBe(2)
    expect(calmer.discards.blue.at(-1)?.cardId).toBe('deescalation_channel')
  })

  it('lässt Krisenkommunikation bei Eskalation null nicht ausspielen', () => {
    const state = createInitialState()
    const card = putCardInBlueHand(state, 'deescalation_channel')
    expect(() => playCard(state, { instanceId: card.instanceId })).toThrow(/keine Krisenkommunikation/)
  })

  it('senkt Eskalation nach einer vollständig ruhigen Runde automatisch', () => {
    const state = createInitialState()
    state.escalation = 3
    const redTurn = endTurn(state)
    const nextRound = endTurn(redTurn)
    expect(nextRound.escalation).toBe(2)
  })

  it('wechselt die Startinitiative in jeder Runde', () => {
    const roundOne = createInitialState()
    expect(roundOne.activeFaction).toBe('blue')
    const roundOneSecondTurn = endTurn(roundOne)
    expect(roundOneSecondTurn.activeFaction).toBe('red')
    const roundTwo = endTurn(roundOneSecondTurn)
    expect(roundTwo.round).toBe(2)
    expect(roundTwo.activeFaction).toBe('red')
  })

  it('respektiert Ressourcenobergrenzen bei legalen Kartenzielen', () => {
    const state = createInitialState()
    state.regions.central_basin.resources.blue.awareness = 3
    const card = putCardInBlueHand(state, 'isr_recon')
    expect(() => playCard(state, { instanceId: card.instanceId, regions: ['central_basin'] })).toThrow(/nicht zulässig/)
  })
})
