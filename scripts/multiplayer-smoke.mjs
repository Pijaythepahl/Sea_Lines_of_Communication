const base = process.argv[2] ?? 'http://127.0.0.1:8787'

const request = async (path, init) => {
  const response = await fetch(`${base}${path}`, init)
  const body = await response.json()
  if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`)
  return body
}

const socketFor = (session) => {
  const url = new URL(base)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.pathname = `/api/rooms/${session.roomCode}/socket`
  url.searchParams.set('token', session.token)
  return new WebSocket(url)
}

const nextJson = (socket) => new Promise((resolve, reject) => {
  const onMessage = (event) => {
    cleanup()
    resolve(JSON.parse(String(event.data)))
  }
  const onError = () => {
    cleanup()
    reject(new Error('WebSocket connection failed'))
  }
  const cleanup = () => {
    socket.removeEventListener('message', onMessage)
    socket.removeEventListener('error', onError)
  }
  socket.addEventListener('message', onMessage)
  socket.addEventListener('error', onError)
})

const nextJsonWhere = (socket, predicate) => new Promise((resolve, reject) => {
  const onMessage = (event) => {
    const value = JSON.parse(String(event.data))
    if (!predicate(value)) return
    cleanup()
    resolve(value)
  }
  const onError = () => {
    cleanup()
    reject(new Error('WebSocket connection failed'))
  }
  const cleanup = () => {
    socket.removeEventListener('message', onMessage)
    socket.removeEventListener('error', onError)
  }
  socket.addEventListener('message', onMessage)
  socket.addEventListener('error', onError)
})

const opened = (socket) => socket.readyState === WebSocket.OPEN
  ? Promise.resolve()
  : new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', reject, { once: true })
  })

const created = await request('/api/rooms', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ maxRounds: 12, blueGovernment: 'autocracy' }),
})
if (created.snapshot.status !== 'waiting' || created.session.faction !== 'blue') throw new Error('Room creation contract failed')
if (created.snapshot.state.maxRounds !== 12 || created.snapshot.state.version !== 9) throw new Error('Room configuration contract failed')
if (created.snapshot.state.governments.blue !== 'autocracy') throw new Error('Host government did not synchronize')

const joined = await request(`/api/rooms/${created.session.roomCode}/join`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ government: 'democracy' }),
})
if (joined.snapshot.status !== 'playing' || joined.session.faction !== 'red') throw new Error('Room join contract failed')
if (joined.snapshot.state.governments.blue !== 'autocracy' || joined.snapshot.state.governments.red !== 'democracy') throw new Error('Independent government choices did not synchronize')

const blueSocket = socketFor(created.session)
const redSocket = socketFor(joined.session)
const blueInitialPromise = nextJson(blueSocket)
const redInitialPromise = nextJson(redSocket)
await Promise.all([opened(blueSocket), opened(redSocket)])
const [blueInitial, redInitial] = await Promise.all([blueInitialPromise, redInitialPromise])

if (blueInitial.state.hands.red.length !== 0 || redInitial.state.hands.blue.length !== 0) throw new Error('Opponent hand was exposed')
if (blueInitial.state.hands.blue.length === 0 || redInitial.state.hands.red.length === 0) throw new Error('Own hand is missing')
if (blueInitial.state.covertOperations.length !== 0 || redInitial.state.covertOperations.length !== 0) throw new Error('Unexpected secret operation exposure')

const blueUpdatePromise = nextJsonWhere(blueSocket, (message) => message.type === 'snapshot' && message.revision > blueInitial.revision)
const redUpdatePromise = nextJsonWhere(redSocket, (message) => message.type === 'snapshot' && message.revision > redInitial.revision)
blueSocket.send(JSON.stringify({ type: 'end-turn', revision: blueInitial.revision }))
const [blueUpdate, redUpdate] = await Promise.all([blueUpdatePromise, redUpdatePromise])

if (blueUpdate.revision !== blueInitial.revision + 1 || redUpdate.revision !== blueUpdate.revision) throw new Error('Revision sync failed')
if (blueUpdate.state.activeFaction !== 'red' || redUpdate.state.activeFaction !== 'red') throw new Error('Turn sync failed')

const blueProposalPromise = nextJsonWhere(blueSocket, (message) => message.type === 'snapshot' && message.revision > blueUpdate.revision)
const redProposalPromise = nextJsonWhere(redSocket, (message) => message.type === 'snapshot' && message.revision > redUpdate.revision)
blueSocket.send(JSON.stringify({ type: 'request-rematch', maxRounds: 18, government: 'democracy', revision: blueUpdate.revision }))
const [blueProposal, redProposal] = await Promise.all([blueProposalPromise, redProposalPromise])
if (blueProposal.rematchProposal?.requestedBy !== 'blue' || redProposal.rematchProposal?.maxRounds !== 18 || redProposal.rematchProposal?.government !== 'democracy') throw new Error('Rematch proposal did not synchronize')

const blueDeclinePromise = nextJsonWhere(blueSocket, (message) => message.type === 'snapshot' && message.revision > blueProposal.revision)
const redDeclinePromise = nextJsonWhere(redSocket, (message) => message.type === 'snapshot' && message.revision > redProposal.revision)
redSocket.send(JSON.stringify({ type: 'decline-rematch', revision: redProposal.revision }))
const [blueDecline, redDecline] = await Promise.all([blueDeclinePromise, redDeclinePromise])
if (blueDecline.rematchProposal || redDecline.rematchProposal) throw new Error('Declined rematch proposal remained active')

const blueSecondProposalPromise = nextJsonWhere(blueSocket, (message) => message.type === 'snapshot' && message.revision > blueDecline.revision)
const redSecondProposalPromise = nextJsonWhere(redSocket, (message) => message.type === 'snapshot' && message.revision > redDecline.revision)
blueSocket.send(JSON.stringify({ type: 'request-rematch', maxRounds: 6, government: 'autocracy', revision: blueDecline.revision }))
const [blueSecondProposal, redSecondProposal] = await Promise.all([blueSecondProposalPromise, redSecondProposalPromise])

const blueRematchPromise = nextJsonWhere(blueSocket, (message) => message.type === 'snapshot' && message.revision > blueSecondProposal.revision)
const redRematchPromise = nextJsonWhere(redSocket, (message) => message.type === 'snapshot' && message.revision > redSecondProposal.revision)
redSocket.send(JSON.stringify({ type: 'accept-rematch', government: 'democracy', revision: redSecondProposal.revision }))
const [blueRematch, redRematch] = await Promise.all([blueRematchPromise, redRematchPromise])
if (blueRematch.roomCode !== created.session.roomCode || redRematch.roomCode !== joined.session.roomCode) throw new Error('Room code changed during rematch')
if (blueRematch.status !== 'playing' || blueRematch.state.maxRounds !== 6 || blueRematch.state.round !== 1) throw new Error('Accepted rematch did not reset the game')
if (blueRematch.state.governments.blue !== 'autocracy' || redRematch.state.governments.red !== 'democracy') throw new Error('Rematch government choices did not synchronize')
if (blueRematch.state.hands.red.length !== 0 || redRematch.state.hands.blue.length !== 0) throw new Error('Rematch exposed opponent hands')

const blueClosed = new Promise((resolve) => blueSocket.addEventListener('close', resolve, { once: true }))
const redClosed = new Promise((resolve) => redSocket.addEventListener('close', resolve, { once: true }))
blueSocket.close()
redSocket.close()
await Promise.all([blueClosed, redClosed])
console.log(`Multiplayer smoke test passed for room ${created.session.roomCode}`)
