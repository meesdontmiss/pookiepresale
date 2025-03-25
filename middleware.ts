import { NextRequest, NextResponse } from 'next/server';

// List of routes that should not be redirected
const EXCLUDED_ROUTES = [
  '/api/',  // API routes
  '/mobile/', // Already on mobile routes
  '/_next/', // Next.js internal routes
  '/favicon/', // Favicon files
  '/images/', // Image assets
  '/sounds/', // Sound assets
  '/models/' // 3D models
];

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
];

/**
 * Detects if the request is coming from a mobile device based on user agent
 */
function isMobileDevice(userAgent: string): boolean {
  return MOBILE_UA_PATTERNS.some(pattern => pattern.test(userAgent));
}

/**
 * Determines if the path should be excluded from redirection
 */
function isExcludedPath(path: string): boolean {
  return EXCLUDED_ROUTES.some(route => path.startsWith(route));
}

/**
 * Middleware function that runs before every request
 */
export function middleware(request: NextRequest) {
  // Get the user agent from the request headers
  const userAgent = request.headers.get('user-agent') || '';
  const { pathname } = request.nextUrl;
  
  // Check if the request is for an asset or API route
  if (isExcludedPath(pathname)) {
    return NextResponse.next();
  }

  // If it's a mobile device and not already on a mobile page
  if (isMobileDevice(userAgent) && pathname === '/') {
    // Create a new URL for the mobile version
    const url = request.nextUrl.clone();
    url.pathname = '/mobile';
    
    // Redirect the user to the mobile version
    return NextResponse.redirect(url);
  }

  // For all other requests, continue normally
  return NextResponse.next();
}

// Configure the middleware to run only on specific paths
export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}; 