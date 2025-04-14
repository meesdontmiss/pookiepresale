"use client"

import { useState, useEffect, useRef } from "react"

interface PresaleStatsData {
  total_raised: number
  cap: number
  contributors: number | null // Allow null for contributors
}

// REMOVE Treasury wallet constant
// REMOVE checkTreasuryWalletBalance function

export default function PresaleStats() {
  const [stats, setStats] = useState<PresaleStatsData>({
    total_raised: 0,
    cap: 0, // Initialize cap to 0
    contributors: null
  })
  const [loading, setLoading] = useState(true)
  
  // REMOVE lastValidRaisedRef

  // Calculate progress percentage
  const progressPercent = stats.cap > 0 ? Math.min(100, Math.round((stats.total_raised / stats.cap) * 100)) : 0;
  const isConcluded = stats.cap > 0 && stats.total_raised >= stats.cap;

  // REMOVE safelyUpdateStats function

  // REMOVE first useEffect with fetchStats and intervals

  // Setup real-time updates ONLY via the event listener
  useEffect(() => {
    // REMOVE Supabase client initialization and subscriptions
    
    // REMOVE fetchStats function inside this useEffect

    // Listen for custom progress update events from the contribution form
    const handleProgressUpdate = (event: CustomEvent) => {
      if (event.detail) {
        console.log('PresaleStats: Progress update event received:', event.detail);
        setLoading(false); // Got data, no longer loading
        
        // Directly set state from event detail
        setStats({
          total_raised: Number(event.detail.raised || 0),
          cap: Number(event.detail.cap || 0), // Use cap from event, default to 0 if missing
          contributors: event.detail.contributors // Use contributors from event (can be null)
        });
        
        // REMOVE timeout for checkTreasuryWalletBalance
      }
    };

    // Add event listener
    window.addEventListener('pookie-progress-update', handleProgressUpdate as EventListener);
    
    // Request initial state from form component (optional but good practice)
    // This assumes the form component dispatches state on mount
    console.log('PresaleStats: Component mounted, waiting for progress update event.');
    // Set a timeout to remove loading state if no event received after a while
    const loadingTimeout = setTimeout(() => setLoading(false), 5000); 

    // Cleanup function
    return () => {
      window.removeEventListener('pookie-progress-update', handleProgressUpdate as EventListener);
      clearTimeout(loadingTimeout);
    }
  }, [])

  return (
    <div className="space-y-3">
      {/* Status Text */}
      <div className="text-center mb-2">
        {loading ? (
          <p className="text-sm text-gray-400">Loading stats...</p>
        ) : isConcluded ? (
          <p className="text-sm font-semibold text-green-500">Status: Concluded</p>
        ) : (
          <p className="text-sm font-semibold text-yellow-500">Status: Live</p> // Should not be reached if form is paused
        )}
      </div>

      {/* Progress Bar */}
      <div>
        <div className="w-full relative h-6 bg-gray-800 rounded-full overflow-hidden">
          <div 
            style={{ width: `${progressPercent}%` }}
            className="absolute h-full bg-gradient-to-r from-green-500 to-green-400 transition-all duration-700 flex items-center justify-center"
          >
            {progressPercent >= 10 && (
              <span className="text-xs font-bold text-white">{progressPercent}%</span>
            )}
          </div>
          {progressPercent < 10 && (
            <span className="absolute text-xs font-bold text-white h-full w-full flex items-center justify-center">{progressPercent}%</span>
          )}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-2">
        <div className="text-center p-3 bg-gray-800/50 rounded-lg">
          <p className="text-xs text-gray-400">Raised</p>
          <p className="font-bold text-sm">{stats.total_raised.toFixed(2)} SOL</p>
        </div>
        <div className="text-center p-3 bg-gray-800/50 rounded-lg">
          <p className="text-xs text-gray-400">Target</p>
          <p className="font-bold text-sm">{stats.cap} SOL</p>
        </div>
      </div>
    </div>
  )
} 