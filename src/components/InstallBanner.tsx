import { useEffect, useState } from 'react'
import { NicklMark } from './Wordmark'

const DISMISSED_KEY = 'nickl:install-banner-dismissed'

// Not in lib.dom — Chrome exposes it but TypeScript doesn't ship the type.
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function isIos(): boolean {
  return /iPhone|iPad/.test(navigator.userAgent)
}

function isStandalone(): boolean {
  if (
    typeof window !== 'undefined' &&
    window.matchMedia('(display-mode: standalone)').matches
  ) {
    return true
  }
  // iOS Safari sets navigator.standalone when launched from the home screen.
  return (
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === '1'
  } catch {
    // localStorage can throw in private mode / disabled cookies.
    return false
  }
}

function persistDismissed(): void {
  try {
    localStorage.setItem(DISMISSED_KEY, '1')
  } catch {
    // Best-effort; banner may reappear on next load.
  }
}

export default function InstallBanner() {
  const [installEvent, setInstallEvent] =
    useState<BeforeInstallPromptEvent | null>(null)
  const [iosVisible, setIosVisible] = useState(false)
  const [dismissed, setDismissed] = useState(readDismissed)

  useEffect(() => {
    if (dismissed) return
    if (isStandalone()) return

    function onBeforeInstall(e: Event) {
      e.preventDefault()
      setInstallEvent(e as BeforeInstallPromptEvent)
    }

    function onAppInstalled() {
      setInstallEvent(null)
      setIosVisible(false)
      persistDismissed()
      setDismissed(true)
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onAppInstalled)

    // iOS Safari doesn't fire beforeinstallprompt; surface the manual-steps
    // banner instead.
    if (isIos() && !('onbeforeinstallprompt' in window)) {
      setIosVisible(true)
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onAppInstalled)
    }
  }, [dismissed])

  function handleDismiss() {
    persistDismissed()
    setDismissed(true)
    setInstallEvent(null)
    setIosVisible(false)
  }

  async function handleInstall() {
    if (!installEvent) return
    await installEvent.prompt()
    const { outcome } = await installEvent.userChoice
    // If they declined the native prompt, don't pester them again.
    // If they accepted, appinstalled will fire and persist the dismissal.
    if (outcome === 'dismissed') {
      persistDismissed()
      setDismissed(true)
    }
    setInstallEvent(null)
  }

  if (dismissed) return null
  if (!installEvent && !iosVisible) return null

  const message = iosVisible
    ? "To install Nickl, tap the share button then 'Add to Home Screen'"
    : 'Add Nickl to your home screen'

  return (
    <div className="fixed left-0 right-0 bottom-0 z-40 bg-card border-t border-line shadow-lg">
      <div className="max-w-[480px] mx-auto px-4 py-3 flex items-center gap-3">
        <NicklMark size={36} />
        <p className="flex-1 min-w-0 text-sm text-ink">{message}</p>
        {installEvent && (
          <button
            type="button"
            onClick={handleInstall}
            className="px-4 py-2 bg-brand text-white text-sm font-medium rounded-lg hover:bg-brand-dark min-h-[44px]"
          >
            Install
          </button>
        )}
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss"
          className="w-11 h-11 -mr-1 flex items-center justify-center text-muted hover:text-ink text-2xl leading-none"
        >
          ×
        </button>
      </div>
    </div>
  )
}
