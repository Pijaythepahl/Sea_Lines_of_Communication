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
  getValidRegionTargets,
  hasSupplyConnection,
  getUsability,
  migrateGameState,
  playCard,
  resolveCovertOperations,
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

  it('lässt den neutralen Freihafen auch bei großer Unterlegenheit höchstens umkämpft werden', () => {
    const state = createInitialState()
    state.regions.freeport_sea.resources.red = { presence: 3, awareness: 3, access: 2, logistics: 2 }
    expect(getUsability(state, 'freeport_sea', 'blue')).toBe('contested')
    state.regions.freeport_sea.resources.blue.access = 0
    expect(calculateRouteYield(state, 'blue_detour')).toMatchObject({ blocked: true, reason: 'Kein durchgehender Marktzugang' })
  })
})

describe('Engpass und Handelsrouten', () => {
  it('vergibt Staatsformboni nur in den vereinbarten Eskalationsfenstern', () => {
    const state = createInitialState(6, { blue: 'democracy', red: 'autocracy' })
    for (const [escalation, democracy, autocracy] of [[0, 1, 0], [2, 1, 0], [3, 0, 1], [5, 0, 1], [6, 0, 0], [8, 0, 0]] as const) {
      state.escalation = escalation
      expect(calculateRouteYield(state, 'blue_main').governmentBonus).toBe(democracy)
      expect(calculateRouteYield(state, 'red_main').governmentBonus).toBe(autocracy)
    }
    state.escalation = 3
    state.roundEscalation.red = 1
    expect(calculateRouteYield(state, 'red_main')).toMatchObject({ governmentBonus: 1, responsibilityPenalty: 1 })
    state.regions.western_sea.resources.blue.access = 0
    expect(calculateRouteYield(state, 'blue_main')).toMatchObject({ blocked: true, governmentBonus: 0 })
  })

  it('sperrt die gegnerische Hauptroute, aber nicht deren Ausweichroute', () => {
    const state = createInitialState()
    state.regions.meridian_strait.resources.red.presence = 2
    state.regions.meridian_strait.resources.red.access = 1
    expect(evaluateChokepoint(state)).toBe('red')
    expect(calculateRouteYield(state, 'blue_main').blocked).toBe(true)
    expect(calculateRouteYield(state, 'blue_detour')).toMatchObject({ blocked: false, yield: 4, governmentBonus: 1 })
  })

  it('reduziert den Malus einer umkämpften Route durch Konvoisicherung', () => {
    const state = createInitialState()
    state.regions.central_basin.resources.red.presence = 1
    expect(calculateRouteYield(state, 'blue_main').yield).toBe(6)
    state.protections.push({ id: 'test', faction: 'blue', routeId: 'blue_main', amount: 1, expiresAfterRound: 1 })
    expect(calculateRouteYield(state, 'blue_main').yield).toBe(7)
  })

  it('baut die Ausweichroute mit Zusätzlicher Tonnage für 1 AP dauerhaft bis höchstens 5 aus', () => {
    const state = createInitialState()
    const card = putCardInBlueHand(state, 'detour_expansion')
    const upgraded = playCard(state, { instanceId: card.instanceId })
    expect(upgraded.routeCapacity.blue_detour).toBe(4)
    expect(upgraded.actionPoints).toBe(2)
    const secondCard = putCardInBlueHand(upgraded, 'detour_expansion')
    const fullyUpgraded = playCard(upgraded, { instanceId: secondCard.instanceId })
    expect(fullyUpgraded.routeCapacity.blue_detour).toBe(5)
    const extra = { instanceId: 'test-extra-detour', cardId: 'detour_expansion' as const }
    fullyUpgraded.hands.blue.push(extra)
    expect(() => playCard(fullyUpgraded, { instanceId: extra.instanceId })).toThrow(/maximale Kapazität/)
  })

  it('verwendet die ausgebaute Kapazität, sobald die Hauptroute blockiert ist', () => {
    const state = createInitialState()
    state.routeCapacity.blue_detour = 5
    state.regions.meridian_strait.resources.red = { presence: 2, awareness: 0, access: 1, logistics: 0 }
    expect(calculateRouteYield(state, 'blue_main').blocked).toBe(true)
    expect(calculateRouteYield(state, 'blue_detour').yield).toBe(6)
  })
})

describe('Karten und Rundenfolge', () => {
  it('verstärkt nur das Heimatmeer oder einen über Zugang, Logistik und SLOC versorgten Vorposten', () => {
    const state = createInitialState(6, { blue: 'autocracy', red: 'autocracy' })
    expect(getValidRegionTargets(state, 'forward_deployment')).toEqual(['western_sea'])

    state.regions.central_basin.resources.blue.access = 1
    state.regions.central_basin.resources.blue.logistics = 1
    expect(hasSupplyConnection(state, 'central_basin', 'blue')).toBe(true)
    expect(getValidRegionTargets(state, 'forward_deployment')).toContain('central_basin')

    state.suspensions.push({ id: 'test-logistics', faction: 'blue', regionId: 'central_basin', resource: 'logistics', amount: 1, expiresAfterRound: 1 })
    expect(hasSupplyConnection(state, 'central_basin', 'blue')).toBe(false)
    state.suspensions = []

    state.regions.northwest_passage.resources.red = { presence: 3, awareness: 3, access: 0, logistics: 0 }
    expect(getUsability(state, 'northwest_passage', 'blue')).toBe('denied')
    expect(hasSupplyConnection(state, 'central_basin', 'blue')).toBe(false)
    state.regions.freeport_sea.resources.blue.logistics = 1
    expect(hasSupplyConnection(state, 'freeport_sea', 'blue')).toBe(true)
  })

  it('verlegt Präsenz ein oder zwei Felder, ohne verwehrte Zwischenräume zu überspringen', () => {
    const state = createInitialState(6, { blue: 'autocracy', red: 'autocracy' })
    const openTargets = getValidRegionTargets(state, 'patrol_group', ['western_sea'])
    expect(openTargets).toEqual(expect.arrayContaining(['northwest_passage', 'southwest_arc', 'central_basin', 'freeport_sea']))

    state.regions.southwest_arc.resources.red.presence = 3
    const blockedTargets = getValidRegionTargets(state, 'patrol_group', ['western_sea'])
    expect(blockedTargets).not.toContain('freeport_sea')
    expect(blockedTargets).toContain('central_basin')
    state.regions.central_basin.resources.blue.presence = 3
    expect(getValidRegionTargets(state, 'patrol_group', ['western_sea'])).not.toContain('central_basin')
  })

  it('verbessert beim Aufbau von Präsenz das Lagebild bis 2, aber nicht beim bloßen Verlegen', () => {
    const state = createInitialState()
    const deployment = putCardInBlueHand(state, 'forward_deployment')
    const reinforced = playCard(state, { instanceId: deployment.instanceId, regions: ['western_sea'] })
    expect(reinforced.regions.western_sea.resources.blue).toMatchObject({ presence: 3, awareness: 2 })

    const patrolState = createInitialState()
    const patrol = putCardInBlueHand(patrolState, 'patrol_group')
    const moved = playCard(patrolState, { instanceId: patrol.instanceId, regions: ['western_sea', 'southwest_arc'] })
    expect(moved.regions.southwest_arc.resources.blue).toMatchObject({ presence: 1, awareness: 0 })
  })

  it('begrenzt den Lagebildbonus aus Präsenzaufbau auf 2', () => {
    const state = createInitialState()
    state.regions.western_sea.resources.blue.awareness = 2
    const deployment = putCardInBlueHand(state, 'forward_deployment')
    const reinforced = playCard(state, { instanceId: deployment.instanceId, regions: ['western_sea'] })
    expect(reinforced.regions.western_sea.resources.blue.awareness).toBe(2)
  })

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
    expect(calmer.deescalationActions.blue).toBe(1)
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
    expect(calculateRoundYield(state, 'blue')).toMatchObject({ yield: 8, governmentBonus: 1, restraintBonus: 1 })
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

  it('behält mehr als 16 Operationsmeldungen vollständig und in neuester Reihenfolge', () => {
    let state = createInitialState(18)
    for (let index = 0; index < 20; index += 1) state = endTurn(state)
    expect(state.log.length).toBeGreaterThan(16)
    expect(state.log[0].round).toBeGreaterThanOrEqual(state.log.at(-1)!.round)
    expect(state.log.at(-1)?.code).toBe('game-start')
  })
})

describe('Migration und Abschlussbewertung', () => {
  it('initialisiert jede freie Blau-/Rot-Kombination für jede Partielänge', () => {
    for (const rounds of [6, 12, 18] as const) {
      for (const blue of ['democracy', 'autocracy'] as const) {
        for (const red of ['democracy', 'autocracy'] as const) {
          expect(createInitialState(rounds, { blue, red }).governments).toEqual({ blue, red })
        }
      }
    }
  })

  it('migriert ältere Spielstände auf Version 8, sechs Runden und freie Staatsformen', () => {
    const legacy = structuredClone(createInitialState()) as unknown as Record<string, unknown>
    legacy.version = 4
    delete legacy.maxRounds
    delete legacy.routeCapacity
    delete legacy.covertOperations
    const migrated = migrateGameState(legacy)
    expect(migrated.version).toBe(8)
    expect(migrated.maxRounds).toBe(6)
    expect(migrated.governments).toEqual({ blue: 'democracy', red: 'democracy' })
    expect('matchup' in migrated).toBe(false)
    expect(migrated.routeCapacity).toMatchObject({ blue_main: 6, blue_detour: 3 })
    expect(migrated.covertOperations).toEqual([])
  })

  it('übernimmt die Staatsformen eines Version-7-Spielstands', () => {
    const legacy = structuredClone(createInitialState()) as any
    legacy.version = 7
    legacy.matchup = 'democracy-autocracy'
    delete legacy.governments
    expect(migrateGameState(legacy).governments).toEqual({ blue: 'democracy', red: 'autocracy' })
  })

  it('beendet Partien nach der gewählten Rundenzahl und baut Decks 24/34/44 mit mehr Patrouillen', () => {
    const state = createInitialState(12)
    state.round = 12
    const secondTurn = endTurn(state)
    const complete = endTurn(secondTurn)
    expect(complete.phase).toBe('complete')
    expect(complete.round).toBe(12)

    for (const [rounds, size, patrols] of [[6, 24, 4], [12, 34, 5], [18, 44, 6]] as const) {
      const game = createInitialState(rounds)
      const cards = [...game.decks.blue, ...game.hands.blue]
      expect(cards).toHaveLength(size)
      expect(cards.filter((card) => card.cardId === 'patrol_group')).toHaveLength(patrols)
      expect(cards.filter((card) => card.cardId === 'detour_expansion')).toHaveLength(2)
      expect(game.hands.blue).toHaveLength(rounds === 6 ? 6 : 7)
      expect(endTurn(game).hands.red).toHaveLength(rounds === 6 ? 6 : 7)
    }
  })

  it('ergänzt bei der Migration nur die noch nutzbaren Ausbaukarten', () => {
    const legacy = structuredClone(createInitialState(12)) as any
    legacy.version = 5
    legacy.round = 2
    legacy.routeCapacity.blue_detour = 4
    legacy.decks.blue = legacy.decks.blue.filter((card: CardInstance) => card.cardId !== 'detour_expansion')
    legacy.hands.blue = legacy.hands.blue.filter((card: CardInstance) => card.cardId !== 'detour_expansion')
    const migrated = migrateGameState(legacy)
    const blueCards = [...migrated.decks.blue, ...migrated.hands.blue, ...migrated.discards.blue]
    expect(blueCards.filter((card) => card.cardId === 'detour_expansion')).toHaveLength(1)
    expect(migrated.leadershipHistoryComplete).toBe(false)
  })

  it('skaliert die Wirtschaftsanteile der Führungswertung mit der Rundenzahl', () => {
    const short = createInitialState(6)
    short.economicScore.blue = 18
    short.winner = { faction: 'blue', reason: 'Test' }
    expect(calculateLeadershipRating(short, 'blue').components.economy).toBe(1)

    const long = createInitialState(12)
    long.economicScore.blue = 36
    long.winner = { faction: 'blue', reason: 'Test' }
    expect(calculateLeadershipRating(long, 'blue').components.economy).toBe(1)
  })

  it('bewertet das Ergebnis anhand des Punkteabstands pro Runde', () => {
    const state = createInitialState(6)
    state.economicScore = { blue: 12, red: 15 }
    expect(calculateLeadershipRating(state, 'blue').components.result).toBe(1.5)
    expect(calculateLeadershipRating(state, 'red').components.result).toBe(2.5)
    state.economicScore = { blue: 10, red: 10 }
    expect(calculateLeadershipRating(state, 'blue').components.result).toBe(2)
    state.economicScore = { blue: 0, red: 30 }
    expect(calculateLeadershipRating(state, 'blue').components.result).toBe(0)
    expect(calculateLeadershipRating(state, 'red').components.result).toBe(4)

    const long = createInitialState(12)
    long.economicScore = { blue: 12, red: 15 }
    expect(calculateLeadershipRating(long, 'blue').components.result).toBe(1.7)
    expect(calculateLeadershipRating(long, 'red').components.result).toBe(2.3)
  })

  it('berechnet Sterne getrennt vom wirtschaftlichen Sieger', () => {
    const state = createInitialState()
    state.phase = 'complete'
    state.economicScore = { blue: 31, red: 20 }
    state.lastEvaluationEscalation = 8
    state.totalEscalation.blue = 8
    state.winner = { faction: 'blue', reason: 'Test' }
    expect(calculateLeadershipRating(state, 'blue')).toMatchObject({ score: 5.8, stars: 3, label: 'Kostspielige Führung' })
    expect(calculateLeadershipRating(state, 'red').stars).toBeGreaterThanOrEqual(1)
  })

  it('bewertet Eskalationsverlauf und deeskalierendes Verhalten über die gesamte Partie', () => {
    const state = createInitialState(12)
    state.winner = { faction: 'blue', reason: 'Test' }
    state.escalationHistory = [1, 3, 5, 3]
    state.totalEscalation.blue = 6
    state.escalationActions.blue = 4
    state.deescalationActions.blue = 2
    const rating = calculateLeadershipRating(state, 'blue')
    expect(rating.components.escalation).toBe(1.5)
    expect(rating.components.responsibility).toBe(1.5)
    expect(rating.metrics).toMatchObject({ averageEscalation: 3, escalationActions: 4, escalationPoints: 6, deescalationActions: 2, netResponsibility: 4 })
  })
})
