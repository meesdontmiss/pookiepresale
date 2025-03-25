"use client"

import { useState } from 'react'
import { Connection } from '@solana/web3.js'
import { Button } from '@/components/ui/button'

// List of RPC endpoints to test
const RPC_ENDPOINTS = [
  "/api/rpc/proxy",
  "https://api.mainnet-beta.solana.com",
  "https://rpc.helius.xyz/?api-key=28cda6d9-5527-4c12-a0b3-cf2c6e54c1a4",
  "https://solana-mainnet.phantom.tech/YBPpkkN4g91xDiAnTE9r0RcMkjg0sKUIWvAfoFVJ",
  "https://solana-api.syndica.io/access-token/9iDftHLv5zEEVAoZt8PVTCx369RxJ845xdMu9UGevAGg9YdwzaiJpBzZGrL9vt3N/rpc",
  "https://boldest-empty-bridge.solana-mainnet.quiknode.pro/4d8d5aa933a5aee3c9e72cf7119e279026eb4f11/",
  "https://solana-mainnet.g.alchemy.com/v2/demo",
];

export default function DebugHelper() {
  const [results, setResults] = useState<{endpoint: string, success: boolean, message: string}[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const testEndpoint = async (endpoint: string) => {
    try {
      const connection = new Connection(endpoint, {
        commitment: "confirmed",
        confirmTransactionInitialTimeout: 15000
      });
      
      const start = Date.now();
      const { blockhash } = await connection.getLatestBlockhash();
      const elapsed = Date.now() - start;
      
      return {
        endpoint,
        success: true,
        message: `Success in ${elapsed}ms - Blockhash: ${blockhash.slice(0, 6)}...`
      };
    } catch (error) {
      return {
        endpoint,
        success: false,
        message: error instanceof Error ? error.message : String(error)
      };
    }
  };

  const testAllEndpoints = async () => {
    setIsLoading(true);
    setResults([]);
    
    const testResults = [];
    for (const endpoint of RPC_ENDPOINTS) {
      const result = await testEndpoint(endpoint);
      testResults.push(result);
      setResults([...testResults]); // Update results after each test
    }
    
    setIsLoading(false);
  };

  return (
    <div className="p-4 border rounded-md mt-4">
      <h2 className="text-xl font-semibold mb-2">RPC Endpoint Tester</h2>
      <p className="text-sm text-gray-500 mb-4">Test different RPC endpoints to see which ones are working.</p>
      
      <Button 
        onClick={testAllEndpoints} 
        disabled={isLoading}
        className="mb-4"
      >
        {isLoading ? 'Testing...' : 'Test RPC Endpoints'}
      </Button>
      
      {results.length > 0 && (
        <div className="space-y-2">
          {results.map((result, index) => (
            <div 
              key={index} 
              className={`p-3 rounded ${result.success ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}
            >
              <p className="font-medium">{result.endpoint}</p>
              <p className="text-sm">{result.message}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
} 