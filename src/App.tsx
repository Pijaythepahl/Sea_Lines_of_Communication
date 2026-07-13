import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CARDS, FACTIONS, REGIONS, REGION_ORDER, RESOURCE_LABELS, ROUTES, ROUTE_ORDER, USABILITY_LABELS } from './data'
import {
  calculateProjection,
  calculateRouteYield,
  constants,
  createInitialState,
  endTurn,
  evaluateChokepoint,
  getBestYield,
  getEffectiveResources,
  getEscalationBand,
  getUsability,
  getValidHybridResources,
  getValidRegionTargets,
  isPlayReady,
  otherFaction,
  playCard,
} from './engine'
import type {
  CardInstance,
  CardPlay,
  FactionId,
  GameState,
  RegionId,
  ResourceKey,
  RouteId,
  SuspendableResource,
} from './types'

const STORAGE_KEY = 'sloc-game-v3'
const V2_STORAGE_KEY = 'sloc-game-v2'
const LEGACY_STORAGE_KEY = 'sloc-mvp1-game-v1'

type StoredGameState = Omit<GameState, 'version'> & {
  version: number
  deescalatedThisRound?: Record<FactionId, boolean>
}

const migrateToV3 = (stored: StoredGameState): GameState => {
  const next = structuredClone(stored)
  for (const faction of ['blue', 'red'] as const) {
    const zones = [...next.decks[faction], ...next.hands[faction], ...next.discards[faction]]
    if (!zones.some((card) => card.cardId === 'deescalation_channel')) {
      next.decks[faction].unshift(
        { instanceId: `${faction}-deescalation_channel-migrated-0`, cardId: 'deescalation_channel' },
        { instanceId: `${faction}-deescalation_channel-migrated-1`, cardId: 'deescalation_channel' },
      )
    }
  }
  delete next.deescalatedThisRound
  return { ...next, version: 3 }
}

const loadState = (): GameState => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(V2_STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY)
    if (!raw) return createInitialState()
    const parsed = JSON.parse(raw) as StoredGameState
    if (!parsed.regions?.central_basin || !parsed.hands?.blue) return createInitialState()
    if (parsed.version === 3) return parsed as GameState
    if (parsed.version === 2) return migrateToV3(parsed)
    if (parsed.version === 1) {
      return migrateToV3({
        ...parsed,
        version: 2,
        escalation: 0,
        roundEscalation: { blue: 0, red: 0 },
        lastYield: {
          blue: { ...parsed.lastYield.blue, escalationPenalty: 0, responsibilityPenalty: 0 },
          red: { ...parsed.lastYield.red, escalationPenalty: 0, responsibilityPenalty: 0 },
        },
      })
    }
    return createInitialState()
  } catch {
    return createInitialState()
  }
}

const factionClass = (faction: FactionId) => (faction === 'blue' ? 'is-blue' : 'is-red')

const RESOURCE_ORDER: ResourceKey[] = ['presence', 'awareness', 'access', 'logistics']

const ResourceIconPaths = ({ resource }: { resource: ResourceKey }) => {
  if (resource === 'presence') return <>
    <path d="M3 15h18l-3 4H7z" />
    <path d="M8 15V9h8v6M11 9V5h3v4M12.5 5V2M15 6l3 2" />
  </>
  if (resource === 'awareness') return <>
    <circle cx="12" cy="12" r="2.2" />
    <path d="M12 12l7-5M5.7 17.8a8 8 0 0 1 0-11.6M8.6 15a4 4 0 0 1 0-6M18.3 6.2a8 8 0 0 1 0 11.6" />
  </>
  if (resource === 'access') return <>
    <circle cx="8" cy="9" r="4" />
    <path d="M11 12l8 8M15 16l2-2M17 18l2-2" />
  </>
  return <>
    <path d="M3 6l5-3 5 3-5 3zM3 6v6l5 3 5-3V6M8 9v6M11 15l5-3 5 3-5 3zM11 15v4l5 3 5-3v-4M16 18v4" />
  </>
}

const ResourceIcon = ({ resource, className = '' }: { resource: ResourceKey; className?: string }) => (
  <svg className={`resource-icon-svg ${className}`} viewBox="0 0 24 24" aria-hidden="true">
    <ResourceIconPaths resource={resource} />
  </svg>
)

const CARD_RESOURCE_ICONS: Partial<Record<CardInstance['cardId'], ResourceKey>> = {
  patrol_group: 'presence',
  forward_deployment: 'presence',
  isr_recon: 'awareness',
  persistent_sensors: 'awareness',
  port_agreement: 'access',
  forward_base: 'logistics',
}

const CardIcon = ({ cardId }: { cardId: CardInstance['cardId'] }) => {
  const resource = CARD_RESOURCE_ICONS[cardId]
  return resource ? <ResourceIcon resource={resource} /> : <>{CARDS[cardId].icon}</>
}

const MapResourceRow = ({ state, faction, regionId }: { state: GameState; faction: FactionId; regionId: RegionId }) => {
  const resources = getEffectiveResources(state, regionId, faction)
  return (
    <g>
      <title>{`${FACTIONS[faction].adjective}: Präsenz ${resources.presence}, Lagebild ${resources.awareness}, Zugang ${resources.access}, Logistik ${resources.logistics}`}</title>
      <rect className={`resource-pill ${faction}`} width="126" height="16" rx="8" />
      {RESOURCE_ORDER.map((resource, index) => {
        const x = 8 + index * 30
        return (
          <g className="map-resource-value" key={resource} transform={`translate(${x} 2)`}>
            <g transform="scale(.5)"><ResourceIconPaths resource={resource} /></g>
            <text x="15" y="9.7">{resources[resource]}</text>
          </g>
        )
      })}
    </g>
  )
}

interface MapBoardProps {
  state: GameState
  inspected: RegionId
  validRegions: RegionId[]
  selectedRegions: RegionId[]
  validRoutes: RouteId[]
  selectedRoute?: RouteId
  onRegionClick: (regionId: RegionId) => void
  onRouteClick: (routeId: RouteId) => void
}

const MapBoard = ({
  state,
  inspected,
  validRegions,
  selectedRegions,
  validRoutes,
  selectedRoute,
  onRegionClick,
  onRouteClick,
}: MapBoardProps) => {
  const chokepoint = evaluateChokepoint(state)
  return (
    <section className="map-panel" aria-label="Strategische Seekarte">
      <div className="map-heading">
        <div>
          <span className="eyebrow">OPERATIVES LAGEBILD</span>
          <h2>Pelagos-Archipel</h2>
        </div>
        <div className="map-legend-stack">
          <div className="map-legend" aria-label="Statuslegende">
            <span><i className="legend-dot free" /> frei</span>
            <span><i className="legend-dot contested" /> umkämpft</span>
            <span><i className="legend-dot denied" /> verwehrt</span>
          </div>
          <div className="map-resource-key" aria-label="Ressourcenlegende">
            {RESOURCE_ORDER.map((resource) => <span key={resource}><ResourceIcon resource={resource} />{RESOURCE_LABELS[resource].name}</span>)}
          </div>
        </div>
      </div>
      <div className="map-stage">
        <svg className="strategy-map" viewBox="0 0 900 530" role="img" aria-label="Fiktive maritime Karte mit neun Regionen und vier Sea Lines of Communication">
          <defs>
            <linearGradient id="sea" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#e9e4d6" />
              <stop offset="0.52" stopColor="#dce3df" />
              <stop offset="1" stopColor="#cbd8d8" />
            </linearGradient>
            <linearGradient id="land" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#cbbf9e" />
              <stop offset="1" stopColor="#a99c7b" />
            </linearGradient>
            <pattern id="chartGrid" width="30" height="30" patternUnits="userSpaceOnUse">
              <path d="M30 0H0V30" fill="none" stroke="#284d61" strokeOpacity=".09" strokeWidth=".7" />
            </pattern>
            <pattern id="deniedPattern" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="8" stroke="#9d3434" strokeOpacity=".3" strokeWidth="2" />
            </pattern>
            <filter id="nodeShadow" x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#071c2c" floodOpacity=".3" />
            </filter>
          </defs>
          <rect width="900" height="530" fill="url(#sea)" />
          <rect width="900" height="530" fill="url(#chartGrid)" />
          <path className="bathymetry" d="M-20 70 C160 135 224 50 383 95 S690 137 930 48" />
          <path className="bathymetry" d="M-10 392 C151 332 278 360 389 414 S693 490 920 401" />
          <path className="bathymetry thin" d="M54 0 C110 173 75 330 153 540 M770 -10 C712 161 758 349 690 540" />
          <path className="landmass" d="M0 0 H171 C165 42 125 55 105 90 C80 132 43 155 0 146 Z" />
          <path className="landmass" d="M900 0 H730 C738 52 780 62 800 91 C832 136 866 151 900 145 Z" />
          <path className="landmass islands" d="M444 10 l20 12 -12 18 -30 -6 -8 -16 Z M555 92 l14 9 -8 17 -22 1 -7 -12 Z M446 376 l17 9 -2 19 -25 9 -14 -13 7 -18 Z" />

          {REGION_ORDER.map((regionId) => {
            const region = REGIONS[regionId]
            const usability = getUsability(state, regionId, state.activeFaction)
            const isValid = validRegions.includes(regionId)
            const isSelected = selectedRegions.includes(regionId)
            return (
              <path
                key={`area-${regionId}`}
                d={region.mapPath}
                className={`sea-region ${usability} ${isValid ? 'valid-target' : ''} ${isSelected ? 'selected-target' : ''}`}
                onClick={() => onRegionClick(regionId)}
              />
            )
          })}

          {ROUTE_ORDER.map((routeId) => {
            const route = ROUTES[routeId]
            const result = calculateRouteYield(state, routeId)
            const valid = validRoutes.includes(routeId)
            return (
              <g key={routeId} className={`map-route ${factionClass(route.faction)} ${route.kind} ${result.blocked ? 'blocked' : ''} ${valid ? 'valid-route' : ''} ${selectedRoute === routeId ? 'selected-route' : ''}`}>
                <path className="route-hitbox" d={route.svgPath} onClick={() => onRouteClick(routeId)} />
                <path className="route-line" d={route.svgPath} />
              </g>
            )
          })}

          {REGION_ORDER.map((regionId) => {
            const region = REGIONS[regionId]
            const usability = getUsability(state, regionId, state.activeFaction)
            const selected = inspected === regionId
            const valid = validRegions.includes(regionId)
            return (
              <g
                key={regionId}
                className={`region-node ${usability} ${selected ? 'inspected' : ''} ${valid ? 'valid-target' : ''}`}
                transform={`translate(${region.x} ${region.y})`}
                onClick={() => onRegionClick(regionId)}
                role="button"
                aria-label={`${region.name}, ${USABILITY_LABELS[usability].label} für ${FACTIONS[state.activeFaction].adjective}`}
              >
                <circle className="node-ring" r={region.chokepoint ? 29 : 25} />
                <circle className="node-core" r={region.chokepoint ? 22 : 19} />
                <text className="node-symbol" y="5">{region.chokepoint ? '◇' : region.market ? '¤' : '✦'}</text>
                <text className="node-title" y={-34}>{region.shortName}</text>
                <text className="node-status" y={region.chokepoint ? 45 : 41}>{USABILITY_LABELS[usability].short}</text>
                <g transform="translate(-63 47)">
                  <MapResourceRow state={state} regionId={regionId} faction="blue" />
                </g>
                <g transform="translate(-63 64)">
                  <MapResourceRow state={state} regionId={regionId} faction="red" />
                </g>
              </g>
            )
          })}

          <g className="compass" transform="translate(62 458)">
            <circle r="30" />
            <path d="M0-26 L6-5 L0 0 L-6-5 Z M0 26 L6 5 L0 0 L-6 5 Z M-26 0 L-5-6 L0 0 L-5 6 Z M26 0 L5-6 L0 0 L5 6 Z" />
            <text y="-34">N</text>
          </g>
        </svg>

        <div className="choke-indicator">
          <span className="eyebrow">MERIDIANSTRASSE</span>
          <strong className={chokepoint ? factionClass(chokepoint) : ''}>
            {chokepoint ? `${FACTIONS[chokepoint].adjective} kontrolliert` : 'Offen · nicht kontrolliert'}
          </strong>
        </div>
        <RegionInspector state={state} regionId={inspected} />
      </div>
    </section>
  )
}

const RegionInspector = ({ state, regionId }: { state: GameState; regionId: RegionId }) => {
  const region = REGIONS[regionId]
  return (
    <aside className="region-inspector" aria-live="polite">
      <div className="inspector-title">
        <div><span className="eyebrow">REGION</span><h3>{region.name}</h3></div>
        {region.chokepoint && <span className="special-tag">ENGPASS</span>}
        {region.market && <span className="special-tag">MARKT</span>}
      </div>
      <p>{region.subtitle}</p>
      <div className="inspector-factions">
        {(['blue', 'red'] as const).map((faction) => {
          const usability = getUsability(state, regionId, faction)
          const resources = getEffectiveResources(state, regionId, faction)
          const suspended = state.suspensions.some((entry) => entry.faction === faction && entry.regionId === regionId)
          return (
            <div className={`inspector-faction ${factionClass(faction)}`} key={faction}>
              <div><strong>{FACTIONS[faction].adjective}</strong><span className={`status-text ${usability}`}>{USABILITY_LABELS[usability].label}</span></div>
              <div className="mini-resources">
                {RESOURCE_ORDER.map((resource) => (
                  <span key={resource} title={RESOURCE_LABELS[resource].name}><ResourceIcon resource={resource} /><b>{resources[resource]}</b></span>
                ))}
              </div>
              <small>Projektion {calculateProjection(state, regionId, faction)}{suspended ? ' · Ressource suspendiert' : ''}</small>
            </div>
          )
        })}
      </div>
    </aside>
  )
}

const Sidebar = ({ state }: { state: GameState }) => {
  const active = state.activeFaction
  const choke = evaluateChokepoint(state)
  const totals = (faction: FactionId) => REGION_ORDER.reduce(
    (sum, id) => {
      const resources = getEffectiveResources(state, id, faction)
      sum.presence += resources.presence
      sum.awareness += resources.awareness
      sum.access += resources.access
      sum.logistics += resources.logistics
      return sum
    },
    { presence: 0, awareness: 0, access: 0, logistics: 0 },
  )
  const activeTotals = totals(active)
  return (
    <aside className="left-sidebar">
      <section className={`command-card ${factionClass(active)}`}>
        <span className="eyebrow">AKTIVE KOALITION</span>
        <div className="faction-lockup"><span className="faction-seal">{FACTIONS[active].symbol}</span><div><h2>{FACTIONS[active].name}</h2><p>{state.turnIndex === 0 ? 'Erste Initiative' : 'Reaktion'} · Runde {state.round}</p></div></div>
        <div className="ap-display" aria-label={`${state.actionPoints} Aktionspunkte verbleibend`}>
          <span>AKTIONSPUNKTE</span>
          <div>{[1, 2, 3].map((value) => <i key={value} className={value <= state.actionPoints ? 'filled' : ''}>{value <= state.actionPoints ? '●' : '○'}</i>)}</div>
        </div>
      </section>

      <section className="panel resource-overview">
        <div className="panel-heading"><span>Strategische Lage</span><small>Summen auf der Karte</small></div>
        {RESOURCE_ORDER.map((resource) => (
          <div className="resource-row" key={resource}>
            <span className="resource-icon"><ResourceIcon resource={resource} /></span>
            <span>{RESOURCE_LABELS[resource].name}</span>
            <strong>{activeTotals[resource]}</strong>
          </div>
        ))}
        <div className="projection-note"><span>Engpass</span><strong>{choke ? FACTIONS[choke].adjective : 'offen'}</strong></div>
      </section>

      <section className="panel briefing">
        <div className="panel-heading"><span>Strategischer Hinweis</span></div>
        <p><strong>Seeverbindungen offenhalten.</strong> Präsenz allein genügt nicht: Lagebild, Zugang und Logistik tragen gemeinsam zur Projektion bei.</p>
        <div className="formula">Präsenz + Lagebild + Zugang + Logistik = Projektion</div>
      </section>

      <section className="panel log-panel">
        <div className="panel-heading"><span>Operationslog</span><small>letzte Meldungen</small></div>
        <ol>
          {state.log.slice(0, 7).map((entry) => (
            <li key={entry.id} className={entry.faction ? factionClass(entry.faction) : ''}>
              <span>R{entry.round}</span><p>{entry.message}</p>
            </li>
          ))}
        </ol>
      </section>
    </aside>
  )
}

interface ScoreboardProps {
  state: GameState
  validRoutes: RouteId[]
  selectedRoute?: RouteId
  onRouteClick: (routeId: RouteId) => void
  onShowRules: () => void
}

const Scoreboard = ({ state, validRoutes, selectedRoute, onRouteClick, onShowRules }: ScoreboardProps) => (
  <aside className="right-sidebar">
    <section className="panel score-panel">
      <div className="panel-heading"><span>Wirtschaftlicher Ertrag</span><small>nach {state.round > 1 ? `${state.round - 1} Wertungen` : 'Startlage'}</small></div>
      <div className="score-comparison">
        {(['blue', 'red'] as const).map((faction) => {
          const forecast = getBestYield(state, faction)
          return (
            <div className={`score-side ${factionClass(faction)}`} key={faction}>
              <span>{FACTIONS[faction].adjective}</span>
              <strong>{state.economicScore[faction]}</strong>
              <small>Prognose +{forecast.yield}</small>
            </div>
          )
        })}
      </div>
      <div className="score-scale"><i style={{ width: `${Math.min(100, (state.economicScore.blue / 36) * 100)}%` }} /><i style={{ width: `${Math.min(100, (state.economicScore.red / 36) * 100)}%` }} /></div>
      <p className="score-caption">Nur die ertragreichste nutzbare SLOC zählt am Rundenende.</p>
    </section>

    <section className="panel routes-panel">
      <div className="panel-heading"><span>SLOCs</span><small>Live-Prognose</small></div>
      <button className="route-rules-button" type="button" onClick={onShowRules}>
        <span>?</span> Wann ist ein Seeweg frei, unter Druck oder zu?
      </button>
      <div className="route-list">
        {ROUTE_ORDER.map((routeId) => {
          const route = ROUTES[routeId]
          const result = calculateRouteYield(state, routeId)
          const valid = validRoutes.includes(routeId)
          return (
            <button
              type="button"
              key={routeId}
              className={`route-entry ${factionClass(route.faction)} ${valid ? 'valid-route' : ''} ${selectedRoute === routeId ? 'selected' : ''}`}
              onClick={() => onRouteClick(routeId)}
              disabled={validRoutes.length > 0 && !valid}
            >
              <span className="route-line-icon">{route.kind === 'main' ? '━' : '┄'}</span>
              <span>
                <strong>{route.name.replace(/^(Blaue|Rote) /, '')}</strong>
                <small>{result.blocked ? result.reason : `${result.contestedRegions} unter Druck · Esk −${result.escalationPenalty + result.responsibilityPenalty}`}</small>
              </span>
              <b className={result.blocked ? 'blocked' : ''}>{result.blocked ? 'ZU' : `+${result.yield}`}</b>
            </button>
          )
        })}
      </div>
    </section>

    <section className="panel round-track">
      <div className="panel-heading"><span>Runde</span></div>
      <div className="round-dots">
        {Array.from({ length: constants.MAX_ROUNDS }, (_, index) => index + 1).map((round) => (
          <span key={round} className={round < state.round ? 'complete' : round === state.round ? 'current' : ''}>{round}</span>
        ))}
      </div>
      <p>{state.phase === 'complete' ? 'Partie beendet' : `Runde ${state.round} von ${constants.MAX_ROUNDS}`}</p>
    </section>
  </aside>
)

const RouteRulesDialog = ({ onClose }: { onClose: () => void }) => {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  return (
    <div
      className="modal-backdrop rules-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="route-rules-title"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}
    >
      <section className="route-rules-dialog">
        <header>
          <div><span className="eyebrow">REGELHILFE · SLOCs</span><h2 id="route-rules-title">Wann ist eine SLOC nutzbar?</h2></div>
          <button type="button" onClick={onClose} aria-label="Regelhilfe schließen">×</button>
        </header>

        <div className="projection-explainer">
          <span>Berechnung je Region und Seite</span>
          <strong>Präsenz + Lagebild + Zugang + Logistik = Projektion</strong>
          <p>Die eigene Projektion wird immer mit der gegnerischen Projektion in derselben Region verglichen.</p>
        </div>

        <div className="route-status-grid">
          <article className="status-free">
            <div><i /> <strong>Frei nutzbar</strong></div>
            <p>Deine Projektion ist mindestens so hoch wie die gegnerische.</p>
            <small>Die Region verursacht keinen zusätzlichen SLOC-Malus.</small>
          </article>
          <article className="status-contested">
            <div><i /> <strong>Unter Druck</strong></div>
            <p>Deine Projektion liegt genau 1 oder 2 Punkte hinter der gegnerischen.</p>
            <small>Der Seeweg bleibt offen, verliert aber je betroffener Region 1 Ertrag.</small>
          </article>
          <article className="status-denied">
            <div><i /> <strong>Verwehrt / zu</strong></div>
            <p>Deine Projektion liegt mindestens 3 Punkte hinter der gegnerischen.</p>
            <small>Jede SLOC durch diese Region ist für dich geschlossen.</small>
          </article>
        </div>

        <div className="closure-rules">
          <h3>Eine SLOC ist außerdem geschlossen, wenn …</h3>
          <ul>
            <li>am Ausgangsraum oder am Freihafen kein eigener aktiver Zugang mehr besteht,</li>
            <li>mindestens eine durchquerte Region für die Seite verwehrt ist, oder</li>
            <li>die gegnerische Seite die Meridianstraße kontrolliert – dies betrifft nur die Haupt-SLOC.</li>
          </ul>
        </div>

        <div className="rules-notes">
          <p><strong>Engpasskontrolle:</strong> mindestens 2 Punkte Projektionsvorsprung sowie 2 Präsenz und 1 Zugang in der Meridianstraße. Die Ausweich-SLOC bleibt möglich.</p>
          <p><strong>Eskalation:</strong> verändert nicht den Status „frei/zu“, reduziert aber zusätzlich den wirtschaftlichen Ertrag einer weiterhin nutzbaren SLOC.</p>
          <p><strong>Konvoisicherung:</strong> hebt bei der nächsten Wertung genau einen „unter Druck“-Malus auf.</p>
        </div>

        <footer><button className="confirm-button" type="button" onClick={onClose}>Verstanden</button></footer>
      </section>
    </div>
  )
}

interface HandProps {
  state: GameState
  selected?: CardInstance
  selectedRegions: RegionId[]
  selectedRoute?: RouteId
  hybridResource?: SuspendableResource
  error?: string
  onSelect: (instance: CardInstance) => void
  onResource: (resource: SuspendableResource) => void
  onConfirm: () => void
  onCancel: () => void
  onEndTurn: () => void
}

const CardHand = ({ state, selected, selectedRegions, selectedRoute, hybridResource, error, onSelect, onResource, onConfirm, onCancel, onEndTurn }: HandProps) => {
  const faction = state.activeFaction
  const hoverTimer = useRef<ReturnType<typeof window.setTimeout> | null>(null)
  const [tooltip, setTooltip] = useState<{
    card: CardInstance
    left: number
    top: number
    insufficientAp: boolean
  }>()
  const card = selected ? CARDS[selected.cardId] : undefined
  const play: CardPlay | undefined = selected ? { instanceId: selected.instanceId, regions: selectedRegions, routeId: selectedRoute, resource: hybridResource } : undefined
  const ready = card && play ? isPlayReady(card.id, play) : false
  const hybridOptions = card?.target === 'hybrid-resource' && selectedRegions[0]
    ? getValidHybridResources(state, selectedRegions[0])
    : []

  const hideTooltip = () => {
    if (hoverTimer.current !== null) window.clearTimeout(hoverTimer.current)
    hoverTimer.current = null
    setTooltip(undefined)
  }

  const scheduleTooltip = (instance: CardInstance, element: HTMLElement, delay: number) => {
    if (hoverTimer.current !== null) window.clearTimeout(hoverTimer.current)
    const rect = element.getBoundingClientRect()
    hoverTimer.current = window.setTimeout(() => {
      const width = 290
      setTooltip({
        card: instance,
        left: Math.min(window.innerWidth - width - 12, Math.max(12, rect.left + rect.width / 2 - width / 2)),
        top: Math.max(12, rect.top - (CARDS[instance.cardId].escalation > 0 ? 232 : 178)),
        insufficientAp: CARDS[instance.cardId].cost > state.actionPoints,
      })
    }, delay)
  }

  useEffect(() => () => {
    if (hoverTimer.current !== null) window.clearTimeout(hoverTimer.current)
  }, [])

  return (
    <section className={`hand-panel ${factionClass(faction)}`}>
      <div className="action-composer">
        <div className="composer-copy">
          <span className="eyebrow">{card ? `BEFEHL · ${card.domain}` : 'BEFEHLSHAND'}</span>
          <strong>{card ? card.instruction : 'Karte wählen und Wirkung auf der Lagekarte platzieren.'}</strong>
          {error && <small className="action-error">{error}</small>}
        </div>
        {card && (
          <div className="target-summary">
            {selectedRegions.map((id, index) => <span key={`${id}-${index}`}>{index + 1}. {REGIONS[id].shortName}</span>)}
            {selectedRoute && <span>{ROUTES[selectedRoute].name}</span>}
            {hybridOptions.length > 0 && !hybridResource && hybridOptions.map((resource) => (
              <button type="button" key={resource} onClick={() => onResource(resource)}>{RESOURCE_LABELS[resource].name} wählen</button>
            ))}
            {hybridResource && <span>{RESOURCE_LABELS[hybridResource].name}</span>}
          </div>
        )}
        <div className="composer-actions">
          {card && <button className="ghost-button" type="button" onClick={onCancel}>Abbrechen</button>}
          {card && <button className="confirm-button" type="button" disabled={!ready} onClick={onConfirm}>Für {card.cost} AP ausspielen</button>}
          <button className="end-turn-button" type="button" onClick={onEndTurn}>Zug beenden <span>→</span></button>
        </div>
      </div>
      <div className="cards-row" aria-label={`Kartenhand ${FACTIONS[faction].name}`}>
        {state.hands[faction].map((instance) => {
          const definition = CARDS[instance.cardId]
          const disabled = definition.cost > state.actionPoints || (definition.id === 'deescalation_channel' && state.escalation === 0)
          return (
            <button
              type="button"
              className={`strategy-card ${selected?.instanceId === instance.instanceId ? 'selected' : ''}`}
              key={instance.instanceId}
              onClick={() => { if (!disabled) onSelect(instance) }}
              aria-disabled={disabled}
              aria-describedby={tooltip?.card.instanceId === instance.instanceId ? `card-help-${instance.instanceId}` : undefined}
              onMouseEnter={(event) => scheduleTooltip(instance, event.currentTarget, 700)}
              onMouseLeave={hideTooltip}
              onFocus={(event) => scheduleTooltip(instance, event.currentTarget, 150)}
              onBlur={hideTooltip}
            >
              <span className="card-domain">{definition.domain}</span>
              <span className="card-cost">{definition.cost}</span>
              {definition.escalation > 0 && <span className="card-risk" title={`Eskalation +${definition.escalation}`}>△ +{definition.escalation}</span>}
              <span className="card-icon"><CardIcon cardId={definition.id} /></span>
              <strong>{definition.title}</strong>
              <p>{definition.description}</p>
              <span className="card-footer">SLOC // {definition.id.toUpperCase().slice(0, 8)}</span>
            </button>
          )
        })}
        {state.hands[faction].length === 0 && <div className="empty-hand">Keine Karten auf der Hand.</div>}
      </div>
      {tooltip && createPortal((() => {
        const definition = CARDS[tooltip.card.cardId]
        return (
          <aside
            id={`card-help-${tooltip.card.instanceId}`}
            className={`card-hover-help ${factionClass(faction)}`}
            style={{ left: tooltip.left, top: tooltip.top }}
            role="tooltip"
          >
            <div className="hover-help-heading">
              <span><CardIcon cardId={definition.id} /></span>
              <div><small>{definition.domain} · {definition.cost} AP</small><strong>{definition.title}</strong></div>
            </div>
            <div className="hover-help-section"><b>Wirkung</b><p>{definition.description}</p></div>
            <div className="hover-help-section"><b>Wann &amp; wo?</b><p>{definition.playHint}</p></div>
            {definition.escalation > 0 && (
              <div className="hover-help-escalation">
                <b>Eskalationsrisiko +{definition.escalation}</b>
                <p>{definition.escalationReason}</p>
              </div>
            )}
            {tooltip.insufficientAp && <div className="hover-help-warning">Aktuell fehlen Aktionspunkte: benötigt {definition.cost}, verfügbar {state.actionPoints}.</div>}
          </aside>
        )
      })(), document.body)}
    </section>
  )
}

const EndGameDialog = ({ state, onRestart }: { state: GameState; onRestart: () => void }) => {
  if (state.phase !== 'complete' || !state.winner) return null
  const winner = state.winner.faction
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="result-title">
      <div className={`result-dialog ${winner ? factionClass(winner) : ''}`}>
        <span className="result-compass">✦</span>
        <span className="eyebrow">SECHSTE WIRTSCHAFTSAUSWERTUNG</span>
        <h2 id="result-title">{winner ? `${FACTIONS[winner].name} setzt sich durch` : 'Strategisches Gleichgewicht'}</h2>
        <p>{state.winner.reason}</p>
        <div className="final-scores">
          <div className="is-blue"><span>Blau</span><strong>{state.economicScore.blue}</strong></div>
          <i>:</i>
          <div className="is-red"><span>Rot</span><strong>{state.economicScore.red}</strong></div>
        </div>
        <button className="confirm-button" type="button" onClick={onRestart}>Neue Partie beginnen</button>
      </div>
    </div>
  )
}

export default function App() {
  const [state, setState] = useState<GameState>(loadState)
  const [selectedCardId, setSelectedCardId] = useState<string>()
  const [selectedRegions, setSelectedRegions] = useState<RegionId[]>([])
  const [selectedRoute, setSelectedRoute] = useState<RouteId>()
  const [hybridResource, setHybridResource] = useState<SuspendableResource>()
  const [inspected, setInspected] = useState<RegionId>('central_basin')
  const [error, setError] = useState<string>()
  const [showRouteRules, setShowRouteRules] = useState(false)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }, [state])

  const selectedCard = state.hands[state.activeFaction].find((entry) => entry.instanceId === selectedCardId)
  const selectedDefinition = selectedCard ? CARDS[selectedCard.cardId] : undefined
  const validRegions = useMemo(
    () => selectedCard && selectedDefinition?.target !== 'route' && !isPlayReady(selectedCard.cardId, { instanceId: selectedCard.instanceId, regions: selectedRegions, resource: hybridResource })
      ? getValidRegionTargets(state, selectedCard.cardId, selectedRegions)
      : [],
    [state, selectedCard, selectedDefinition, selectedRegions, hybridResource],
  )
  const validRoutes = selectedDefinition?.target === 'route'
    ? ROUTE_ORDER.filter((id) => ROUTES[id].faction === state.activeFaction)
    : []

  const clearSelection = () => {
    setSelectedCardId(undefined)
    setSelectedRegions([])
    setSelectedRoute(undefined)
    setHybridResource(undefined)
    setError(undefined)
  }

  const handleSelectCard = (instance: CardInstance) => {
    if (selectedCardId === instance.instanceId) {
      clearSelection()
      return
    }
    setSelectedCardId(instance.instanceId)
    setSelectedRegions([])
    setSelectedRoute(undefined)
    setHybridResource(undefined)
    setError(undefined)
  }

  const handleRegionClick = (regionId: RegionId) => {
    setInspected(regionId)
    if (!selectedCard || !validRegions.includes(regionId)) return
    setSelectedRegions((current) => [...current, regionId])
    setHybridResource(undefined)
  }

  const handleRouteClick = (routeId: RouteId) => {
    if (!selectedCard || !validRoutes.includes(routeId)) return
    setSelectedRoute(routeId)
  }

  const handleConfirm = () => {
    if (!selectedCard) return
    try {
      const next = playCard(state, {
        instanceId: selectedCard.instanceId,
        regions: selectedRegions,
        routeId: selectedRoute,
        resource: hybridResource,
      })
      setState(next)
      clearSelection()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Die Aktion konnte nicht ausgeführt werden.')
    }
  }

  const handleEndTurn = () => {
    setState((current) => endTurn(current))
    clearSelection()
  }

  const restart = () => {
    if (state.phase !== 'complete' && !window.confirm('Laufende Partie wirklich verwerfen und neu beginnen?')) return
    const fresh = createInitialState()
    setState(fresh)
    setInspected('central_basin')
    clearSelection()
  }

  const escalationBand = getEscalationBand(state.escalation)

  return (
    <div className={`app-shell ${factionClass(state.activeFaction)}`}>
      <header className="topbar">
        <div className="brand-mark" aria-hidden="true"><span>✦</span></div>
        <div className="brand-copy"><span>SEA LINES OF</span><strong>COMMUNICATION</strong><small>Rundenbasierte Strategie zur maritimen Großwetterlage</small></div>
        <div className="turn-status">
          <span>RUNDE</span><strong>{state.round}<small>/ {constants.MAX_ROUNDS}</small></strong>
          <i />
          <div><span>AKTIV</span><b>{FACTIONS[state.activeFaction].adjective}</b></div>
        </div>
        <div className={`escalation-meter ${escalationBand.tone}`} aria-label={`Eskalation ${state.escalation} von ${constants.MAX_ESCALATION}, ${escalationBand.label}`}>
          <div className="escalation-copy"><span>ESKALATION</span><b>{escalationBand.label}</b></div>
          <div className="escalation-pips" aria-hidden="true">
            {Array.from({ length: constants.MAX_ESCALATION }, (_, index) => <i key={index} className={index < state.escalation ? 'filled' : ''} />)}
          </div>
          <strong>{state.escalation}<small>/{constants.MAX_ESCALATION}</small></strong>
        </div>
        <button className="new-game" type="button" onClick={restart} title="Neue Partie">↻ <span>Neue Partie</span></button>
      </header>

      <main className="game-grid">
        <Sidebar state={state} />
        <MapBoard
          state={state}
          inspected={inspected}
          validRegions={validRegions}
          selectedRegions={selectedRegions}
          validRoutes={validRoutes}
          selectedRoute={selectedRoute}
          onRegionClick={handleRegionClick}
          onRouteClick={handleRouteClick}
        />
        <Scoreboard
          state={state}
          validRoutes={validRoutes}
          selectedRoute={selectedRoute}
          onRouteClick={handleRouteClick}
          onShowRules={() => setShowRouteRules(true)}
        />
        <CardHand
          state={state}
          selected={selectedCard}
          selectedRegions={selectedRegions}
          selectedRoute={selectedRoute}
          hybridResource={hybridResource}
          error={error}
          onSelect={handleSelectCard}
          onResource={setHybridResource}
          onConfirm={handleConfirm}
          onCancel={clearSelection}
          onEndTurn={handleEndTurn}
        />
      </main>

      <div className="small-screen-warning">
        <span>✦</span><h1>Größeres Display erforderlich</h1><p>Diese operative Lagekarte ist für Desktop und Laptop ab 1280 Pixel Breite ausgelegt.</p>
      </div>
      <EndGameDialog state={state} onRestart={restart} />
      {showRouteRules && <RouteRulesDialog onClose={() => setShowRouteRules(false)} />}
    </div>
  )
}
