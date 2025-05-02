'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

export default function CursorController() {
  const pathname = usePathname()

  useEffect(() => {
    const isStakingPage = pathname === '/staking'
    
    // Store original body cursor style
    const originalBodyCursor = document.body.style.cursor;

    if (isStakingPage) {
      // Force default cursor on body for staking page
      document.body.style.cursor = 'auto';
    } else {
      // Restore original (or let CSS handle it if empty)
      document.body.style.cursor = originalBodyCursor || '';
    }

    // Cleanup function to restore original cursor style
    return () => {
      document.body.style.cursor = originalBodyCursor || '';
    }
  }, [pathname]) // Re-run effect when pathname changes

  return null // This component doesn't render anything visible
} 