import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { chooseAiAction } from './ai'
import { CARDS, FACTIONS, REGIONS, REGION_ORDER, RESOURCE_LABELS, ROUTES, ROUTE_ORDER, USABILITY_LABELS } from './data'
import {
  calculateProjection,
  calculateLeadershipRating,
  calculateRoundYield,
  calculateRouteYield,
  constants,
  COVERT_CARD_IDS,
  createFactionView,
  createInitialState,
  endTurn,
  evaluateChokepoint,
  getEffectiveResources,
  getEscalationBand,
  getUsability,
  getValidHybridResources,
  getValidRegionTargets,
  isPlayReady,
  migrateGameState,
  otherFaction,
  playCard,
} from './engine'
import {
  LanguageProvider,
  cardText,
  escalationLabel,
  factionText,
  formatError,
  formatLogEntry,
  formatYieldReason,
  formatWinnerReason,
  governmentText,
  leadershipLabel,
  pick,
  regionText,
  resourceText,
  routeText,
  usabilityText,
  useLanguage,
  type Language,
} from './i18n'
import {
  createOnlineRoom,
  isRoomSnapshot,
  joinOnlineRoom,
  socketUrl,
  type ConnectionStatus,
  type OnlineSession,
  type RoomCommand,
  type RoomSnapshot,
} from './multiplayer'
import type {
  CardInstance,
  CardPlay,
  FactionId,
  GameState,
  GovernmentSelection,
  GovernmentType,
  RegionId,
  ResourceKey,
  RouteId,
  RoundCount,
  SuspendableResource,
} from './types'

const STORAGE_KEY = 'sloc-game-v8'
const LOCAL_PVP_STORAGE_KEY = 'sloc-local-pvp-v8'
const V7_STORAGE_KEY = 'sloc-game-v7'
const V7_LOCAL_PVP_STORAGE_KEY = 'sloc-local-pvp-v7'
const V6_STORAGE_KEY = 'sloc-game-v6'
const V6_LOCAL_PVP_STORAGE_KEY = 'sloc-local-pvp-v6'
const V5_STORAGE_KEY = 'sloc-game-v5'
const V5_LOCAL_PVP_STORAGE_KEY = 'sloc-local-pvp-v5'
const V4_STORAGE_KEY = 'sloc-game-v4'
const V4_LOCAL_PVP_STORAGE_KEY = 'sloc-local-pvp-v4'
const V3_STORAGE_KEY = 'sloc-game-v3'
const V2_STORAGE_KEY = 'sloc-game-v2'
const LEGACY_STORAGE_KEY = 'sloc-mvp1-game-v1'
const ONLINE_SESSION_KEY = 'sloc-online-session-v1'
const LANGUAGE_KEY = 'sloc-language-v1'
const MUSIC_VOLUME_KEY = 'sloc-music-volume-v1'
const MUSIC_MUTED_KEY = 'sloc-music-muted-v1'
const DEFAULT_MUSIC_VOLUME = 0.32
const MUSIC_FADE_MS = 650
const MUSIC_TRACK_STABILITY_MS = 1000
const MUSIC_TRACKS = {
  title: '/audio/music/title-theme.ogg',
  high: '/audio/music/escalation-high.ogg',
  maximum: '/audio/music/escalation-maximum.ogg',
} as const

const loadMusicVolume = () => {
  try {
    const stored = localStorage.getItem(MUSIC_VOLUME_KEY)
    if (stored === null) return DEFAULT_MUSIC_VOLUME
    const value = Number(stored)
    return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : DEFAULT_MUSIC_VOLUME
  } catch {
    return DEFAULT_MUSIC_VOLUME
  }
}

const loadMusicMuted = () => {
  try {
    return localStorage.getItem(MUSIC_MUTED_KEY) === 'true'
  } catch {
    return false
  }
}

const useGameMusic = (track: string, volume: number) => {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const animationFrameRef = useRef<number | undefined>(undefined)
  const currentTrackRef = useRef<string>(MUSIC_TRACKS.title)
  const volumeRef = useRef(volume)

  useEffect(() => {
    const audio = document.createElement('audio')

    audio.src = MUSIC_TRACKS.title
    audio.loop = true
    audio.preload = 'auto'
    audio.volume = 0
    audio.muted = volume === 0
    audio.hidden = true
    audio.dataset.gameMusic = 'true'
    audio.setAttribute('aria-hidden', 'true')
    document.body.append(audio)
    audioRef.current = audio
    audio.load()

    return () => {
      if (animationFrameRef.current !== undefined) cancelAnimationFrame(animationFrameRef.current)
      audio.pause()
      audio.removeAttribute('src')
      audio.remove()
      audioRef.current = null
    }
  }, [])

  useEffect(() => {
    volumeRef.current = volume
    const audio = audioRef.current
    if (!audio) return
    audio.muted = volume === 0
    if (!audio.paused) audio.volume = volume
  }, [volume])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    let disposed = false

    const cancelFade = () => {
      if (animationFrameRef.current === undefined) return
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = undefined
    }

    const fadeTo = (target: number) => new Promise<void>((resolve) => {
      cancelFade()
      const initialVolume = audio.volume
      const startedAt = performance.now()

      const step = (now: number) => {
        if (disposed) return
        const progress = Math.min((now - startedAt) / MUSIC_FADE_MS, 1)
        audio.volume = initialVolume + (target - initialVolume) * progress
        if (progress < 1) {
          animationFrameRef.current = requestAnimationFrame(step)
          return
        }
        animationFrameRef.current = undefined
        resolve()
      }

      animationFrameRef.current = requestAnimationFrame(step)
    })

    const start = async () => {
      if (disposed) return
      try {
        if (currentTrackRef.current !== track) {
          await fadeTo(0)
          if (disposed) return
          audio.pause()
          audio.src = track
          audio.currentTime = 0
          audio.volume = 0
          currentTrackRef.current = track
          audio.load()
        }
        if (audio.paused) await audio.play()
        if (disposed) return
        await fadeTo(volumeRef.current)
      } catch {
        // Browser autoplay may be blocked until a React UI event calls the
        // synchronous start function returned by this hook.
      }
    }

    void start()

    return () => {
      disposed = true
      cancelFade()
    }
  }, [track])

  return () => {
    const audio = audioRef.current
    if (!audio) return
    audio.muted = volumeRef.current === 0
    audio.volume = volumeRef.current
    if (audio.paused) void audio.play().catch(() => undefined)
  }
}

const loadState = (storageKey = STORAGE_KEY): GameState => {
  try {
    const raw = localStorage.getItem(storageKey)
      ?? (storageKey === STORAGE_KEY
        ? localStorage.getItem(V7_STORAGE_KEY) ?? localStorage.getItem(V6_STORAGE_KEY) ?? localStorage.getItem(V5_STORAGE_KEY) ?? localStorage.getItem(V4_STORAGE_KEY) ?? localStorage.getItem(V3_STORAGE_KEY) ?? localStorage.getItem(V2_STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY)
        : storageKey === LOCAL_PVP_STORAGE_KEY ? localStorage.getItem(V7_LOCAL_PVP_STORAGE_KEY) ?? localStorage.getItem(V6_LOCAL_PVP_STORAGE_KEY) ?? localStorage.getItem(V5_LOCAL_PVP_STORAGE_KEY) ?? localStorage.getItem(V4_LOCAL_PVP_STORAGE_KEY) : null)
    if (!raw) return createInitialState()
    const parsed = JSON.parse(raw) as GameState
    if (!parsed.regions?.central_basin || !parsed.hands?.blue) return createInitialState()
    return migrateGameState(parsed)
  } catch {
    return createInitialState()
  }
}

const factionClass = (faction: FactionId) => (faction === 'blue' ? 'is-blue' : 'is-red')

const GovernmentSelector = ({ faction, value, onChange, pending = false }: { faction: FactionId; value: GovernmentType; onChange?: (government: GovernmentType) => void; pending?: boolean }) => {
  const language = useLanguage()
  return <section className={`government-side ${factionClass(faction)} ${pending ? 'is-pending' : ''}`}>
    <div className="government-side-heading">
      <span>{factionText(faction, language).adjective}</span>
      <small>{faction === 'blue' ? pick(language, 'Blaue Koalition', 'Blue Coalition') : pick(language, 'Rote Koalition', 'Red Coalition')}</small>
    </div>
    {pending
      ? <div className="government-pending"><strong>{pick(language, 'Wird von Rot gewählt', 'Selected by Red')}</strong><small>{pick(language, 'nach Eingabe des Raumcodes', 'after entering the room code')}</small></div>
      : <div className="government-options" role="group" aria-label={`${factionText(faction, language).adjective}: ${pick(language, 'Staatsform wählen', 'choose government')}`}>
          {constants.GOVERNMENT_OPTIONS.map((government) => <button type="button" key={government} className={value === government ? 'active' : ''} aria-pressed={value === government} onClick={() => onChange?.(government)}>
            <strong>{governmentText(government, language).name}</strong>
            <small>{governmentText(government, language).benefit}</small>
          </button>)}
        </div>}
  </section>
}

const GovernmentSetup = ({ governments, onChange, pendingRed = false }: { governments: GovernmentSelection; onChange: (faction: FactionId, government: GovernmentType) => void; pendingRed?: boolean }) => (
  <div className="government-setup">
    <GovernmentSelector faction="blue" value={governments.blue} onChange={(government) => onChange('blue', government)} />
    <GovernmentSelector faction="red" value={governments.red} onChange={(government) => onChange('red', government)} pending={pendingRed} />
  </div>
)

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
  const language = useLanguage()
  const resources = getEffectiveResources(state, regionId, faction)
  return (
    <g>
      <title>{`${factionText(faction, language).adjective}: ${resourceText('presence', language).name} ${resources.presence}, ${resourceText('awareness', language).name} ${resources.awareness}, ${resourceText('access', language).name} ${resources.access}, ${resourceText('logistics', language).name} ${resources.logistics}`}</title>
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
  const language = useLanguage()
  const chokepoint = evaluateChokepoint(state)
  return (
    <section className="map-panel" aria-label={pick(language, 'Strategische Seekarte', 'Strategic maritime map')}>
      <div className="map-heading">
        <div>
          <span className="eyebrow">{pick(language, 'OPERATIVES LAGEBILD', 'OPERATIONAL PICTURE')}</span>
          <h2>Pelagos-Archipel</h2>
        </div>
        <div className="map-legend-stack">
          <div className="map-legend" aria-label={pick(language, 'Statuslegende', 'Status legend')}>
            <span><i className="legend-dot free" /> {pick(language, 'frei', 'open')}</span>
            <span><i className="legend-dot contested" /> {pick(language, 'umkämpft', 'contested')}</span>
            <span><i className="legend-dot denied" /> {pick(language, 'verwehrt', 'denied')}</span>
          </div>
          <div className="map-resource-key" aria-label={pick(language, 'Ressourcenlegende', 'Resource legend')}>
            {RESOURCE_ORDER.map((resource) => <span key={resource}><ResourceIcon resource={resource} />{resourceText(resource, language).name}</span>)}
          </div>
        </div>
      </div>
      <div className="map-stage">
        <svg className="strategy-map" viewBox="0 0 900 530" role="img" aria-label={pick(language, 'Fiktive maritime Karte mit neun Regionen und vier Sea Lines of Communication', 'Fictional maritime map with nine regions and four Sea Lines of Communication')}>
          <defs>
            <linearGradient id="sea" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#e9e4d6" />
              <stop offset="0.52" stopColor="#dce3df" />
              <stop offset="1" stopColor="#cbd8d8" />
            </linearGradient>
            <linearGradient id="land" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#ded0aa" />
              <stop offset="0.55" stopColor="#c5b48d" />
              <stop offset="1" stopColor="#9d8d69" />
            </linearGradient>
            <pattern id="landTexture" width="14" height="14" patternUnits="userSpaceOnUse">
              <path d="M-2 11 C3 7 8 7 16 2 M-4 4 C2 0 8 1 14-3" fill="none" stroke="#735f3f" strokeOpacity=".11" strokeWidth=".8" />
            </pattern>
            <pattern id="chartGrid" width="30" height="30" patternUnits="userSpaceOnUse">
              <path d="M30 0H0V30" fill="none" stroke="#284d61" strokeOpacity=".09" strokeWidth=".7" />
            </pattern>
            <pattern id="deniedPattern" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="8" stroke="#9d3434" strokeOpacity=".3" strokeWidth="2" />
            </pattern>
            <filter id="nodeShadow" x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#071c2c" floodOpacity=".3" />
            </filter>
            <filter id="landShadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor="#203b47" floodOpacity=".24" />
            </filter>
          </defs>
          <rect width="900" height="530" fill="url(#sea)" />
          <rect width="900" height="530" fill="url(#chartGrid)" />
          <path className="bathymetry" d="M-20 70 C160 135 224 50 383 95 S690 137 930 48" />
          <path className="bathymetry" d="M-10 392 C151 332 278 360 389 414 S693 490 920 401" />
          <path className="bathymetry thin" d="M54 0 C110 173 75 330 153 540 M770 -10 C712 161 758 349 690 540" />
          <g className="map-land" filter="url(#landShadow)">
            <path className="landmass coast-edge" d="M0 0 H154 C160 31 139 58 112 75 C83 94 69 126 43 143 C29 152 14 158 0 160 Z" />
            <path className="landmass coast-edge" d="M900 0 H746 C740 31 761 58 788 75 C817 94 831 126 857 143 C871 152 886 158 900 160 Z" />
            <path className="landmass continent" d="M168 164 C205 136 276 137 327 166 C374 193 387 231 363 267 C344 295 368 317 353 349 C333 391 287 407 248 386 C211 366 202 332 174 307 C142 278 139 208 168 164 Z" />
            <path className="landmass continent" d="M732 164 C695 136 624 137 573 166 C526 193 513 231 537 267 C556 295 532 317 547 349 C567 391 613 407 652 386 C689 366 698 332 726 307 C758 278 761 208 732 164 Z" />
            <path className="landmass freeport-island" d="M421 412 C433 393 460 389 477 403 C493 416 493 448 481 468 C469 487 438 490 422 472 C407 455 407 431 421 412 Z" />
            <path className="land-texture" d="M168 164 C205 136 276 137 327 166 C374 193 387 231 363 267 C344 295 368 317 353 349 C333 391 287 407 248 386 C211 366 202 332 174 307 C142 278 139 208 168 164 Z M732 164 C695 136 624 137 573 166 C526 193 513 231 537 267 C556 295 532 317 547 349 C567 391 613 407 652 386 C689 366 698 332 726 307 C758 278 761 208 732 164 Z" />
            <path className="coastline-detail" d="M178 174 C216 151 271 151 316 175 M181 297 C207 322 218 362 252 376 M722 174 C684 151 629 151 584 175 M719 297 C693 322 682 362 648 376" />
            <path className="landmass islands" d="M469 74 l15 8 -7 14 -20 2 -8 -11 Z M405 320 l12 7 -5 13 -18 2 -7 -10 Z M807 397 l14 8 -5 14 -19 2 -8 -11 Z" />
          </g>

          {REGION_ORDER.map((regionId) => {
            const region = regionText(regionId, language)
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
            const route = routeText(routeId, language)
            const result = calculateRouteYield(state, routeId)
            const valid = validRoutes.includes(routeId)
            const operationalYield = Math.max(0, result.yield - result.governmentBonus)
            const flowRatio = state.escalation >= constants.MAX_ESCALATION || result.blocked
              ? 0
              : Math.max(0, Math.min(1, operationalYield / state.routeCapacity[routeId]))
            const flowDuration = 5.2 - flowRatio * 3.4
            return (
              <g key={routeId} className={`map-route ${factionClass(route.faction)} ${route.kind} ${result.blocked ? 'blocked' : ''} ${flowRatio > 0 ? 'flowing' : 'flow-stopped'} ${valid ? 'valid-route' : ''} ${selectedRoute === routeId ? 'selected-route' : ''}`}>
                <path className="route-hitbox" d={route.svgPath} onClick={() => onRouteClick(routeId)} />
                <path className="route-line" d={route.svgPath} />
                <path className="route-flow" d={route.svgPath} pathLength="100" style={{ animationDuration: `${flowDuration}s` }} />
              </g>
            )
          })}

          {REGION_ORDER.map((regionId) => {
            const region = regionText(regionId, language)
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
                aria-label={`${region.name}, ${usabilityText(usability, language).label} ${pick(language, 'für', 'for')} ${factionText(state.activeFaction, language).adjective}`}
              >
                <circle className="node-ring" r={region.chokepoint ? 29 : 25} />
                <circle className="node-core" r={region.chokepoint ? 22 : 19} />
                <text className="node-symbol" y="5">{region.chokepoint ? '◇' : region.market ? '¤' : '✦'}</text>
                <text className="node-title" y={-34}>{region.shortName}</text>
                <text className="node-status" y={region.chokepoint ? 45 : 41}>{usabilityText(usability, language).short}</text>
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
          <span className="eyebrow">{pick(language, 'MERIDIANSTRASSE', 'MERIDIAN STRAIT')}</span>
          <strong className={chokepoint ? factionClass(chokepoint) : ''}>
            {chokepoint ? `${factionText(chokepoint, language).adjective} ${pick(language, 'kontrolliert', 'controls')}` : pick(language, 'Offen · nicht kontrolliert', 'Open · uncontrolled')}
          </strong>
        </div>
        <div className="sloc-legend" aria-label={pick(language, 'Legende der Seewege', 'Sea line legend')}>
          <span><i className="main-line" />{pick(language, 'Haupt-SLOC · direkter', 'Main SLOC · more direct')}</span>
          <span><i className="detour-line" />{pick(language, 'Ausweich-SLOC · länger', 'Detour SLOC · longer')}</span>
        </div>
        <RegionInspector state={state} regionId={inspected} />
      </div>
    </section>
  )
}

const RegionInspector = ({ state, regionId }: { state: GameState; regionId: RegionId }) => {
  const language = useLanguage()
  const region = regionText(regionId, language)
  return (
    <aside className="region-inspector" aria-live="polite">
      <div className="inspector-title">
        <div><span className="eyebrow">{pick(language, 'REGION', 'REGION')}</span><h3>{region.name}</h3></div>
        {region.chokepoint && <span className="special-tag">{pick(language, 'ENGPASS', 'CHOKEPOINT')}</span>}
        {region.market && <span className="special-tag">{pick(language, 'MARKT', 'MARKET')}</span>}
      </div>
      <p>{region.subtitle}</p>
      <div className="inspector-factions">
        {(['blue', 'red'] as const).map((faction) => {
          const usability = getUsability(state, regionId, faction)
          const resources = getEffectiveResources(state, regionId, faction)
          const suspended = state.suspensions.some((entry) => entry.faction === faction && entry.regionId === regionId)
          return (
            <div className={`inspector-faction ${factionClass(faction)}`} key={faction}>
              <div><strong>{factionText(faction, language).adjective}</strong><span className={`status-text ${usability}`}>{usabilityText(usability, language).label}</span></div>
              <div className="mini-resources">
                {RESOURCE_ORDER.map((resource) => (
                  <span key={resource} title={resourceText(resource, language).name}><ResourceIcon resource={resource} /><b>{resources[resource]}</b></span>
                ))}
              </div>
              <small>{pick(language, 'Projektion', 'Projection')} {calculateProjection(state, regionId, faction)}{suspended ? pick(language, ' · Ressource suspendiert', ' · Resource suspended') : ''}</small>
            </div>
          )
        })}
      </div>
    </aside>
  )
}

const Sidebar = ({ state }: { state: GameState }) => {
  const language = useLanguage()
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
        <span className="eyebrow">{pick(language, 'AKTIVE KOALITION', 'ACTIVE COALITION')}</span>
        <div className="faction-lockup"><span className="faction-seal">{factionText(active, language).symbol}</span><div><h2>{factionText(active, language).name}</h2><p>{governmentText(state.governments[active], language).name} · {state.turnIndex === 0 ? pick(language, 'Erste Initiative', 'First initiative') : pick(language, 'Reaktion', 'Response')} · {pick(language, 'Runde', 'Round')} {state.round}</p></div></div>
        <div className="ap-display" aria-label={`${state.actionPoints} ${pick(language, 'Aktionspunkte verbleibend', 'action points remaining')}`}>
          <span>{pick(language, 'AKTIONSPUNKTE', 'ACTION POINTS')}</span>
          <div>{[1, 2, 3].map((value) => <i key={value} className={value <= state.actionPoints ? 'filled' : ''}>{value <= state.actionPoints ? '●' : '○'}</i>)}</div>
        </div>
      </section>

      <section className="panel resource-overview">
        <div className="panel-heading"><span>{pick(language, 'Strategische Lage', 'Strategic Situation')}</span><small>{pick(language, 'Summen auf der Karte', 'Map totals')}</small></div>
        {RESOURCE_ORDER.map((resource) => (
          <div className="resource-row" key={resource}>
            <span className="resource-icon"><ResourceIcon resource={resource} /></span>
            <span>{resourceText(resource, language).name}</span>
            <strong>{activeTotals[resource]}</strong>
          </div>
        ))}
        <div className="projection-note"><span>{pick(language, 'Engpass', 'Chokepoint')}</span><strong>{choke ? factionText(choke, language).adjective : pick(language, 'offen', 'open')}</strong></div>
      </section>

      <section className="panel log-panel">
        <div className="panel-heading"><span>{pick(language, 'Operationslog', 'Operations Log')}</span><small>{pick(language, 'letzte Meldungen', 'latest reports')}</small></div>
        <ol>
          {state.log.map((entry) => (
            <li key={entry.id} className={entry.faction ? factionClass(entry.faction) : ''}>
              <span>R{entry.round}</span><p>{formatLogEntry(entry, language)}</p>
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
}

const Scoreboard = ({ state, validRoutes, selectedRoute, onRouteClick }: ScoreboardProps) => {
  const language = useLanguage()
  return <aside className="right-sidebar">
    <section className="panel score-panel">
      <div className="panel-heading"><span>{pick(language, 'Wirtschaftlicher Ertrag', 'Economic Yield')}</span><small>{state.round > 1 ? `${pick(language, 'nach', 'after')} ${state.round - 1} ${pick(language, 'Wertungen', 'evaluations')}` : pick(language, 'Startlage', 'Initial situation')}</small></div>
      <div className="score-comparison">
        {(['blue', 'red'] as const).map((faction) => {
          const forecastAp = faction === state.activeFaction ? state.actionPoints : state.endedActionPoints[faction]
          const forecast = calculateRoundYield(state, faction, { actionPoints: forecastAp })
          const signed = forecast.yield >= 0 ? `+${forecast.yield}` : String(forecast.yield)
          return (
            <div className={`score-side ${factionClass(faction)}`} key={faction}>
              <span>{factionText(faction, language).adjective}</span>
              <strong>{state.economicScore[faction]}</strong>
              <small>{pick(language, 'Prognose', 'Forecast')} {signed}{forecast.restraintBonus ? pick(language, ' · Ruhe +1', ' · Restraint +1') : ''}</small>
            </div>
          )
        })}
      </div>
      <div className="score-scale"><i style={{ width: `${Math.max(0, Math.min(100, (state.economicScore.blue / (state.maxRounds * 7)) * 100))}%` }} /><i style={{ width: `${Math.max(0, Math.min(100, (state.economicScore.red / (state.maxRounds * 7)) * 100))}%` }} /></div>
      <p className="score-caption">{pick(language, 'Nur die ertragreichste nutzbare SLOC zählt am Rundenende.', 'Only the highest-yield usable SLOC counts at the end of each round.')}</p>
    </section>

    <section className="panel routes-panel">
      <div className="panel-heading"><span>SLOCs</span><small>{pick(language, 'Live-Prognose', 'Live forecast')}</small></div>
      <div className="route-list">
        {ROUTE_ORDER.map((routeId) => {
          const route = routeText(routeId, language)
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
                <strong>{language === 'de' ? route.name.replace(/^(Blaue|Rote) /, '') : route.name.replace(/^(Blue|Red) /, '')} · {pick(language, 'Kapazität', 'Capacity')} {state.routeCapacity[routeId]}</strong>
                <small>{result.blocked ? formatYieldReason(result, language) : `${result.contestedRegions} ${pick(language, 'unter Druck', 'contested')} · Esc −${result.escalationPenalty + result.responsibilityPenalty}${result.governmentBonus ? ` · ${governmentText(state.governments[route.faction], language).name} +${result.governmentBonus}` : ''}`}</small>
              </span>
              <b className={result.blocked ? 'blocked' : ''}>{result.blocked ? pick(language, 'ZU', 'CLOSED') : `+${result.yield}`}</b>
            </button>
          )
        })}
      </div>
    </section>
  </aside>
}

const HelpDialog = ({ onClose }: { onClose: () => void }) => {
  const language = useLanguage()
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
      aria-labelledby="help-title"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}
    >
      <section className="route-rules-dialog help-dialog">
        <header>
          <div><span className="eyebrow">{pick(language, 'SPIELHILFE · VERSION 1.01', 'GAME HELP · VERSION 1.01')}</span><h2 id="help-title">{pick(language, 'Seewege führen', 'Command the Sea Lines')}</h2></div>
          <button type="button" onClick={onClose} aria-label={pick(language, 'Regelhilfe schließen', 'Close rules')}>×</button>
        </header>

        <div className="help-section-grid">
          <article><h3>{pick(language, 'Spielablauf', 'Turn flow')}</h3><p>{pick(language, 'Jede Koalition erhält 3 AP. Spiele Karten, wähle ihre Ziele auf der Karte und beende anschließend den Zug. Nach beiden Zügen zählt nur die ertragreichste nutzbare SLOC.', 'Each coalition receives 3 AP. Play cards, choose their targets on the map, then end the turn. After both turns, only the highest-yield usable SLOC scores.')}</p></article>
          <article><h3>{pick(language, 'Karten und Flotten', 'Cards and fleets')}</h3><p>{pick(language, 'Patrouillenverband verlegt 1 Präsenz für 1 AP ein oder zwei Felder weit; verwehrte Zwischenräume können nicht übersprungen werden. Vorausstationierung verstärkt das Heimatmeer oder einen versorgten Vorposten.', 'Patrol Group moves 1 Presence one or two regions for 1 AP; denied intermediate regions cannot be crossed. Forward Deployment reinforces the home sea or a supplied outpost.')}</p></article>
          <article><h3>{pick(language, 'Verdeckte Aktionen', 'Covert actions')}</h3><p>{pick(language, 'Beschattung und Hybrider Druck können für +1 AP verdeckt vorbereitet werden. Sie wirken vor der Wertung ohne Eskalationsanstieg, verhindern aber Ruhebonus und automatische Beruhigung.', 'Shadowing and Hybrid Pressure may be prepared covertly for +1 AP. They resolve before scoring without raising Escalation, but prevent Restraint and automatic calming.')}</p></article>
          <article><h3>{pick(language, 'Staatsformen und Führung', 'Governments and leadership')}</h3><p>{pick(language, 'Demokratien erhalten +1 Ertrag bei Eskalation 0–2, Autokratien bei 3–5. Ab 6 gilt kein Vorteil. Die Endnote berücksichtigt Ergebnisabstand, Wirtschaft, Eskalation und Verantwortung.', 'Democracies gain +1 Yield at Escalation 0–2, Autocracies at 3–5. No government gains a bonus from 6 onward. The final rating uses result margin, Economy, Escalation, and Responsibility.')}</p></article>
        </div>

        <div className="projection-explainer">
          <span>{pick(language, 'Berechnung je Region und Seite', 'Calculated for each region and side')}</span>
          <strong>{pick(language, 'Präsenz + Lagebild + Zugang + Logistik = Projektion', 'Presence + Awareness + Access + Logistics = Projection')}</strong>
          <p>{pick(language, 'Die eigene Projektion wird immer mit der gegnerischen Projektion in derselben Region verglichen.', 'Your Projection is always compared with opposing Projection in the same region.')}</p>
        </div>

        <div className="route-status-grid">
          <article className="status-free">
            <div><i /> <strong>{pick(language, 'Frei nutzbar', 'Open')}</strong></div>
            <p>{pick(language, 'Deine Projektion ist mindestens so hoch wie die gegnerische.', 'Your Projection is at least as high as opposing Projection.')}</p>
            <small>{pick(language, 'Die Region verursacht keinen zusätzlichen SLOC-Malus.', 'The region causes no additional SLOC penalty.')}</small>
          </article>
          <article className="status-contested">
            <div><i /> <strong>{pick(language, 'Unter Druck', 'Contested')}</strong></div>
            <p>{pick(language, 'Deine Projektion liegt genau 1 oder 2 Punkte hinter der gegnerischen.', 'Your Projection is exactly 1 or 2 points below opposing Projection.')}</p>
            <small>{pick(language, 'Der Seeweg bleibt offen, verliert aber je betroffener Region 1 Ertrag.', 'The sea line remains open but loses 1 Yield for each affected region.')}</small>
          </article>
          <article className="status-denied">
            <div><i /> <strong>{pick(language, 'Verwehrt / zu', 'Denied / closed')}</strong></div>
            <p>{pick(language, 'Deine Projektion liegt mindestens 3 Punkte hinter der gegnerischen.', 'Your Projection is at least 3 points below opposing Projection.')}</p>
            <small>{pick(language, 'Jede SLOC durch diese Region ist für dich geschlossen.', 'Every SLOC crossing this region is closed to you.')}</small>
          </article>
        </div>

        <div className="closure-rules">
          <h3>{pick(language, 'Eine SLOC ist außerdem geschlossen, wenn …', 'A SLOC is also closed when …')}</h3>
          <ul>
            <li>{pick(language, 'am Ausgangsraum oder am Freihafen kein eigener aktiver Zugang mehr besteht,', 'there is no active friendly Access at the origin or Freeport,')}</li>
            <li>{pick(language, 'mindestens eine durchquerte Region für die Seite verwehrt ist, oder', 'at least one traversed region is denied to the side, or')}</li>
            <li>{pick(language, 'die gegnerische Seite die Meridianstraße kontrolliert – dies betrifft nur die Haupt-SLOC.', 'the opposing side controls Meridian Strait – this only affects the Main SLOC.')}</li>
          </ul>
        </div>

        <div className="rules-notes">
          <p><strong>{pick(language, 'Freihafen:', 'Freeport:')}</strong> {pick(language, 'militärische Projektionsüberlegenheit kann den neutralen Markt höchstens unter Druck setzen, nie verwehren. Ohne aktiven eigenen Zugang bleibt die SLOC dennoch geschlossen.', 'military Projection superiority can at most contest the neutral market, never deny it. Without active friendly Access, the SLOC is still closed.')}</p>
          <p><strong>{pick(language, 'Engpasskontrolle:', 'Chokepoint control:')}</strong> {pick(language, 'mindestens 2 Punkte Projektionsvorsprung sowie 2 Präsenz und 1 Zugang in der Meridianstraße. Die Ausweich-SLOC bleibt möglich.', 'at least a 2-point Projection lead plus 2 Presence and 1 Access in Meridian Strait. The Detour SLOC remains available.')}</p>
          <p><strong>{pick(language, 'Präsenz und Lagebild:', 'Presence and Awareness:')}</strong> {pick(language, 'Vorausstationierung verbessert zusätzlich das Lagebild bis maximal 2. Bloßes Verlegen vorhandener Präsenz tut dies nicht.', 'Forward Deployment also improves Awareness up to 2. Merely moving existing Presence does not.')}</p>
          <p><strong>{pick(language, 'Versorgte Vorposten:', 'Supplied outposts:')}</strong> {pick(language, 'benötigen aktiven Zugang, aktive Logistik und einen nicht verwehrten Abschnitt einer eigenen SLOC bis zum Heimatmeer.', 'require active Access, active Logistics, and a non-denied segment of a friendly SLOC back to the home sea.')}</p>
          <p><strong>{pick(language, 'Eskalation:', 'Escalation:')}</strong> {pick(language, 'verändert nicht den Status „frei/zu“, reduziert aber zusätzlich den wirtschaftlichen Ertrag einer weiterhin nutzbaren SLOC.', 'does not change open/closed status, but further reduces the economic Yield of an otherwise usable SLOC.')}</p>
          <p><strong>{pick(language, 'Konvoisicherung:', 'Convoy Escort:')}</strong> {pick(language, 'hebt bei der nächsten Wertung genau einen „unter Druck“-Malus auf.', 'removes exactly one contested penalty during the next evaluation.')}</p>
          <p><strong>{pick(language, 'Ausbau:', 'Upgrade:')}</strong> {pick(language, 'Jede Seite besitzt genau zwei Karten „Zusätzliche Tonnage“. Für 1 AP steigt die eigene Ausweich-SLOC dauerhaft um 1, bis maximal Kapazität 5.', 'Each side has exactly two Additional Tonnage cards. For 1 AP, your Detour SLOC permanently gains 1 capacity, up to 5.')}</p>
          <p><strong>{pick(language, 'Kontrollverlust:', 'Loss of Control:')}</strong> {pick(language, 'Eskalation 8 erzeugt unabhängig vom Seeweg −1 Ertrag, bei eigener Eskalationsverantwortung −2.', 'Escalation 8 causes −1 Yield regardless of sea-line status, or −2 if the faction generated Escalation that round.')}</p>
          <p><strong>{pick(language, 'Führungswertung:', 'Leadership rating:')}</strong> {pick(language, 'Ergebnis zählt bis 4, Wirtschaft, durchschnittliche Eskalation und Verantwortung jeweils bis 2 Punkte. Halbpunktwerte markieren die festen Schwellen zwischen den Bewertungsbändern.', 'Result contributes up to 4 points; Economy, average Escalation, and Responsibility contribute up to 2 each. Half points mark the fixed thresholds between rating bands.')}</p>
        </div>

        <footer><button className="confirm-button" type="button" onClick={onClose}>{pick(language, 'Verstanden', 'Understood')}</button></footer>
      </section>
    </div>
  )
}

interface MusicSettingsProps {
  musicVolume: number
  musicMuted: boolean
  onMusicVolume: (volume: number) => void
  onMusicMuted: (muted: boolean) => void
  onMusicStart: () => void
}

const SpeakerIcon = ({ muted }: { muted: boolean }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
    <path d="M4 9v6h4l5 4V5L8 9H4Z" fill="currentColor" stroke="none" />
    {muted
      ? <path d="m17 9 4 6m0-6-4 6" />
      : <><path d="M16 9.5a4 4 0 0 1 0 5" /><path d="M18.5 7a7.5 7.5 0 0 1 0 10" /></>}
  </svg>
)

const MusicVolumeControl = ({ musicVolume, musicMuted, onMusicVolume, onMusicMuted, onMusicStart }: MusicSettingsProps) => {
  const language = useLanguage()
  const displayedVolume = musicMuted ? 0 : Math.round(musicVolume * 100)
  const changeVolume = (value: number) => {
    onMusicStart()
    const volume = Math.max(0, Math.min(1, value / 100))
    onMusicVolume(volume)
    onMusicMuted(volume === 0)
  }

  return <section className="music-volume-control" aria-label={pick(language, 'Audioeinstellungen', 'Audio settings')}>
    <header><span>{pick(language, 'Audio', 'Audio')}</span><small>{pick(language, 'Musik', 'Music')}</small></header>
    <div className="music-volume-row">
      <button
        type="button"
        className={musicMuted ? 'is-muted' : ''}
        aria-label={musicMuted ? pick(language, 'Musik einschalten', 'Unmute music') : pick(language, 'Musik stummschalten', 'Mute music')}
        aria-pressed={musicMuted}
        onClick={() => {
          onMusicStart()
          onMusicMuted(!musicMuted)
        }}
      >
        <SpeakerIcon muted={musicMuted} />
      </button>
      <input
        type="range"
        min="0"
        max="100"
        step="1"
        value={displayedVolume}
        aria-label={pick(language, 'Musiklautstärke', 'Music volume')}
        onChange={(event) => changeVolume(Number(event.target.value))}
      />
      <output>{musicMuted ? pick(language, 'Aus', 'Off') : `${displayedVolume}%`}</output>
    </div>
  </section>
}

const AudioMenuButton = (settings: MusicSettingsProps) => {
  const language = useLanguage()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent && event.key !== 'Escape') return
      if (event instanceof MouseEvent && rootRef.current?.contains(event.target as Node)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', close)
    window.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', close)
    }
  }, [open])

  return <div className="audio-menu" ref={rootRef}>
    <button
      className="audio-menu-trigger"
      type="button"
      aria-label={pick(language, 'Audioeinstellungen öffnen', 'Open audio settings')}
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={() => {
        settings.onMusicStart()
        setOpen((value) => !value)
      }}
    >
      <SpeakerIcon muted={settings.musicMuted} />
    </button>
    {open && <div className="audio-menu-popover" role="dialog" aria-label={pick(language, 'Audioeinstellungen', 'Audio settings')}>
      <MusicVolumeControl {...settings} />
    </div>}
  </div>
}

interface GameMenuProps extends MusicSettingsProps {
  onMainMenu: () => void
  onNewGame: () => void
  onHelp: () => void
}

const GameMenu = ({ onMainMenu, onNewGame, onHelp, ...musicSettings }: GameMenuProps) => {
  const language = useLanguage()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent && event.key !== 'Escape') return
      if (event instanceof MouseEvent && rootRef.current?.contains(event.target as Node)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', close)
    window.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', close)
    }
  }, [open])
  const run = (action: () => void) => {
    setOpen(false)
    action()
  }
  return <div className="game-menu" ref={rootRef}>
    <button className="game-menu-trigger" type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
      <span aria-hidden="true">☰</span> {pick(language, 'Menü', 'Menu')}
    </button>
    {open && <div className="game-menu-popover">
      <div className="game-menu-actions" role="menu">
        <button type="button" role="menuitem" onClick={() => run(onMainMenu)}>← {pick(language, 'Zurück zum Hauptmenü', 'Back to main menu')}</button>
        <button type="button" role="menuitem" onClick={() => run(onNewGame)}>↻ {pick(language, 'Neue Partie', 'New game')}</button>
        <button type="button" role="menuitem" onClick={() => run(onHelp)}>? {pick(language, 'Hilfe', 'Help')}</button>
      </div>
      <div className="game-menu-audio"><MusicVolumeControl {...musicSettings} /></div>
    </div>}
  </div>
}

const NewGameDialog = ({ initialRounds, initialGovernments, onlineFaction, onClose, onConfirm }: { initialRounds: RoundCount; initialGovernments: GovernmentSelection; onlineFaction?: FactionId; onClose: () => void; onConfirm: (rounds: RoundCount, governments: GovernmentSelection) => void }) => {
  const language = useLanguage()
  const [rounds, setRounds] = useState<RoundCount>(initialRounds)
  const [governments, setGovernments] = useState<GovernmentSelection>({ ...initialGovernments })
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])
  return <div className="modal-backdrop launch-backdrop" role="dialog" aria-modal="true" aria-labelledby="new-game-title" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className={`round-selection-dialog ${onlineFaction ? 'is-online' : ''}`}>
      <span className="eyebrow">{onlineFaction ? pick(language, 'ONLINE-REVANCHE', 'ONLINE REMATCH') : pick(language, 'NEUE PARTIE', 'NEW GAME')}</span>
      <h2 id="new-game-title">{pick(language, 'Runden und Staatsformen', 'Rounds and governments')}</h2>
      <p>{onlineFaction
        ? pick(language, 'Wähle deine Staatsform. Die andere Koalition entscheidet beim Annehmen über ihre eigene Seite.', 'Choose your government. The other coalition selects its own side when accepting.')
        : pick(language, 'Die laufende lokale Partie wird erst nach deiner Bestätigung ersetzt.', 'The current local game is replaced only after you confirm.')}</p>
      <div className="round-choice" role="group" aria-label={pick(language, 'Rundenzahl', 'Round count')}>
        {constants.ROUND_OPTIONS.map((option) => <button key={option} type="button" className={rounds === option ? 'active' : ''} aria-pressed={rounds === option} onClick={() => setRounds(option)}><strong>{option}</strong><small>{pick(language, 'Runden', 'rounds')}</small></button>)}
      </div>
      {onlineFaction
        ? <div className="government-setup single-side"><GovernmentSelector faction={onlineFaction} value={governments[onlineFaction]} onChange={(government) => setGovernments((current) => ({ ...current, [onlineFaction]: government }))} /></div>
        : <GovernmentSetup governments={governments} onChange={(faction, government) => setGovernments((current) => ({ ...current, [faction]: government }))} />}
      <div className="launch-actions">
        <button className="mode-text-button" type="button" onClick={onClose}>{pick(language, 'Abbrechen', 'Cancel')}</button>
        <button className="mode-primary" type="button" onClick={() => onConfirm(rounds, governments)}>{onlineFaction ? pick(language, 'Vorschlagen', 'Propose') : pick(language, 'Neu starten', 'Restart')} <span>→</span></button>
      </div>
    </section>
  </div>
}

const RematchDialog = ({ snapshot, faction, onAccept, onDecline, onCancel }: { snapshot: RoomSnapshot; faction: FactionId; onAccept: (government: GovernmentType) => void; onDecline: () => void; onCancel: () => void }) => {
  const language = useLanguage()
  const proposal = snapshot.rematchProposal
  const [government, setGovernment] = useState<GovernmentType>(snapshot.state.governments[faction])
  useEffect(() => {
    if (proposal) setGovernment(snapshot.state.governments[faction])
  }, [proposal?.requestedBy, proposal?.maxRounds, faction, snapshot.state.governments])
  if (!proposal) return null
  const own = proposal.requestedBy === faction
  return <div className="modal-backdrop rematch-backdrop" role="dialog" aria-modal="true" aria-labelledby="rematch-title">
    <section className={`handoff-dialog ${factionClass(proposal.requestedBy)}`}>
      <span className="result-compass">↻</span>
      <span className="eyebrow">{pick(language, 'NEUE PARTIE · GLEICHER RAUM', 'NEW GAME · SAME ROOM')}</span>
      <h2 id="rematch-title">{own ? pick(language, 'Vorschlag gesendet', 'Proposal sent') : pick(language, 'Revanche vorgeschlagen', 'Rematch proposed')}</h2>
      <p>{own
        ? pick(language, `Du hast ${proposal.maxRounds} Runden als ${governmentText(proposal.government, language).name} vorgeschlagen. Die andere Koalition wählt ihre eigene Staatsform.`, `You proposed ${proposal.maxRounds} rounds as a ${governmentText(proposal.government, language).name}. The other coalition chooses its own government.`)
        : pick(language, `${factionText(proposal.requestedBy, language).name} schlägt ${proposal.maxRounds} Runden als ${governmentText(proposal.government, language).name} vor. Wähle deine Staatsform für die Revanche.`, `${factionText(proposal.requestedBy, language).name} proposes ${proposal.maxRounds} rounds as a ${governmentText(proposal.government, language).name}. Choose your government for the rematch.`)}</p>
      {!own && <div className="government-setup single-side compact"><GovernmentSelector faction={faction} value={government} onChange={setGovernment} /></div>}
      <div className="dialog-actions">
        {own
          ? <button className="ghost-button" type="button" onClick={onCancel}>{pick(language, 'Vorschlag zurückziehen', 'Withdraw proposal')}</button>
          : <><button className="ghost-button" type="button" onClick={onDecline}>{pick(language, 'Ablehnen', 'Decline')}</button><button className="confirm-button" type="button" onClick={() => onAccept(government)}>{pick(language, 'Neue Partie starten', 'Start new game')}</button></>}
      </div>
    </section>
  </div>
}

interface HandProps {
  state: GameState
  selected?: CardInstance
  selectedRegions: RegionId[]
  selectedRoute?: RouteId
  hybridResource?: SuspendableResource
  covert: boolean
  error?: string
  onSelect: (instance: CardInstance) => void
  onResource: (resource: SuspendableResource) => void
  onCovert: (covert: boolean) => void
  onConfirm: () => void
  onCancel: () => void
  onEndTurn: () => void
  locked?: boolean
  waitMessage?: string
}

const CardHand = ({ state, selected, selectedRegions, selectedRoute, hybridResource, covert, error, onSelect, onResource, onCovert, onConfirm, onCancel, onEndTurn, locked = false, waitMessage }: HandProps) => {
  const language = useLanguage()
  const faction = state.activeFaction
  const hoverTimer = useRef<ReturnType<typeof window.setTimeout> | null>(null)
  const [tooltip, setTooltip] = useState<{
    card: CardInstance
    left: number
    top: number
    insufficientAp: boolean
  }>()
  const card = selected ? cardText(selected.cardId, language) : undefined
  const play: CardPlay | undefined = selected ? { instanceId: selected.instanceId, regions: selectedRegions, routeId: selectedRoute, resource: hybridResource, covert } : undefined
  const totalCost = card ? card.cost + (covert ? 1 : 0) : 0
  const ready = card && play ? isPlayReady(card.id, play) && totalCost <= state.actionPoints : false
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
        left: window.scrollX + Math.min(window.innerWidth - width - 12, Math.max(12, rect.left + rect.width / 2 - width / 2)),
        top: window.scrollY + Math.max(12, rect.top - (CARDS[instance.cardId].escalation > 0 ? 232 : 178)),
        insufficientAp: CARDS[instance.cardId].cost > state.actionPoints,
      })
    }, delay)
  }

  useEffect(() => () => {
    if (hoverTimer.current !== null) window.clearTimeout(hoverTimer.current)
  }, [])

  if (locked) {
    return (
      <section className={`hand-panel ${factionClass(faction)} is-locked`}>
        <div className="action-composer waiting-composer">
          <div className="composer-copy">
            <span className="eyebrow">{pick(language, 'LAGEAKTUALISIERUNG', 'SITUATION UPDATE')}</span>
            <strong>{waitMessage ?? `${factionText(faction, language).name} ${pick(language, 'ist am Zug.', 'is taking its turn.')}`}</strong>
          </div>
          <span className="waiting-signal" aria-hidden="true"><i /><i /><i /></span>
        </div>
        <div className="waiting-hand">
          <span className="waiting-emblem">✦</span>
          <div><strong>{pick(language, 'Gegnerische Befehlshand bleibt verdeckt', 'Opposing command hand remains hidden')}</strong><p>{pick(language, 'Die Lagekarte wird nach jeder bestätigten Aktion automatisch aktualisiert.', 'The situation map updates automatically after each confirmed action.')}</p></div>
        </div>
      </section>
    )
  }

  return (
    <section className={`hand-panel ${factionClass(faction)}`}>
      <div className="action-composer">
        <div className="composer-copy">
          <span className="eyebrow">{card ? `${pick(language, 'BEFEHL', 'COMMAND')} · ${card.domain}` : pick(language, 'BEFEHLSHAND', 'COMMAND HAND')}</span>
          <strong>{card ? card.instruction : pick(language, 'Karte wählen und Wirkung auf der Lagekarte platzieren.', 'Select a card and place its effect on the situation map.')}</strong>
          {!card && state.covertOperations.some((entry) => entry.faction === faction) && <small>{pick(language, 'Eine eigene verdeckte Operation ist für die nächste Wertung vorbereitet.', 'One friendly covert operation is prepared for the next evaluation.')}</small>}
          {error && <small className="action-error">{formatError(error, language)}</small>}
        </div>
        {card && (
          <div className="target-summary">
            {COVERT_CARD_IDS.includes(card.id) && (
              <button className={covert ? 'covert-active' : ''} type="button" onClick={() => onCovert(!covert)} disabled={!covert && card.cost + 1 > state.actionPoints}>
                {covert ? pick(language, 'Verdeckt · Wirkung zur Wertung', 'Covert · resolves at evaluation') : pick(language, 'Offen spielen', 'Play openly')}
              </button>
            )}
            {selectedRegions.map((id, index) => <span key={`${id}-${index}`}>{index + 1}. {regionText(id, language).shortName}</span>)}
            {selectedRoute && <span>{routeText(selectedRoute, language).name}</span>}
            {hybridOptions.length > 0 && !hybridResource && hybridOptions.map((resource) => (
              <button type="button" key={resource} onClick={() => onResource(resource)}>{resourceText(resource, language).name} {pick(language, 'wählen', 'select')}</button>
            ))}
            {hybridResource && <span>{resourceText(hybridResource, language).name}</span>}
          </div>
        )}
        <div className="composer-actions">
          {card && <button className="ghost-button" type="button" onClick={onCancel}>{pick(language, 'Abbrechen', 'Cancel')}</button>}
          {card && <button className="confirm-button" type="button" disabled={!ready} onClick={onConfirm}>{pick(language, 'Für', 'For')} {totalCost} AP {covert ? pick(language, 'vorbereiten', 'prepare') : pick(language, 'ausspielen', 'play')}</button>}
          <button className="end-turn-button" type="button" onClick={onEndTurn}>{pick(language, 'Zug beenden', 'End turn')} <span>→</span></button>
        </div>
      </div>
      <div className="cards-row" aria-label={`${pick(language, 'Kartenhand', 'Card hand')} ${factionText(faction, language).name}`}>
        {state.hands[faction].map((instance) => {
          const definition = cardText(instance.cardId, language)
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
        {state.hands[faction].length === 0 && <div className="empty-hand">{pick(language, 'Keine Karten auf der Hand.', 'No cards in hand.')}</div>}
      </div>
      {tooltip && createPortal((() => {
        const definition = cardText(tooltip.card.cardId, language)
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
            <div className="hover-help-section"><b>{pick(language, 'Wirkung', 'Effect')}</b><p>{definition.description}</p></div>
            <div className="hover-help-section"><b>{pick(language, 'Wann & wo?', 'When & where?')}</b><p>{definition.playHint}</p></div>
            {definition.escalation > 0 && (
              <div className="hover-help-escalation">
                <b>{pick(language, 'Eskalationsrisiko', 'Escalation risk')} +{definition.escalation}</b>
                <p>{definition.escalationReason}</p>
              </div>
            )}
            {COVERT_CARD_IDS.includes(definition.id) && <div className="hover-help-section"><b>{pick(language, 'Verdeckte Variante', 'Covert variant')}</b><p>{pick(language, 'Für +1 AP verzögert und ohne Eskalationsanstieg, wenn eigenes Lagebild mindestens 1 und gegnerisches höchstens 1 beträgt.', 'For +1 AP, delayed and without increasing Escalation, if friendly Awareness is at least 1 and opposing Awareness is at most 1.')}</p></div>}
            {tooltip.insufficientAp && <div className="hover-help-warning">{pick(language, 'Aktuell fehlen Aktionspunkte:', 'Insufficient action points:')} {pick(language, 'benötigt', 'required')} {definition.cost}, {pick(language, 'verfügbar', 'available')} {state.actionPoints}.</div>}
          </aside>
        )
      })(), document.body)}
    </section>
  )
}

const EndGameDialog = ({ state, onNewGame, onMainMenu }: { state: GameState; onNewGame: () => void; onMainMenu: () => void }) => {
  const language = useLanguage()
  if (state.phase !== 'complete' || !state.winner) return null
  const winner = state.winner.faction
  const ratings = (['blue', 'red'] as const).map((faction) => calculateLeadershipRating(state, faction))
  const decimal = (value: number) => value.toLocaleString(language === 'de' ? 'de-DE' : 'en-GB', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  const component = (value: number) => Number.isInteger(value) ? String(value) : decimal(value)
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="result-title">
      <div className={`result-dialog ${winner ? factionClass(winner) : ''}`}>
        <span className="result-compass">✦</span>
        <span className="eyebrow">{state.maxRounds}. {pick(language, 'WIRTSCHAFTSAUSWERTUNG', 'ECONOMIC EVALUATION')}</span>
        <h2 id="result-title">{winner ? `${factionText(winner, language).name} ${pick(language, 'setzt sich durch', 'prevails')}` : pick(language, 'Strategisches Gleichgewicht', 'Strategic Balance')}</h2>
        <p>{formatWinnerReason(state.winner, language)}</p>
        <div className="final-scores">
          <div className="is-blue"><span>{factionText('blue', language).adjective}</span><strong>{state.economicScore.blue}</strong></div>
          <i>:</i>
          <div className="is-red"><span>{factionText('red', language).adjective}</span><strong>{state.economicScore.red}</strong></div>
        </div>
        <div className="leadership-ratings">
          {ratings.map((rating) => {
            const opportunities = [
              { score: rating.components.result / 2, text: pick(language, 'Steigere den kumulierten Wirtschaftsertrag und setze die stärkste gegnerische SLOC gezielter unter Druck.', 'Raise cumulative economic Yield and put more focused pressure on the opponent’s strongest SLOC.') },
              { score: rating.components.economy, text: pick(language, 'Sichere früher einen verlässlichen Zugang und halte mindestens eine SLOC mit hohem Ertrag offen.', 'Secure reliable Access earlier and keep at least one high-yield SLOC open.') },
              { score: rating.components.escalation, text: pick(language, 'Halte die Eskalation über mehrere Wertungen niedriger – ruhige Runden und Krisenkommunikation verbessern den Durchschnitt.', 'Keep Escalation lower across several evaluations—quiet rounds and Crisis Communications improve the average.') },
              { score: rating.components.responsibility, text: pick(language, 'Nutze weniger offen eskalierende Karten oder gleiche Eskalationspunkte mit Krisenkommunikation aus.', 'Use fewer openly escalatory cards or offset Escalation points with Crisis Communications.') },
            ].filter((entry, index) => index === 0 ? rating.components.result < 4 : entry.score < 2).sort((a, b) => a.score - b.score).slice(0, 2)
            return <article className={factionClass(rating.faction)} key={rating.faction}>
              <span>{factionText(rating.faction, language).name}</span>
              <strong aria-label={`${rating.stars} ${pick(language, 'von 5 Sternen', 'of 5 stars')}`}>{'★'.repeat(rating.stars)}{'☆'.repeat(5 - rating.stars)}</strong>
              <b>{leadershipLabel(rating.stars, language)}</b>
              <div className="rating-breakdown">
                <p><b>{pick(language, 'Ergebnis', 'Result')} {component(rating.components.result)}/4</b><small>{pick(language, `Punkteabstand über ${state.maxRounds} Runden berücksichtigt.`, `Score margin across ${state.maxRounds} rounds included.`)}</small></p>
                <p><b>{pick(language, 'Wirtschaft', 'Economy')} {rating.components.economy}/2</b><small>{pick(language, `Ø ${decimal(rating.metrics.averageYield)} Ertrag je Runde.`, `Average ${decimal(rating.metrics.averageYield)} Yield per round.`)}</small></p>
                <p><b>{pick(language, 'Eskalation', 'Escalation')} {rating.components.escalation}/2</b><small>{pick(language, `Ø ${decimal(rating.metrics.averageEscalation)} von 8 bei den Wertungen.`, `Average ${decimal(rating.metrics.averageEscalation)} of 8 at evaluations.`)}</small></p>
                <p><b>{pick(language, 'Verantwortung', 'Responsibility')} {rating.components.responsibility}/2</b><small>{pick(language, `${rating.metrics.escalationActions} eskalierende Aktionen · +${rating.metrics.escalationPoints} Punkte · ${rating.metrics.deescalationActions}× Krisenkommunikation · netto ${rating.metrics.netResponsibility}.`, `${rating.metrics.escalationActions} escalatory actions · +${rating.metrics.escalationPoints} points · ${rating.metrics.deescalationActions}× Crisis Communications · net ${rating.metrics.netResponsibility}.`)}</small></p>
              </div>
              <div className="rating-advice"><em>{pick(language, 'Nächste Partie', 'Next game')}</em>{opportunities.length > 0 ? opportunities.map((entry, index) => <p key={index}>{entry.text}</p>) : <p>{pick(language, 'Alle steuerbaren Führungsbereiche liegen im höchsten Bewertungsband.', 'All controllable leadership areas are in the highest rating band.')}</p>}</div>
              {!state.leadershipHistoryComplete && <small className="history-warning">{pick(language, 'Historische Aktionsdetails aus dem älteren Spielstand sind unvollständig; erhaltene Eskalationspunkte wurden vollständig berücksichtigt.', 'Historical action details from the older save are incomplete; preserved Escalation points were fully counted.')}</small>}
            </article>
          })}
        </div>
        <div className="result-actions"><button className="ghost-button" type="button" onClick={onMainMenu}>{pick(language, 'Hauptmenü', 'Main menu')}</button><button className="confirm-button" type="button" onClick={onNewGame}>{pick(language, 'Neue Partie', 'New game')}</button></div>
      </div>
    </div>
  )
}

interface ModeSelectionProps extends MusicSettingsProps {
  language: Language
  onLanguage: (language: Language) => void
  rounds: RoundCount
  onRounds: (rounds: RoundCount) => void
  governments: GovernmentSelection
  onGovernments: (governments: GovernmentSelection) => void
  busy: boolean
  error?: string
  hasSavedSingleGame: boolean
  hasSavedLocalGame: boolean
  savedOnlineSession?: OnlineSession
  onSingleplayer: (fresh: boolean) => void
  onLocalPvp: (fresh: boolean) => void
  onCreateRoom: () => void
  onJoinRoom: (code: string, government: GovernmentType) => void
  onResumeRoom: (session: OnlineSession) => void
}

const ModeSelection = ({ language, onLanguage, rounds, onRounds, governments, onGovernments, busy, error, hasSavedSingleGame, hasSavedLocalGame, savedOnlineSession, onSingleplayer, onLocalPvp, onCreateRoom, onJoinRoom, onResumeRoom, musicVolume, musicMuted, onMusicVolume, onMusicMuted, onMusicStart }: ModeSelectionProps) => {
  const queryRoom = new URLSearchParams(window.location.search).get('room') ?? ''
  const [joinCode, setJoinCode] = useState(queryRoom.toUpperCase())
  const [launchMode, setLaunchMode] = useState<'singleplayer' | 'local-pvp' | 'online'>()
  const [joiningCode, setJoiningCode] = useState<string>()
  const [joinGovernment, setJoinGovernment] = useState<GovernmentType>('democracy')

  const confirmLaunch = () => {
    if (launchMode === 'singleplayer') onSingleplayer(true)
    if (launchMode === 'local-pvp') onLocalPvp(true)
    if (launchMode === 'online') onCreateRoom()
    setLaunchMode(undefined)
  }

  return (
    <main className="mode-screen" onClickCapture={onMusicStart} onKeyDownCapture={onMusicStart}>
      <div className="mode-backdrop" aria-hidden="true"><i /><i /><i /></div>
      <div className="mode-utility-controls">
        <div className="language-switcher" role="group" aria-label={pick(language, 'Sprache wählen', 'Choose language')}>
          <button type="button" className={language === 'de' ? 'active' : ''} aria-pressed={language === 'de'} aria-label="Deutsch" title="Deutsch" onClick={() => onLanguage('de')}>
            <span aria-hidden="true">🇩🇪</span><small>DE</small>
          </button>
          <button type="button" className={language === 'en' ? 'active' : ''} aria-pressed={language === 'en'} aria-label="English" title="English" onClick={() => onLanguage('en')}>
            <span aria-hidden="true">🇬🇧</span><small>EN</small>
          </button>
        </div>
        <AudioMenuButton musicVolume={musicVolume} musicMuted={musicMuted} onMusicVolume={onMusicVolume} onMusicMuted={onMusicMuted} onMusicStart={onMusicStart} />
      </div>
      <header className="mode-brand">
        <span className="mode-brand-mark">✦</span>
        <div><span>SEA LINES OF</span><strong>COMMUNICATION</strong><small>{pick(language, 'VERSION 1.01 · Freie Staatsformwahl', 'VERSION 1.01 · Free government selection')}</small></div>
      </header>
      <section className="mode-intro">
        <span className="eyebrow">{pick(language, 'EINSATZBEREITSCHAFT HERSTELLEN', 'ESTABLISH READINESS')}</span>
        <h1>{pick(language, 'Wie möchtest du spielen?', 'How would you like to play?')}</h1>
        <p>{pick(language, 'Spiele gegen die KI, gemeinsam an einem Gerät oder online. Kartenhände und verdeckte Operationen bleiben in beiden PvP-Modi geschützt.', 'Play against the AI, together on one device, or online. Hands and covert operations remain protected in both PvP modes.')}</p>
      </section>
      <section className="mode-options" aria-label={pick(language, 'Spielmodus wählen', 'Choose game mode')}>
        <article className="mode-card single-mode">
          <span className="mode-number">01</span>
          <div className="mode-icon" aria-hidden="true">♟</div>
          <span className="eyebrow">{pick(language, 'EINZELSPIELER', 'SINGLE PLAYER')}</span>
          <h2>{pick(language, 'Blau gegen Rote KI', 'Blue vs Red AI')}</h2>
          <p>{pick(language, 'Du führst die Blaue Koalition. Die KI bewertet Routen, Projektion und Eskalationsrisiko und spielt ihre Züge selbstständig.', 'You lead the Blue Coalition. The AI evaluates routes, Projection, and Escalation risk and plays its turns independently.')}</p>
          <ul><li>{pick(language, 'sofort spielbar', 'play immediately')}</li><li>{pick(language, 'lokal gespeichert', 'saved locally')}</li><li>{pick(language, 'sichtbare KI-Züge', 'visible AI turns')}</li></ul>
          <button className="mode-primary" type="button" disabled={busy} onClick={() => hasSavedSingleGame ? onSingleplayer(false) : setLaunchMode('singleplayer')}>
            {hasSavedSingleGame ? pick(language, 'Einzelspieler fortsetzen', 'Continue single player') : pick(language, 'Einzelspieler starten', 'Start single player')} <span>→</span>
          </button>
          {hasSavedSingleGame && <button className="mode-text-button" type="button" disabled={busy} onClick={() => setLaunchMode('singleplayer')}>{pick(language, 'Neue Einzelpartie', 'New single-player game')}</button>}
        </article>

        <article className="mode-card local-mode">
          <span className="mode-number">02</span>
          <div className="mode-icon" aria-hidden="true">⇄</div>
          <span className="eyebrow">{pick(language, 'LOKALES PVP', 'LOCAL PVP')}</span>
          <h2>Pass-and-play</h2>
          <p>{pick(language, 'Blau und Rot teilen sich ein Gerät. Ein Übergabebildschirm schützt Hände und vorbereitete Operationen vor der jeweils anderen Seite.', 'Blue and Red share one device. A handoff screen protects hands and prepared operations from the other side.')}</p>
          <ul><li>{pick(language, 'kein Netzwerk nötig', 'no network required')}</li><li>{pick(language, 'separat gespeichert', 'saved separately')}</li><li>{pick(language, 'verdeckte Hände', 'hidden hands')}</li></ul>
          <button className="mode-primary" type="button" disabled={busy} onClick={() => hasSavedLocalGame ? onLocalPvp(false) : setLaunchMode('local-pvp')}>
            {hasSavedLocalGame ? pick(language, 'Lokale Partie fortsetzen', 'Continue local game') : pick(language, 'Lokale Partie starten', 'Start local game')} <span>→</span>
          </button>
          {hasSavedLocalGame && <button className="mode-text-button" type="button" disabled={busy} onClick={() => setLaunchMode('local-pvp')}>{pick(language, 'Neue lokale Partie', 'New local game')}</button>}
        </article>

        <article className="mode-card online-mode">
          <span className="mode-number">03</span>
          <div className="mode-icon" aria-hidden="true">◎</div>
          <span className="eyebrow">{pick(language, 'ONLINE-MULTIPLAYER', 'ONLINE MULTIPLAYER')}</span>
          <h2>{pick(language, 'Blau gegen Rot', 'Blue vs Red')}</h2>
          <p>{pick(language, 'Eröffne einen privaten Spielraum oder tritt mit einem sechsstelligen Code bei. Cloudflare synchronisiert und prüft alle Aktionen.', 'Open a private game room or join with a six-character code. Cloudflare synchronizes and validates every action.')}</p>
          <div className="online-actions">
            <button className="mode-primary" type="button" disabled={busy} onClick={() => setLaunchMode('online')}>{pick(language, 'Raum eröffnen', 'Open room')} <span>→</span></button>
            <div className="join-row">
              <input
                value={joinCode}
                onChange={(event) => setJoinCode(event.target.value.replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 6))}
                placeholder={pick(language, 'RAUMCODE', 'ROOM CODE')}
                aria-label={pick(language, 'Sechsstelliger Raumcode', 'Six-character room code')}
                maxLength={6}
              />
              <button type="button" disabled={busy || joinCode.length !== 6} onClick={() => setJoiningCode(joinCode)}>{pick(language, 'Beitreten', 'Join')}</button>
            </div>
          </div>
          {savedOnlineSession && (
            <button className="resume-room" type="button" disabled={busy} onClick={() => onResumeRoom(savedOnlineSession)}>
              {pick(language, 'Raum', 'Room')} {savedOnlineSession.roomCode} {pick(language, 'als', 'as')} {factionText(savedOnlineSession.faction, language).adjective} {pick(language, 'fortsetzen', 'continue')}
            </button>
          )}
        </article>
      </section>
      {busy && <div className="mode-status"><span className="waiting-signal"><i /><i /><i /></span> {pick(language, 'Verbindung wird hergestellt …', 'Establishing connection …')}</div>}
      {error && <div className="mode-error" role="alert">{formatError(error, language)}</div>}
      <footer className="mode-footer"><span>6–18 {pick(language, 'Runden', 'Rounds')}</span><i /> <span>{pick(language, 'Keine Registrierung', 'No registration')}</span><i /> <span>{pick(language, 'Private Raumcodes', 'Private room codes')}</span></footer>
      {launchMode && (
        <div className="modal-backdrop launch-backdrop" role="dialog" aria-modal="true" aria-labelledby="round-selection-title">
          <section className={`round-selection-dialog ${launchMode === 'online' ? 'is-online' : ''}`}>
            <span className="eyebrow">{pick(language, 'EINSATZDAUER', 'CAMPAIGN LENGTH')}</span>
            <h2 id="round-selection-title">{pick(language, 'Runden und Staatsformen', 'Rounds and governments')}</h2>
            <p>{launchMode === 'online'
              ? pick(language, 'Du legst Dauer und Staatsform für Blau fest. Rot wählt die eigene Staatsform beim Beitritt.', 'You set the length and Blue government. Red chooses its own government when joining.')
              : pick(language, 'Wähle die Dauer der neuen Partie. Sechs Runden sind das Minimum.', 'Choose the length of the new game. Six rounds is the minimum.')}</p>
            <div className="round-choice" role="group" aria-label={pick(language, 'Rundenzahl', 'Number of rounds')}>
              {constants.ROUND_OPTIONS.map((value) => (
                <button type="button" key={value} className={rounds === value ? 'active' : ''} aria-pressed={rounds === value} onClick={() => onRounds(value)}>
                  <strong>{value}</strong><span>{pick(language, 'Runden', 'Rounds')}</span>
                </button>
              ))}
            </div>
            <GovernmentSetup governments={governments} onChange={(faction, government) => onGovernments({ ...governments, [faction]: government })} pendingRed={launchMode === 'online'} />
            <div className="round-dialog-actions">
              <button className="mode-text-button" type="button" disabled={busy} onClick={() => setLaunchMode(undefined)}>{pick(language, 'Abbrechen', 'Cancel')}</button>
              <button className="mode-primary" type="button" disabled={busy} onClick={confirmLaunch}>
                {launchMode === 'online' ? pick(language, 'Raum eröffnen', 'Open room') : pick(language, 'Partie starten', 'Start game')} <span>→</span>
              </button>
            </div>
          </section>
        </div>
      )}
      {joiningCode && (
        <div className="modal-backdrop launch-backdrop" role="dialog" aria-modal="true" aria-labelledby="join-government-title">
          <section className="round-selection-dialog is-online join-government-dialog">
            <span className="eyebrow">{pick(language, `RAUM ${joiningCode} · ROTE KOALITION`, `ROOM ${joiningCode} · RED COALITION`)}</span>
            <h2 id="join-government-title">{pick(language, 'Deine Staatsform', 'Your government')}</h2>
            <p>{pick(language, 'Wähle jetzt die Staatsform für Rot. Blau wurde bereits vom Host festgelegt.', 'Choose Red’s government now. Blue has already been set by the host.')}</p>
            <div className="government-setup single-side"><GovernmentSelector faction="red" value={joinGovernment} onChange={setJoinGovernment} /></div>
            <div className="round-dialog-actions">
              <button className="mode-text-button" type="button" disabled={busy} onClick={() => setJoiningCode(undefined)}>{pick(language, 'Abbrechen', 'Cancel')}</button>
              <button className="mode-primary" type="button" disabled={busy} onClick={() => { onJoinRoom(joiningCode, joinGovernment); setJoiningCode(undefined) }}>{pick(language, 'Partie beitreten', 'Join game')} <span>→</span></button>
            </div>
          </section>
        </div>
      )}
    </main>
  )
}

interface OnlineLobbyProps extends MusicSettingsProps {
  session: OnlineSession
  snapshot?: RoomSnapshot
  connection: ConnectionStatus
  onLeave: () => void
}

const OnlineLobby = ({ session, snapshot, connection, onLeave, ...musicSettings }: OnlineLobbyProps) => {
  const language = useLanguage()
  const [copied, setCopied] = useState(false)
  const inviteUrl = `${window.location.origin}${window.location.pathname}?room=${session.roomCode}`
  const copyInvite = async () => {
    await navigator.clipboard.writeText(inviteUrl)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }
  return (
    <main className="mode-screen lobby-screen" onClickCapture={musicSettings.onMusicStart} onKeyDownCapture={musicSettings.onMusicStart}>
      <div className="mode-utility-controls"><AudioMenuButton {...musicSettings} /></div>
      <header className="mode-brand compact"><span className="mode-brand-mark">✦</span><div><span>SEA LINES OF</span><strong>COMMUNICATION</strong></div></header>
      <section className="lobby-card">
        <span className="eyebrow">{pick(language, 'PRIVATER SPIELRAUM', 'PRIVATE GAME ROOM')}</span>
        <h1>{snapshot?.status === 'waiting' ? pick(language, 'Warten auf Rot', 'Waiting for Red') : pick(language, 'Verbindung wird hergestellt', 'Establishing connection')}</h1>
        <p>{snapshot?.status === 'waiting'
          ? pick(language, 'Teile den Link oder den Raumcode mit der zweiten Person. Du übernimmst die Blaue Koalition.', 'Share the link or room code with the second player. You command the Blue Coalition.')
          : `${pick(language, 'Dein Sitz als', 'Your seat as')} ${factionText(session.faction, language).adjective} ${pick(language, 'wird mit dem gemeinsamen Spielstand verbunden.', 'is connecting to the shared game state.')}`}</p>
        {snapshot && <p><strong>{snapshot.state.maxRounds} {pick(language, 'Runden', 'Rounds')}</strong> · {pick(language, 'Blau', 'Blue')}: {governmentText(snapshot.state.governments.blue, language).name} · {pick(language, 'Rot wählt beim Beitritt', 'Red chooses when joining')}</p>}
        <div className="room-code" aria-label={`${pick(language, 'Raumcode', 'Room code')} ${session.roomCode}`}>{session.roomCode.split('').map((letter, index) => <span key={`${letter}-${index}`}>{letter}</span>)}</div>
        <div className="lobby-actions">
          <button className="mode-primary" type="button" onClick={copyInvite}>{copied ? pick(language, 'Link kopiert', 'Link copied') : pick(language, 'Einladungslink kopieren', 'Copy invitation link')}</button>
          <button className="mode-text-button" type="button" onClick={onLeave}>{pick(language, 'Zurück zur Auswahl', 'Back to selection')}</button>
        </div>
        <div className={`connection-line ${connection}`}><i /> {connection === 'connected' ? pick(language, 'Mit Cloudflare verbunden', 'Connected to Cloudflare') : pick(language, 'Verbindung wird aufgebaut …', 'Establishing connection …')}</div>
      </section>
    </main>
  )
}

const HandoffOverlay = ({ faction, onReady }: { faction: FactionId; onReady: () => void }) => {
  const language = useLanguage()
  return <div className="modal-backdrop handoff-backdrop" role="dialog" aria-modal="true" aria-labelledby="handoff-title">
    <section className={`handoff-dialog ${factionClass(faction)}`}>
      <span className="result-compass">✦</span>
      <span className="eyebrow">{pick(language, 'PASS-AND-PLAY · VERDECKTE ÜBERGABE', 'PASS-AND-PLAY · PRIVATE HANDOFF')}</span>
      <h2 id="handoff-title">{factionText(faction, language).name} {pick(language, 'übernimmt', 'takes over')}</h2>
      <p>{pick(language, 'Gib das Gerät an die aktive Person weiter. Handkarten und geheime Aufträge werden erst nach der Bestätigung sichtbar.', 'Pass the device to the active player. Cards and secret orders become visible only after confirmation.')}</p>
      <button className="confirm-button" type="button" onClick={onReady}>{pick(language, 'Zug übernehmen', 'Take turn')}</button>
    </section>
  </div>
}

function GameApp({ language, onLanguage }: { language: Language; onLanguage: (language: Language) => void }) {
  const [mode, setMode] = useState<'menu' | 'singleplayer' | 'local-pvp' | 'multiplayer'>('menu')
  const [selectedRounds, setSelectedRounds] = useState<RoundCount>(constants.DEFAULT_ROUNDS)
  const [selectedGovernments, setSelectedGovernments] = useState<GovernmentSelection>({ ...constants.DEFAULT_GOVERNMENTS })
  const [musicVolume, setMusicVolume] = useState(loadMusicVolume)
  const [musicMuted, setMusicMuted] = useState(loadMusicMuted)
  const [state, setState] = useState<GameState>(loadState)
  const [onlineSession, setOnlineSession] = useState<OnlineSession>()
  const [roomSnapshot, setRoomSnapshot] = useState<RoomSnapshot>()
  const [connection, setConnection] = useState<ConnectionStatus>('offline')
  const [launcherBusy, setLauncherBusy] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [aiThinking, setAiThinking] = useState(false)
  const [selectedCardId, setSelectedCardId] = useState<string>()
  const [selectedRegions, setSelectedRegions] = useState<RegionId[]>([])
  const [selectedRoute, setSelectedRoute] = useState<RouteId>()
  const [hybridResource, setHybridResource] = useState<SuspendableResource>()
  const [covert, setCovert] = useState(false)
  const [handoffReady, setHandoffReady] = useState(false)
  const [inspected, setInspected] = useState<RegionId>('central_basin')
  const [error, setError] = useState<string>()
  const [showHelp, setShowHelp] = useState(false)
  const [showNewGame, setShowNewGame] = useState(false)
  const [onlineTurnNotice, setOnlineTurnNotice] = useState<FactionId>()
  const [onlineSetupNotice, setOnlineSetupNotice] = useState(false)
  const socketRef = useRef<WebSocket | null>(null)
  const pendingRevisionRef = useRef<number | undefined>(undefined)
  const previousOnlineTurnRef = useRef<{ revision: number; activeFaction: FactionId; status: RoomSnapshot['status'] } | undefined>(undefined)
  const suppressNextTurnNoticeRef = useRef(true)
  const defaultDocumentTitleRef = useRef(document.title)

  const savedOnlineSession = useMemo(() => {
    try {
      const raw = sessionStorage.getItem(ONLINE_SESSION_KEY)
      if (!raw) return undefined
      const parsed = JSON.parse(raw) as OnlineSession
      return parsed.roomCode && parsed.token && parsed.faction ? parsed : undefined
    } catch {
      return undefined
    }
  }, [mode])

  useEffect(() => {
    if (mode === 'singleplayer') localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    if (mode === 'local-pvp') localStorage.setItem(LOCAL_PVP_STORAGE_KEY, JSON.stringify(state))
  }, [state, mode])

  useEffect(() => {
    try {
      localStorage.setItem(MUSIC_VOLUME_KEY, String(musicVolume))
      localStorage.setItem(MUSIC_MUTED_KEY, String(musicMuted))
    } catch {
      // Audio settings remain available for this session if storage is unavailable.
    }
  }, [musicVolume, musicMuted])

  useEffect(() => {
    if (mode !== 'multiplayer' || !onlineSession) return
    let disposed = false
    let reconnectTimer: number | undefined

    const connect = () => {
      if (disposed) return
      suppressNextTurnNoticeRef.current = true
      setConnection((current) => current === 'connected' ? 'reconnecting' : 'connecting')
      const socket = new WebSocket(socketUrl(onlineSession))
      socketRef.current = socket
      socket.addEventListener('open', () => {
        setConnection('connected')
        setLauncherBusy(false)
      })
      socket.addEventListener('message', (event) => {
        try {
          const message = JSON.parse(String(event.data)) as unknown
          if (isRoomSnapshot(message)) {
            const previous = previousOnlineTurnRef.current
            const suppressNotice = suppressNextTurnNoticeRef.current
            suppressNextTurnNoticeRef.current = false
            if (previous?.status === 'waiting' && message.status === 'playing') setOnlineSetupNotice(true)
            if (!suppressNotice
              && previous
              && message.revision > previous.revision
              && previous.status === 'playing'
              && message.status === 'playing'
              && previous.activeFaction !== onlineSession.faction
              && message.state.activeFaction === onlineSession.faction) {
              setOnlineTurnNotice(onlineSession.faction)
            } else if (message.state.activeFaction !== onlineSession.faction || message.status !== 'playing') {
              setOnlineTurnNotice(undefined)
            }
            previousOnlineTurnRef.current = { revision: message.revision, activeFaction: message.state.activeFaction, status: message.status }
            setRoomSnapshot(message)
            setState(message.state)
            if (pendingRevisionRef.current === undefined || message.revision > pendingRevisionRef.current) {
              pendingRevisionRef.current = undefined
              setSubmitting(false)
            }
            setError(undefined)
            if (message.status === 'playing' || message.status === 'complete') setLauncherBusy(false)
          } else if (message && typeof message === 'object' && 'type' in message && message.type === 'error' && 'error' in message) {
            setError(String(message.error))
            pendingRevisionRef.current = undefined
            setSubmitting(false)
          }
        } catch {
          setError(pick(language, 'Der empfangene Spielstand konnte nicht gelesen werden.', 'The received game state could not be read.'))
        }
      })
      socket.addEventListener('close', () => {
        if (disposed) return
        setConnection('reconnecting')
        pendingRevisionRef.current = undefined
        setSubmitting(false)
        socketRef.current = null
        reconnectTimer = window.setTimeout(connect, 1500)
      })
      socket.addEventListener('error', () => socket.close())
    }

    connect()
    return () => {
      disposed = true
      if (reconnectTimer) window.clearTimeout(reconnectTimer)
      socketRef.current?.close()
      socketRef.current = null
    }
  }, [mode, onlineSession, language])

  useEffect(() => {
    document.title = onlineTurnNotice
      ? pick(language, 'Du bist am Zug · Sea Lines of Communication', 'Your turn · Sea Lines of Communication')
      : defaultDocumentTitleRef.current
    return () => { document.title = defaultDocumentTitleRef.current }
  }, [onlineTurnNotice, language])

  useEffect(() => {
    if (mode !== 'singleplayer' || state.phase !== 'action' || state.activeFaction !== 'red') {
      setAiThinking(false)
      return
    }
    setAiThinking(true)
    const timer = window.setTimeout(() => {
      const decision = chooseAiAction(state)
      setState((current) => {
        if (current.activeFaction !== 'red' || current.phase !== 'action') return current
        if (!decision || decision.type === 'end-turn') return endTurn(current)
        return playCard(current, decision.play)
      })
    }, 720)
    return () => window.clearTimeout(timer)
  }, [mode, state])

  const isOnline = mode === 'multiplayer'
  const isLocalPvp = mode === 'local-pvp'
  const isPreGameMenu = mode === 'menu'
    || (isOnline && Boolean(onlineSession) && roomSnapshot?.status !== 'playing' && roomSnapshot?.status !== 'complete')
  const desiredMusicTrack = isPreGameMenu || state.escalation <= 3
    ? MUSIC_TRACKS.title
    : state.escalation === constants.MAX_ESCALATION
      ? MUSIC_TRACKS.maximum
      : MUSIC_TRACKS.high
  const [musicTrack, setMusicTrack] = useState(desiredMusicTrack)
  useEffect(() => {
    if (desiredMusicTrack === musicTrack) return
    if (isPreGameMenu) {
      setMusicTrack(MUSIC_TRACKS.title)
      return
    }
    const timer = window.setTimeout(() => setMusicTrack(desiredMusicTrack), MUSIC_TRACK_STABILITY_MS)
    return () => window.clearTimeout(timer)
  }, [desiredMusicTrack, isPreGameMenu, musicTrack])
  const startMusic = useGameMusic(musicTrack, musicMuted ? 0 : musicVolume)
  const musicSettings: MusicSettingsProps = {
    musicVolume,
    musicMuted,
    onMusicVolume: setMusicVolume,
    onMusicMuted: setMusicMuted,
    onMusicStart: startMusic,
  }
  const viewerFaction: FactionId = isOnline && onlineSession ? onlineSession.faction : isLocalPvp ? state.activeFaction : 'blue'
  const visibleState = useMemo(
    () => isOnline ? state : createFactionView(state, viewerFaction),
    [state, viewerFaction, isOnline],
  )
  const canAct = state.phase === 'action'
    && state.activeFaction === viewerFaction
    && (!isLocalPvp || handoffReady)
    && (!isOnline || (roomSnapshot?.status === 'playing' && connection === 'connected' && !submitting && !onlineSetupNotice))

  const selectedCard = canAct ? state.hands[state.activeFaction].find((entry) => entry.instanceId === selectedCardId) : undefined
  const selectedDefinition = selectedCard ? CARDS[selectedCard.cardId] : undefined
  const validRegions = useMemo(
    () => {
      if (!selectedCard || selectedDefinition?.target === 'route' || isPlayReady(selectedCard.cardId, { instanceId: selectedCard.instanceId, regions: selectedRegions, resource: hybridResource })) return []
      const targets = getValidRegionTargets(state, selectedCard.cardId, selectedRegions)
      if (!covert || selectedRegions.length > 0) return targets
      const faction = state.activeFaction
      const opponent = otherFaction(faction)
      return targets.filter((regionId) => getEffectiveResources(state, regionId, faction).awareness >= 1 && getEffectiveResources(state, regionId, opponent).awareness <= 1)
    },
    [state, selectedCard, selectedDefinition, selectedRegions, hybridResource, covert],
  )
  const validRoutes = selectedDefinition?.target === 'route'
    ? ROUTE_ORDER.filter((id) => ROUTES[id].faction === state.activeFaction)
    : []

  const clearSelection = () => {
    setSelectedCardId(undefined)
    setSelectedRegions([])
    setSelectedRoute(undefined)
    setHybridResource(undefined)
    setCovert(false)
    setError(undefined)
  }

  const handleSelectCard = (instance: CardInstance) => {
    if (!canAct) return
    if (selectedCardId === instance.instanceId) {
      clearSelection()
      return
    }
    setSelectedCardId(instance.instanceId)
    setSelectedRegions([])
    setSelectedRoute(undefined)
    setHybridResource(undefined)
    setCovert(false)
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
    const cardPlay: CardPlay = {
      instanceId: selectedCard.instanceId,
      regions: selectedRegions,
      routeId: selectedRoute,
      resource: hybridResource,
      covert,
    }
    try {
      if (isOnline) {
        if (!roomSnapshot || socketRef.current?.readyState !== WebSocket.OPEN) throw new Error('Die Online-Verbindung ist noch nicht bereit.')
        const command: RoomCommand = { type: 'play-card', play: cardPlay, revision: roomSnapshot.revision }
        socketRef.current.send(JSON.stringify(command))
        pendingRevisionRef.current = roomSnapshot.revision
        setSubmitting(true)
      } else {
        setState(playCard(state, cardPlay))
      }
      clearSelection()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Die Aktion konnte nicht ausgeführt werden.')
    }
  }

  const handleEndTurn = () => {
    if (!canAct) return
    try {
      if (isOnline) {
        if (!roomSnapshot || socketRef.current?.readyState !== WebSocket.OPEN) throw new Error('Die Online-Verbindung ist noch nicht bereit.')
        socketRef.current.send(JSON.stringify({ type: 'end-turn', revision: roomSnapshot.revision } satisfies RoomCommand))
        pendingRevisionRef.current = roomSnapshot.revision
        setSubmitting(true)
      } else {
        setState((current) => endTurn(current))
        if (isLocalPvp) setHandoffReady(false)
      }
      clearSelection()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Der Zug konnte nicht beendet werden.')
    }
  }

  const restartSingleplayer = () => {
    if (state.phase !== 'complete' && !window.confirm(pick(language, 'Laufende Partie wirklich verwerfen und neu beginnen?', 'Discard the current game and start again?'))) return
    const fresh = createInitialState(state.maxRounds, state.governments)
    setState(fresh)
    setInspected('central_basin')
    clearSelection()
  }

  const restartCurrentLocalGame = () => {
    if (mode !== 'local-pvp') return restartSingleplayer()
    if (state.phase !== 'complete' && !window.confirm(pick(language, 'Laufende Partie wirklich verwerfen und neu beginnen?', 'Discard the current game and start again?'))) return
    const fresh = createInitialState(state.maxRounds, state.governments)
    setState(fresh)
    localStorage.setItem(LOCAL_PVP_STORAGE_KEY, JSON.stringify(fresh))
    setHandoffReady(false)
    setInspected('central_basin')
    clearSelection()
  }

  const confirmNewGame = (rounds: RoundCount, governments: GovernmentSelection) => {
    try {
      if (isOnline) {
        if (!roomSnapshot || socketRef.current?.readyState !== WebSocket.OPEN) throw new Error('Die Online-Verbindung ist noch nicht bereit.')
        const faction = onlineSession?.faction
        if (!faction) throw new Error('Die Online-Sitzung ist nicht vollständig.')
        socketRef.current.send(JSON.stringify({ type: 'request-rematch', maxRounds: rounds, government: governments[faction], revision: roomSnapshot.revision } satisfies RoomCommand))
        pendingRevisionRef.current = roomSnapshot.revision
        setSubmitting(true)
      } else {
        const fresh = createInitialState(rounds, governments)
        setState(fresh)
        if (isLocalPvp) {
          localStorage.setItem(LOCAL_PVP_STORAGE_KEY, JSON.stringify(fresh))
          setHandoffReady(false)
        } else {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh))
        }
        setInspected('central_basin')
      }
      setShowNewGame(false)
      clearSelection()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Die neue Partie konnte nicht vorbereitet werden.')
    }
  }

  const handleRematch = (type: 'accept-rematch' | 'decline-rematch' | 'cancel-rematch', government?: GovernmentType) => {
    try {
      if (!roomSnapshot || socketRef.current?.readyState !== WebSocket.OPEN) throw new Error('Die Online-Verbindung ist noch nicht bereit.')
      const command: RoomCommand = type === 'accept-rematch'
        ? { type, government: government ?? state.governments[onlineSession?.faction ?? 'blue'], revision: roomSnapshot.revision }
        : { type, revision: roomSnapshot.revision }
      socketRef.current.send(JSON.stringify(command))
      pendingRevisionRef.current = roomSnapshot.revision
      setSubmitting(true)
      clearSelection()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Der Vorschlag konnte nicht bearbeitet werden.')
    }
  }

  const startSingleplayer = (fresh: boolean) => {
    setError(undefined)
    if (fresh) {
      const initial = createInitialState(selectedRounds, selectedGovernments)
      setState(initial)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(initial))
    } else {
      setState(loadState())
    }
    setInspected('central_basin')
    setMode('singleplayer')
    clearSelection()
  }

  const startLocalPvp = (fresh: boolean) => {
    setError(undefined)
    const initial = fresh ? createInitialState(selectedRounds, selectedGovernments) : loadState(LOCAL_PVP_STORAGE_KEY)
    setState(initial)
    if (fresh) localStorage.setItem(LOCAL_PVP_STORAGE_KEY, JSON.stringify(initial))
    setInspected('central_basin')
    setHandoffReady(false)
    setMode('local-pvp')
    clearSelection()
  }

  const enterOnlineSession = (session: OnlineSession, snapshot?: RoomSnapshot, showSetup = false) => {
    sessionStorage.setItem(ONLINE_SESSION_KEY, JSON.stringify(session))
    setOnlineSession(session)
    setRoomSnapshot(snapshot)
    previousOnlineTurnRef.current = snapshot ? { revision: snapshot.revision, activeFaction: snapshot.state.activeFaction, status: snapshot.status } : undefined
    suppressNextTurnNoticeRef.current = true
    setOnlineTurnNotice(undefined)
    setOnlineSetupNotice(showSetup)
    if (snapshot) setState(snapshot.state)
    setConnection('connecting')
    setMode('multiplayer')
    setLauncherBusy(true)
    setError(undefined)
    clearSelection()
  }

  const createRoom = async () => {
    setLauncherBusy(true)
    setError(undefined)
    try {
      const response = await createOnlineRoom(selectedRounds, selectedGovernments.blue)
      enterOnlineSession(response.session, response.snapshot)
    } catch (reason) {
      setLauncherBusy(false)
      setError(reason instanceof Error ? reason.message : 'Der Spielraum konnte nicht eröffnet werden.')
    }
  }

  const joinRoom = async (code: string, government: GovernmentType) => {
    setLauncherBusy(true)
    setError(undefined)
    try {
      const response = await joinOnlineRoom(code, government)
      enterOnlineSession(response.session, response.snapshot, true)
      const url = new URL(window.location.href)
      url.searchParams.delete('room')
      window.history.replaceState({}, '', url)
    } catch (reason) {
      setLauncherBusy(false)
      setError(reason instanceof Error ? reason.message : 'Der Beitritt ist fehlgeschlagen.')
    }
  }

  const leaveToMenu = () => {
    if (isOnline && roomSnapshot?.status === 'playing' && !window.confirm(pick(language, 'Online-Partie verlassen? Du kannst sie später über die Modusauswahl fortsetzen.', 'Leave the online game? You can resume it later from the mode selection.'))) return
    socketRef.current?.close()
    setOnlineSession(undefined)
    setRoomSnapshot(undefined)
    setConnection('offline')
    setLauncherBusy(false)
    pendingRevisionRef.current = undefined
    setSubmitting(false)
    setOnlineTurnNotice(undefined)
    setOnlineSetupNotice(false)
    previousOnlineTurnRef.current = undefined
    setMode('menu')
    clearSelection()
  }

  if (mode === 'menu') {
    return (
      <ModeSelection
        language={language}
        onLanguage={onLanguage}
        rounds={selectedRounds}
        onRounds={setSelectedRounds}
        governments={selectedGovernments}
        onGovernments={setSelectedGovernments}
        busy={launcherBusy}
        error={error}
        hasSavedSingleGame={Boolean(localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(V7_STORAGE_KEY) ?? localStorage.getItem(V6_STORAGE_KEY) ?? localStorage.getItem(V5_STORAGE_KEY) ?? localStorage.getItem(V4_STORAGE_KEY) ?? localStorage.getItem(V3_STORAGE_KEY) ?? localStorage.getItem(V2_STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY))}
        hasSavedLocalGame={Boolean(localStorage.getItem(LOCAL_PVP_STORAGE_KEY) ?? localStorage.getItem(V7_LOCAL_PVP_STORAGE_KEY) ?? localStorage.getItem(V6_LOCAL_PVP_STORAGE_KEY) ?? localStorage.getItem(V5_LOCAL_PVP_STORAGE_KEY) ?? localStorage.getItem(V4_LOCAL_PVP_STORAGE_KEY))}
        savedOnlineSession={savedOnlineSession}
        onSingleplayer={startSingleplayer}
        onLocalPvp={startLocalPvp}
        onCreateRoom={createRoom}
        onJoinRoom={joinRoom}
        onResumeRoom={(session) => enterOnlineSession(session)}
        {...musicSettings}
      />
    )
  }

  if (isOnline && onlineSession && roomSnapshot?.status !== 'playing' && roomSnapshot?.status !== 'complete') {
    return <OnlineLobby session={onlineSession} snapshot={roomSnapshot} connection={connection} onLeave={leaveToMenu} {...musicSettings} />
  }

  const escalationBand = getEscalationBand(state.escalation)

  return (
    <div className={`app-shell ${factionClass(state.activeFaction)}`} onClickCapture={startMusic} onKeyDownCapture={startMusic}>
      <header className="topbar">
        <div className="brand-mark" aria-hidden="true"><span>✦</span></div>
        <div className="brand-copy"><span>SEA LINES OF</span><strong>COMMUNICATION</strong><small>{isOnline ? `ONLINE · ${pick(language, 'DU', 'YOU')}: ${factionText(viewerFaction, language).adjective}` : isLocalPvp ? pick(language, 'LOKALES PVP · PASS-AND-PLAY', 'LOCAL PVP · PASS-AND-PLAY') : pick(language, 'EINZELSPIELER · DU: BLAU', 'SINGLE PLAYER · YOU: BLUE')}</small></div>
        <div className="turn-status">
          <span>{pick(language, 'RUNDE', 'ROUND')}</span><strong>{state.round}<small>/ {state.maxRounds}</small></strong>
          <i />
          <div><span>{pick(language, 'AKTIV', 'ACTIVE')}</span><b>{factionText(state.activeFaction, language).adjective}</b></div>
        </div>
        <div className={`escalation-meter ${escalationBand.tone}`} aria-label={`${pick(language, 'Eskalation', 'Escalation')} ${state.escalation} ${pick(language, 'von', 'of')} ${constants.MAX_ESCALATION}, ${escalationLabel(state.escalation, language)}`}>
          <div className="escalation-copy"><span>{pick(language, 'ESKALATION', 'ESCALATION')}</span><b>{escalationLabel(state.escalation, language)}</b></div>
          <div className="escalation-pips" aria-hidden="true">
            {Array.from({ length: constants.MAX_ESCALATION }, (_, index) => <i key={index} className={index < state.escalation ? 'filled' : ''} />)}
          </div>
          <strong>{state.escalation}<small>/{constants.MAX_ESCALATION}</small></strong>
        </div>
        <GameMenu onMainMenu={leaveToMenu} onNewGame={() => setShowNewGame(true)} onHelp={() => setShowHelp(true)} {...musicSettings} />
      </header>

      <main className="game-grid">
        <Sidebar state={visibleState} />
        <MapBoard
          state={visibleState}
          inspected={inspected}
          validRegions={validRegions}
          selectedRegions={selectedRegions}
          validRoutes={validRoutes}
          selectedRoute={selectedRoute}
          onRegionClick={handleRegionClick}
          onRouteClick={handleRouteClick}
        />
        <Scoreboard
          state={visibleState}
          validRoutes={validRoutes}
          selectedRoute={selectedRoute}
          onRouteClick={handleRouteClick}
        />
        <CardHand
          state={visibleState}
          selected={selectedCard}
          selectedRegions={selectedRegions}
          selectedRoute={selectedRoute}
          hybridResource={hybridResource}
          covert={covert}
          error={error}
          onSelect={handleSelectCard}
          onResource={setHybridResource}
          onCovert={(value) => {
            setCovert(value)
            setSelectedRegions([])
            setHybridResource(undefined)
            setError(undefined)
          }}
          onConfirm={handleConfirm}
          onCancel={clearSelection}
          onEndTurn={handleEndTurn}
          locked={!canAct}
          waitMessage={isLocalPvp
            ? pick(language, 'Die Befehlshand bleibt bis zur bestätigten Übergabe verdeckt.', 'The command hand remains hidden until the handoff is confirmed.')
            : isOnline
            ? connection !== 'connected'
              ? pick(language, 'Verbindung zur gemeinsamen Lage wird wiederhergestellt.', 'Reconnecting to the shared situation.')
              : `${factionText(state.activeFaction, language).name} ${pick(language, 'plant den nächsten Zug.', 'is planning the next turn.')}`
            : aiThinking
              ? pick(language, 'Die Rote KI bewertet SLOCs, Projektion und Eskalationsrisiko.', 'The Red AI is evaluating SLOCs, Projection, and Escalation risk.')
              : pick(language, 'Die Rote KI übernimmt die Initiative.', 'The Red AI takes the initiative.')}
        />
      </main>

      <div className="small-screen-warning">
        <span>✦</span><h1>{pick(language, 'Größeres Display erforderlich', 'Larger display required')}</h1><p>{pick(language, 'Diese operative Lagekarte ist für Desktop und Laptop ab 1280 Pixel Breite ausgelegt.', 'This operational map is designed for desktop and laptop displays at least 1280 pixels wide.')}</p>
      </div>
      {(!isOnline || !roomSnapshot?.rematchProposal) && <EndGameDialog state={state} onNewGame={() => setShowNewGame(true)} onMainMenu={leaveToMenu} />}
      {isLocalPvp && !handoffReady && state.phase === 'action' && <HandoffOverlay faction={state.activeFaction} onReady={() => setHandoffReady(true)} />}
      {showHelp && <HelpDialog onClose={() => setShowHelp(false)} />}
      {showNewGame && <NewGameDialog initialRounds={state.maxRounds} initialGovernments={state.governments} onlineFaction={isOnline ? onlineSession?.faction : undefined} onClose={() => setShowNewGame(false)} onConfirm={confirmNewGame} />}
      {isOnline && roomSnapshot && onlineSession && <RematchDialog snapshot={roomSnapshot} faction={onlineSession.faction} onAccept={(government) => handleRematch('accept-rematch', government)} onDecline={() => handleRematch('decline-rematch')} onCancel={() => handleRematch('cancel-rematch')} />}
      {isOnline && onlineSetupNotice && onlineSession && (
        <div className="modal-backdrop online-setup-backdrop" role="dialog" aria-modal="true" aria-labelledby="online-setup-title">
          <section className={`handoff-dialog online-setup ${factionClass(onlineSession.faction)}`}>
            <span className="result-compass">◇</span>
            <span className="eyebrow">{pick(language, 'ONLINE · EINSATZBEREIT', 'ONLINE · READY')}</span>
            <h2 id="online-setup-title">{pick(language, `Du spielst ${governmentText(state.governments[onlineSession.faction], language).name}`, `You play ${governmentText(state.governments[onlineSession.faction], language).name}`)}</h2>
            <p>{pick(language, `Gegenüber: ${factionText(otherFaction(onlineSession.faction), language).name} · ${governmentText(state.governments[otherFaction(onlineSession.faction)], language).name}`, `Opponent: ${factionText(otherFaction(onlineSession.faction), language).name} · ${governmentText(state.governments[otherFaction(onlineSession.faction)], language).name}`)}</p>
            <div className="setup-government-summary">
              {(['blue', 'red'] as const).map((faction) => <span className={factionClass(faction)} key={faction}><b>{factionText(faction, language).adjective}: {governmentText(state.governments[faction], language).name}</b><small>{governmentText(state.governments[faction], language).benefit}</small></span>)}
            </div>
            <button className="confirm-button" type="button" autoFocus onClick={() => setOnlineSetupNotice(false)}>{pick(language, 'Partie betreten', 'Enter game')}</button>
          </section>
        </div>
      )}
      {isOnline && onlineTurnNotice === viewerFaction && state.phase === 'action' && state.activeFaction === viewerFaction && (
        <div className="modal-backdrop turn-notice-backdrop" role="dialog" aria-modal="true" aria-labelledby="turn-notice-title">
          <section className={`handoff-dialog turn-notice ${factionClass(viewerFaction)}`}>
            <span className="result-compass">✦</span>
            <span className="eyebrow">{pick(language, 'ONLINE · INITIATIVEWECHSEL', 'ONLINE · INITIATIVE CHANGE')}</span>
            <h2 id="turn-notice-title">{pick(language, 'Du bist am Zug', 'Your turn')}</h2>
            <p>{factionText(viewerFaction, language).name} · {governmentText(state.governments[viewerFaction], language).name} · {pick(language, `Runde ${state.round}`, `Round ${state.round}`)}</p>
            <button className="confirm-button" type="button" autoFocus onClick={() => setOnlineTurnNotice(undefined)}>{pick(language, 'Zug übernehmen', 'Take turn')}</button>
          </section>
        </div>
      )}
    </div>
  )
}

export default function App() {
  const [language, setLanguage] = useState<Language>(() => localStorage.getItem(LANGUAGE_KEY) === 'en' ? 'en' : 'de')
  useEffect(() => {
    localStorage.setItem(LANGUAGE_KEY, language)
    document.documentElement.lang = language
  }, [language])
  return <LanguageProvider language={language}><GameApp language={language} onLanguage={setLanguage} /></LanguageProvider>
}
