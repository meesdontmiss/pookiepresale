import { NextRequest, NextResponse } from 'next/server'

// Array of common mobile user agent patterns
const MOBILE_UA_PATTERNS = [
  /Android/i,
  /webOS/i,
  /iPhone/i,
  /iPad/i,
  /iPod/i,
  /BlackBerry/i,
  /Windows Phone/i,
  /Mobile/i,
  /Tablet/i
]

/**
 * Detects if the request is coming from a mobile device based on user agent
 */
function isMobileDevice(userAgent: string): boolean {
  return MOBILE_UA_PATTERNS.some(pattern => pattern.test(userAgent))
}

/**
 * GET handler for the mobile route
 * Ensures mobile users stay on mobile and desktop users redirect to desktop
 */
export async function GET(request: NextRequest) {
  const userAgent = request.headers.get('user-agent') || ''
  
  // If it's NOT a mobile device, redirect to desktop version
  if (!isMobileDevice(userAgent)) {
    return NextResponse.redirect(new URL('/', request.url))
  }
  
  // Let the mobile page component handle the request for mobile users
  return NextResponse.next()
} 