"use client"

import { useEffect, useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Image from 'next/image'

interface Particle {
  id: number
  x: number
  y: number
  size: number
  color: string
  velocity: {
    x: number
    y: number
  }
  opacity: number
  rotation: number
  scale: number
}

interface FireworkBurst {
  id: number
  x: number
  y: number
  particles: Particle[]
  timestamp: number
}

interface FireworksEffectProps {
  duration?: number
  particleCount?: number
  burstCount?: number
  imagePath?: string
}

// Colors for the fireworks (will be used for filter effects on the images)
const COLORS = [
  '#00ff88', // Primary green
  '#00ffcc',
  '#00ddff',
  '#ffcc00',
  '#ff88dd',
  '#ffffff',
]

export default function FireworksEffect({ 
  duration = 4000, 
  particleCount = 20,
  burstCount = 1,
  imagePath = '/images/pookie-flag.png'
}: FireworksEffectProps) {
  const [isActive, setIsActive] = useState(true)
  const [bursts, setBursts] = useState<FireworkBurst[]>([])
  const burstIdCounter = useRef(0)
  const particleIdCounter = useRef(0)
  const canvasRef = useRef<HTMLDivElement>(null)
  
  // Create a single burst in the center
  useEffect(() => {
    if (!canvasRef.current) return
    
    const canvas = canvasRef.current
    const canvasWidth = canvas.clientWidth
    const canvasHeight = canvas.clientHeight
    
    // Position the burst in the center
    const x = canvasWidth / 2
    const y = canvasHeight / 2
    
    const burstId = burstIdCounter.current++
    const particles: Particle[] = []
    
    // Create particles in a circular pattern
    for (let i = 0; i < particleCount; i++) {
      const angle = (i / particleCount) * Math.PI * 2
      const speed = 5 // Consistent speed for all particles
      
      particles.push({
        id: particleIdCounter.current++,
        x: 0,
        y: 0,
        size: 30, // Consistent size
        color: '#00ff88', // Green color
        velocity: {
          x: Math.cos(angle) * speed,
          y: Math.sin(angle) * speed
        },
        opacity: 1,
        rotation: angle * (180 / Math.PI), // Rotate based on direction
        scale: 1
      })
    }
    
    setBursts([{
      id: burstId,
      x,
      y,
      particles,
      timestamp: Date.now()
    }])
    
    // Clean up after duration
    setTimeout(() => {
      setIsActive(false)
    }, duration)
  }, [particleCount, duration])
  
  // Update particles animation
  useEffect(() => {
    if (!isActive) return
    
    let animationFrameId: number
    const startTime = Date.now()
    
    const animate = () => {
      const currentTime = Date.now()
      const elapsed = currentTime - startTime
      const progress = Math.min(elapsed / duration, 1)
      
      setBursts(prevBursts => {
        return prevBursts.map(burst => {
          const updatedParticles = burst.particles.map(particle => {
            // Linear movement outward
            const newX = particle.x + particle.velocity.x
            const newY = particle.y + particle.velocity.y
            
            // Fade out based on progress
            const newOpacity = Math.max(0, 1 - progress)
            
            return {
              ...particle,
              x: newX,
              y: newY,
              opacity: newOpacity,
              scale: 1 - (progress * 0.5) // Slightly shrink as they move out
            }
          })
          
          return {
            ...burst,
            particles: updatedParticles
          }
        })
      })
      
      if (progress < 1) {
        animationFrameId = requestAnimationFrame(animate)
      }
    }
    
    animate()
    
    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId)
      }
    }
  }, [isActive, duration])

  if (!isActive && bursts.length === 0) return null
  
  return (
    <div
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-40"
    >
      {bursts.map(burst => (
        <div 
          key={`burst-${burst.id}`} 
          className="absolute"
          style={{
            left: `${burst.x}px`,
            top: `${burst.y}px`
          }}
        >
          {burst.particles.map(particle => (
            <div
              key={`particle-${particle.id}`}
              className="absolute transition-all duration-50"
              style={{
                opacity: particle.opacity,
                transform: `translate(${particle.x}px, ${particle.y}px) rotate(${particle.rotation}deg) scale(${particle.scale})`,
                width: `${particle.size}px`,
                height: `${particle.size}px`,
              }}
            >
              <Image
                src={imagePath}
                alt="Pookie Flag"
                width={particle.size}
                height={particle.size}
                className="w-full h-full object-contain"
              />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
} 