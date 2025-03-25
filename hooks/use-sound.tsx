"use client"

import { useEffect, useRef } from 'react'

export const useSound = (soundPath: string, volume = 1.0) => {
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    // Create audio element only on client side
    if (typeof window !== 'undefined') {
      const audio = new Audio(soundPath)
      audio.volume = volume
      audioRef.current = audio
      
      // Clean up on unmount
      return () => {
        audio.pause()
        audio.src = ''
      }
    }
  }, [soundPath, volume])

  const playSound = () => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0
      audioRef.current.play().catch(err => {
        console.warn('Audio playback error:', err)
      })
    }
  }

  return { playSound }
} 