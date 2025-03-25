"use client"

import { useState } from "react"
import { useWallet } from "@solana/wallet-adapter-react"
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui"
import { Button } from "@/components/ui/button"

// Predefined SOL contribution amounts
const PUBLIC_CONTRIBUTION_AMOUNT = 0.25
const PRIVATE_CONTRIBUTION_OPTIONS = [0.5, 1.0, 1.5, 2.0]

export default function PreSaleForm() {
  const { publicKey, signTransaction, connected } = useWallet()
  const [selectedAmount, setSelectedAmount] = useState<number>(0.25)
  const [isPrivateSale, setIsPrivateSale] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleContribute = async () => {
    if (!publicKey || !connected) {
      alert("Please connect your wallet first")
      return
    }

    setIsSubmitting(true)
    try {
      // Get treasury wallet address from environment variables
      const treasuryWallet = process.env.NEXT_PUBLIC_TREASURY_WALLET
      
      if (!treasuryWallet) {
        throw new Error('Treasury wallet not configured')
      }
      
      // Use @solana/web3.js to create and send the transaction
      const { Connection, SystemProgram, Transaction, PublicKey } = await import('@solana/web3.js')
      
      // Create connection to Solana using our API proxy to avoid 403 errors
      let connection;
      
      // Use our proxy URL in the browser, but fall back to the env var for server-side
      if (typeof window !== 'undefined') {
        const baseUrl = window.location.origin;
        connection = new Connection(`${baseUrl}/api/rpc/proxy`, 'confirmed');
      } else {
        // Server-side connection (should not be used from client components, but adding for completeness)
        connection = new Connection(process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com', 'confirmed');
      }
      
      // Create a transaction to send SOL to treasury
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: new PublicKey(treasuryWallet),
          lamports: selectedAmount * 1000000000, // Convert SOL to lamports
        })
      )
      
      // Get recent blockhash
      const { blockhash } = await connection.getLatestBlockhash()
      transaction.recentBlockhash = blockhash
      transaction.feePayer = publicKey
      
      // Send transaction
      if (!signTransaction) {
        throw new Error('Wallet does not support signTransaction')
      }
      
      const signedTransaction = await signTransaction(transaction)
      const signature = await connection.sendRawTransaction(signedTransaction.serialize())
      
      // Wait for confirmation
      await connection.confirmTransaction(signature, 'confirmed')
      
      // Verify with our API
      const verifyResponse = await fetch('/api/transactions/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          signature,
          walletAddress: publicKey.toString(),
          amount: selectedAmount,
          tier: isPrivateSale ? "core" : "public",
        }),
      })
      
      if (!verifyResponse.ok) {
        throw new Error('Failed to verify transaction')
      }
      
      alert("Thank you for your contribution!")
      setSelectedAmount(0.25)
      
    } catch (error) {
      console.error("Contribution error:", error)
      alert("Transaction failed. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="w-full px-2 py-4">
      {!connected ? (
        <div className="flex flex-col items-center space-y-4">
          <p className="text-center text-sm mb-2">Connect your wallet to participate in the presale</p>
          <WalletMultiButton className="bg-green-500 hover:bg-green-600 text-white rounded-md h-10" />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="mb-4">
            <div className="flex justify-between mb-2">
              <span className="text-sm font-medium">Sale Type:</span>
              <div className="flex space-x-2">
                <Button 
                  className={`text-xs px-2 py-1 h-7 ${!isPrivateSale ? 'bg-green-500' : 'bg-zinc-700'}`}
                  onClick={() => setIsPrivateSale(false)}
                >
                  Public
                </Button>
                <Button 
                  className={`text-xs px-2 py-1 h-7 ${isPrivateSale ? 'bg-green-500' : 'bg-zinc-700'}`}
                  onClick={() => setIsPrivateSale(true)}
                >
                  Private
                </Button>
              </div>
            </div>
            
            <div className="mb-4">
              <span className="text-sm font-medium block mb-2">Amount:</span>
              <div className="grid grid-cols-2 gap-2">
                {isPrivateSale ? (
                  PRIVATE_CONTRIBUTION_OPTIONS.map((amount) => (
                    <Button
                      key={amount}
                      variant={selectedAmount === amount ? "default" : "outline"}
                      className={`text-sm ${selectedAmount === amount ? 'bg-green-500' : 'bg-zinc-800'}`}
                      onClick={() => setSelectedAmount(amount)}
                    >
                      {amount} SOL
                    </Button>
                  ))
                ) : (
                  <Button
                    variant="default"
                    className="text-sm bg-green-500"
                    onClick={() => setSelectedAmount(PUBLIC_CONTRIBUTION_AMOUNT)}
                  >
                    {PUBLIC_CONTRIBUTION_AMOUNT} SOL
                  </Button>
                )}
              </div>
            </div>
          </div>
          
          <Button
            className="w-full bg-green-500 hover:bg-green-600 text-white"
            disabled={isSubmitting || !selectedAmount}
            onClick={handleContribute}
          >
            {isSubmitting ? "Processing..." : `Contribute ${selectedAmount} SOL`}
          </Button>
          
          <p className="text-xs text-center text-gray-400 mt-2">
            Your tokens will be distributed at TGE
          </p>
        </div>
      )}
    </div>
  )
} 