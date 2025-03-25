"use client"

import React, { useEffect, useRef, useState } from 'react'
import { playClickSound, playSound } from '@/hooks/use-audio'
import { Volume2, PauseCircle, Play, ListMusic, VolumeX, VolumeIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

const CLICK_SOUND_PATH = '/sounds/click-sound.wav'

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

export function MusicPlayer() {
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  
  // Initialize audio on mount
  useEffect(() => {
    if (typeof window !== 'undefined' && !audioRef.current) {
      const audio = new Audio()
      audio.volume = 0.3
      audio.loop = true
      audio.src = MUSIC_PLAYLIST[currentTrackIndex].path
      
      audio.addEventListener('play', () => setIsPlaying(true))
      audio.addEventListener('pause', () => setIsPlaying(false))
      audio.addEventListener('ended', () => setIsPlaying(false))
      
      audioRef.current = audio
    }
    
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.src = ''
      }
    }
  }, [])
  
  const handlePlayPause = () => {
    if (audioRef.current) {
      if (!isPlaying) {
        audioRef.current.play()
          .catch(e => console.error("Error playing audio:", e));
      } else {
        audioRef.current.pause();
      }
    }
    setIsPlaying(!isPlaying);
  }
  
  const handleVolumeChange = () => {
    setIsMuted(!isMuted)
  }
  
  const handleChangeTrack = (direction: 'next' | 'prev') => {
    playClickSound(0.375)
    
    const newIndex = direction === 'next'
      ? (currentTrackIndex + 1) % MUSIC_PLAYLIST.length
      : (currentTrackIndex - 1 + MUSIC_PLAYLIST.length) % MUSIC_PLAYLIST.length
    
    if (audioRef.current) {
      audioRef.current.src = MUSIC_PLAYLIST[newIndex].path
      audioRef.current.load()
      setCurrentTrackIndex(newIndex)
      
      if (isPlaying) {
        audioRef.current.play()
      }
    }
  }
  
  const handleButtonClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    playClickSound(0.375);
    // Other logic remains the same
  }
  
  return (
    <div className="flex items-center gap-3 bg-background/90 hover:bg-background backdrop-blur-md border-2 border-primary/50 rounded-full py-2 px-4 text-primary transition-all shadow-glow">
      {/* Previous track button */}
      <button
        onClick={() => handleChangeTrack('prev')}
        className="p-1 hover:text-primary rounded-full hover:bg-primary/10"
        aria-label="Previous track"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="19 20 9 12 19 4 19 20"></polygon>
          <line x1="5" y1="19" x2="5" y2="5"></line>
        </svg>
      </button>

      {/* Play/Pause button */}
      <button
        onClick={handlePlayPause}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${
          isPlaying ? 'bg-primary/20 hover:bg-primary/30' : 'bg-primary/40 hover:bg-primary/50'
        } transition-colors`}
        aria-label={isPlaying ? "Pause background music" : "Play background music"}
      >
        {isPlaying ? (
          <>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="6" y="4" width="4" height="16"></rect>
              <rect x="14" y="4" width="4" height="16"></rect>
            </svg>
            <span className="text-xs font-medium">Pause</span>
          </>
        ) : (
          <>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary animate-pulse">
              <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
            <span className="text-xs font-medium">Play</span>
          </>
        )}
      </button>
      
      {/* Next track button */}
      <button
        onClick={() => handleChangeTrack('next')}
        className="p-1 hover:text-primary rounded-full hover:bg-primary/10"
        aria-label="Next track"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="5 4 15 12 5 20 5 4"></polygon>
          <line x1="19" y1="5" x2="19" y2="19"></line>
        </svg>
      </button>
      
      {/* Track display */}
      <div className="text-xs font-medium">
        {MUSIC_PLAYLIST[currentTrackIndex].name}
      </div>
    </div>
  )
} 