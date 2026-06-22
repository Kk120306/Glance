'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { io, type Socket } from 'socket.io-client'
import type { ServerToClientMessage } from '@glance/shared/ws'

const WS_SERVER_URL = process.env.NEXT_PUBLIC_WS_SERVER_URL ?? 'http://localhost:4000'

export interface PatientSummary {
  id: string
  name: string
  deviceToken: string
  cameraOverrideActive: boolean
  createdAt: string
  /** Family messages this patient hasn't seen yet (read receipt outstanding). */
  unseenCount?: number
}

interface DashboardContextValue {
  patients: PatientSummary[]
  patientsLoading: boolean
  /** patientId → 'online' | 'offline'. Missing entry means unknown (treat as offline). */
  onlineStatus: Record<string, 'online' | 'offline'>
  familyMemberId: string | null
  /** Shared caregiver socket, registered to every associated patient's alerts room. */
  socket: Socket | null
  /** patientId → count of family messages not yet seen by that patient (live). */
  unseenByPatient: Record<string, number>
  /** Total unseen family messages across every managed patient (live). */
  totalUnseen: number
  /** Refetch the patient list and return the fresh array. */
  refreshPatients: () => Promise<PatientSummary[]>
  /** Optimistically update a patient's display name in the shared list. */
  updatePatientName: (id: string, name: string) => void
  sosAlert: { patientId: string; timestamp: string } | null
  setSosAlert: (alert: { patientId: string; timestamp: string } | null) => void
}

const DashboardContext = createContext<DashboardContextValue | null>(null)

export function useDashboard(): DashboardContextValue {
  const ctx = useContext(DashboardContext)
  if (!ctx) throw new Error('useDashboard must be used within a DashboardProvider')
  return ctx
}

// Audible alarm for an SOS takeover (loud, sustained).
function playSosAlarm() {
  if (typeof window === 'undefined' || !('AudioContext' in window)) return
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.frequency.value = 880
    gain.gain.value = 0.6
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 2)
    setTimeout(() => ctx.close().catch(() => {}), 3000)
  } catch {
    // ignore audio errors
  }
}

// Discrete double-chime to alert the caregiver to a patient-initiated request.
function playDoubleChime() {
  if (typeof window === 'undefined' || !('AudioContext' in window)) return
  try {
    const ctx = new AudioContext()
    const beep = (startOffset: number, freq: number) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      const t0 = ctx.currentTime + startOffset
      gain.gain.setValueAtTime(0.0001, t0)
      gain.gain.exponentialRampToValueAtTime(0.4, t0 + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.18)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(t0)
      osc.stop(t0 + 0.2)
    }
    beep(0, 880)
    beep(0.22, 1175)
    setTimeout(() => ctx.close().catch(() => {}), 800)
  } catch {
    // ignore audio errors
  }
}

export function DashboardProvider({ children }: { children: ReactNode }) {
  const [patients, setPatients] = useState<PatientSummary[]>([])
  const [patientsLoading, setPatientsLoading] = useState(true)
  const [familyMemberId, setFamilyMemberId] = useState<string | null>(null)
  const [onlineStatus, setOnlineStatus] = useState<Record<string, 'online' | 'offline'>>({})
  const [socket, setSocket] = useState<Socket | null>(null)

  // Live per-patient unseen counts (seeded from the patient list, then nudged by
  // socket events: +1 when a family message is sent, −1 when the patient reads it).
  const [unseenByPatient, setUnseenByPatient] = useState<Record<string, number>>({})

  // Global alerts (fire regardless of which patient page is open).
  const [sosAlert, setSosAlert] = useState<{ patientId: string; timestamp: string } | null>(null)
  const [patientAlert, setPatientAlert] = useState<{ patientId: string; content: string } | null>(null)
  // Auto-dismiss timer for the patient-request toast, so toasts never pile up.
  const patientAlertTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Always-current patient id list for (re-)registration without re-creating the socket.
  const patientIdsRef = useRef<string[]>([])

  const refreshPatients = useCallback(async () => {
    try {
      const res = await fetch('/api/patients')
      if (res.ok) {
        const data = (await res.json()) as PatientSummary[]
        setPatients(data)
        patientIdsRef.current = data.map((p) => p.id)
        // Reset unseen counts to server truth (self-heals any socket drift).
        setUnseenByPatient(Object.fromEntries(data.map((p) => [p.id, p.unseenCount ?? 0])))
        return data
      }
    } catch {
      // ignore — keep last known list
    } finally {
      setPatientsLoading(false)
    }
    return []
  }, [])

  const updatePatientName = useCallback((id: string, name: string) => {
    setPatients((prev) => prev.map((p) => (p.id === id ? { ...p, name } : p)))
  }, [])

  // ── Bootstrap: who am I + which patients do I manage
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/family-member/me')
        if (res.ok) {
          const data = (await res.json()) as { id: string }
          setFamilyMemberId(data.id)
        }
      } catch {
        // ignore
      }
      await refreshPatients()
    })()
  }, [refreshPatients])

  // ── Single shared caregiver socket
  useEffect(() => {
    if (!familyMemberId) return

    const s = io(WS_SERVER_URL, {
      reconnectionDelay: 500,
      reconnectionDelayMax: 8000,
    })

    const register = () => {
      s.emit(
        'message',
        JSON.stringify({
          type: 'REGISTER',
          role: 'caregiver',
          familyMemberId,
          patientIds: patientIdsRef.current,
        }),
      )
    }

    s.on('connect', register)
    s.on('reconnect', register)

    s.on('PATIENT_STATUS_CHANGE', (envelope: ServerToClientMessage) => {
      if (envelope.type !== 'PATIENT_STATUS_CHANGE') return
      const { patientId, status } = envelope.payload
      setOnlineStatus((prev) => ({ ...prev, [patientId]: status }))
    })

    s.on('SOS_TRIGGERED', (envelope: ServerToClientMessage) => {
      if (envelope.type !== 'SOS_TRIGGERED') return
      setSosAlert({ patientId: envelope.payload.patientId, timestamp: envelope.payload.timestamp })
      playSosAlarm()
    })

    s.on('NEW_MESSAGE', (envelope: ServerToClientMessage) => {
      if (envelope.type !== 'NEW_MESSAGE') return
      const msg = envelope.payload
      if (msg.senderPatientId) {
        // Patient-initiated phrase → toast + chime, auto-dismissed after 8s.
        setPatientAlert({ patientId: msg.senderPatientId, content: msg.content })
        playDoubleChime()
        if (patientAlertTimer.current) clearTimeout(patientAlertTimer.current)
        patientAlertTimer.current = setTimeout(() => setPatientAlert(null), 8000)
      } else {
        // Family→patient message → still unseen until the patient's device reads it.
        setUnseenByPatient((prev) => ({
          ...prev,
          [msg.recipientId]: (prev[msg.recipientId] ?? 0) + 1,
        }))
      }
    })

    s.on('MESSAGE_READ', (envelope: ServerToClientMessage) => {
      if (envelope.type !== 'MESSAGE_READ') return
      const { patientId } = envelope.payload
      if (!patientId) return
      setUnseenByPatient((prev) => ({
        ...prev,
        [patientId]: Math.max(0, (prev[patientId] ?? 0) - 1),
      }))
    })

    setSocket(s)

    return () => {
      s.disconnect()
      setSocket(null)
      if (patientAlertTimer.current) clearTimeout(patientAlertTimer.current)
    }
  }, [familyMemberId])

  // ── Keep room membership in sync as the managed-patient set changes
  useEffect(() => {
    patientIdsRef.current = patients.map((p) => p.id)
    if (socket?.connected) {
      socket.emit(
        'message',
        JSON.stringify({
          type: 'REGISTER',
          role: 'caregiver',
          familyMemberId,
          patientIds: patientIdsRef.current,
        }),
      )
    }
  }, [patients, socket, familyMemberId])

  const patientName = (id: string) => patients.find((p) => p.id === id)?.name ?? 'Patient'

  const totalUnseen = Object.values(unseenByPatient).reduce((sum, n) => sum + n, 0)

  return (
    <DashboardContext.Provider
      value={{
        patients,
        patientsLoading,
        onlineStatus,
        familyMemberId,
        socket,
        unseenByPatient,
        totalUnseen,
        refreshPatients,
        updatePatientName,
        sosAlert,
        setSosAlert,
      }}
    >
      {/* Patient request toast — dismissible, corner. Fires for any managed patient. */}
      {patientAlert && (
        <div
          role="alert"
          className="fixed top-4 right-4 z-50 flex max-w-sm items-start gap-3 rounded-[18px] border border-line bg-white px-4 py-3 shadow-card"
          style={{ borderLeft: '4px solid #F59E0B' }}
        >
          <span className="text-2xl" aria-hidden>
            🔔
          </span>
          <div className="flex flex-col">
            <span className="text-xs font-bold uppercase tracking-[.14em]" style={{ color: '#B5760A' }}>
              {patientName(patientAlert.patientId)} · request
            </span>
            <span className="text-base font-bold text-ink">{patientAlert.content}</span>
          </div>
          <button
            type="button"
            onClick={() => {
              if (patientAlertTimer.current) clearTimeout(patientAlertTimer.current)
              setPatientAlert(null)
            }}
            aria-label="Dismiss patient request"
            className="ml-2 text-ink-faint hover:text-ink"
          >
            ✕
          </button>
        </div>
      )}

      {/* SOS takeover — fires for any managed patient regardless of current page. */}
      {sosAlert && (
        <div
          role="alert"
          className="fixed inset-0 z-50 flex flex-col items-center justify-center"
          style={{ background: 'radial-gradient(900px 700px at 50% 36%,#B83036 0%,#8A2127 55%,#6E171C 100%)' }}
        >
          <p className="mb-2 font-serif text-6xl font-semibold text-white">SOS Alert</p>
          <p className="mb-4 text-2xl font-bold text-white">{patientName(sosAlert.patientId)}</p>
          <p className="mb-8 text-lg" style={{ color: 'rgba(255,255,255,.85)' }}>
            Triggered at {new Date(sosAlert.timestamp).toLocaleTimeString()}
          </p>
          <button
            type="button"
            onClick={() => setSosAlert(null)}
            className="rounded-[14px] bg-white px-8 py-4 text-xl font-bold"
            style={{ color: '#6E171C' }}
          >
            Dismiss
          </button>
        </div>
      )}

      {children}
    </DashboardContext.Provider>
  )
}
