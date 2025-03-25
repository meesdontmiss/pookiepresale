"use client"

import { useState, useEffect } from "react"

interface PresaleStats {
  total_raised: number
  cap: number
  contributors: number
}

export default function PresaleStats() {
  const [stats, setStats] = useState<PresaleStats>({
    total_raised: 0,
    cap: 75,
    contributors: 0
  })
  const [loading, setLoading] = useState(true)

  // Calculate progress percentage
  const progressPercent = Math.min(100, Math.round((stats.total_raised / stats.cap) * 100))

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await fetch('/api/presale/stats')
        if (!response.ok) throw new Error('Failed to fetch presale stats')
        
        const data = await response.json()
        if (data.success) {
          setStats({
            total_raised: Number(data.stats.total_raised || 0),
            cap: Number(data.stats.cap || 75),
            contributors: Number(data.stats.contributors || 0)
          })
        }
      } catch (error) {
        console.error('Error fetching presale stats:', error)
      } finally {
        setLoading(false)
      }
    }
    
    fetchStats()
    
    // Set up an interval to periodically update the stats
    const intervalId = setInterval(fetchStats, 30000) // Update every 30 seconds
    
    return () => clearInterval(intervalId)
  }, [])

  // Setup real-time updates
  useEffect(() => {
    // Initialize Supabase client for real-time updates
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
    
    if (!supabaseUrl || !supabaseKey) {
      console.error('Supabase credentials not available')
      return
    }
    
    const { createClient } = require('@supabase/supabase-js')
    const supabase = createClient(supabaseUrl, supabaseKey)
    
    // Subscribe to all changes on contributions table - ensure table name matches main page
    const subscription = supabase
      .channel('public:contributions')
      .on('INSERT', () => {
        // When a new contribution is made, refresh the stats
        fetchStats()
      })
      .on('UPDATE', () => {
        // When a contribution is updated, refresh the stats
        fetchStats()
      })
      .subscribe()
    
    // Function to fetch stats
    const fetchStats = async () => {
      try {
        const response = await fetch('/api/presale/stats')
        if (!response.ok) throw new Error('Failed to fetch presale stats')
        
        const data = await response.json()
        if (data.success) {
          setStats({
            total_raised: Number(data.stats.total_raised || 0),
            cap: Number(data.stats.cap || 75),
            contributors: Number(data.stats.contributors || 0)
          })
        }
      } catch (error) {
        console.error('Error fetching presale stats:', error)
      }
    }

    // Listen for custom progress update events from the contribution form
    const handleProgressUpdate = (event: CustomEvent) => {
      if (event.detail) {
        console.log('PresaleStats: Progress update event received:', event.detail);
        setStats({
          total_raised: event.detail.raised || 0,
          cap: event.detail.cap || 75,
          contributors: event.detail.contributors || 0
        });
      }
    };

    // Add event listener
    window.addEventListener('pookie-progress-update', handleProgressUpdate as EventListener);
    
    // Cleanup function
    return () => {
      subscription.unsubscribe()
      window.removeEventListener('pookie-progress-update', handleProgressUpdate as EventListener);
    }
  }, [])

  return (
    <div className="w-full">
      <div className="grid grid-cols-2 gap-4 text-center">
        <div>
          <p className="text-gray-400 text-sm">Raised</p>
          <p className="text-xl font-bold text-white">
            {loading ? "Loading..." : `${stats.total_raised.toFixed(1)} SOL`}
          </p>
        </div>
        <div>
          <p className="text-gray-400 text-sm">Contributors</p>
          <p className="text-xl font-bold text-white">
            {loading ? "Loading..." : stats.contributors}
          </p>
        </div>
        <div>
          <p className="text-gray-400 text-sm">Progress</p>
          <p className="text-xl font-bold text-green-400">
            {loading ? "Loading..." : `${progressPercent}%`}
          </p>
        </div>
        <div>
          <p className="text-gray-400 text-sm">Allocation</p>
          <p className="text-xl font-bold text-white">100%</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="relative mt-4">
        <div className="overflow-hidden h-2 mb-1 text-xs flex rounded-full bg-zinc-800">
          <div 
            style={{ width: `${progressPercent}%` }}
            className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-green-400"
          />
        </div>
        <div className="flex justify-between text-xs text-gray-400">
          <span>0 SOL</span>
          <span>{stats.cap} SOL</span>
        </div>
      </div>
    </div>
  )
} 