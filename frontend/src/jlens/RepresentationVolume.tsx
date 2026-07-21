import { Canvas, type ThreeEvent, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'

import type { JacobianLensResponse } from '../api'
import {
  createRepresentationVolume,
  type JLensSelection,
  type RepresentationCell,
} from './volumeModel'

type CameraPreset = 'perspective' | 'top' | 'layer'

type RepresentationVolumeProps = {
  result: JacobianLensResponse
  selectedTokenId?: number
  selectedTokenColor?: string
  selection: JLensSelection
  onSelect: (selection: JLensSelection) => void
  compact?: boolean
}

const cleanToken = (text: string) => text.replaceAll(' ', '·') || '∅'

function supportsWebGL() {
  if (typeof window === 'undefined' || typeof window.WebGLRenderingContext === 'undefined') return false

  try {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'))
  } catch {
    return false
  }
}

function cameraPosition(preset: CameraPreset, extent: number): [number, number, number] {
  if (preset === 'top') return [0, 0, extent * 2]
  if (preset === 'layer') return [0, extent * 1.35, extent * 1.25]
  return [extent * 0.9, extent * 0.72, extent * 1.18]
}

function CameraRig({ preset, fitZoom, extent }: { preset: CameraPreset; fitZoom: number; extent: number }) {
  const camera = useThree((state) => state.camera)
  const invalidate = useThree((state) => state.invalidate)

  useEffect(() => {
    camera.position.set(...cameraPosition(preset, extent))
    camera.lookAt(0, 0, 0)
    if (camera instanceof THREE.OrthographicCamera) camera.zoom = fitZoom
    camera.updateProjectionMatrix()
    invalidate()
  }, [camera, extent, fitZoom, invalidate, preset])

  return (
    <OrbitControls
      makeDefault
      enableDamping
      dampingFactor={0.08}
      enablePan
      minZoom={Math.max(2, fitZoom * 0.35)}
      maxZoom={fitZoom * 4}
      regress
    />
  )
}

function LayerGuides({ layerCount, positionCount }: { layerCount: number; positionCount: number }) {
  const width = Math.max(1, (positionCount - 1) * 0.48 + 0.5)
  const startX = -width / 2

  return (
    <group>
      {Array.from({ length: layerCount }, (_, rowIndex) => {
        const y = (rowIndex - (layerCount - 1) / 2) * 0.62
        return (
          <mesh key={rowIndex} position={[0, y, -0.045]} raycast={() => null}>
            <boxGeometry args={[width, 0.018, 0.02]} />
            <meshBasicMaterial color="#38505a" transparent opacity={0.36} />
          </mesh>
        )
      })}
      <mesh position={[startX, 0, -0.04]} raycast={() => null}>
        <boxGeometry args={[0.018, Math.max(1, layerCount * 0.62), 0.02]} />
        <meshBasicMaterial color="#78909a" transparent opacity={0.42} />
      </mesh>
    </group>
  )
}

function VolumeCells({
  cells,
  layerCount,
  positionCount,
  selection,
  signalColor,
  onHover,
  onSelect,
}: {
  cells: RepresentationCell[]
  layerCount: number
  positionCount: number
  selection: JLensSelection
  signalColor: string
  onHover: (cell: RepresentationCell | null) => void
  onSelect: (selection: JLensSelection) => void
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const transform = useMemo(() => new THREE.Object3D(), [])
  const invalidate = useThree((state) => state.invalidate)
  const selectedCell = cells.find(
    (cell) => selection.rowIndex === cell.rowIndex && selection.position === cell.position,
  )

  useEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return

    cells.forEach((cell, index) => {
      const height = 0.08 + cell.intensity * 1.55
      transform.position.set(
        (cell.position - (positionCount - 1) / 2) * 0.48,
        (cell.rowIndex - (layerCount - 1) / 2) * 0.62,
        height / 2,
      )
      transform.scale.set(0.39, 0.34, height)
      transform.updateMatrix()
      mesh.setMatrixAt(index, transform.matrix)
    })

    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
    invalidate()
  }, [cells, invalidate, layerCount, positionCount, transform])

  const cellFromEvent = (event: ThreeEvent<PointerEvent | MouseEvent>) =>
    event.instanceId == null ? null : cells[event.instanceId] ?? null

  const selectedHeight = selectedCell ? 0.08 + selectedCell.intensity * 1.55 : 0

  return (
    <>
      <instancedMesh
        ref={meshRef}
        args={[undefined, undefined, cells.length]}
        onPointerMove={(event) => {
          event.stopPropagation()
          onHover(cellFromEvent(event))
        }}
        onPointerOut={() => onHover(null)}
        onClick={(event) => {
          event.stopPropagation()
          const cell = cellFromEvent(event)
          if (cell) onSelect({ rowIndex: cell.rowIndex, position: cell.position })
        }}
      >
        <boxGeometry />
        <meshBasicMaterial color="#35cbd2" transparent opacity={0.82} toneMapped={false} />
      </instancedMesh>
      {selectedCell && (
        <mesh
          position={[
            (selectedCell.position - (positionCount - 1) / 2) * 0.48,
            (selectedCell.rowIndex - (layerCount - 1) / 2) * 0.62,
            selectedHeight / 2,
          ]}
          scale={[0.43, 0.38, selectedHeight + 0.04]}
          raycast={() => null}
        >
          <boxGeometry />
          <meshBasicMaterial color={signalColor} wireframe toneMapped={false} />
        </mesh>
      )}
    </>
  )
}

export function RepresentationVolume({
  result,
  selectedTokenId,
  selectedTokenColor = '#27c4ca',
  selection,
  onSelect,
  compact = false,
}: RepresentationVolumeProps) {
  const [preset, setPreset] = useState<CameraPreset>('perspective')
  const [hovered, setHovered] = useState<RepresentationCell | null>(null)
  const [webglAvailable] = useState(supportsWebGL)
  const volume = useMemo(
    () => createRepresentationVolume(result, selectedTokenId),
    [result, selectedTokenId],
  )
  const selectedCell = volume.cells.find(
    (cell) => cell.rowIndex === selection.rowIndex && cell.position === selection.position,
  )
  const inspectedCell = hovered ?? selectedCell
  const width = Math.max(1, volume.positionCount * 0.48)
  const height = Math.max(1, volume.layerCount * 0.62)
  const extent = Math.max(7, width, height)
  const fitZoom = Math.max(5, Math.min(56, 440 / (extent * 1.35)))

  return (
    <section className={`representation-volume ${compact ? 'is-compact' : ''}`} aria-labelledby="volume-title">
      <header>
        <div>
          <p>Interactive representation volume</p>
          <h3 id="volume-title">{cleanToken(volume.selectedTokenText)} · rank landscape</h3>
        </div>
        <div className="volume-camera-controls" aria-label="Camera preset">
          {(['perspective', 'top', 'layer'] as CameraPreset[]).map((cameraPreset) => (
            <button
              key={cameraPreset}
              type="button"
              className={preset === cameraPreset ? 'is-active' : ''}
              onClick={() => setPreset(cameraPreset)}
            >
              {cameraPreset}
            </button>
          ))}
        </div>
      </header>

      <div className="volume-stage">
        {webglAvailable ? (
          <Canvas
            orthographic
            frameloop="demand"
            dpr={[1, 1.75]}
            camera={{ near: 0.1, far: extent * 10, position: cameraPosition(preset, extent), zoom: fitZoom }}
            gl={{ antialias: true, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: true }}
            onPointerMissed={() => setHovered(null)}
            aria-label="Interactive three-dimensional Jacobian Lens rank volume"
          >
            <color attach="background" args={['#071116']} />
            <LayerGuides layerCount={volume.layerCount} positionCount={volume.positionCount} />
            <VolumeCells
              cells={volume.cells}
              layerCount={volume.layerCount}
              positionCount={volume.positionCount}
              selection={selection}
              signalColor={selectedTokenColor}
              onHover={setHovered}
              onSelect={onSelect}
            />
            <CameraRig preset={preset} fitZoom={fitZoom} extent={extent} />
          </Canvas>
        ) : (
          <div className="volume-fallback" role="status">
            <strong>3D rendering is unavailable.</strong>
            <span>The linked table remains the exact, accessible representation of this result.</span>
          </div>
        )}

        <div className="volume-axis volume-axis-x">TOKEN POSITION →</div>
        <div className="volume-axis volume-axis-y">LAYER →</div>
        <div className="volume-legend"><i /> taller column = stronger rank</div>
        {inspectedCell && (
          <aside className="volume-readout" aria-live="polite">
            <small>{inspectedCell.kind === 'model_output' ? 'MODEL OUTPUT' : `LAYER ${inspectedCell.layer}`}</small>
            <strong>POS {inspectedCell.position} · {cleanToken(inspectedCell.inputToken)}</strong>
            <dl>
              <div><dt>Token rank</dt><dd>{inspectedCell.rank.toLocaleString()}</dd></div>
              <div><dt>Argmax</dt><dd>{cleanToken(inspectedCell.prediction)}</dd></div>
              <div><dt>Signal</dt><dd>{Math.round(inspectedCell.intensity * 100)}%</dd></div>
            </dl>
          </aside>
        )}
      </div>

      <footer>
        <span>X position</span><span>Y layer</span><span>Z −log rank</span>
        <strong>Drag to orbit · wheel to zoom · click to link</strong>
      </footer>
    </section>
  )
}
