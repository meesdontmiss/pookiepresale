"use client"

import { useEffect, useState } from "react"
import Image from "next/image"

export function AnimatedBackground() {
  const [backgroundLoaded, setBackgroundLoaded] = useState(false)

  useEffect(() => {
    const checkBackgroundExists = async () => {
      try {
        const response = await fetch("/animations/background.png", { method: "HEAD" })
        setBackgroundLoaded(response.ok)
      } catch (error) {
        setBackgroundLoaded(false)
      }
    }

    checkBackgroundExists()
  }, [])

  return (
    <div className="fixed inset-0 -z-10 overflow-hidden">
      {backgroundLoaded ? (
        <>
          <Image
            src="/animations/background.png"
            alt="Animated background"
            fill
            className="object-cover opacity-10"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-b from-background via-background/90 to-background/70" />
        </>
      ) : (
        <div className="fixed inset-0 -z-10 bg-gradient-to-b from-background to-muted" />
      )}

      {/* Add some retro-style grid effect */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(0,255,170,0.1)_1px,transparent_1px),linear-gradient(90deg,rgba(0,255,170,0.1)_1px,transparent_1px)] bg-[size:40px_40px] opacity-20" />

      {/* Add some floating particles */}
      <div className="absolute inset-0 overflow-hidden">
        {[...Array(20)].map((_, i) => (
          <div
            key={i}
            className="absolute w-1 h-1 rounded-full bg-primary/50"
            style={{
              top: `${Math.random() * 100}%`,
              left: `${Math.random() * 100}%`,
              opacity: Math.random() * 0.7 + 0.3,
              animation: `float ${Math.random() * 10 + 10}s linear infinite`,
              animationDelay: `-${Math.random() * 10}s`,
            }}
          />
        ))}
      </div>
    </div>
  )
}

