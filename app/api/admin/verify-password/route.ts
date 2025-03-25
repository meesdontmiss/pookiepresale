import { NextRequest, NextResponse } from 'next/server'
import { createHash, createHmac } from 'crypto'

// Use environment variables for all sensitive values
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || '07bbc80758c32e2f233c8e3fef952cc0194f14d63f2b4a022647cb788b8f20fe'
const SALT = process.env.ADMIN_PASSWORD_SALT || 'pookie-salt-2024'
const JWT_SECRET = process.env.JWT_SECRET || 'secure-jwt-secret-placeholder'

// Add warning log if using default values in production
if (process.env.NODE_ENV === 'production') {
  if (!process.env.ADMIN_PASSWORD_HASH || !process.env.ADMIN_PASSWORD_SALT || !process.env.JWT_SECRET) {
    console.warn('WARNING: Using default security values in production. Set proper environment variables.')
  }
}

// Rate limiting
const MAX_ATTEMPTS = 5
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000 // 15 minutes
const failedAttempts = new Map<string, { count: number, timestamp: number }>()

// Clean up function for failed attempts
function cleanupFailedAttempts() {
  const now = Date.now()
  for (const [ip, data] of failedAttempts.entries()) {
    if (now - data.timestamp > RATE_LIMIT_WINDOW_MS) {
      failedAttempts.delete(ip)
    }
  }
}

// Run cleanup every hour
setInterval(cleanupFailedAttempts, 60 * 60 * 1000)

export async function POST(req: NextRequest) {
  try {
    // Apply rate limiting based on IP
    const clientIp = req.headers.get('x-forwarded-for') || 'unknown'
    const ipHash = createHash('sha256').update(clientIp).digest('hex')
    
    // Check if IP is rate limited
    const attempt = failedAttempts.get(ipHash)
    const now = Date.now()
    
    if (attempt && attempt.count >= MAX_ATTEMPTS && now - attempt.timestamp < RATE_LIMIT_WINDOW_MS) {
      return NextResponse.json({
        success: false,
        error: 'Too many failed attempts. Please try again later.'
      }, { status: 429 })
    }
    
    // Parse request body
    const body = await req.json()
    const { password } = body
    
    if (!password) {
      return NextResponse.json({
        success: false,
        error: 'Password is required'
      }, { status: 400 })
    }
    
    // Delay to prevent timing attacks
    await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 500))
    
    // Create hash of the provided password
    const passwordHash = createHash('sha256').update(password + SALT).digest('hex')
    
    // Compare with stored hash
    const isValid = passwordHash === ADMIN_PASSWORD_HASH
    
    if (!isValid) {
      // Record failed attempt
      if (!attempt) {
        failedAttempts.set(ipHash, { count: 1, timestamp: now })
      } else {
        failedAttempts.set(ipHash, { count: attempt.count + 1, timestamp: now })
      }
      
      return NextResponse.json({
        success: false,
        error: 'Invalid password'
      }, { status: 401 })
    }
    
    // Reset failed attempts on success
    failedAttempts.delete(ipHash)
    
    // Create a session token (simplified JWT)
    // In production, use a proper JWT library
    const expiresAt = Date.now() + (2 * 60 * 60 * 1000) // 2 hours
    const payload = {
      exp: expiresAt,
      iat: Date.now(),
      role: 'admin'
    }
    
    const payloadString = JSON.stringify(payload)
    const signature = createHmac('sha256', JWT_SECRET)
      .update(payloadString)
      .digest('hex')
    
    // Create the token
    const token = Buffer.from(payloadString).toString('base64') + '.' + signature
    
    return NextResponse.json({
      success: true,
      token,
      expiresAt
    })
    
  } catch (error) {
    console.error('Password verification error:', error)
    
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 })
  }
} 