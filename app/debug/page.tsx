"use client"

import { useEffect, useState } from 'react'
import DebugHelper from '@/components/debug-helper'
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js'

export default function DebugPage() {
  const [networkStatus, setNetworkStatus] = useState<'loading' | 'connected' | 'error'>('loading');
  const [balance, setBalance] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function checkConnection() {
      try {
        const treasuryWallet = process.env.NEXT_PUBLIC_TREASURY_WALLET || "4FdhCrDhcBcXyqLJGANnYbRiJyp1ApbQvXA1PYJXmdCG";
        const connection = new Connection("https://rpc.helius.xyz/?api-key=28cda6d9-5527-4c12-a0b3-cf2c6e54c1a4");
        
        // Test connection
        const slot = await connection.getSlot();
        
        // Get treasury balance
        const treasuryBalance = await connection.getBalance(new PublicKey(treasuryWallet));
        
        setNetworkStatus('connected');
        setBalance(treasuryBalance / LAMPORTS_PER_SOL);
      } catch (err) {
        setNetworkStatus('error');
        setError(err instanceof Error ? err.message : String(err));
      }
    }
    
    checkConnection();
  }, []);

  return (
    <div className="container max-w-3xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Solana Connection Debug Page</h1>
      
      <div className="mb-8 p-4 border rounded-md">
        <h2 className="text-xl font-semibold mb-4">Network Status</h2>
        <div className="space-y-2">
          <div>
            <span className="font-medium">Status: </span>
            <span 
              className={
                networkStatus === 'connected' ? 'text-green-600' : 
                networkStatus === 'error' ? 'text-red-600' : 
                'text-yellow-600'
              }
            >
              {networkStatus === 'connected' ? 'Connected' : 
               networkStatus === 'error' ? 'Error' : 
               'Checking...'}
            </span>
          </div>
          
          {balance !== null && (
            <div>
              <span className="font-medium">Treasury Balance: </span>
              {balance.toFixed(4)} SOL
            </div>
          )}
          
          {error && (
            <div className="p-3 bg-red-50 text-red-800 rounded text-sm mt-2">
              {error}
            </div>
          )}
        </div>
      </div>
      
      <DebugHelper />
      
      <div className="mt-8 text-sm text-gray-500">
        <p>This page tests various RPC endpoints to determine which ones are working reliably.</p>
        <p>If you're experiencing 403 errors, use this page to identify which endpoints are functioning properly.</p>
      </div>
    </div>
  );
} 