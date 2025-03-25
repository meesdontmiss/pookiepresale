"use client"

import { TwitterIcon, MessageCircleIcon } from "lucide-react"
import { playClickSound } from "@/hooks/use-audio"

export function SocialLinks() {
  return (
    <div className="flex justify-center space-x-4">
      <a 
        href="https://X.com/pookiethepeng" 
        target="_blank" 
        rel="noopener noreferrer" 
        className="flex h-12 w-12 items-center justify-center rounded-full bg-black/30 text-white hover:bg-black/50"
        onClick={() => playClickSound()}
      >
        <TwitterIcon size={24} />
      </a>
      <a 
        href="https://t.me/pookiethepeng" 
        target="_blank" 
        rel="noopener noreferrer" 
        className="flex h-12 w-12 items-center justify-center rounded-full bg-black/30 text-white hover:bg-black/50"
        onClick={() => playClickSound()}
      >
        <MessageCircleIcon size={24} />
      </a>
    </div>
  )
} 