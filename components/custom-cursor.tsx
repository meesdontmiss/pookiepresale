"use client"

import { useEffect } from 'react'

export function CustomCursor() {
  useEffect(() => {
    // Only run on client side
    if (typeof window === 'undefined') return
    
    // Only use custom cursor on larger screens
    const isMobile = window.innerWidth < 768
    if (isMobile) return
    
    // Add cursor-middle-finger class to html
    document.documentElement.classList.add('cursor-middle-finger')
    
    return () => {
      // Clean up by removing the class
      document.documentElement.classList.remove('cursor-middle-finger')
    }
  }, [])

  // This component doesn't render anything visible
  return null
} 