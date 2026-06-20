'use client'

import { useEffect, useRef } from 'react'
import { useInteraction } from '@glance/shared/design/components'

/**
 * Registers a DOM element as an interactive target (gaze cursor + scan mode) and
 * reports whether it is currently focused plus its live dwell progress. The
 * `onSelect` callback is kept in a ref so the registration is stable across
 * re-renders and the latest handler always fires.
 */
export function useInteractiveTarget<T extends HTMLElement>(id: string, onSelect: () => void) {
  const ref = useRef<T | null>(null)
  const { registerTarget, focusedTargetId, dwellProgress } = useInteraction()
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect

  useEffect(() => {
    return registerTarget({
      id,
      ref: ref as React.RefObject<HTMLElement | null>,
      onSelect: () => onSelectRef.current(),
    })
  }, [registerTarget, id])

  const focused = focusedTargetId === id
  return { ref, focused, dwellProgress: focused ? dwellProgress : 0 }
}
