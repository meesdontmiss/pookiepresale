"use client"

import { Suspense, useRef, useState, useEffect } from "react"
import { Canvas, useFrame, useThree } from "@react-three/fiber"
import { 
  OrbitControls, 
  useGLTF, 
  Environment, 
  ContactShadows, 
  Sparkles,
  Float,
  PerformanceMonitor,
  AdaptiveDpr,
  Html,
  Cloud
} from "@react-three/drei"
import { ErrorBoundary } from "react-error-boundary"
import * as THREE from "three"
import type { Group, Vector3, Mesh, Object3D } from "three"
import { useSpring, animated } from "@react-spring/three"
import { Vector3 as ThreeVector3, MathUtils } from "three"
import { useAudio, playSound, playClickSound } from "@/hooks/use-audio"

// Audio paths - support both MP3 and WAV formats
const CLICK_SOUND_PATH = '/sounds/click-sound.wav'

// Progress component for use outside Canvas
function LoadingIndicator() {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="bg-background/80 backdrop-blur-md p-4 rounded-lg border border-primary/20">
        <div className="text-primary font-bold text-lg">Loading model...</div>
      </div>
    </div>
  )
}

// Model component that loads the POOKIE.glb file with mouse interaction
function PookieModel({ mousePosition }: { mousePosition: React.RefObject<{x: number, y: number}> }) {
  const groupRef = useRef<Group>(null)
  const { viewport } = useThree()
  
  // Spring animation for hover effect
  const [hover, setHover] = useState(false)
  const springProps = useSpring({
    scale: hover ? [1.1, 1.1, 1.1] : [1, 1, 1],
    config: { mass: 2, tension: 300, friction: 30 }
  })
  
  // Fluid underwater movement springs
  const [{ wobble }, setWobble] = useSpring(() => ({ 
    wobble: 0,
    config: { mass: 3, tension: 25, friction: 20 }
  }))
  
  // Set initial rotation for a more dramatic tilt
  useEffect(() => {
    if (groupRef.current) {
      // Set initial rotation values to appear more tilted
      groupRef.current.rotation.x = 0.25; // Initial forward tilt
      groupRef.current.rotation.y = 0.1;
      groupRef.current.rotation.z = -0.05;
    }
  }, []);
  
  // Add subtle animation and mouse follow with fluid motion
  useFrame((state) => {
    if (groupRef.current) {
      // Add slow breathing/floating animation
      const t = state.clock.getElapsedTime()
      
      // Mouse follow effect - gentle with fluid underwater feel
      if (mousePosition.current) {
        // Calculate a more dramatic response for mouse movement
        const targetRotX = mousePosition.current.y * -1.0 // Much stronger vertical rotation
        const targetRotY = mousePosition.current.x * 1.2  // Maintain horizontal rotation strength
        const targetRotZ = mousePosition.current.x * -0.4 // Slightly stronger Z rotation
        
        // More fluid, faster movement for increased responsiveness
        groupRef.current.rotation.x = MathUtils.lerp(
          groupRef.current.rotation.x,
          targetRotX + 0.25, // Add base tilt value to target rotation
          0.2 // Significantly increased responsiveness (was 0.08)
        )
        
        groupRef.current.rotation.y = MathUtils.lerp(
          groupRef.current.rotation.y,
          targetRotY,
          0.25  // Significantly increased responsiveness (was 0.1)
        )
        
        groupRef.current.rotation.z = MathUtils.lerp(
          groupRef.current.rotation.z,
          targetRotZ,
          0.2 // Significantly increased responsiveness (was 0.07)
        )
        
        // Add more pronounced position drift toward mouse
        groupRef.current.position.x = MathUtils.lerp(
          groupRef.current.position.x,
          mousePosition.current.x * 0.8, // Stronger horizontal drift
          0.15 // Faster response (was 0.06)
        )
        
        // Add vertical position drift with inverted movement
        groupRef.current.position.y = MathUtils.lerp(
          groupRef.current.position.y,
          mousePosition.current.y * -0.6 + Math.sin(t * 0.4) * 0.2, // Stronger vertical drift
          0.12 // Faster response (was 0.04)
        )
      }
    }
  })

  // Load the GLB model
  const { scene } = useGLTF("/models/POOKIE.glb")

  // Handle drag interactions
  const [isDragging, setIsDragging] = useState(false)
  const dragStart = useRef({ x: 0, y: 0 })
  const previousPosition = useRef({ x: 0, y: 0 })

  const handlePointerDown = (e: React.PointerEvent<Object3D | Mesh>) => {
    e.stopPropagation()
    setIsDragging(true)
    dragStart.current = { x: e.clientX, y: e.clientY }
    
    if (groupRef.current) {
      previousPosition.current = { 
        x: groupRef.current.position.x, 
        y: groupRef.current.position.y 
      }
    }
    
    // Play click sound when model is clicked
    playClickSound()
    
    // Trigger wobble effect when clicked
    setWobble({ wobble: 1, config: { friction: 15 } })
    setTimeout(() => setWobble({ wobble: 0, config: { friction: 20 } }), 100)
  }

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      if (isDragging && groupRef.current) {
        // Calculate deltas
        const deltaX = (e.clientX - dragStart.current.x) / 100
        const deltaY = (e.clientY - dragStart.current.y) / 100
        
        // Apply with a fluid, springy motion
        groupRef.current.position.x = previousPosition.current.x + deltaX
        groupRef.current.position.y = previousPosition.current.y - deltaY
      }
    }
    
    const handlePointerUp = () => {
      setIsDragging(false)
      // Add a gentle spring back to center
      if (groupRef.current) {
        // Store final position
        previousPosition.current = { 
          x: groupRef.current.position.x, 
          y: groupRef.current.position.y 
        }
      }
    }
    
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [isDragging])

  return (
    <group ref={groupRef} position={[0, -1.2, 0]}>
      <Float 
        speed={1.5}
        rotationIntensity={0.3}
        floatIntensity={0.4}
        floatingRange={[0, 0.5]}
      >
        <animated.group 
          scale={springProps.scale as any} 
          onPointerOver={() => setHover(true)} 
          onPointerOut={() => setHover(false)}
          onPointerDown={handlePointerDown}
          rotation-x={wobble.to(v => v * 0.05)}
          rotation-z={wobble.to(v => v * -0.05)}
        >
          <primitive 
            object={scene} 
            scale={[1.5, 1.5, 1.5]} 
            position={[0, -2.0, 0]} 
            rotation={[0.3, 0, 0]} 
          />
        </animated.group>
      </Float>
      
      {/* Snow directly surrounding Pookie */}
      <Sparkles 
        count={1000}
        scale={20}
        size={1.5}
        speed={0.08}
        opacity={0.8}
        color="white"
        noise={0.03}
        position={[0, 0, 0]}
      />
      
      {/* Additional foreground snow */}
      <Sparkles 
        count={500}
        scale={15}
        size={1.2}
        speed={0.1}
        opacity={0.7}
        color="white"
        noise={0.05}
        position={[0, 0, 5]}
      />
      
      {/* Background snow layer */}
      <Sparkles 
        count={800}
        scale={25}
        size={1.0}
        speed={0.06}
        opacity={0.6}
        color="white"
        noise={0.04}
        position={[0, 0, -5]}
      />
    </group>
  )
}

// Fallback component in case the model fails to load - using Three.js mesh
function FallbackModel() {
  return (
    <mesh>
      <sphereGeometry args={[1.5, 32, 32]} />
      <meshStandardMaterial color="#00ff88" emissive="#00ff44" emissiveIntensity={0.2} />
    </mesh>
  )
}

// Igloo component to house Pookie
function Igloo() {
  const { scene } = useGLTF("/models/IGLOO.glb")
  
  return (
    <primitive 
      object={scene} 
      scale={[3.5, 3.5, 3.5]} 
      position={[0, -15.0, -25.0]} 
      rotation={[0, Math.PI, 0]} 
    />
  )
}

// Main scene component
export function PookieScene() {
  const mousePosition = useRef<{x: number, y: number}>({ x: 0, y: 0 })
  const [dpr, setDpr] = useState(1.5)
  const [isClient, setIsClient] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  
  // Set isClient to true on component mount
  useEffect(() => {
    // Preload GLB model on client side only
    useGLTF.preload("/models/POOKIE.glb")
    useGLTF.preload("/models/IGLOO.glb")
    setIsClient(true)
    
    // Simulate model loading completion
    const timer = setTimeout(() => {
      setIsLoading(false)
    }, 1000)
    
    return () => clearTimeout(timer)
  }, [])
  
  // Track mouse position for interactive effects
  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      // Calculate normalized mouse position (-1 to 1) with increased sensitivity
      // Using a wider range to make the model more responsive to mouse position
      mousePosition.current = {
        x: ((event.clientX / window.innerWidth) * 2 - 1) * 1.3, // Increase range by 30%
        y: (-(event.clientY / window.innerHeight) * 2 + 1) * 1.3 // Increase range by 30%
      }
    }
    
    // Use passive option for better performance
    window.addEventListener('mousemove', handleMouseMove, { passive: true })
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [])

  // Only render the Canvas on the client to avoid hydration mismatch
  if (!isClient) {
    return (
      <div className="w-full h-full bg-background flex items-center justify-center">
        <div className="text-primary">Loading 3D scene...</div>
      </div>
    )
  }

  return (
    <ErrorBoundary fallback={<div>Something went wrong with the 3D scene</div>}>
      <div 
        className="relative w-full h-full" 
        id="pookie-canvas-container"
        onClick={(e) => {
          // Don't capture clicks in the top 60px (header area)
          if (e.clientY < 60) {
            e.stopPropagation();
          }
        }}
      >
        {isLoading && <LoadingIndicator />}
        
        <Canvas
          camera={{ position: [0, 0, 16], fov: 35 }} 
          style={{ touchAction: "none", colorScheme: "dark", pointerEvents: "auto" }}
          dpr={dpr}
        >
          <color attach="background" args={["#081020"]} />
          
          <PerformanceMonitor 
            onDecline={() => setDpr(1)} 
            onIncline={() => setDpr(1.5)}
          >
            <AdaptiveDpr pixelated />
          </PerformanceMonitor>
          
          {/* Enhanced dramatic lighting for snow scene */}
          <ambientLight intensity={0.5} />
          <spotLight 
            position={[10, 15, 10]} 
            angle={0.3} 
            penumbra={1} 
            intensity={1.5} 
            castShadow 
            color="#c4e0ff"
          />
          <spotLight 
            position={[-10, 5, -10]} 
            angle={0.25} 
            penumbra={1} 
            intensity={0.8} 
            castShadow 
            color="#e0f0ff"
          />
          {/* Dramatic overhead light for snow effect */}
          <spotLight
            position={[0, 10, 0]}
            angle={0.7}
            penumbra={1}
            intensity={0.7}
            color="#ffffff"
          />
          <pointLight position={[5, -10, 5]} intensity={0.8} color="#8ca8ff" />

          <Suspense fallback={<FallbackModel />}>
            <PookieModel mousePosition={mousePosition} />
            <Igloo />
            <Environment preset="night" />
            <ContactShadows 
              position={[0, -3.0, 0]} 
              opacity={0.3} 
              scale={15} 
              blur={3} 
              far={10}
              color="#a0c0ff"
            />
          </Suspense>

          <OrbitControls
            makeDefault
            enableZoom={true}
            enablePan={false}
            enableRotate={true}
            minPolarAngle={Math.PI / 6}
            maxPolarAngle={Math.PI / 1.2}
            rotateSpeed={1.0}
            zoomSpeed={0.7}
            dampingFactor={0.1}
            enableDamping={true}
            // Ignore pointer events from navigation element
            domElement={document.getElementById('pookie-canvas-container') || undefined}
          />
        </Canvas>
      </div>
    </ErrorBoundary>
  )
}

