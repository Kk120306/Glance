'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { signOut, useSession } from '@/lib/auth-client'
import { Button } from '@glance/shared/design/components'
import { MessageBubble } from '@glance/shared/design/components'
import type { Message } from '@glance/shared/types'

export default function DashboardPage() {
  const router = useRouter()
  const { data: session } = useSession()
  const [content, setContent] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [loadingMessages, setLoadingMessages] = useState(true)

  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch('/api/messages')
      if (res.ok) {
        const data = (await res.json()) as Message[]
        setMessages(data)
      }
    } catch {
      // silently ignore
    } finally {
      setLoadingMessages(false)
    }
  }, [])

  useEffect(() => {
    void fetchMessages()
  }, [fetchMessages])

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (!content.trim()) return
    setError(null)
    setSending(true)
    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: content.trim() }),
      })
      if (!res.ok) {
        const data = (await res.json()) as { error: unknown }
        setError(typeof data.error === 'string' ? data.error : 'Failed to send')
      } else {
        setContent('')
        await fetchMessages()
      }
    } catch {
      setError('Network error — please try again')
    } finally {
      setSending(false)
    }
  }

  async function handleSignOut() {
    await signOut()
    router.push('/login')
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col p-6 gap-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-neutral-900">Glance</h1>
        <div className="flex items-center gap-4">
          {session?.user && (
            <span className="text-sm text-neutral-500">{session.user.email}</span>
          )}
          <Button variant="ghost" onClick={handleSignOut}>
            Sign out
          </Button>
        </div>
      </header>

      <section aria-label="Compose message">
        <form onSubmit={handleSend} className="flex flex-col gap-3 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
          <label htmlFor="message-content" className="text-sm font-medium text-neutral-700">
            Send a message
          </label>
          <textarea
            id="message-content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            maxLength={1000}
            rows={3}
            placeholder="Type your message…"
            className="w-full resize-none rounded-md border border-neutral-300 px-3 py-2 text-base focus:border-transparent focus:outline-none focus:ring-2 focus:ring-brand-primary"
          />
          {error && (
            <p role="alert" className="text-sm text-error">
              {error}
            </p>
          )}
          <div className="flex items-center justify-between">
            <span className="text-xs text-neutral-400">{content.length}/1000</span>
            <Button type="submit" disabled={sending || !content.trim()}>
              {sending ? 'Sending…' : 'Send'}
            </Button>
          </div>
        </form>
      </section>

      <section aria-label="Message history">
        <h2 className="mb-3 text-lg font-semibold text-neutral-700">Message history</h2>
        {loadingMessages ? (
          <p className="text-sm text-neutral-400">Loading…</p>
        ) : messages.length === 0 ? (
          <p className="text-sm text-neutral-400">No messages yet. Send one above.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {messages.map((msg) => (
              <li key={msg.id}>
                <MessageBubble
                  senderName={session?.user?.name ?? session?.user?.email ?? 'You'}
                  content={msg.content}
                  timestamp={msg.createdAt}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
