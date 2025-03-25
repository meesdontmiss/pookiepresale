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

function PookieModel() {
  const { scene, nodes, materials } = useGLTF('/models/POOKIE.glb') as unknown as GLTFResult
  const modelRef = useRef<THREE.Group>(null)
  const { camera } = useThree()

  // Position camera for better view on mobile
  useEffect(() => {
    if (camera) {
      // Position the camera to properly frame the full body
      camera.position.set(0, -0.5, 7)
      camera.lookAt(0, -0.5, 0)
    }
  }, [camera])

  // Simple rotation animation
  useFrame(() => {
    if (modelRef.current) {
      modelRef.current.rotation.y += 0.003
    }
  })
  
  return (
    <group ref={modelRef} position={[0, -1, 0]} rotation={[0.1, 0, 0]}>
      <primitive object={scene} scale={2.8} />
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
        position={[0, -0.5, 7]}
        fov={45}
        near={0.1}
        far={1000}
      />
      
      <ambientLight intensity={0.6} />
      <pointLight position={[10, 10, 10]} intensity={0.8} />
      <spotLight position={[0, 10, 5]} intensity={1.2} />
      
      <PookieModel />
      
      <OrbitControls 
        enableZoom={false}
        enablePan={false}
        rotateSpeed={0.4}
        minPolarAngle={Math.PI / 3}
        maxPolarAngle={Math.PI / 1.5}
        dampingFactor={0.1}
        enableDamping
      />
    </Canvas>
  )
}

useGLTF.preload('/models/POOKIE.glb') 