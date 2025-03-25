"use client"

import React, { useRef, useEffect, useState } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useGLTF, OrbitControls } from '@react-three/drei'

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
      camera.position.set(0, 0, 5)
      camera.lookAt(0, 0, 0)
    }
  }, [camera])

  // Simple rotation animation
  useFrame(() => {
    if (modelRef.current) {
      modelRef.current.rotation.y += 0.003
    }
  })
  
  return (
    <group ref={modelRef} position={[0, -0.5, 0]} rotation={[0, 0, 0]}>
      <primitive object={scene} scale={2.3} />
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
      dpr={[1, 2]} // Lower DPR for mobile performance
      camera={{ position: [0, 0, 5], fov: 45 }}
      style={{ background: 'transparent' }}
    >
      <ambientLight intensity={0.5} />
      <pointLight position={[10, 10, 10]} intensity={1} />
      <spotLight position={[0, 10, 0]} intensity={1.5} />
      
      <PookieModel />
      
      <OrbitControls 
        enableZoom={false}
        enablePan={false}
        rotateSpeed={0.5}
        minPolarAngle={Math.PI / 3}
        maxPolarAngle={Math.PI / 1.5}
      />
    </Canvas>
  )
}

useGLTF.preload('/models/POOKIE.glb') 