import { NextRequest } from 'next/server'
import { createHash, timingSafeEqual } from 'crypto'

// No fallback - the admin password must be set in environment variables
const ADMIN_TOKEN_TTL = 24 * 60 * 60 * 1000 // 24 hours in milliseconds

// Function to securely compare passwords with constant time comparison to prevent timing attacks
function secureCompare(a: string, b: string): boolean {
  try {
    // Hash both inputs to ensure they have the same length for comparison
    const hashA = createHash('sha256').update(a).digest()
    const hashB = createHash('sha256').update(b).digest()
    return timingSafeEqual(hashA, hashB)
  } catch (error) {
    return false
  }
}

// Generate a token that expires after 24 hours
export function generateAdminToken(): string {
  // Check that admin password is set
  const adminPassword = process.env.ADMIN_PASSWORD
  if (!adminPassword) {
    throw new Error('ADMIN_PASSWORD environment variable must be set')
  }

  const timestamp = Date.now()
  const expiry = timestamp + ADMIN_TOKEN_TTL
  const payload = `${expiry}`
  
  // Create a hash of the payload and admin password
  const hash = createHash('sha256')
    .update(`${payload}:${adminPassword}`)
    .digest('hex')
  
  // Return the token in the format: expiry:hash
  return `${expiry}:${hash}`
}

// Verify an admin token
export function verifyToken(token: string): boolean {
  try {
    const adminPassword = process.env.ADMIN_PASSWORD
    if (!adminPassword) {
      console.error('ADMIN_PASSWORD environment variable not set')
      return false
    }

    // Split the token into expiry and hash
    const [expiry, hash] = token.split(':')
    const expiryTime = parseInt(expiry)
    
    // Check if token has expired
    if (isNaN(expiryTime) || Date.now() > expiryTime) {
      return false
    }
    
    // Verify the hash with constant-time comparison
    const payload = `${expiryTime}`
    const expectedHash = createHash('sha256')
      .update(`${payload}:${adminPassword}`)
      .digest('hex')
    
    // Use timing-safe comparison
    return secureCompare(hash, expectedHash)
  } catch (error) {
    console.error('Token verification error:', error)
    return false
  }
}

// Verify admin password
export function verifyAdminPassword(password: string): boolean {
  try {
    const adminPassword = process.env.ADMIN_PASSWORD
    if (!adminPassword) {
      console.error('ADMIN_PASSWORD environment variable not set')
      return false
    }

    // Use timing-safe comparison to prevent timing attacks
    return secureCompare(password, adminPassword)
  } catch (error) {
    console.error('Password verification error:', error)
    return false
  }
}

// Verify admin authentication from a request
export async function verifyAdminAuth(request: NextRequest): Promise<{ success: boolean }> {
  try {
    // Get the authorization header
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return { success: false }
    }
    
    // Extract the token
    const token = authHeader.substring(7) // Remove "Bearer " prefix
    
    // Verify the token
    return { success: verifyToken(token) }
  } catch (error) {
    console.error('Admin auth error:', error)
    return { success: false }
  }
} 