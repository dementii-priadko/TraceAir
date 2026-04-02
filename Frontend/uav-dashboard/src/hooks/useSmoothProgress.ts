import { useEffect, useState } from 'react'

export function useSmoothProgress(targetProgress: number, active: boolean) {
  const [displayProgress, setDisplayProgress] = useState(targetProgress)

  useEffect(() => {
    if (!active) {
      setDisplayProgress(targetProgress)
      return
    }

    const intervalId = window.setInterval(() => {
      setDisplayProgress((currentProgress) => {
        const floor = Math.max(currentProgress, targetProgress)

        if (currentProgress < floor) {
          const delta = floor - currentProgress
          const step = delta >= 8 ? 3 : delta >= 4 ? 2 : 1
          return Math.min(currentProgress + step, floor)
        }

        if (floor <= 0 || floor >= 99) {
          return currentProgress
        }

        const trickleCeiling =
          floor >= 92
            ? Math.min(floor + 3, 98)
            : Math.min(floor + 2, 96)

        return currentProgress < trickleCeiling
          ? currentProgress + 1
          : currentProgress
      })
    }, 180)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [active, targetProgress])

  return displayProgress
}
