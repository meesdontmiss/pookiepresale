"use client"

import { useState, useEffect, useRef, Suspense } from "react"
import { Canvas } from "@react-three/fiber"
import { useGLTF, OrbitControls, Stage, useAnimations } from "@react-three/drei"
import Image from "next/image"
import { ErrorBoundary } from "react-error-boundary"

interface ModelProps {
  modelPath: string
  scale?: number
  position?: [number, number, number]
  rotation?: [number, number, number]
  autoRotate?: boolean
}

function Model({ modelPath, scale = 1, position = [0, 0, 0], rotation = [0, 0, 0], autoRotate = false }: ModelProps) {
  const groupRef = useRef(null)

  // Use error boundary to catch GLTF loading errors
  const { scene, animations } = useGLTF(modelPath)
  const { actions } = useAnimations(animations, groupRef)

  useEffect(() => {
    // Play the first animation if available
    if (animations.length > 0 && actions) {
      const firstAnimation = Object.keys(actions)[0]
      if (firstAnimation) {
        actions[firstAnimation]?.play()
      }
    }
  }, [actions, animations])

  return (
    <group ref={groupRef} dispose={null}>
      <primitive object={scene} scale={scale} position={position} rotation={rotation} />
    </group>
  )
}

interface ModelViewerProps {
  modelPath: string
  fallbackImagePath: string
  className?: string
  autoRotate?: boolean
}

function FallbackImage({ imagePath, className }: { imagePath: string; className?: string }) {
  return (
    <div className={`relative ${className} flex items-center justify-center`}>
      <Image src={imagePath || "/placeholder.svg"} alt="Model placeholder" fill className="object-contain" />
    </div>
  )
}

export function ModelViewer({ modelPath, fallbackImagePath, className, autoRotate = false }: ModelViewerProps) {
  const [modelExists, setModelExists] = useState<boolean | null>(null)

  useEffect(() => {
    // Check if the model file exists
    const checkModelExists = async () => {
      try {
        const response = await fetch(modelPath, { method: "HEAD" })
        setModelExists(response.ok)
      } catch (error) {
        setModelExists(false)
      }
    }

    checkModelExists()
  }, [modelPath])

  // Show fallback image while checking or if model doesn't exist
  if (modelExists === null || modelExists === false) {
    return <FallbackImage imagePath={fallbackImagePath} className={className} />
  }

  return (
    <div className={`${className}`}>
      <ErrorBoundary fallback={<FallbackImage imagePath={fallbackImagePath} className={className} />}>
        <Canvas shadows dpr={[1, 2]} camera={{ fov: 45 }}>
          <color attach="background" args={["transparent"]} />
          <Stage environment="city" intensity={0.5}>
            <Suspense fallback={null}>
              <Model modelPath={modelPath} scale={2} autoRotate={autoRotate} />
            </Suspense>
          </Stage>
          <OrbitControls
            autoRotate={autoRotate}
            enableZoom={true}
            enablePan={false}
            minPolarAngle={Math.PI / 4}
            maxPolarAngle={Math.PI / 1.5}
          />
        </Canvas>
      </ErrorBoundary>
    </div>
  )
}

