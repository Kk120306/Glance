'use client'

import React, {
  createContext,
  useContext,
  useRef,
  useEffect,
  useCallback,
  useState,
} from 'react'

export type GazeDirection = 'up' | 'down' | 'left' | 'right' | 'center'

export interface InteractiveTarget {
  id: string
  ref: React.RefObject<HTMLElement | null>
  onSelect: () => void
  /** Which gaze direction activates this target in gaze mode */
  gazeDirection?: GazeDirection
}

interface InteractionContextValue {
  registerTarget: (target: InteractiveTarget) => () => void
  mode: 'gaze' | 'scan'
  focusedTargetId: string | null
}

const InteractionContext = createContext<InteractionContextValue | null>(null)

export function useInteraction() {
  const ctx = useContext(InteractionContext)
  if (!ctx) throw new Error('useInteraction must be used within InteractionProvider')
  return ctx
}

interface InteractionProviderProps {
  mode: 'gaze' | 'scan'
  gazeDirection?: GazeDirection
  /** Increments by 1 each time a blink is detected; triggers scan selection */
  blinkSignal?: number
  gazeDwellMs?: number
  scanCycleMs?: number
  children: React.ReactNode
}

export function InteractionProvider({
  mode,
  gazeDirection,
  blinkSignal = 0,
  gazeDwellMs = 1500,
  scanCycleMs = 1500,
  children,
}: InteractionProviderProps) {
  const targetsRef = useRef<InteractiveTarget[]>([])
  const [focusedIndex, setFocusedIndex] = useState(0)
  const [focusedTargetId, setFocusedTargetId] = useState<string | null>(null)
  const dwellTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const currentDwellDirectionRef = useRef<GazeDirection | null>(null)
  const prevBlinkSignalRef = useRef(0)

  const registerTarget = useCallback((target: InteractiveTarget) => {
    targetsRef.current = [...targetsRef.current, target]
    return () => {
      targetsRef.current = targetsRef.current.filter(t => t.id !== target.id)
    }
  }, [])

  // Scan mode: cycle focus on interval
  useEffect(() => {
    if (mode !== 'scan') {
      setFocusedIndex(0)
      return
    }
    const interval = setInterval(() => {
      setFocusedIndex(prev => {
        const count = targetsRef.current.length
        return count === 0 ? 0 : (prev + 1) % count
      })
    }, scanCycleMs)
    return () => clearInterval(interval)
  }, [mode, scanCycleMs])

  // Sync focusedTargetId with focusedIndex in scan mode
  useEffect(() => {
    if (mode === 'scan') {
      setFocusedTargetId(targetsRef.current[focusedIndex]?.id ?? null)
    } else {
      setFocusedTargetId(null)
    }
  }, [mode, focusedIndex])

  // Scan mode: blink triggers selection
  useEffect(() => {
    if (mode !== 'scan') return
    if (blinkSignal > prevBlinkSignalRef.current) {
      prevBlinkSignalRef.current = blinkSignal
      targetsRef.current[focusedIndex]?.onSelect()
    }
  }, [mode, blinkSignal, focusedIndex])

  // Scan mode: spacebar / click helper for testing and accessibility
  useEffect(() => {
    if (mode !== 'scan') return
    const handleKey = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault()
        targetsRef.current[focusedIndex]?.onSelect()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [mode, focusedIndex])

  // Gaze mode: dwell-based selection
  useEffect(() => {
    if (mode !== 'gaze') {
      if (dwellTimerRef.current) {
        clearTimeout(dwellTimerRef.current)
        dwellTimerRef.current = null
        currentDwellDirectionRef.current = null
      }
      return
    }

    if (!gazeDirection || gazeDirection === 'center') {
      if (dwellTimerRef.current) {
        clearTimeout(dwellTimerRef.current)
        dwellTimerRef.current = null
        currentDwellDirectionRef.current = null
      }
      return
    }

    // Direction hasn't changed — dwell timer is already running
    if (gazeDirection === currentDwellDirectionRef.current) return

    // New direction — restart dwell timer
    if (dwellTimerRef.current) {
      clearTimeout(dwellTimerRef.current)
      dwellTimerRef.current = null
    }
    currentDwellDirectionRef.current = gazeDirection

    dwellTimerRef.current = setTimeout(() => {
      const target = targetsRef.current.find(t => t.gazeDirection === gazeDirection)
      if (target) {
        target.onSelect()
      }
      currentDwellDirectionRef.current = null
      dwellTimerRef.current = null
    }, gazeDwellMs)
  }, [mode, gazeDirection, gazeDwellMs])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (dwellTimerRef.current) clearTimeout(dwellTimerRef.current)
    }
  }, [])

  return (
    <InteractionContext.Provider value={{ registerTarget, mode, focusedTargetId }}>
      {children}
    </InteractionContext.Provider>
  )
}
