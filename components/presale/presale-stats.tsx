"use client"

import { useState, useEffect, useRef } from "react"

interface PresaleStats {
  total_raised: number
  cap: number
  contributors: number
}

// Treasury wallet address constant
const TREASURY_WALLET = process.env.NEXT_PUBLIC_TREASURY_WALLET || "4rYvLKto7HzVESZnXj7RugCyDgjz4uWeHR4MHCy3obNh";

export default function PresaleStats() {
  const [stats, setStats] = useState<PresaleStats>({
    total_raised: 0,
    cap: 75,
    contributors: 0
  })
  const [loading, setLoading] = useState(true)
  
  // Use a ref to store the last valid non-zero raised amount to prevent flashing to 0
  const lastValidRaisedRef = useRef<number>(0)

  // Calculate progress percentage
  const progressPercent = Math.min(100, Math.round((stats.total_raised / stats.cap) * 100))

  // Function to check the treasury wallet balance directly
  const checkTreasuryWalletBalance = async () => {
    try {
      if (typeof window === 'undefined') return null;
      
      const { Connection, PublicKey, LAMPORTS_PER_SOL } = await import('@solana/web3.js');
      const baseUrl = window.location.origin;
      const connection = new Connection(`${baseUrl}/api/rpc/proxy`, 'confirmed');
      
      // Get treasury balance
      const treasuryBalance = await connection.getBalance(new PublicKey(TREASURY_WALLET));
      const solBalance = treasuryBalance / LAMPORTS_PER_SOL;
      
      console.log(`PresaleStats: Treasury wallet balance: ${solBalance.toFixed(4)} SOL`);
      
      // Only update if the value is valid (non-zero) and different from current
      if (solBalance > 0) {
        lastValidRaisedRef.current = solBalance;
        
        // Update stats with the real treasury balance
        setStats(prev => ({
          ...prev,
          total_raised: solBalance
        }));
      }
      
      return solBalance > 0 ? solBalance : null;
    } catch (error) {
      console.error('Error checking treasury balance:', error);
      return null;
    }
  };

  // Function to update stats safely, preventing downgrades to zero
  const safelyUpdateStats = (newStats: Partial<PresaleStats>) => {
    setStats(prev => {
      // If we're getting a new raised amount of 0 but we have a better value, use the better value
      if (newStats.total_raised !== undefined && newStats.total_raised <= 0 && lastValidRaisedRef.current > 0) {
        return {
          ...prev,
          ...newStats,
          total_raised: lastValidRaisedRef.current
        };
      }
      
      // If we're getting a positive raised amount, update our reference
      if (newStats.total_raised !== undefined && newStats.total_raised > 0) {
        lastValidRaisedRef.current = newStats.total_raised;
      }
      
      return {
        ...prev,
        ...newStats
      };
    });
  };

  useEffect(() => {
    const fetchStats = async () => {
      try {
        // First try to get the real wallet balance
        const walletBalance = await checkTreasuryWalletBalance();
        
        // Then get the contributor count from the API
        const response = await fetch('/api/presale/stats')
        if (!response.ok) throw new Error('Failed to fetch presale stats')
        
        const data = await response.json()
        if (data.success) {
          // If we got a valid wallet balance, use it, otherwise use API data
          const raisedAmount = walletBalance !== null ? walletBalance : Number(data.stats.total_raised || 0);
          
          // Update our last valid reference if we have a good value
          if (raisedAmount > 0) {
            lastValidRaisedRef.current = raisedAmount;
          }
          
          safelyUpdateStats({
            total_raised: raisedAmount > 0 ? raisedAmount : lastValidRaisedRef.current,
            cap: Number(data.stats.cap || 75),
            contributors: Number(data.stats.contributors || 0)
          });
        }
      } catch (error) {
        console.error('Error fetching presale stats:', error)
        
        // In case of error, don't reset the raised amount to 0
        if (lastValidRaisedRef.current > 0) {
          safelyUpdateStats({});
        }
      } finally {
        setLoading(false)
      }
    }
    
    fetchStats()
    
    // Set up intervals to periodically update the stats
    const statsInterval = setInterval(fetchStats, 30000) // Update stats every 30 seconds
    const walletInterval = setInterval(checkTreasuryWalletBalance, 60000) // Check wallet every minute
    
    return () => {
      clearInterval(statsInterval)
      clearInterval(walletInterval)
    }
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
        // When a new contribution is made, check the wallet balance and refresh the stats
        checkTreasuryWalletBalance();
        fetchStats();
      })
      .on('UPDATE', () => {
        // When a contribution is updated, check the wallet balance and refresh the stats
        checkTreasuryWalletBalance();
        fetchStats();
      })
      .subscribe()
    
    // Function to fetch stats
    const fetchStats = async () => {
      try {
        const response = await fetch('/api/presale/stats')
        if (!response.ok) throw new Error('Failed to fetch presale stats')
        
        const data = await response.json()
        if (data.success) {
          // Keep the current raised amount (which may be from wallet balance)
          // but update other stats from the API
          safelyUpdateStats({
            cap: Number(data.stats.cap || 75),
            contributors: Number(data.stats.contributors || 0)
          });
        }
      } catch (error) {
        console.error('Error fetching presale stats:', error)
      }
    }

    // Listen for custom progress update events from the contribution form
    const handleProgressUpdate = (event: CustomEvent) => {
      if (event.detail) {
        console.log('PresaleStats: Progress update event received:', event.detail);
        
        // Only update the raised amount if it's valid and non-zero
        const newRaised = event.detail.raised || 0;
        
        if (newRaised > 0) {
          lastValidRaisedRef.current = newRaised;
        }
        
        safelyUpdateStats({
          total_raised: newRaised > 0 ? newRaised : lastValidRaisedRef.current,
          cap: event.detail.cap || 75,
          contributors: event.detail.contributors || 0
        });
        
        // After receiving an update event, verify with actual wallet balance
        setTimeout(checkTreasuryWalletBalance, 5000);
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
    <div className="space-y-3">
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