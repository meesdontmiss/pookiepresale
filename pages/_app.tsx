import type { AppProps } from 'next/app'
import { useEffect } from 'react'

// Import our patch to ensure it's loaded 
// Before any Solana code runs
import '@/lib/solana-connection-patch'

export default function App({ Component, pageProps }: AppProps) {
  // Apply the patch on initial load
  useEffect(() => {
    console.log('🔧 Solana connection patch applied at app level')
    
    // For debugging: add a global error handler to catch and log unhandled errors
    const originalOnError = window.onerror
    window.onerror = function(message, source, lineno, colno, error) {
      console.error('Global error caught:', { message, source, lineno, colno, error })
      // Call the original handler if it exists
      if (originalOnError) {
        return originalOnError.apply(this, [message, source, lineno, colno, error])
      }
      return false
    }
  }, [])

  return <Component {...pageProps} />
} 