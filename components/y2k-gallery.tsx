"use client"

import { useState, useEffect } from "react"
import Image from "next/image"

// Define the image data
const galleryImages = [
  {
    src: "/images/POOKIE-GALAXY-GAS.png",
    alt: "Pookie Galaxy Gas",
    title: "GALAXY GAS",
    subtitle: "HIGH ON THAT GAS",
  },
  {
    src: "/images/GARY-PACK.png",
    alt: "Gary Pack",
    title: "GARY PACKIN",
    subtitle: "HEATIN UP THE BLOCK",
  },
  {
    src: "/images/dont-need-u-back.png",
    alt: "Don't Need U Back",
    title: "DON'T NEED U BACK",
    subtitle: "I'M BETTER OFF ALONE",
  },
  {
    src: "/images/I-LIKE-EM-THICC.png",
    alt: "I Like Em Thicc",
    title: "I LIKE EM THICC",
    subtitle: "GIMME THAT EXTRA CUSHION",
  },
  {
    src: "/images/I-WANT-YOU!.png",
    alt: "I Want You!",
    title: "I WANT YOU!",
    subtitle: "JOIN THE $POOKIE ARMY TODAY",
  },
  {
    src: "/images/bigger-pook.png",
    alt: "Bigger Pook",
    title: "BIGGER IS BETTER",
    subtitle: "SIZE MATTERS WHEN IT'S $POOKIE",
  },
  {
    src: "/images/bottom-bitch.png",
    alt: "Bottom Bitch",
    title: "BOTTOM BITCH",
    subtitle: "KNOW YOUR PLACE",
  },
  {
    src: "/images/dont-lie-to-urself-baby.png",
    alt: "Don't Lie To Urself",
    title: "DON'T LIE TO URSELF",
    subtitle: "EMBRACE THE TRUTH",
  },
  {
    src: "/images/off-the-percs.png",
    alt: "Off The Percs",
    title: "OFF THE PERCS",
    subtitle: "FEELING NO PAIN",
  },
  {
    src: "/images/DAMN-POOKIE.png",
    alt: "Damn Pookie",
    title: "YOU DONT GET AN ASS LIKE THIS",
    subtitle: "BY SITTING ON IT",
  },
  {
    src: "/images/GAY-POOK.png",
    alt: "Gay Pook",
    title: "GAY POOK",
    subtitle: "LOVE IS LOVE",
  },
  {
    src: "/images/SWAG.png",
    alt: "Swag Pookie",
    title: "S.W.A.G.",
    subtitle: "Start Winning Achieve Greatness",
  },
  {
    src: "/images/GOT-THAT-POOK-IN-ME.png",
    alt: "Got That Pook In Me",
    title: "GOT THAT POOK IN ME",
    subtitle: "CAN'T FIGHT THIS FEELING",
  },
  {
    src: "/images/DRAINED-IT.png",
    alt: "Drained It",
    title: "DRAINED IT",
    subtitle: "EMPTY LIKE MY WALLET",
  },
  {
    src: "/images/all-these-nuts-around.png",
    alt: "All These Nuts Around",
    title: "ALL THESE NUTS",
    subtitle: "SURROUNDING ME EVERYWHERE",
  },
  {
    src: "/images/doc-martens.png",
    alt: "Doc Martens",
    title: "YOU WOULDN'T LAST A DAY",
    subtitle: "IN MY DOC MARTENS",
  },
  {
    src: "/images/crackhead pooks.jpg",
    alt: "Crackhead Pooks",
    title: "CRACKHEAD ENERGY",
    subtitle: "THAT PURE UNFILTERED VIBE",
  },
  {
    src: "/images/pookie-smashin.gif",
    alt: "Pookie Smashin",
    title: "SMASHING IT",
    subtitle: "GOING HARD AF",
  },
  {
    src: "/images/bandokids-x-pookie.gif",
    alt: "Bandokids x Pookie",
    title: "BANDO COLLAB",
    subtitle: "CROSSOVER EPISODE",
  },
  {
    src: "/images/POOKIE-HAWK-TUAH-abuse.png",
    alt: "Hawk Tuah Pookie",
    title: "TUAH ON ME",
    subtitle: "DO IT LOOK LIKE I NEED HELP?",
  },
  {
    src: "/images/POOKIE-DID-911.png",
    alt: "9/11 Pookie",
    title: "JET FUEL",
    subtitle: "CAN'T MELT STEEL BEAMS",
  }
]

export function Y2KGallery() {
  const [activeIndex, setActiveIndex] = useState(0)
  const [isLoaded, setIsLoaded] = useState(false)
  const [showGlitter, setShowGlitter] = useState(false)

  useEffect(() => {
    setIsLoaded(true)

    // Create glitter effect every few seconds
    const glitterInterval = setInterval(() => {
      setShowGlitter(true)
      setTimeout(() => setShowGlitter(false), 500)
    }, 3000)

    return () => clearInterval(glitterInterval)
  }, [])

  if (!isLoaded) return null

  return (
    <div className="relative">
      {/* Y2K-style marquee */}
      <div className="bg-black text-white py-2 mb-6 overflow-hidden border-2 border-pink-500">
        <div className="animate-marquee whitespace-nowrap">
          <span className="mx-4">✧･ﾟ: *✧･ﾟ:* $POOKIE TO THE MOON *:･ﾟ✧*:･ﾟ✧</span>
          <span className="mx-4">✧･ﾟ: *✧･ﾟ:* PRIVATE PRESALE LIVE NOW *:･ﾟ✧*:･ﾟ✧</span>
          <span className="mx-4">✧･ﾟ: *✧･ﾟ:* $1 = 1 $POOKIE *:･ﾟ✧*:･ﾟ✧</span>
          <span className="mx-4">✧･ﾟ: *✧･ﾟ:* DAMN POOKIE?! HOW U WADDLE LIKE DAT? *:･ﾟ✧*:･ﾟ✧</span>
        </div>
      </div>

      {/* Main gallery grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {galleryImages.map((image, index) => (
          <div
            key={index}
            className="group relative cursor-pointer transition-all duration-300 transform hover:scale-105 hover:rotate-2 hover:z-10"
            onClick={() => setActiveIndex(index)}
          >
            <div className="relative aspect-square overflow-hidden border-4 border-dashed border-white bg-black shadow-lg hover:shadow-xl transition-all duration-300">
              <img
                src={image.src}
                alt={image.alt}
                className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = "/images/logo.gif";
                  (e.target as HTMLImageElement).onerror = null;
                }}
              />

              {/* Y2K-style overlay with WordArt-like text */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-4">
                <h3 className="text-xl font-bold text-white drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)] transform translate-y-4 group-hover:translate-y-0 transition-transform duration-300">{image.title}</h3>
                <p className="text-sm text-yellow-300 italic transform translate-y-4 group-hover:translate-y-0 transition-transform duration-500 delay-75">{image.subtitle}</p>
              </div>

              {/* Decorative corner elements */}
              <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-pink-500 group-hover:w-8 group-hover:h-8 transition-all duration-300"></div>
              <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-green-400 group-hover:w-8 group-hover:h-8 transition-all duration-300"></div>
              <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-blue-500 group-hover:w-8 group-hover:h-8 transition-all duration-300"></div>
              <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-yellow-400 group-hover:w-8 group-hover:h-8 transition-all duration-300"></div>
            </div>
          </div>
        ))}
      </div>

      {/* Glitter effect */}
      {showGlitter && (
        <div className="absolute inset-0 pointer-events-none z-10">
          {Array.from({ length: 30 }).map((_, i) => (
            <div
              key={i}
              className="absolute w-2 h-2 bg-white rounded-full animate-ping"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                opacity: Math.random() * 0.7 + 0.3,
                animationDuration: `${Math.random() * 1 + 0.5}s`,
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

