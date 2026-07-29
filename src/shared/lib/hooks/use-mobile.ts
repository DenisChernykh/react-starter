import * as React from 'react'

const MOBILE_BREAKPOINT = 768

// eslint-disable-next-line jsdoc/require-jsdoc -- Copied Base/Lyra registry hook.
export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    mql.addEventListener('change', onChange)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Copied Base/Lyra registry synchronizes browser state on mount.
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  return Boolean(isMobile)
}
