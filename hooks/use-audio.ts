import { useEffect, useRef, useState } from 'react'

interface UseAudioProps {
  src: string
  type?: string
  volume?: number
  loop?: boolean
  autoplay?: boolean
}

// Paths for all click sounds
const CLICK_SOUND_PATHS = [
  '/sounds/click-sound-1.mp3',
  '/sounds/click-sound-2.mp3',
  '/sounds/click-sound-3.mp3'
]

// Force-reset the counter at the start of each session
let currentClickSoundIndex = Math.floor(Math.random() * CLICK_SOUND_PATHS.length);

// Function to play a sound once
export function playSound(src: string, volume = 1.0) {
  if (typeof window === 'undefined') return
  
  try {
    // Create a new audio element for one-off sounds
    const audio = new Audio(src)
    audio.volume = volume
    audio.play()
      .catch(error => {
        // Ignore user interaction errors (common in browsers)
        if (error.name !== 'NotAllowedError') {
          console.warn(`Failed to play sound: ${src}`, error)
        }
      })
  } catch (error) {
    console.warn(`Error creating audio element for ${src}:`, error)
  }
}

// Function to play a click sound, cycling through available sounds
export function playClickSound(volume = 0.3) {
  if (typeof window === 'undefined') return;
  
  // Get the current sound from the sequence
  const soundPath = CLICK_SOUND_PATHS[currentClickSoundIndex];
  
  // Debug log for tracking the cycling
  console.log(`Playing click sound ${currentClickSoundIndex + 1} of ${CLICK_SOUND_PATHS.length}: ${soundPath}`);
  
  // Play the sound
  playSound(soundPath, volume);
  
  // Move to the next sound (cycling back to the beginning when we reach the end)
  currentClickSoundIndex = (currentClickSoundIndex + 1) % CLICK_SOUND_PATHS.length;
}

// Hook for controlling audio playback
export function useAudio({
  src,
  type = 'audio/mpeg',
  volume = 1.0,
  loop = false,
  autoplay = false
}: UseAudioProps) {
  const [isPlaying, setIsPlaying] = useState(autoplay)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  
  // Setup audio element on mount
  useEffect(() => {
    if (typeof window === 'undefined') return
    
    // Clean up previous audio element if src changes
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.src = ''
    }
    
    // Create a new audio element for this source
    const audio = new Audio(src)
    audio.volume = volume
    audio.loop = loop
    
    // Add event listeners to sync state
    const handlePlay = () => setIsPlaying(true)
    const handlePause = () => setIsPlaying(false)
    const handleEnded = () => {
      if (!loop) setIsPlaying(false)
    }
    
    audio.addEventListener('play', handlePlay)
    audio.addEventListener('pause', handlePause)
    audio.addEventListener('ended', handleEnded)
    
    audioRef.current = audio
    
    // Autoplay if needed (and allowed by browser)
    if (autoplay) {
      audio.play().catch(() => {
        // Silently fail on autoplay - browsers often block this
        setIsPlaying(false)
      })
    }
    
    // Clean up on unmount or when src changes
    return () => {
      audio.removeEventListener('play', handlePlay)
      audio.removeEventListener('pause', handlePause)
      audio.removeEventListener('ended', handleEnded)
      audio.pause()
      audio.src = ''
    }
  }, [src, volume, loop, autoplay])
  
  // Update audio properties when they change
  useEffect(() => {
    if (!audioRef.current) return
    
    audioRef.current.volume = volume
    audioRef.current.loop = loop
  }, [volume, loop])
  
  // Toggle play/pause
  const togglePlay = () => {
    if (!audioRef.current) return
    
    if (isPlaying) {
      audioRef.current.pause()
    } else {
      audioRef.current.play().catch(error => {
        console.warn('Error playing audio:', error)
      })
    }
  }
  
  // Play audio
  const play = () => {
    if (!audioRef.current || isPlaying) return
    
    audioRef.current.play().catch(error => {
      console.warn('Error playing audio:', error)
    })
  }
  
  // Pause audio
  const pause = () => {
    if (!audioRef.current || !isPlaying) return
    
    audioRef.current.pause()
  }
  
  // Stop audio (pause and reset to beginning)
  const stop = () => {
    if (!audioRef.current) return
    
    audioRef.current.pause()
    audioRef.current.currentTime = 0
  }
  
  return {
    isPlaying,
    togglePlay,
    play,
    pause,
    stop
  }
} 