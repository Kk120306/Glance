import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import type { EmitRequest, ClientToServerMessage, ServerToClientMessage } from '@glance/shared/ws'

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

/** True while a patient has at least one live device socket connected. */
function isPatientOnline(patientId: string): boolean {
  return (patientSockets.get(patientId)?.size ?? 0) > 0
}

/** Broadcast a patient's online/offline transition to all caregivers watching them. */
function broadcastPatientStatus(patientId: string, status: 'online' | 'offline') {
  const event: ServerToClientMessage = {
    type: 'PATIENT_STATUS_CHANGE',
    payload: { patientId, status },
  }
  io.to(`patient:alerts:${patientId}`).emit(event.type, event)
  console.log(`[ws] patient ${patientId} is ${status}`)
}

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
      const wasOnline = isPatientOnline(patientId)
      if (!patientSockets.has(patientId)) patientSockets.set(patientId, new Set())
      patientSockets.get(patientId)!.add(socket.id)
      socketIdentity.set(socket.id, { role: 'patient', id: patientId })
      socket.join(`patient:${patientId}`)
      console.log(`[ws] patient registered: ${patientId} (${socket.id})`)
      // First device socket for this patient → notify caregivers they came online.
      if (!wasOnline) broadcastPatientStatus(patientId, 'online')
    } else if (msg.role === 'caregiver') {
      const { familyMemberId, patientIds } = msg
      if (!caregiverSockets.has(familyMemberId)) caregiverSockets.set(familyMemberId, new Set())
      caregiverSockets.get(familyMemberId)!.add(socket.id)
      socketIdentity.set(socket.id, { role: 'caregiver', id: familyMemberId })
      socket.join(`caregiver:${familyMemberId}`)
      // Join the alerts room for every associated patient so this caregiver
      // receives SOS / phrase / reply / status events regardless of which
      // patient dashboard page they currently have open.
      for (const patientId of patientIds ?? []) {
        socket.join(`patient:alerts:${patientId}`)
        // Seed the caregiver with each patient's current connectivity so the
        // sidebar dots are correct immediately on connect (no polling endpoint).
        const event: ServerToClientMessage = {
          type: 'PATIENT_STATUS_CHANGE',
          payload: { patientId, status: isPatientOnline(patientId) ? 'online' : 'offline' },
        }
        socket.emit(event.type, event)
      }
      console.log(
        `[ws] caregiver registered: ${familyMemberId} (${socket.id}) watching ${(patientIds ?? []).length} patient(s)`,
      )
    }
  })

  socket.on('disconnect', () => {
    const identity = socketIdentity.get(socket.id)
    if (identity) {
      if (identity.role === 'patient') {
        patientSockets.get(identity.id)?.delete(socket.id)
        // Last device socket gone → notify caregivers the patient went offline.
        if (!isPatientOnline(identity.id)) broadcastPatientStatus(identity.id, 'offline')
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

  if (!body.targetPatientId && !body.targetFamilyMemberId && !body.targetPatientAlerts) {
    res.status(400).json({
      error: 'Invalid body: must specify targetPatientId, targetFamilyMemberId, or targetPatientAlerts',
    })
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

  if (body.targetPatientAlerts) {
    io.to(`patient:alerts:${body.targetPatientAlerts}`).emit(body.event.type, body.event)
    console.log(`[ws] emitted ${body.event.type} to patient:alerts:${body.targetPatientAlerts}`)
  }

  res.status(204).end()
})

app.get('/health', (_req, res) => {
  res.json({ ok: true })
})

httpServer.listen(PORT, () => {
  console.log(`[ws-server] listening on port ${PORT}`)
})
