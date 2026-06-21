'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@glance/shared/design/components'
import { VoiceRecorder } from '@/components/VoiceRecorder'

interface VoicePerson {
  id: string
  name: string
  email: string
  hasVoice: boolean
  isSelf: boolean
}

interface Persona {
  id: string
  name: string
  elevenlabsVoiceId: string | null
  hasVoice: boolean
}

export default function VoiceLibraryPage() {
  const [roster, setRoster] = useState<VoicePerson[]>([])
  const [loading, setLoading] = useState(true)

  // The signed-in caregiver's own voice id (the only one they can edit).
  const [voiceId, setVoiceId] = useState('')
  const [voiceSaving, setVoiceSaving] = useState(false)
  const [voiceSaved, setVoiceSaved] = useState(false)

  // Personas — named identities (Mom, Dad, Kid) the account can message AS.
  const [personas, setPersonas] = useState<Persona[]>([])
  const [newPersonaName, setNewPersonaName] = useState('')
  const [creating, setCreating] = useState(false)
  const [expandedPersona, setExpandedPersona] = useState<string | null>(null)

  const fetchRoster = useCallback(async () => {
    try {
      const res = await fetch('/api/voice-library')
      if (res.ok) setRoster((await res.json()) as VoicePerson[])
    } catch {
      // best-effort
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchMyVoice = useCallback(async () => {
    try {
      const res = await fetch('/api/family-member/me')
      if (res.ok) {
        const data = (await res.json()) as { elevenlabsVoiceId: string | null }
        setVoiceId(data.elevenlabsVoiceId ?? '')
      }
    } catch {
      // best-effort
    }
  }, [])

  const fetchPersonas = useCallback(async () => {
    try {
      const res = await fetch('/api/personas')
      if (res.ok) setPersonas((await res.json()) as Persona[])
    } catch {
      // best-effort
    }
  }, [])

  useEffect(() => {
    void fetchRoster()
    void fetchMyVoice()
    void fetchPersonas()
  }, [fetchRoster, fetchMyVoice, fetchPersonas])

  async function handleSaveVoice() {
    setVoiceSaving(true)
    try {
      await fetch('/api/family-member/me/voice', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ elevenlabsVoiceId: voiceId || null }),
      })
      setVoiceSaved(true)
      setTimeout(() => setVoiceSaved(false), 2000)
      void fetchRoster()
    } catch {
      // ignore
    } finally {
      setVoiceSaving(false)
    }
  }

  async function handleCreatePersona() {
    const name = newPersonaName.trim()
    if (!name) return
    setCreating(true)
    try {
      const res = await fetch('/api/personas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      if (res.ok) {
        const created = (await res.json()) as Persona
        setNewPersonaName('')
        setExpandedPersona(created.id) // open the recorder for the fresh persona
        await fetchPersonas()
      }
    } catch {
      // ignore
    } finally {
      setCreating(false)
    }
  }

  async function handleDeletePersona(id: string) {
    try {
      const res = await fetch(`/api/personas/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setPersonas((prev) => prev.filter((p) => p.id !== id))
        if (expandedPersona === id) setExpandedPersona(null)
      }
    } catch {
      // ignore
    }
  }

  const others = roster.filter((p) => !p.isSelf)

  return (
    <main className="flex-1 bg-[#F4EEE6] p-[30px] px-[34px] min-h-screen overflow-y-auto">
      <header className="mb-6">
        <h1 className="font-serif text-[34px] font-semibold tracking-tight text-ink">Voice library</h1>
        <p className="text-[16px] text-ink-muted mt-0.5">
          Create a voice for each person — Mom, Dad, a sibling — then choose who you’re speaking as
          when you message. Your loved one hears each message in that person’s own voice.
        </p>
      </header>

      {/* Your voice — the account default */}
      <section className="mb-6 flex flex-col gap-5 rounded-[22px] border border-line bg-white p-6 shadow-soft max-w-2xl">
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-xl font-semibold text-ink">Your voice</h2>
          <span
            className={`rounded-full px-3 py-1 text-[13px] font-bold ${
              voiceId ? 'bg-[#D9F6F0] text-[#0B6F63]' : 'bg-line text-ink-muted'
            }`}
          >
            {voiceId ? 'Voice on file ✓' : 'No voice yet'}
          </span>
        </div>

        <VoiceRecorder onCloned={(id) => setVoiceId(id)} />

        <details>
          <summary className="cursor-pointer text-xs text-ink-muted hover:text-ink-muted">
            Advanced: use an existing ElevenLabs voice ID
          </summary>
          <div className="mt-2 flex gap-2">
            <input
              type="text"
              value={voiceId}
              onChange={(e) => setVoiceId(e.target.value)}
              placeholder="e.g. 21m00Tcm4TlvDq8ikWAM"
              className="flex-1 rounded-[14px] border border-line-warm px-4 py-3 text-sm transition-all focus:bg-surface-warm focus:outline-none focus:ring-2 focus:ring-brand-primary"
            />
            <Button onClick={handleSaveVoice} disabled={voiceSaving}>
              {voiceSaved ? 'Saved!' : voiceSaving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </details>
      </section>

      {/* Personas — the people you can message as */}
      <section className="mb-6 max-w-2xl">
        <h2 className="mb-1 font-serif text-2xl font-semibold text-ink">People you message as</h2>
        <p className="mb-3 text-[14px] text-ink-muted">
          Add a person, record their voice, then pick them when sending a message.
        </p>

        {/* Add a persona */}
        <div className="mb-4 flex gap-2">
          <input
            type="text"
            value={newPersonaName}
            onChange={(e) => setNewPersonaName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleCreatePersona()
            }}
            maxLength={60}
            placeholder="Add a person — e.g. Mom, Dad, Emma"
            className="flex-1 rounded-[14px] border border-line-warm px-4 py-3 text-sm transition-all focus:bg-surface-warm focus:outline-none focus:ring-2 focus:ring-brand-primary"
          />
          <Button onClick={handleCreatePersona} disabled={creating || !newPersonaName.trim()}>
            {creating ? 'Adding…' : '+ Add'}
          </Button>
        </div>

        {personas.length === 0 ? (
          <p className="text-sm text-ink-faint">No people yet. Add Mom, Dad, or anyone who messages.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {personas.map((p) => {
              const open = expandedPersona === p.id
              return (
                <li key={p.id} className="rounded-[18px] border border-line bg-white p-4 shadow-soft">
                  <div className="flex items-center gap-4">
                    <div
                      className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
                      style={{ background: 'linear-gradient(135deg, #A98CF7, #7C5CFC)' }}
                    >
                      {p.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[16px] font-bold text-ink">{p.name}</p>
                      <span
                        className={`mt-0.5 inline-block rounded-full px-2.5 py-0.5 text-[12px] font-bold ${
                          p.hasVoice ? 'bg-[#D9F6F0] text-[#0B6F63]' : 'bg-line text-ink-muted'
                        }`}
                      >
                        {p.hasVoice ? 'Voice on file ✓' : 'No voice yet'}
                      </span>
                    </div>
                    <Button variant="ghost" onClick={() => setExpandedPersona(open ? null : p.id)}>
                      {p.hasVoice ? 'Re-record' : 'Record voice'}
                    </Button>
                    <button
                      type="button"
                      onClick={() => void handleDeletePersona(p.id)}
                      className="text-sm font-bold text-error hover:underline"
                    >
                      Remove
                    </button>
                  </div>
                  {open && (
                    <div className="mt-4">
                      <VoiceRecorder
                        uploadUrl={`/api/personas/${p.id}/voice-clone`}
                        onCloned={() => {
                          setExpandedPersona(null)
                          void fetchPersonas()
                        }}
                      />
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {/* Other linked accounts (informational) */}
      <section className="max-w-2xl">
        <h2 className="mb-3 font-serif text-2xl font-semibold text-ink">Other accounts that can message</h2>
        {loading ? (
          <p className="text-sm text-ink-faint">Loading…</p>
        ) : others.length === 0 ? (
          <p className="text-sm text-ink-faint">
            No one else is linked yet. When other family members sign in and are added to a patient, they appear here.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {others.map((p) => (
              <li
                key={p.id}
                className="flex items-center gap-4 rounded-[18px] border border-line bg-white p-4 shadow-soft"
              >
                <div
                  className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
                  style={{ background: 'linear-gradient(135deg, #5FC9BD, #0E9384)' }}
                >
                  {p.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[16px] font-bold text-ink">{p.name}</p>
                  <p className="truncate text-[13px] text-ink-faint">{p.email}</p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-[13px] font-bold ${
                    p.hasVoice ? 'bg-[#D9F6F0] text-[#0B6F63]' : 'bg-line text-ink-muted'
                  }`}
                >
                  {p.hasVoice ? 'Voice on file ✓' : 'No voice yet'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
