"use client"

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Client component to conditionally add/remove a class from the body 
 * based on the current pathname.
 */
export function BodyClassManager() {
  const pathname = usePathname();
  const isStakingPage = pathname === '/staking';
  const bodyClassName = 'cursor-middle-finger'; // The class to manage

  useEffect(() => {
    // Add or remove the class from the document body
    if (isStakingPage) {
      document.body.classList.remove(bodyClassName);
    } else {
      document.body.classList.add(bodyClassName);
    }

    // Cleanup function to potentially add the class back if the component unmounts
    // This might not be strictly necessary depending on navigation, but good practice.
    return () => {
      // Optionally, decide if you want to ALWAYS add it back on unmount,
      // or only if the *new* page isn't the staking page.
      // For simplicity, let's assume we want the default cursor unless explicitly removed.
      if (!document.body.classList.contains(bodyClassName)) {
         // document.body.classList.add(bodyClassName);
         // Let's remove this cleanup part to avoid potential conflicts during fast navigation
      }
    };
  }, [pathname]); // Re-run effect when pathname changes

  // This component doesn't render anything itself
  return null;
} 