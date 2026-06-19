import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import type { EmitRequest, ClientToServerMessage } from '@glance/shared/ws'

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

// Identity maps for targeted routing
const patientSockets = new Map<string, Set<string>>()    // patientId → Set<socketId>
const caregiverSockets = new Map<string, Set<string>>()  // familyMemberId → Set<socketId>
const socketIdentity = new Map<string, { role: 'patient' | 'caregiver'; id: string }>()

io.on('connection', (socket) => {
  console.log(`[ws] client connected: ${socket.id}`)

  socket.on('message', (raw: unknown) => {
    let msg: ClientToServerMessage
    try {
      msg = (typeof raw === 'string' ? JSON.parse(raw) : raw) as ClientToServerMessage
    } catch {
      return
    }

    if (msg.type !== 'REGISTER') return

    if (msg.role === 'patient') {
      const { patientId } = msg
      if (!patientSockets.has(patientId)) patientSockets.set(patientId, new Set())
      patientSockets.get(patientId)!.add(socket.id)
      socketIdentity.set(socket.id, { role: 'patient', id: patientId })
      socket.join(`patient:${patientId}`)
      console.log(`[ws] patient registered: ${patientId} (${socket.id})`)
    } else if (msg.role === 'caregiver') {
      const { familyMemberId } = msg
      if (!caregiverSockets.has(familyMemberId)) caregiverSockets.set(familyMemberId, new Set())
      caregiverSockets.get(familyMemberId)!.add(socket.id)
      socketIdentity.set(socket.id, { role: 'caregiver', id: familyMemberId })
      socket.join(`caregiver:${familyMemberId}`)
      console.log(`[ws] caregiver registered: ${familyMemberId} (${socket.id})`)
    }
  })

  socket.on('disconnect', () => {
    const identity = socketIdentity.get(socket.id)
    if (identity) {
      if (identity.role === 'patient') {
        patientSockets.get(identity.id)?.delete(socket.id)
      } else {
        caregiverSockets.get(identity.id)?.delete(socket.id)
      }
      socketIdentity.delete(socket.id)
    }
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
  if (!body?.event) {
    res.status(400).json({ error: 'Invalid body: missing event' })
    return
  }

  if (!body.targetPatientId && !body.targetFamilyMemberId) {
    res.status(400).json({ error: 'Invalid body: must specify targetPatientId or targetFamilyMemberId' })
    return
  }

  if (body.targetPatientId) {
    io.to(`patient:${body.targetPatientId}`).emit(body.event.type, body.event)
    console.log(`[ws] emitted ${body.event.type} to patient:${body.targetPatientId}`)
  }

  if (body.targetFamilyMemberId) {
    io.to(`caregiver:${body.targetFamilyMemberId}`).emit(body.event.type, body.event)
    console.log(`[ws] emitted ${body.event.type} to caregiver:${body.targetFamilyMemberId}`)
  }

  res.status(204).end()
})

app.get('/health', (_req, res) => {
  res.json({ ok: true })
})

httpServer.listen(PORT, () => {
  console.log(`[ws-server] listening on port ${PORT}`)
})
