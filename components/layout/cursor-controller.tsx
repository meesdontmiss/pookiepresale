'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

export default function CursorController() {
  const pathname = usePathname()

  useEffect(() => {
    const isStakingPage = pathname === '/staking'
    const className = 'staking-cursor' // Class to toggle

    if (isStakingPage) {
      document.documentElement.classList.add(className)
    } else {
      document.documentElement.classList.remove(className)
    }

    // Cleanup function to remove class if component unmounts
    return () => {
      document.documentElement.classList.remove(className)
    }
  }, [pathname]) // Re-run effect when pathname changes

  return null // This component doesn't render anything visible
} 