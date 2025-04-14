"use client"

import { useState, useEffect } from "react"

interface PresaleStatsData {
  total_raised: number
  cap: number
  contributors: number | null
}

// Treasury wallet address constant
const TREASURY_WALLET = process.env.NEXT_PUBLIC_TREASURY_WALLET || "4rYvLKto7HzVESZnXj7RugCyDgjz4uWeHR4MHCy3obNh";

export default function PresaleStats() {
  const [stats, setStats] = useState<PresaleStatsData>({
    total_raised: 0,
    cap: 0,
    contributors: null
  })
  const [loading, setLoading] = useState(true)

  // Calculate progress percentage - when presale is concluded, should always be 100%
  const progressPercent = 100; // Always 100% since presale is concluded

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
      
      console.log(`PresaleStats: Live treasury balance: ${solBalance.toFixed(4)} SOL`);
      
      if (solBalance > 0) {
        // For a concluded presale, the cap equals the raised amount
        setStats({
          total_raised: solBalance,
          cap: solBalance, // Set cap equal to raised amount
          contributors: stats.contributors // Keep existing contributor count
        });
        setLoading(false);
      }
      
      return solBalance;
    } catch (error) {
      console.error('Error checking treasury balance:', error);
      return null;
    }
  };

  useEffect(() => {
    // Initial fetch of treasury balance
    checkTreasuryWalletBalance();
    
    // Try to get contributors count from API if available
    const fetchContributors = async () => {
      try {
        const response = await fetch('/api/presale/stats');
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.stats && data.stats.contributors) {
            // Update just the contributors count
            setStats(prev => ({
              ...prev,
              contributors: Number(data.stats.contributors)
            }));
          }
        }
      } catch (error) {
        console.error('Error fetching contributor count:', error);
      }
    };
    
    fetchContributors();
    
    // Set up interval to refresh the balance periodically
    const refreshInterval = setInterval(checkTreasuryWalletBalance, 60000); // Update every minute
    
    return () => {
      clearInterval(refreshInterval);
    };
  }, []);

  // Also listen for any progress update events (optional)
  useEffect(() => {
    const handleProgressUpdate = (event: CustomEvent) => {
      if (event.detail && event.detail.contributors) {
        // Only take the contributors count from events, keep our direct balance check
        setStats(prev => ({
          ...prev,
          contributors: event.detail.contributors
        }));
      }
    };
    
    window.addEventListener('pookie-progress-update', handleProgressUpdate as EventListener);
    
    return () => {
      window.removeEventListener('pookie-progress-update', handleProgressUpdate as EventListener);
    };
  }, []);

  return (
    <div className="space-y-3">
      {/* Status Text - Always show Concluded */}
      <div className="text-center mb-2">
        {loading ? (
          <p className="text-sm text-gray-400">Loading stats...</p>
        ) : (
          <p className="text-sm font-semibold text-green-500">Status: Concluded</p>
        )}
      </div>

      {/* Progress Bar - Always 100% */}
      <div>
        <div className="w-full relative h-6 bg-gray-800 rounded-full overflow-hidden">
          <div 
            style={{ width: '100%' }} 
            className="absolute h-full bg-gradient-to-r from-green-500 to-green-400 transition-all duration-700 flex items-center justify-center"
          >
            <span className="text-xs font-bold text-white">100%</span>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-2">
        <div className="text-center p-3 bg-gray-800/50 rounded-lg">
          <p className="text-xs text-gray-400">Raised</p>
          <p className="font-bold text-sm">{stats.total_raised.toFixed(2)} SOL</p>
        </div>
        <div className="text-center p-3 bg-gray-800/50 rounded-lg">
          <p className="text-xs text-gray-400">Final Target</p>
          <p className="font-bold text-sm">{stats.total_raised.toFixed(2)} SOL</p>
        </div>
      </div>
    </div>
  )
} 