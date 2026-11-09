import type { ReactElement } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { Box, CircleDot, Grid3X3, Maximize2, Minimize2, Move3d, Palette, RotateCcw, Sun } from 'lucide-react'
import type { GeometryPayload, ModelAsset } from '@shared/types'
import { cn } from '@renderer/lib/cn'

type BgMode = 'dark' | 'light' | 'studio'
type MaterialMode = 'clay' | 'amber' | 'metal' | 'normals'

const BG: Record<BgMode, { color: string; grid: [number, number] }> = {
  dark: { color: '#141619', grid: [0x2b3038, 0x1c2026] },
  light: { color: '#E9E9E6', grid: [0xb8b8b2, 0xd3d3cd] },
  studio: { color: '#1D2027', grid: [0x3b414d, 0x282d36] }
}

function Controls(): ReactElement | null {
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  const ref = useRef<OrbitControls | null>(null)

  useEffect(() => {
    const controls = new OrbitControls(camera, gl.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.09
    controls.rotateSpeed = 0.75
    controls.zoomSpeed = 0.9
    controls.panSpeed = 0.7
    controls.minDistance = 0.6
    controls.maxDistance = 60
    controls.target.set(0, 0.06, 0)
    controls.update()
    ref.current = controls
    return () => {
      controls.dispose()
      ref.current = null
    }
  }, [camera, gl])

  useFrame(() => {
    ref.current?.update()
  })

  useEffect(() => {
    const el = gl.domElement
    const prevent = (e: Event): void => e.preventDefault()
    el.addEventListener('contextmenu', prevent)
    return () => el.removeEventListener('contextmenu', prevent)
  }, [gl])

  return null
}

function CameraRig({
  mode,
  radius,
  resetToken
}: {
  mode: 'persp' | 'ortho'
  radius: number
  resetToken: number
}): ReactElement {
  const set = useThree((s) => s.set)
  const size = useThree((s) => s.size)

  useEffect(() => {
    const aspect = size.width / Math.max(1, size.height)
    const dist = (radius / Math.sin((34 * Math.PI) / 180 / 2)) * 1.02
    if (mode === 'persp') {
      const cam = new THREE.PerspectiveCamera(34, aspect, 0.01, radius * 200)
      cam.position.set(dist * 0.62, dist * 0.46, dist * 0.72)
      cam.lookAt(0, 0, 0)
      cam.updateProjectionMatrix()
      set({ camera: cam })
    } else {
      const span = radius * 2.25
      const cam = new THREE.OrthographicCamera((-span * aspect) / 2, (span * aspect) / 2, span / 2, -span / 2, 0.01, radius * 200)
      cam.position.set(dist * 0.62, dist * 0.46, dist * 0.72)
      cam.lookAt(0, 0, 0)
      cam.updateProjectionMatrix()
      set({ camera: cam })
    }
  }, [mode, radius, size.width, size.height, resetToken, set])

  return <></>
}

function ModelMesh({
  geometry,
  material,
  wireframe
}: {
  geometry: THREE.BufferGeometry
  material: MaterialMode
  wireframe: boolean
}): ReactElement {
  const materialNode = useMemo(() => {
    switch (material) {
      case 'amber':
        return <meshStandardMaterial color="#C7D2FF" roughness={0.34} metalness={0.25} wireframe={wireframe} side={THREE.DoubleSide} />
      case 'metal':
        return <meshStandardMaterial color="#D5D8DE" roughness={0.18} metalness={0.92} wireframe={wireframe} side={THREE.DoubleSide} />
      case 'normals':
        return <meshNormalMaterial flatShading={false} wireframe={wireframe} side={THREE.DoubleSide} />
      default:
        return <meshStandardMaterial color="#C9CCD3" roughness={0.46} metalness={0.08} wireframe={wireframe} side={THREE.DoubleSide} />
    }
  }, [material, wireframe])

  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      {materialNode}
    </mesh>
  )
}

export interface ModelViewerProps {
  model: ModelAsset | null
  payload: GeometryPayload | null
  loading: boolean
  error: string | null
  className?: string
  compact?: boolean
}

export function ModelViewer({ model, payload, loading, error, className, compact }: ModelViewerProps): ReactElement {
  const [bg, setBg] = useState<BgMode>('dark')
  const [material, setMaterial] = useState<MaterialMode>('clay')
  const [wireframe, setWireframe] = useState(false)
  const [showGrid, setShowGrid] = useState(true)
  const [showAxes, setShowAxes] = useState(false)
  const [projection, setProjection] = useState<'persp' | 'ortho'>('persp')
  const [fullscreen, setFullscreen] = useState(false)
  const [resetToken, setResetToken] = useState(0)

  const geometry = useMemo(() => {
    if (!payload) return null
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(payload.positions, 3))
    const normals = payload.normals
    if (normals && normals.length === payload.positions.length) {
      g.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
    }
    else g.computeVertexNormals()
    if (payload.indices && payload.indices.length > 0) {
      g.setIndex(new THREE.BufferAttribute(payload.indices, 1))
    }
    g.computeBoundingBox()
    g.computeBoundingSphere()
    return g
  }, [payload])

  useEffect(() => {
    return () => {
      geometry?.dispose()
    }
  }, [geometry])

  const norm = useMemo(() => {
    if (!payload || !geometry) return { scale: 1, center: new THREE.Vector3(), radius: 1.4 }
    const b = payload.bounds
    const maxDim = Math.max(b.x, b.y, b.z, 0.0001)
    const scale = 2 / maxDim
    const center = geometry.boundingBox
      ? geometry.boundingBox.getCenter(new THREE.Vector3())
      : new THREE.Vector3()
    return { scale, center, radius: Math.max(1.25, (2 * Math.sqrt(3)) / 2) }
  }, [payload, geometry])

  const overlay = !payload || loading || error

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-lg border border-white/[0.07]',
        fullscreen && 'fixed inset-0 z-40 rounded-none border-0',
        className
      )}
      style={{ backgroundColor: BG[bg].color }}
    >
      {geometry && payload ? (
        <Canvas
          dpr={[1, 2]}
          gl={{ antialias: true, preserveDrawingBuffer: true, alpha: false }}
          onCreated={({ gl }) => {
            gl.setClearColor(BG[bg].color)
          }}
        >
          <color attach="background" args={[BG[bg].color]} />
          <CameraRig mode={projection} radius={norm.radius} resetToken={resetToken} />
          <Controls />
          <ambientLight intensity={bg === 'light' ? 1.15 : 0.55} />
          <hemisphereLight args={['#ffffff', '#2a2e38', bg === 'light' ? 1.1 : 0.7]} />
          <directionalLight position={[4, 7, 5]} intensity={bg === 'light' ? 2.2 : 2.6} castShadow={false} />
          <directionalLight position={[-5, 3, -4]} intensity={0.85} color="#8FA6C4" />
          <group scale={norm.scale}>
            <group rotation={[-Math.PI / 2, 0, 0]}>
              <group position={[-norm.center.x, -norm.center.y, -norm.center.z]}>
                <ModelMesh geometry={geometry} material={material} wireframe={wireframe} />
              </group>
            </group>
          </group>
          {showGrid ? (
            <gridHelper args={[8, 24, BG[bg].grid[0], BG[bg].grid[1]]} position={[0, -1.12, 0]} />
          ) : null}
          {showAxes ? <axesHelper args={[1.45]} position={[0, -1.1, 0]} /> : null}
        </Canvas>
      ) : null}

      {overlay ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 text-center">
          {loading ? (
            <>
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/10 border-t-accent/80" />
              <p className="text-[11px] text-ink-400">解析几何数据…</p>
            </>
          ) : error ? (
            <>
              <Box size={18} className="text-warn/70" />
              <p className="max-w-[220px] text-[11px] leading-relaxed text-warn/80">{error}</p>
            </>
          ) : (
            <>
              <Move3d size={18} className="text-ink-500" />
              <p className="text-[11px] text-ink-500">选择一个模型查看 3D 预览</p>
            </>
          )}
        </div>
      ) : null}

      {geometry ? (
        <div className="pointer-events-none absolute left-2 top-2 flex items-center gap-1.5 opacity-70">
          <span className="rounded bg-black/25 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-white/60">
            {projection === 'ortho' ? '正交' : '透视'}
          </span>
          {payload ? (
            <span className="rounded bg-black/25 px-1.5 py-0.5 text-[9px] tabular-nums text-white/50">
              {payload.triangles.toLocaleString()} 面
            </span>
          ) : null}
        </div>
      ) : null}

      {geometry ? (
        <div className="absolute right-2 top-2 flex flex-col gap-1">
          <ViewerButton
            title="重置视角"
            onClick={() => {
              setResetToken((n) => n + 1)
            }}
          >
            <RotateCcw size={12} />
          </ViewerButton>
          <ViewerButton title={projection === 'persp' ? '切换正交视图' : '切换透视视图'} onClick={() => setProjection((p) => (p === 'persp' ? 'ortho' : 'persp'))}>
            <CircleDot size={12} />
          </ViewerButton>
          <ViewerButton title="材质" onClick={() => setMaterial(nextMaterial(material))}>
            <Palette size={12} />
          </ViewerButton>
          <ViewerButton title="线框" active={wireframe} onClick={() => setWireframe((v) => !v)}>
            <Grid3X3 size={12} />
          </ViewerButton>
          <ViewerButton title="背景" onClick={() => setBg((b) => (b === 'dark' ? 'studio' : b === 'studio' ? 'light' : 'dark'))}>
            <Sun size={12} />
          </ViewerButton>
          <ViewerButton title={fullscreen ? '退出全屏' : '全屏预览'} onClick={() => setFullscreen((v) => !v)}>
            {fullscreen ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
          </ViewerButton>
        </div>
      ) : null}

      {geometry && !compact ? (
        <div className="absolute bottom-2 left-2 flex items-center gap-1">
          <ToggleChip active={showGrid} onClick={() => setShowGrid((v) => !v)}>
            地面网格
          </ToggleChip>
          <ToggleChip active={showAxes} onClick={() => setShowAxes((v) => !v)}>
            坐标轴
          </ToggleChip>
        </div>
      ) : null}

      {fullscreen ? (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-md bg-black/40 px-3 py-1 text-[10.5px] text-white/60">
          {model?.filename} · 拖动旋转，滚轮缩放，右键平移 · Esc 退出
        </div>
      ) : null}

      <FullscreenEscape active={fullscreen} onExit={() => setFullscreen(false)} />
    </div>
  )
}

function nextMaterial(current: MaterialMode): MaterialMode {
  const order: MaterialMode[] = ['clay', 'amber', 'metal', 'normals']
  return order[(order.indexOf(current) + 1) % order.length]
}

function ViewerButton({
  children,
  title,
  onClick,
  active
}: {
  children: ReactElement
  title: string
  onClick: () => void
  active?: boolean
}): ReactElement {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        'no-drag grid h-[22px] w-[22px] place-items-center rounded bg-black/30 text-white/55 backdrop-blur-sm transition-colors',
        'hover:bg-black/50 hover:text-white/90',
        active && 'bg-accent/25 text-accent'
      )}
    >
      {children}
    </button>
  )
}

function ToggleChip({
  children,
  active,
  onClick
}: {
  children: ReactElement | string
  active: boolean
  onClick: () => void
}): ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'no-drag rounded px-1.5 py-[3px] text-[9.5px] backdrop-blur-sm transition-colors',
        active ? 'bg-black/45 text-white/80' : 'bg-black/20 text-white/40 hover:text-white/70'
      )}
    >
      {children}
    </button>
  )
}

function FullscreenEscape({ active, onExit }: { active: boolean; onExit: () => void }): ReactElement {
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onExit()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, onExit])
  return <></>
}
