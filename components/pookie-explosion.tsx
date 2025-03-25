import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'

interface PookieExplosionProps {
  onComplete?: () => void
}

export default function PookieExplosion({ onComplete }: PookieExplosionProps) {
  const [particles, setParticles] = useState<Array<{
    id: number
    angle: number
    size: number
    color: string
  }>>([])

  useEffect(() => {
    // Create 24 particles
    const newParticles = Array.from({ length: 24 }).map((_, i) => ({
      id: i,
      angle: (i * Math.PI * 2) / 24, // Evenly space particles in a circle
      size: Math.random() * 6 + 4, // Random size between 4-10px
      color: i % 2 === 0 ? '#00ff88' : '#00ffaa' // Alternate between two shades of green
    }))
    setParticles(newParticles)

    // Cleanup after animation
    const timer = setTimeout(() => {
      if (onComplete) onComplete()
    }, 800) // Slightly faster animation

    return () => clearTimeout(timer)
  }, [onComplete])

  return (
    <div className="fixed inset-0 pointer-events-none z-50 flex items-center justify-center">
      {particles.map((particle) => (
        <motion.div
          key={particle.id}
          initial={{
            scale: 0,
            opacity: 1,
            x: 0,
            y: 0
          }}
          animate={{
            scale: 1,
            opacity: 0,
            x: Math.cos(particle.angle) * (Math.random() * 50 + 50), // Random distance 50-100px
            y: Math.sin(particle.angle) * (Math.random() * 50 + 50)
          }}
          transition={{
            duration: 0.8,
            ease: [0.2, 0.8, 0.4, 1]
          }}
          className="absolute rounded-full"
          style={{
            width: particle.size,
            height: particle.size,
            backgroundColor: particle.color,
            boxShadow: `0 0 8px ${particle.color}`
          }}
        />
      ))}
    </div>
  )
} 