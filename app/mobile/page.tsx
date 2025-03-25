import { Suspense } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { TwitterIcon, MessageCircleIcon } from 'lucide-react'
import PreSaleForm from '@/components/presale/presale-form'
import PresaleStats from '@/components/presale/presale-stats'

// Dynamically import the 3D model component with no SSR
const PookieModel = dynamic(
  () => import('@/components/pookie-model-mobile'),
  { ssr: false }
)

export default function MobilePage() {
  return (
    <div className="flex flex-col items-center min-h-screen w-full px-4 py-6 overflow-hidden">
      {/* Header */}
      <header className="w-full flex justify-between items-center mb-6">
        <div className="flex items-center">
          <img 
            src="/images/pookie-smashin.gif" 
            alt="Pookie Logo" 
            className="h-10 w-10 mr-2" 
          />
          <h1 className="text-2xl font-bold text-green-400 text-glow">$POOKIE</h1>
        </div>
        <Link 
          href="/"
          className="text-sm text-green-400 underline"
        >
          Switch to Desktop
        </Link>
      </header>

      {/* 3D Model Container - Smaller for mobile */}
      <div className="relative w-full h-60 mb-6">
        <Suspense fallback={<div className="w-full h-full flex items-center justify-center">Loading Pookie...</div>}>
          <PookieModel />
        </Suspense>
      </div>

      {/* Presale Box */}
      <div className="w-full max-w-md bg-zinc-900/80 backdrop-blur-sm rounded-xl p-5 mb-6 border-glow shadow-glow">
        <h2 className="text-xl font-bold text-center mb-3 text-green-400 text-glow">POOKIE Presale</h2>
        <PreSaleForm />
      </div>

      {/* Stats */}
      <div className="w-full max-w-md bg-zinc-900/80 backdrop-blur-sm rounded-xl p-5 mb-6 border-glow shadow-glow">
        <h2 className="text-xl font-bold text-center mb-3 text-glow">Presale Stats</h2>
        <PresaleStats />
      </div>

      {/* Social Links */}
      <div className="flex space-x-4 mb-6">
        <a 
          href="https://X.com/pookiethepeng" 
          target="_blank" 
          rel="noopener noreferrer" 
          className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-800 text-green-400 hover:bg-zinc-700 hover:text-green-300"
        >
          <TwitterIcon size={20} />
        </a>
        <a 
          href="https://t.me/pookiethepeng" 
          target="_blank" 
          rel="noopener noreferrer" 
          className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-800 text-green-400 hover:bg-zinc-700 hover:text-green-300"
        >
          <MessageCircleIcon size={20} />
        </a>
      </div>

      {/* Footer */}
      <footer className="mt-auto text-center text-xs text-gray-500 py-4">
        &copy; {new Date().getFullYear()} $POOKIE. All rights reserved.
      </footer>
    </div>
  )
} 