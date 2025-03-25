"use client"

import React, { useRef, useEffect, useState } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useGLTF, OrbitControls, PerspectiveCamera } from '@react-three/drei'

// Define the type for our GLTF result without explicit import
type GLTFResult = {
  nodes: Record<string, THREE.Mesh>
  materials: Record<string, THREE.Material>
  scene: THREE.Group
}

// Strobe light component that alternates between purple and green
function StrobeLight() {
  const spotlightRef = useRef<THREE.SpotLight>(null)
  const [color, setColor] = useState<'purple' | 'green'>('purple')
  
  // More saturated colors
  const purpleColor = new THREE.Color('#B700FF') // More saturated purple
  const greenColor = new THREE.Color('#00FF99') // More saturated green
  
  // Create strobe effect
  useFrame(({ clock }) => {
    if (spotlightRef.current) {
      // Switch colors every half second
      const shouldBePurple = Math.sin(clock.getElapsedTime() * 5) > 0
      
      if (shouldBePurple && color !== 'purple') {
        setColor('purple')
        spotlightRef.current.color = purpleColor
      } else if (!shouldBePurple && color !== 'green') {
        setColor('green')
        spotlightRef.current.color = greenColor
      }
      
      // Add some intensity variation for dramatic effect
      spotlightRef.current.intensity = 1.0 + Math.sin(clock.getElapsedTime() * 10) * 0.5
    }
  })
  
  return (
    <>
      {/* Main strobe spotlight from above */}
      <spotLight 
        ref={spotlightRef}
        position={[0, 4, 0]} 
        intensity={1.2}
        angle={0.6} // Wider angle for more coverage (in radians)
        penumbra={0.8} // Soft edges
        color={color === 'purple' ? purpleColor : greenColor}
        distance={15}
        decay={1.5}
        castShadow
      />
      
      {/* Secondary fill light to spread the color around */}
      <pointLight 
        position={[0, 1, 4]} 
        intensity={0.3}
        color={color === 'purple' ? purpleColor : greenColor}
        distance={10}
        decay={2}
      />
    </>
  )
}

function PookieModel() {
  const { scene, nodes, materials } = useGLTF('/models/POOKIE.glb') as unknown as GLTFResult
  const modelRef = useRef<THREE.Group>(null)
  const { camera } = useThree()

  // Position camera for better view on mobile
  useEffect(() => {
    if (camera) {
      // Position the camera to properly frame the full body
      camera.position.set(0, -2, 7) // Moved up by 1 on Y axis
      camera.lookAt(0, -2, 0) // Updated lookAt to match
    }
  }, [camera])

  // Simple rotation animation
  useFrame(() => {
    if (modelRef.current) {
      modelRef.current.rotation.y += 0.003
    }
  })
  
  return (
    <group ref={modelRef} position={[0, -2, 0]} rotation={[0.1, 0, 0]}>
      <primitive object={scene} scale={1.17} receiveShadow castShadow /> {/* Increased by 30% (0.9 * 1.3 = 1.17) */}
    </group>
  )
}

export default function PookieModelMobile() {
  const [mounted, setMounted] = useState(false)
  
  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) return null
  
  return (
    <Canvas
      shadows
      gl={{ antialias: true, alpha: true }}
      dpr={[1, 1.5]} // Lower DPR for mobile performance
      style={{ 
        background: 'transparent',
        touchAction: 'none', // Prevents scroll interference
        height: '100%',
        width: '100%',
      }}
    >
      {/* Optimized camera setup for mobile */}
      <PerspectiveCamera
        makeDefault
        position={[0, -2, 7]} // Moved up by 1 on Y axis
        fov={50}
        near={0.1}
        far={1000}
      />
      
      <ambientLight intensity={0.3} /> {/* Reduced ambient light to make strobe more prominent */}
      <pointLight position={[10, 10, 10]} intensity={0.4} />
      
      {/* Add strobe light */}
      <StrobeLight />
      
      <PookieModel />
      
      <OrbitControls 
        enableZoom={false}
        enablePan={false}
        rotateSpeed={0.4}
        minPolarAngle={Math.PI / 2.5}
        maxPolarAngle={Math.PI / 1.8}
        dampingFactor={0.1}
        enableDamping
      />
    </Canvas>
  )
}

useGLTF.preload('/models/POOKIE.glb') 