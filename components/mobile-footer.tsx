"use client"

import Link from "next/link"

export function MobileFooter() {
  return (
    <footer className="text-center text-xs text-gray-500 py-4 border-t border-white/10 mt-6">
      <div className="mb-2">
        <Link 
          href="/"
          className="text-sm text-green-400 underline"
        >
          Switch to Desktop
        </Link>
      </div>
      &copy; {new Date().getFullYear()} $POOKIE. All rights reserved.
    </footer>
  )
} 