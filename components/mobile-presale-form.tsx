"use client"

import { useState, useEffect } from "react"
import { useWallet } from "@solana/wallet-adapter-react"
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui"
import { Button } from "@/components/ui/button"
import PasswordGate from "@/components/password-gate"
import ContributionForm from "@/components/contribution-form"
import { playClickSound } from "@/hooks/use-audio"
import { useToast } from "@/components/ui/use-toast"
import { Check, ExternalLink, Info } from "lucide-react"
import { Input } from "@/components/ui/input"
import dynamic from "next/dynamic"

export function MobilePresaleForm() {
  const { connected, publicKey } = useWallet()
  const [isPasswordVerified, setIsPasswordVerified] = useState(false)
  const [showPresale, setShowPresale] = useState(false)
  const [showPasswordForm, setShowPasswordForm] = useState(false)

  return (
    <div className="space-y-4">
      {showPasswordForm ? (
        <div className="w-full">
          <PasswordGate 
            onVerified={() => {
              setIsPasswordVerified(true);
              setShowPasswordForm(false);
              playClickSound();
            }} 
          />
          <Button 
            className="text-xs p-0 h-6 mt-1" 
            onClick={() => {
              setShowPasswordForm(false);
              playClickSound();
            }}
          >
            Cancel
          </Button>
        </div>
      ) : (
        <>
          {showPresale ? (
            <div>
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-sm font-bold">Contribute to $POOKIE</h3>
                <Button 
                  className="h-7 px-2 text-xs" 
                  onClick={() => {
                    setShowPresale(false);
                    playClickSound();
                  }}
                >
                  Back
                </Button>
              </div>
              
              <div className="bg-black/20 rounded-lg border border-white/10">
                <ContributionForm 
                  maxContribution={isPasswordVerified ? 2.0 : 0.25} 
                  tier={isPasswordVerified ? "core" : "public"} 
                  onClose={() => {
                    setShowPresale(false);
                    playClickSound();
                  }}
                />
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4 mb-2">
                <div className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span>Price:</span>
                    <span className="font-bold">0.25 - 2.0 SOL</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Your Cap:</span>
                    <span className="font-bold">{isPasswordVerified ? "2.0 SOL" : "0.25 SOL"}</span>
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span>Status:</span>
                    <span className="font-bold text-green-400">LIVE</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Allocation:</span>
                    <span className="font-bold">100%</span>
                  </div>
                </div>
              </div>
              
              <div className="flex space-x-2">
                <Button 
                  className="w-full border border-white/20 text-white font-medium bg-black/20 h-10" 
                  onClick={() => {
                    setShowPresale(true);
                    playClickSound();
                  }}
                >
                  Public Sale (0.25 SOL)
                </Button>
                
                {isPasswordVerified ? (
                  <Button 
                    className="w-full bg-green-500 hover:bg-green-600 text-white shadow-md hover:shadow-lg h-10" 
                    onClick={() => {
                      setShowPresale(true);
                      playClickSound();
                    }}
                  >
                    Private Sale (2.0 SOL)
                  </Button>
                ) : (
                  <Button 
                    className="w-full border border-white/20 text-white font-medium bg-black/20 h-10" 
                    onClick={() => {
                      setShowPasswordForm(true);
                      playClickSound();
                    }}
                  >
                    Unlock Private Sale
                  </Button>
                )}
              </div>
            </>
          )}
        </>
      )}
      
      {!connected && !showPasswordForm && !showPresale && (
        <div className="mt-2 bg-black/30 p-2 rounded-lg border border-white/10 text-center">
          <p className="text-xs mb-2">Connect your wallet to contribute</p>
          <div className="flex justify-center">
            <WalletMultiButton className="bg-green-500 text-white rounded-md px-3 py-1 text-xs h-8" />
          </div>
        </div>
      )}
    </div>
  )
} 