"use client"

import { useEffect, useState, useRef, useCallback } from 'react'
import { playClickSound, playSound } from '@/hooks/use-audio'

const CLICK_SOUND_PATH = '/sounds/click-sound-1.mp3'

// Music playlist
const MUSIC_PLAYLIST = [
  {
    path: '/sounds/background-music.wav',
    name: 'Real Pooka Anthem',
    type: 'audio/wav'
  },
  {
    path: '/sounds/realniggahitit.mp3',
    name: 'Hit It',
    type: 'audio/mp3'
  }
]

export function GlobalSoundProvider() {
  // Add hydration-safe client-side rendering state
  const [isMounted, setIsMounted] = useState(false)
  const [hasInteracted, setHasInteracted] = useState(true) // Always set to true now to show controls immediately
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0)
  const audioElementRef = useRef<HTMLAudioElement | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isSoundEnabled, setIsSoundEnabled] = useState(true)
  
  // Track back button presses for double-press detection
  const lastBackPressTimeRef = useRef<number>(0)
  const backPressTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  
  // Handle client-side mounting to avoid hydration errors
  useEffect(() => {
    setIsMounted(true)
    
    // Create a direct audio element as fallback
    if (typeof window !== 'undefined' && !audioElementRef.current) {
      const audio = new Audio()
      audio.volume = 0.3
      audio.loop = true
      
      // Add play/pause event listeners to sync state
      audio.addEventListener('play', () => setIsPlaying(true))
      audio.addEventListener('pause', () => setIsPlaying(false))
      audio.addEventListener('ended', () => setIsPlaying(false))
      
      audioElementRef.current = audio
    }
  }, [])
  
  // Get current track
  const currentTrack = MUSIC_PLAYLIST[currentTrackIndex]
  
  // Update the audio element when the track changes
  useEffect(() => {
    if (audioElementRef.current && isMounted) {
      audioElementRef.current.src = currentTrack.path
      audioElementRef.current.load()
    }
  }, [currentTrack.path, isMounted])
  
  // Change track with improved back button behavior
  const changeTrack = (direction: 'next' | 'prev') => {
    // For next track, behavior is same as before
    if (direction === 'next') {
      // Stop current track
      if (audioElementRef.current) {
        audioElementRef.current.pause()
        audioElementRef.current.currentTime = 0
      }
      
      // Calculate new index
      const newIndex = (currentTrackIndex + 1) % MUSIC_PLAYLIST.length
      console.log(`Changing to track index ${newIndex}: ${MUSIC_PLAYLIST[newIndex].name}`)
      
      // Set new index
      setCurrentTrackIndex(newIndex)
      
      // Play after a short delay to let state update and new source load
      setTimeout(() => {
        // Get the latest track from our new index
        const newTrack = MUSIC_PLAYLIST[newIndex]
        
        // Update direct audio element
        if (audioElementRef.current) {
          audioElementRef.current.src = newTrack.path
          audioElementRef.current.load()
          
          // If was playing, resume playback
          if (isPlaying) {
            console.log(`Playing new track: ${newTrack.name}`)
            audioElementRef.current.play()
              .catch(e => {
                console.log("Play error after track change:", e)
              })
          }
        }
      }, 100)
    } 
    // For previous/back button, handle restart/previous logic
    else {
      const currentTime = Date.now()
      const timeSinceLastPress = currentTime - lastBackPressTimeRef.current
      
      // Check if this is a double press (pressed within 800ms)
      if (timeSinceLastPress < 800) {
        console.log("Back button double press detected, going to previous track")
        
        // Clear any pending timeouts
        if (backPressTimeoutRef.current) {
          clearTimeout(backPressTimeoutRef.current)
          backPressTimeoutRef.current = null
        }
        
        // Go to previous track
        if (audioElementRef.current) {
          audioElementRef.current.pause()
          audioElementRef.current.currentTime = 0
        }
        
        // Calculate new index
        const newIndex = (currentTrackIndex - 1 + MUSIC_PLAYLIST.length) % MUSIC_PLAYLIST.length
        console.log(`Changing to previous track index ${newIndex}: ${MUSIC_PLAYLIST[newIndex].name}`)
        
        // Set new index
        setCurrentTrackIndex(newIndex)
        
        // Play after a short delay to let state update and new source load
        setTimeout(() => {
          // Get the latest track from our new index
          const newTrack = MUSIC_PLAYLIST[newIndex]
          
          // Update direct audio element
          if (audioElementRef.current) {
            audioElementRef.current.src = newTrack.path
            audioElementRef.current.load()
            
            // If was playing, resume playback
            if (isPlaying) {
              console.log(`Playing previous track: ${newTrack.name}`)
              audioElementRef.current.play()
                .catch(e => {
                  console.log("Play error after track change:", e)
                })
            }
          }
        }, 100)
      } 
      // Single press - restart current track
      else {
        console.log("Back button single press detected, restarting current track")
        
        // Reset play position to start of track
        if (audioElementRef.current) {
          audioElementRef.current.currentTime = 0
        }
        
        // Remember this press time
        lastBackPressTimeRef.current = currentTime
        
        // Set timeout to clear the last press time after the double-press window
        backPressTimeoutRef.current = setTimeout(() => {
          lastBackPressTimeRef.current = 0
        }, 800)
      }
    }
  }
  
  // Track user's first interaction with the page
  useEffect(() => {
    if (!isMounted) return
    
    const handleFirstInteraction = () => {
      setHasInteracted(true)
      // Remove listeners after first interaction
      document.removeEventListener('click', handleFirstInteraction)
      document.removeEventListener('keydown', handleFirstInteraction)
      document.removeEventListener('touchstart', handleFirstInteraction)
    }
    
    document.addEventListener('click', handleFirstInteraction)
    document.addEventListener('keydown', handleFirstInteraction)
    document.addEventListener('touchstart', handleFirstInteraction)
    
    return () => {
      document.removeEventListener('click', handleFirstInteraction)
      document.removeEventListener('keydown', handleFirstInteraction)
      document.removeEventListener('touchstart', handleFirstInteraction)
    }
  }, [isMounted])
  
  // Handle global click sounds - play on all clicks (except on buttons that play their own sounds)
  useEffect(() => {
    if (!isMounted || !hasInteracted) return
    
    // Use the cycling click sound function instead of a single sound
    const handleGlobalClick = (e: MouseEvent) => {
      // Check if sound is enabled
      if (isSoundEnabled) {
        // Play click sound using the cycling function
        playClickSound(0.3)
        
        // Debug log - sound is played
        console.log('Click sound played')
      }
    }
    
    document.addEventListener('click', handleGlobalClick)
    
    return () => {
      document.removeEventListener('click', handleGlobalClick)
    }
  }, [isMounted, hasInteracted, isSoundEnabled])
  
  // Handle play/pause button click
  const handleTogglePlay = (e: React.MouseEvent) => {
    e.stopPropagation() // Prevent double click sounds
    console.log("Music toggle button clicked, current state:", isPlaying)
    
    // No need for explicit play click - the global handler will do it
    
    // Toggle play state
    if (!isPlaying) {
      // If not playing, try to play with a slight delay to ensure click sound finishes
      setTimeout(() => {
        console.log("Attempting to play music")
        
        if (audioElementRef.current) {
          audioElementRef.current.play()
            .catch(e => {
              console.log("Play failed:", e)
            })
        }
      }, 100)
    } else {
      // If already playing, pause immediately
      console.log("Pausing music")
      
      if (audioElementRef.current) {
        audioElementRef.current.pause()
      }
    }
  }
  
  // Handle track change button click
  const handleChangeTrack = (direction: 'next' | 'prev', e: React.MouseEvent) => {
    e.stopPropagation() // Prevent double click sounds
    changeTrack(direction)
    // Global handler will play click sound
  }
  
  // Cleanup function for audio element
  useEffect(() => {
    return () => {
      if (audioElementRef.current) {
        audioElementRef.current.pause();
        audioElementRef.current.src = '';
      }
    };
  }, []);

  // Add event listener for 'ended' event to play next track automatically
  useEffect(() => {
    const audioElement = audioElementRef.current;
    
    const handleTrackEnded = () => {
      console.log('Track ended, playing next track');
      changeTrack('next');
    };
    
    if (audioElement) {
      audioElement.addEventListener('ended', handleTrackEnded);
    }
    
    return () => {
      if (audioElement) {
        audioElement.removeEventListener('ended', handleTrackEnded);
      }
    };
  }, []);
  
  const enableSound = () => {
    setIsSoundEnabled(true)
    localStorage.setItem('soundEnabled', 'true')
    // Global handler will play click sound
  }
  
  const disableSound = () => {
    setIsSoundEnabled(false)
    localStorage.setItem('soundEnabled', 'false')
    // Global handler will play click sound
  }
  
  const handleClickAnywhere = useCallback(() => {
    if (!hasInteracted) {
      setHasInteracted(true)
      playClickSound()
    }
  }, [hasInteracted])
  
  // Don't render anything during SSR to avoid hydration issues
  if (!isMounted) return null
  
  // Music controls render - we're not rendering controls here anymore since they're in the navbar
  return null
} 