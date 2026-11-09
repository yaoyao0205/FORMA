import * as THREE from 'three'
import type { GeometryPayload, ModelAsset } from '@shared/types'
import { forma } from '@renderer/lib/api'

const THUMB_SIZE = 420
let renderer: THREE.WebGLRenderer | null = null
let backgroundTexture: THREE.Texture | null = null

function getRenderer(): THREE.WebGLRenderer {
  if (renderer) return renderer
  const canvas = document.createElement('canvas')
  canvas.width = THUMB_SIZE
  canvas.height = THUMB_SIZE
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, preserveDrawingBuffer: true })
  r.setSize(THUMB_SIZE, THUMB_SIZE, false)
  r.setPixelRatio(1)
  r.outputColorSpace = THREE.SRGBColorSpace
  r.toneMapping = THREE.ACESFilmicToneMapping
  r.toneMappingExposure = 1.05
  renderer = r
  return r
}

function getBackground(): THREE.Texture {
  if (backgroundTexture) return backgroundTexture
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const ctx = canvas.getContext('2d')
  if (ctx) {
    const grad = ctx.createRadialGradient(64, 46, 8, 64, 64, 96)
    grad.addColorStop(0, '#22262E')
    grad.addColorStop(0.55, '#171A1F')
    grad.addColorStop(1, '#0E1013')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, 128, 128)
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  backgroundTexture = tex
  return tex
}

export function buildGeometry(payload: GeometryPayload): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(payload.positions, 3))
  const normals = payload.normals
  if (normals && normals.length === payload.positions.length) {
    g.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
  }
  if (payload.indices && payload.indices.length > 0) {
    g.setIndex(new THREE.BufferAttribute(payload.indices, 1))
  }
  g.computeBoundingBox()
  g.computeBoundingSphere()
  return g
}

/** 离屏渲染真实缩略图，返回 dataURL（PNG） */
export async function renderThumbnail(payload: GeometryPayload): Promise<string | null> {
  const geometry = buildGeometry(payload)
  const bounds = geometry.boundingBox
  const center = bounds ? bounds.getCenter(new THREE.Vector3()) : new THREE.Vector3()
  const maxDim = bounds
    ? Math.max(bounds.max.x - bounds.min.x, bounds.max.y - bounds.min.y, bounds.max.z - bounds.min.z, 0.0001)
    : 1
  const scale = 2 / maxDim

  const scene = new THREE.Scene()
  scene.background = getBackground()

  const material = new THREE.MeshStandardMaterial({
    color: 0xd2d5db,
    roughness: 0.4,
    metalness: 0.1,
    flatShading: true,
    side: THREE.DoubleSide
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.scale.setScalar(scale)
  mesh.position.set(-center.x * scale, 0, 0)
  mesh.rotation.x = -Math.PI / 2

  const wrapper = new THREE.Group()
  wrapper.add(mesh)
  wrapper.position.set(0, 0, 0)
  const rotated = new THREE.Group()
  rotated.add(wrapper)
  rotated.position.set(0, 0, 0)
  scene.add(rotated)

  // 让旋转后的模型在竖直方向居中：先算出旋转后的包围盒再回填
  rotated.updateMatrixWorld(true)
  const worldBox = new THREE.Box3().setFromObject(rotated)
  const worldCenter = worldBox.getCenter(new THREE.Vector3())
  rotated.position.set(-worldCenter.x, -worldCenter.y, -worldCenter.z)

  const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 100)
  const sphere = new THREE.Sphere()
  new THREE.Box3().setFromObject(rotated).getBoundingSphere(sphere)
  const radius = Math.max(sphere.radius, 0.3)
  const dist = radius / Math.sin((30 * Math.PI) / 180 / 2) * 0.92
  camera.position.set(dist * 0.54, dist * 0.42, dist * 0.74)
  camera.lookAt(0, 0, 0)

  const ambient = new THREE.AmbientLight(0xffffff, 0.55)
  scene.add(ambient)
  const hemi = new THREE.HemisphereLight(0xffffff, 0x2a2e38, 0.85)
  scene.add(hemi)
  const key = new THREE.DirectionalLight(0xffffff, 2.4)
  key.position.set(3.2, 4.4, 3.6)
  scene.add(key)
  const fill = new THREE.DirectionalLight(0x8fa6c4, 0.9)
  fill.position.set(-3.4, 1.6, -2.8)
  scene.add(fill)
  const rim = new THREE.DirectionalLight(0xB8C6FF, 0.55)
  rim.position.set(-1.6, 2.4, -3.6)
  scene.add(rim)

  const gl = getRenderer()
  try {
    gl.render(scene, camera)
    const dataUrl = gl.domElement.toDataURL('image/png')
    return dataUrl
  } catch {
    return null
  } finally {
    geometry.dispose()
    material.dispose()
  }
}

const attempted = new Set<string>()
let queue: ModelAsset[] = []
let pumping = false

function idle(ms = 60): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function pump(): Promise<void> {
  if (pumping) return
  pumping = true
  try {
    while (queue.length > 0) {
      const model = queue.shift()
      if (!model) break
      if (attempted.has(model.id)) continue
      attempted.add(model.id)
      try {
        const res = await forma.geometry.load({ id: model.id, maxTriangles: 260_000 })
        if (!res.ok || !res.geometry) {
          await idle(20)
          continue
        }
        const dataUrl = await renderThumbnail(res.geometry)
        if (!dataUrl) continue
        const saved = await forma.thumbnail.save({ modelId: model.id, dataUrl })
        if (saved.ok && saved.path) {
          const { useApp } = await import('@renderer/store/useApp')
          useApp.getState().patchModelLocal(model.id, { thumbnail: saved.path })
        }
      } catch {
        // 单张失败不影响队列
      }
      await idle(40)
    }
  } finally {
    pumping = false
  }
}

export function enqueueThumbnails(models: ModelAsset[], limit = 400): void {
  const candidates = models
    .filter((m) => !m.thumbnail && !m.missing && !m.parseError && !attempted.has(m.id))
    .slice(0, limit)
  if (candidates.length === 0) return
  const queuedIds = new Set(queue.map((m) => m.id))
  for (const m of candidates) {
    if (!queuedIds.has(m.id)) queue.push(m)
  }
  void pump()
}

export function thumbnailQueueSize(): number {
  return queue.length
}
