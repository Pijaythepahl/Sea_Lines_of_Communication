import { describe, expect, it } from 'vitest'
import {
  calculateLeadershipRating,
  calculateRoundYield,
  calculateRouteYield,
  createFactionView,
  createInitialState,
  endTurn,
  evaluateChokepoint,
  getEffectiveResources,
  getUsability,
  migrateGameState,
  playCard,
  resolveCovertOperations,
  upgradeDetour,
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

  it('baut die Ausweichroute für 2 AP dauerhaft bis höchstens 5 aus', () => {
    const state = createInitialState()
    const upgraded = upgradeDetour(state)
    expect(upgraded.routeCapacity.blue_detour).toBe(4)
    expect(upgraded.actionPoints).toBe(1)
    expect(() => upgradeDetour(upgraded)).toThrow(/bereits ausgebaut/)
    upgraded.routeCapacity.blue_detour = 5
    upgraded.detourUpgradedRound.blue = null
    expect(() => upgradeDetour(upgraded)).toThrow(/maximale Kapazität/)
  })

  it('verwendet die ausgebaute Kapazität, sobald die Hauptroute blockiert ist', () => {
    const state = createInitialState()
    state.routeCapacity.blue_detour = 5
    state.regions.meridian_strait.resources.red = { presence: 2, awareness: 0, access: 1, logistics: 0 }
    expect(calculateRouteYield(state, 'blue_main').blocked).toBe(true)
    expect(calculateRouteYield(state, 'blue_detour').yield).toBe(5)
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

  it('vergibt höchstens einen Ruhebonus für einen friedlichen Zug mit Rest-AP', () => {
    const state = createInitialState()
    state.endedActionPoints.blue = 3
    expect(calculateRoundYield(state, 'blue')).toMatchObject({ yield: 7, restraintBonus: 1 })
    state.roundEscalation.blue = 1
    expect(calculateRoundYield(state, 'blue')).toMatchObject({ restraintBonus: 0 })
  })

  it('wertet Kontrollverlust unabhängig von blockierten Routen mit −1 oder −2', () => {
    const state = createInitialState()
    state.escalation = 8
    state.regions.eastern_sea.resources.red.access = 0
    state.roundEscalation.blue = 1
    expect(calculateRoundYield(state, 'blue').yield).toBe(-2)
    expect(calculateRoundYield(state, 'red')).toMatchObject({ yield: -1, controlLossPenalty: 1 })
  })

  it('bereitet geeignete Karten nur bei schwachem gegnerischem Lagebild verdeckt vor', () => {
    const state = createInitialState()
    state.regions.central_basin.resources.blue.awareness = 1
    state.regions.central_basin.resources.red.awareness = 1
    const card = putCardInBlueHand(state, 'shadowing_operation')
    const prepared = playCard(state, { instanceId: card.instanceId, regions: ['central_basin'], covert: true })
    expect(prepared.actionPoints).toBe(1)
    expect(prepared.escalation).toBe(0)
    expect(prepared.regions.central_basin.resources.red.awareness).toBe(1)
    expect(prepared.covertOperations).toHaveLength(1)
    expect(prepared.log[0].message).not.toMatch(/Beschattung|Zentral/)
    state.regions.central_basin.resources.red.awareness = 2
    expect(() => playCard(state, { instanceId: card.instanceId, regions: ['central_basin'], covert: true })).toThrow(/gegnerischem Lagebild/)
  })

  it('löst verdeckte Wirkungen verzögert auf und hält ihre Details aus der Gegnersicht', () => {
    const state = createInitialState()
    state.regions.central_basin.resources.blue.awareness = 1
    state.regions.central_basin.resources.red.awareness = 1
    state.regions.central_basin.resources.red.logistics = 1
    const card = putCardInBlueHand(state, 'hybrid_pressure')
    const prepared = playCard(state, { instanceId: card.instanceId, regions: ['central_basin'], resource: 'logistics', covert: true })
    const redView = createFactionView(prepared, 'red')
    expect(redView.covertOperations).toHaveLength(0)
    expect(redView.discards.blue).toHaveLength(0)
    const resolved = resolveCovertOperations(prepared)
    expect(getEffectiveResources(resolved, 'central_basin', 'red').logistics).toBe(0)
    expect(resolved.covertOperations).toHaveLength(0)
    expect(resolved.log[0].message).not.toMatch(/Hybrider Druck|Zentral|Logistik/)
  })

  it('verhindert mit einer verdeckten Operation die automatische Deeskalation', () => {
    const state = createInitialState()
    state.escalation = 3
    state.regions.central_basin.resources.blue.awareness = 1
    state.regions.central_basin.resources.red.awareness = 1
    const card = putCardInBlueHand(state, 'shadowing_operation')
    const prepared = playCard(state, { instanceId: card.instanceId, regions: ['central_basin'], covert: true })
    const redTurn = endTurn(prepared)
    const nextRound = endTurn(redTurn)
    expect(nextRound.escalation).toBe(3)
    expect(nextRound.lastYield.blue.restraintBonus).toBe(0)
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

describe('Migration und Abschlussbewertung', () => {
  it('migriert einen Version-3-Spielstand mit neutralen MVP-4-Feldern', () => {
    const legacy = structuredClone(createInitialState()) as unknown as Record<string, unknown>
    legacy.version = 3
    delete legacy.routeCapacity
    delete legacy.covertOperations
    const migrated = migrateGameState(legacy)
    expect(migrated.version).toBe(4)
    expect(migrated.routeCapacity).toMatchObject({ blue_main: 6, blue_detour: 3 })
    expect(migrated.covertOperations).toEqual([])
  })

  it('berechnet Sterne getrennt vom wirtschaftlichen Sieger', () => {
    const state = createInitialState()
    state.phase = 'complete'
    state.economicScore = { blue: 31, red: 20 }
    state.lastEvaluationEscalation = 8
    state.totalEscalation.blue = 8
    state.winner = { faction: 'blue', reason: 'Test' }
    expect(calculateLeadershipRating(state, 'blue')).toMatchObject({ score: 6, stars: 3, label: 'Kostspielige Führung' })
    expect(calculateLeadershipRating(state, 'red').stars).toBeGreaterThanOrEqual(1)
  })
})
