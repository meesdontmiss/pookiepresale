import { NextRequest, NextResponse } from 'next/server'
import { generateAdminToken, verifyAdminPassword } from '@/utils/admin-auth'
import { RateLimiter } from '@/utils/rate-limiter'

// Create a rate limiter to prevent brute force attacks (5 attempts per 15 minutes)
const loginRateLimiter = new RateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 5, // 5 attempts
  keyGenerator: (req: NextRequest) => {
    // Use IP address as the key
    return req.ip || req.headers.get('x-forwarded-for') || 'unknown'
  }
})

export async function POST(request: NextRequest) {
  try {
    // Check that the admin password is set
    if (!process.env.ADMIN_PASSWORD) {
      console.error('ADMIN_PASSWORD environment variable is not set')
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    // Apply rate limiting to prevent brute force attacks
    const rateLimited = await loginRateLimiter.check(request)
    if (rateLimited) {
      return NextResponse.json(
        { error: 'Too many login attempts. Please try again later.' }, 
        { status: 429 }
      )
    }

    // Parse JSON body
    const body = await request.json()
    const { password } = body

    if (!password) {
      return NextResponse.json({ error: 'Password is required' }, { status: 400 })
    }

    // Verify the password using secure timing-safe comparison
    const isValid = verifyAdminPassword(password)

    if (!isValid) {
      // Log failed attempts but don't expose too much info in the response
      console.warn(`Failed admin login attempt from IP: ${request.ip || request.headers.get('x-forwarded-for') || 'unknown'}`)
      
      return NextResponse.json({ error: 'Invalid password' }, { status: 401 })
    }

    // Generate admin token
    const token = generateAdminToken()

    // Log successful login
    console.log(`Successful admin login from IP: ${request.ip || request.headers.get('x-forwarded-for') || 'unknown'}`)

    return NextResponse.json({
      success: true,
      token,
      expiresIn: 24 * 60 * 60 * 1000 // 24 hours in milliseconds
    })
  } catch (error) {
    console.error('Admin login error:', error)
    return NextResponse.json({ error: 'Login failed' }, { status: 500 })
  }
} 