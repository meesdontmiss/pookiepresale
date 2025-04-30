import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

/**
 * Image proxy API route to bypass CORS restrictions
 * This allows us to fetch images from external sources that don't have proper CORS headers
 */
export async function GET(request: NextRequest) {
  // Get the URL from the query parameters
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');

  // Return error if URL is not provided
  if (!url) {
    return NextResponse.json({ error: 'Missing URL parameter' }, { status: 400 });
  }

  try {
    // URL decode the parameter
    const decodedUrl = decodeURIComponent(url);
    
    // Basic validation: Check if it looks like an HTTP(S) URL
    if (!decodedUrl.startsWith('http://') && !decodedUrl.startsWith('https://')) {
      return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 });
    }

    console.log(`[Image Proxy] Fetching image from: ${decodedUrl}`);
    
    // Fetch the image with a timeout
    const response = await axios.get(decodedUrl, {
      responseType: 'arraybuffer',
      timeout: 5000, // 5 seconds timeout
      validateStatus: function (status) {
        return status >= 200 && status < 300; // Only accept success codes
      },
    });

    // Get the content type from the response
    const contentType = response.headers['content-type'] || 'image/jpeg';
    
    // Return the image data with appropriate headers
    return new NextResponse(response.data, {
      headers: {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=86400, s-maxage=86400', // Cache for 24 hours
      },
    });
  } catch (error: any) {
    console.error(`[Image Proxy] Error fetching image from ${url}:`, error);
    
    // Return different error codes based on the error type
    if (axios.isAxiosError(error)) {
      if (error.code === 'ECONNABORTED') {
        return NextResponse.json({ error: 'Image fetch timeout' }, { status: 504 });
      }
      if (error.response) {
        return NextResponse.json({ error: `Gateway returned ${error.response.status}` }, { status: error.response.status });
      }
    }
    
    // Default error
    return NextResponse.json({ error: 'Failed to fetch image' }, { status: 500 });
  }
} 