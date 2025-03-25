"use client"

import dynamic from 'next/dynamic'
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"
import { playClickSound, playSound } from "@/hooks/use-audio"
import { Suspense } from "react"
import { MusicPlayer } from "@/components/music-player"
import { Y2KGallery } from "@/components/y2k-gallery"

// Dynamically import Y2KGallery component
const Y2KGalleryComponent = dynamic(() => import('../../components/y2k-gallery').then(mod => mod.Y2KGallery), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[400px] flex flex-col items-center justify-center bg-black/10 rounded-lg">
      <div className="animate-pulse mb-2">Loading gallery...</div>
      <div className="text-sm text-muted-foreground">Bringing that 2000s vibe...</div>
    </div>
  )
})

// Click sound path
const CLICK_SOUND_PATH = '/sounds/click-sound.wav'

export default function GalleryPage() {
  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col">
      {/* Fixed Header */}
      <header className="flex-none w-full border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60 z-50">
        <div className="container flex h-16 items-center justify-between py-4">
          <Link href="/" 
            // Global handler will handle the click sound
          >
            <Button variant="ghost" size="sm" className="gap-2">
              <ArrowLeft size={16} />
              <span>Back</span>
            </Button>
          </Link>
          <div className="flex-1 flex justify-center items-center">
            <MusicPlayer />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold text-primary text-glow">$POOKIE</span>
            <span className="text-sm text-muted-foreground">Gallery</span>
          </div>
        </div>
      </header>

      {/* Scrollable Content */}
      <main className="flex-1 container py-6 px-4 overflow-y-auto">
        <div className="max-w-5xl mx-auto pb-24">
          <h1 className="text-2xl md:text-3xl font-bold mb-4 text-glow">Pookie Art Gallery</h1>
          <p className="text-muted-foreground mb-6">Check out these awesome $POOKIE creations from our community.</p>
          
          <div className="w-full">
            <Suspense fallback={
              <div className="w-full h-[400px] flex flex-col items-center justify-center bg-black/10 rounded-lg">
                <div className="animate-pulse mb-2">Loading Y2K gallery...</div>
                <div className="text-sm text-muted-foreground">This might take a moment - our art is heavy!</div>
              </div>
            }>
              <Y2KGalleryComponent />
            </Suspense>
          </div>
        </div>
      </main>
    </div>
  )
}

