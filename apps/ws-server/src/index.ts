import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import type { EmitRequest } from '@glance/shared/ws'

const PORT = process.env.PORT ?? '4000'
const WS_INTERNAL_SECRET = process.env.WS_INTERNAL_SECRET

if (!WS_INTERNAL_SECRET) {
  console.error('WS_INTERNAL_SECRET environment variable is required')
  process.exit(1)
}

const app = express()
app.use(express.json())

const httpServer = createServer(app)
const io = new Server(httpServer, {
  cors: { origin: '*' },
})

io.on('connection', (socket) => {
  const { patientId } = socket.handshake.query
  if (typeof patientId === 'string' && patientId) {
    socket.join(patientId)
    console.log(`[ws] client joined room: ${patientId}`)
  }

  socket.on('disconnect', () => {
    console.log(`[ws] client disconnected: ${socket.id}`)
  })
})

app.post('/emit', (req, res) => {
  const secret = req.headers['x-internal-secret']
  if (secret !== WS_INTERNAL_SECRET) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const body = req.body as EmitRequest
  if (!body?.room || !body?.event) {
    res.status(400).json({ error: 'Invalid body' })
    return
  }

  io.to(body.room).emit(body.event.type, body.event)
  console.log(`[ws] emitted ${body.event.type} to room ${body.room}`)
  res.status(204).end()
})

app.get('/health', (_req, res) => {
  res.json({ ok: true })
})

httpServer.listen(PORT, () => {
  console.log(`[ws-server] listening on port ${PORT}`)
})
