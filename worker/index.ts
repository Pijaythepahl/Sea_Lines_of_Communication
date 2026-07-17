import { DurableObject } from 'cloudflare:workers'
import { createFactionView, createInitialState, endTurn, migrateGameState, playCard } from '../src/engine'
import type { FactionId, GameCommand, GameState, MatchupId, RoundCount } from '../src/types'

interface Env {
  ASSETS: Fetcher
  GAME_ROOMS: DurableObjectNamespace<GameRoom>
}

interface RoomRecord {
  code: string
  status: 'waiting' | 'playing' | 'complete'
  revision: number
  state: GameState
  tokens: { blue: string; red?: string }
  updatedAt: number
  rematchProposal?: { requestedBy: FactionId; maxRounds: RoundCount; matchup: MatchupId }
}

interface SocketAttachment {
  faction: FactionId
  token: string
}

type RoomCommand =
  | (GameCommand & { revision: number })
  | { type: 'request-rematch'; maxRounds: RoundCount; matchup: MatchupId; revision: number }
  | { type: 'accept-rematch'; revision: number }
  | { type: 'decline-rematch'; revision: number }
  | { type: 'cancel-rematch'; revision: number }

const json = (value: unknown, status = 200) => Response.json(value, {
  status,
  headers: { 'Cache-Control': 'no-store' },
})

const roomCode = (): string => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(6))
  return Array.from(bytes, (value) => alphabet[value % alphabet.length]).join('')
}

const tokenMatches = (room: RoomRecord, faction: FactionId, token: string): boolean => room.tokens[faction] === token

export class GameRoom extends DurableObject<Env> {
  private room: RoomRecord | null = null
  private readonly ready: Promise<void>

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    this.ready = ctx.blockConcurrencyWhile(async () => {
      this.room = await ctx.storage.get<RoomRecord>('room') ?? null
      if (this.room && this.room.state.version !== 7) {
        this.room.state = migrateGameState(this.room.state)
        await ctx.storage.put('room', this.room)
      }
    })
  }

  private connections(): Record<FactionId, boolean> {
    const result = { blue: false, red: false }
    for (const socket of this.ctx.getWebSockets()) {
      const attachment = socket.deserializeAttachment() as SocketAttachment | null
      if (attachment?.faction) result[attachment.faction] = true
    }
    return result
  }

  private snapshot(faction: FactionId) {
    if (!this.room) throw new Error('Spielraum nicht initialisiert.')
    const state = createFactionView(this.room.state, faction)
    return {
      type: 'snapshot' as const,
      roomCode: this.room.code,
      status: this.room.status,
      revision: this.room.revision,
      state,
      seats: { blue: true, red: Boolean(this.room.tokens.red) },
      connected: this.connections(),
      rematchProposal: this.room.rematchProposal,
    }
  }

  private session(faction: FactionId) {
    if (!this.room) throw new Error('Spielraum nicht initialisiert.')
    return { roomCode: this.room.code, faction, token: this.room.tokens[faction]! }
  }

  private async persist(): Promise<void> {
    if (!this.room) return
    this.room.updatedAt = Date.now()
    await this.ctx.storage.put('room', this.room)
  }

  private broadcast(): void {
    if (!this.room) return
    for (const socket of this.ctx.getWebSockets()) {
      const attachment = socket.deserializeAttachment() as SocketAttachment | null
      if (!attachment || !tokenMatches(this.room, attachment.faction, attachment.token)) continue
      try {
        socket.send(JSON.stringify(this.snapshot(attachment.faction)))
      } catch {
        // A later close event removes stale connections.
      }
    }
  }

  async fetch(request: Request): Promise<Response> {
    await this.ready
    const url = new URL(request.url)

    if (url.pathname === '/create' && request.method === 'POST') {
      if (this.room) return json({ error: 'Raumcode bereits vergeben.' }, 409)
      const body = await request.json<{ code: string; maxRounds?: RoundCount; matchup?: MatchupId }>()
      this.room = {
        code: body.code,
        status: 'waiting',
        revision: 0,
        state: createInitialState(body.maxRounds, body.matchup),
        tokens: { blue: crypto.randomUUID() },
        updatedAt: Date.now(),
      }
      await this.persist()
      return json({ session: this.session('blue'), snapshot: this.snapshot('blue') }, 201)
    }

    if (!this.room) return json({ error: 'Dieser Spielraum existiert nicht.' }, 404)

    if (url.pathname === '/join' && request.method === 'POST') {
      if (this.room.tokens.red) return json({ error: 'In diesem Spielraum sind bereits zwei Personen.' }, 409)
      this.room.tokens.red = crypto.randomUUID()
      this.room.status = 'playing'
      this.room.revision += 1
      await this.persist()
      this.broadcast()
      return json({ session: this.session('red'), snapshot: this.snapshot('red') })
    }

    const token = url.searchParams.get('token') ?? ''
    const faction = (['blue', 'red'] as const).find((candidate) => tokenMatches(this.room!, candidate, token))
    if (!faction) return json({ error: 'Die Zugangsberechtigung für diesen Raum ist ungültig.' }, 403)

    if (url.pathname === '/state' && request.method === 'GET') {
      return json(this.snapshot(faction))
    }

    if (url.pathname === '/socket' && request.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
      const pair = new WebSocketPair()
      const [client, server] = Object.values(pair)
      this.ctx.acceptWebSocket(server)
      server.serializeAttachment({ faction, token } satisfies SocketAttachment)
      server.send(JSON.stringify(this.snapshot(faction)))
      queueMicrotask(() => this.broadcast())
      return new Response(null, { status: 101, webSocket: client })
    }

    return json({ error: 'Unbekannte Raumanfrage.' }, 404)
  }

  async webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): Promise<void> {
    await this.ready
    if (!this.room) return
    const attachment = socket.deserializeAttachment() as SocketAttachment | null
    if (!attachment || !tokenMatches(this.room, attachment.faction, attachment.token)) {
      socket.send(JSON.stringify({ type: 'error', error: 'Sitzung nicht mehr gültig.' }))
      return
    }

    try {
      const command = JSON.parse(typeof message === 'string' ? message : new TextDecoder().decode(message)) as RoomCommand
      if (command.revision !== this.room.revision) {
        socket.send(JSON.stringify(this.snapshot(attachment.faction)))
        throw new Error('Der Spielstand wurde inzwischen aktualisiert. Bitte erneut versuchen.')
      }

      if (command.type === 'request-rematch') {
        if (!this.room.tokens.red) throw new Error('Eine neue Partie kann erst mit zwei besetzten Seiten vorgeschlagen werden.')
        if (![6, 12, 18].includes(command.maxRounds)) throw new Error('Ungültige Rundenzahl.')
        if (!['democracy-democracy', 'democracy-autocracy', 'autocracy-autocracy'].includes(command.matchup)) throw new Error('Ungültige Staatsform-Paarung.')
        if (this.room.rematchProposal && this.room.rematchProposal.requestedBy !== attachment.faction) {
          throw new Error('Die andere Koalition hat bereits eine neue Partie vorgeschlagen.')
        }
        this.room.rematchProposal = { requestedBy: attachment.faction, maxRounds: command.maxRounds, matchup: command.matchup }
        this.room.revision += 1
        await this.persist()
        this.broadcast()
        return
      }

      if (command.type === 'cancel-rematch') {
        if (!this.room.rematchProposal || this.room.rematchProposal.requestedBy !== attachment.faction) {
          throw new Error('Es gibt keinen eigenen Vorschlag zum Zurückziehen.')
        }
        this.room.rematchProposal = undefined
        this.room.revision += 1
        await this.persist()
        this.broadcast()
        return
      }

      if (command.type === 'decline-rematch') {
        if (!this.room.rematchProposal || this.room.rematchProposal.requestedBy === attachment.faction) {
          throw new Error('Es gibt keinen gegnerischen Vorschlag zum Ablehnen.')
        }
        this.room.rematchProposal = undefined
        this.room.revision += 1
        await this.persist()
        this.broadcast()
        return
      }

      if (command.type === 'accept-rematch') {
        if (!this.room.rematchProposal || this.room.rematchProposal.requestedBy === attachment.faction) {
          throw new Error('Es gibt keinen gegnerischen Vorschlag zum Annehmen.')
        }
        this.room.state = createInitialState(this.room.rematchProposal.maxRounds, this.room.rematchProposal.matchup)
        this.room.status = 'playing'
        this.room.rematchProposal = undefined
        this.room.revision += 1
        await this.persist()
        this.broadcast()
        return
      }

      if (this.room.status !== 'playing') throw new Error('Die Partie wartet auf eine neue Partie oder die zweite Seite.')
      if (this.room.state.activeFaction !== attachment.faction) throw new Error('Die andere Koalition ist am Zug.')

      if (command.type === 'play-card') {
        this.room.state = playCard(this.room.state, command.play)
      } else if (command.type === 'end-turn') {
        this.room.state = endTurn(this.room.state)
      } else {
        throw new Error('Unbekannter Befehl.')
      }

      this.room.revision += 1
      if (this.room.state.phase === 'complete') this.room.status = 'complete'
      await this.persist()
      this.broadcast()
    } catch (reason) {
      socket.send(JSON.stringify({
        type: 'error',
        error: reason instanceof Error ? reason.message : 'Die Aktion konnte nicht ausgeführt werden.',
      }))
    }
  }

  webSocketClose(socket: WebSocket, code: number, reason: string): void {
    socket.close(code, reason)
    queueMicrotask(() => this.broadcast())
  }

  webSocketError(socket: WebSocket): void {
    socket.close(1011, 'Verbindung unterbrochen')
    queueMicrotask(() => this.broadcast())
  }
}

const roomStub = (env: Env, code: string) => env.GAME_ROOMS.get(env.GAME_ROOMS.idFromName(code))

const forward = (stub: DurableObjectStub<GameRoom>, request: Request, pathname: string): Promise<Response> => {
  const url = new URL(request.url)
  url.pathname = pathname
  return stub.fetch(new Request(url, request))
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname === '/api/rooms' && request.method === 'POST') {
      const body = await request.json<{ maxRounds?: RoundCount; matchup?: MatchupId }>().catch((): { maxRounds?: RoundCount; matchup?: MatchupId } => ({}))
      const maxRounds = body.maxRounds ?? 6
      const matchup = body.matchup ?? 'democracy-democracy'
      if (![6, 12, 18].includes(maxRounds)) return json({ error: 'Ungültige Rundenzahl.' }, 400)
      if (!['democracy-democracy', 'democracy-autocracy', 'autocracy-autocracy'].includes(matchup)) return json({ error: 'Ungültige Staatsform-Paarung.' }, 400)
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const code = roomCode()
        const response = await roomStub(env, code).fetch(new Request(new URL('/create', request.url), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, maxRounds, matchup }),
        }))
        if (response.status !== 409) return response
      }
      return json({ error: 'Es konnte kein freier Raumcode erzeugt werden.' }, 503)
    }

    const match = url.pathname.match(/^\/api\/rooms\/([A-Z0-9]{6})\/(join|socket|state)$/i)
    if (match) {
      const code = match[1].toUpperCase()
      return forward(roomStub(env, code), request, `/${match[2].toLowerCase()}`)
    }

    if (url.pathname.startsWith('/api/')) return json({ error: 'API-Endpunkt nicht gefunden.' }, 404)
    return env.ASSETS.fetch(request)
  },
} satisfies ExportedHandler<Env>
