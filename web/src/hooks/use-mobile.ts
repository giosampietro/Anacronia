import * as React from "react"

const MOBILE_BREAKPOINT = 768
const MOBILE_QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`

export function useIsMobile() {
  const subscribe = React.useCallback((callback: () => void) => {
    if (typeof window === "undefined") return () => {}

    const mql = window.matchMedia(MOBILE_QUERY)
    mql.addEventListener("change", callback)
    return () => mql.removeEventListener("change", callback)
  }, [])

  return React.useSyncExternalStore(
    subscribe,
    () => window.matchMedia(MOBILE_QUERY).matches,
    () => false
  )
}
