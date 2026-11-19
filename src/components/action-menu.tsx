'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'

/** A labelled action group; native buttons retain their normal keyboard behavior. */
export function ActionMenu({ label, children, initiallyOpen = false }: { initiallyOpen?: boolean; label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  useEffect(() => { if (initiallyOpen) setOpen(true) }, [initiallyOpen])
  const container = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const id = useId()

  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && container.current?.contains(document.activeElement)) {
        event.stopPropagation()
        setOpen(false)
        trigger.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={container} className="relative"
      onBlur={event => { if (!container.current?.contains(event.relatedTarget)) setOpen(false) }}>
      <button ref={trigger} type="button" className="btn-secondary" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
        {label}<ChevronDown size={15} strokeWidth={1.7} aria-hidden="true" className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div id={id} role="group" aria-label={label} className="action-menu-panel"
          onClick={event => {
            const button = (event.target as HTMLElement).closest('button')
            if (button && !button.disabled) {
              trigger.current?.focus()
              setOpen(false)
            }
          }}>
          {children}
        </div>
      )}
    </div>
  )
}
