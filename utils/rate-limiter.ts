import { NextRequest } from 'next/server'

interface RateLimiterOptions {
  windowMs: number // Time window in milliseconds
  maxRequests: number // Maximum requests per window
  keyGenerator: (req: NextRequest) => string // Function to generate a unique key for the request
}

interface LimitRecord {
  count: number
  resetTime: number
}

/**
 * A simple rate limiter to prevent brute force attacks and abuse
 */
export class RateLimiter {
  private options: RateLimiterOptions
  private limits: Map<string, LimitRecord> = new Map()
  private cleanupInterval: NodeJS.Timeout | null = null

  constructor(options: RateLimiterOptions) {
    this.options = options

    // Set up automatic cleanup of expired records every minute
    if (typeof window === 'undefined') { // Only run on server
      this.cleanupInterval = setInterval(() => {
        this.cleanup()
      }, 60 * 1000) // Clean up every minute
    }
  }

  /**
   * Check if a request should be rate limited
   * @param req The Next.js request object
   * @returns true if rate limited, false otherwise
   */
  async check(req: NextRequest): Promise<boolean> {
    const key = this.options.keyGenerator(req)
    const now = Date.now()
    
    // Get current limit record or create new one
    const record = this.limits.get(key) || {
      count: 0,
      resetTime: now + this.options.windowMs
    }
    
    // Check if window has expired and reset if needed
    if (now > record.resetTime) {
      record.count = 0
      record.resetTime = now + this.options.windowMs
    }
    
    // Increment count
    record.count++
    
    // Save updated record
    this.limits.set(key, record)
    
    // Return true if rate limited
    return record.count > this.options.maxRequests
  }

  /**
   * Clean up expired records
   */
  private cleanup() {
    const now = Date.now()
    for (const [key, record] of this.limits.entries()) {
      if (now > record.resetTime) {
        this.limits.delete(key)
      }
    }
  }

  /**
   * Stop the cleanup interval
   */
  stop() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
  }
} 