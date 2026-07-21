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

type CameraPreset = 'overview' | 'top' | 'focus'

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

function cameraPosition(preset: CameraPreset, extent: number, focusY = 0): [number, number, number] {
  if (preset === 'top') return [0, 0, extent * 2]
  if (preset === 'focus') return [extent * 0.72, focusY + extent * 0.22, extent * 0.78]
  return [extent * 0.9, extent * 0.72, extent * 1.18]
}

function CameraRig({ preset, fitZoom, extent, focusY }: { preset: CameraPreset; fitZoom: number; extent: number; focusY: number }) {
  const camera = useThree((state) => state.camera)
  const invalidate = useThree((state) => state.invalidate)
  const targetY = preset === 'focus' ? focusY : 0

  useEffect(() => {
    camera.position.set(...cameraPosition(preset, extent, targetY))
    camera.lookAt(0, targetY, 0)
    if (camera instanceof THREE.OrthographicCamera) {
      camera.zoom = preset === 'focus' ? fitZoom * 2.15 : fitZoom
    }
    camera.updateProjectionMatrix()
    invalidate()
  }, [camera, extent, fitZoom, invalidate, preset, targetY])

  return (
    <OrbitControls
      makeDefault
      enableDamping
      dampingFactor={0.08}
      enablePan
      minZoom={Math.max(2, fitZoom * 0.35)}
      maxZoom={fitZoom * 4}
      target={[0, targetY, 0]}
      regress
    />
  )
}

function LayerStack({
  rows,
  positionCount,
  activeRowIndex,
  selectedPosition,
  onLayerHover,
  onSelect,
}: {
  rows: JacobianLensResponse['rows']
  positionCount: number
  activeRowIndex: number
  selectedPosition: number
  onLayerHover: (rowIndex: number | null) => void
  onSelect: (selection: JLensSelection) => void
}) {
  const layerCount = rows.length
  const width = Math.max(1, (positionCount - 1) * 0.48 + 0.5)
  const spineX = -width / 2 - 0.32

  return (
    <group>
      {rows.map((row, rowIndex) => {
        const y = (rowIndex - (layerCount - 1) / 2) * 0.62
        const active = rowIndex === activeRowIndex
        return (
          <group key={row.layer}>
            <mesh
              position={[0, y, -0.08]}
              onPointerOver={(event) => { event.stopPropagation(); onLayerHover(rowIndex) }}
              onPointerOut={() => onLayerHover(null)}
              onClick={(event) => {
                event.stopPropagation()
                onSelect({ rowIndex, position: selectedPosition })
              }}
            >
              <boxGeometry args={[width, 0.43, 0.055]} />
              <meshBasicMaterial
                color={row.kind === 'model_output' ? '#cfff4b' : active ? '#55dce2' : '#34525c'}
                transparent
                opacity={active ? 0.22 : row.kind === 'model_output' ? 0.15 : 0.075}
                depthWrite={false}
              />
            </mesh>
            <mesh position={[spineX, y, 0.02]} raycast={() => null}>
              <sphereGeometry args={[active ? 0.075 : 0.048, 12, 12]} />
              <meshBasicMaterial color={active ? '#cfff4b' : '#55dce2'} toneMapped={false} />
            </mesh>
          </group>
        )
      })}
      <mesh position={[spineX, 0, 0.02]} raycast={() => null}>
        <boxGeometry args={[0.018, Math.max(1, (layerCount - 1) * 0.62), 0.018]} />
        <meshBasicMaterial color="#55dce2" transparent opacity={0.58} toneMapped={false} />
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
  activeRowIndex,
  onHover,
  onSelect,
}: {
  cells: RepresentationCell[]
  layerCount: number
  positionCount: number
  selection: JLensSelection
  signalColor: string
  activeRowIndex: number
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
      mesh.setColorAt(
        index,
        new THREE.Color(cell.rowIndex === activeRowIndex ? '#55dce2' : '#1a5d67'),
      )
    })

    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingSphere()
    invalidate()
  }, [activeRowIndex, cells, invalidate, layerCount, positionCount, transform])

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
        <meshBasicMaterial vertexColors transparent opacity={0.86} toneMapped={false} />
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
  const [preset, setPreset] = useState<CameraPreset>('overview')
  const [hovered, setHovered] = useState<RepresentationCell | null>(null)
  const [hoveredLayer, setHoveredLayer] = useState<number | null>(null)
  const [webglAvailable] = useState(supportsWebGL)
  const volume = useMemo(
    () => createRepresentationVolume(result, selectedTokenId),
    [result, selectedTokenId],
  )
  const selectedCell = volume.cells.find(
    (cell) => cell.rowIndex === selection.rowIndex && cell.position === selection.position,
  )
  const inspectedCell = hovered ?? selectedCell
  const activeRowIndex = hovered?.rowIndex ?? hoveredLayer ?? selection.rowIndex
  const width = Math.max(1, volume.positionCount * 0.48)
  const height = Math.max(1, volume.layerCount * 0.62)
  const extent = Math.max(7, width, height)
  const fitZoom = Math.max(5, Math.min(56, 440 / (extent * 1.35)))
  const focusY = (selection.rowIndex - (volume.layerCount - 1) / 2) * 0.62

  const focusLayer = (rowIndex: number) => {
    onSelect({ rowIndex, position: selection.position })
    setPreset('focus')
  }

  return (
    <section className={`representation-volume ${compact ? 'is-compact' : ''}`} aria-labelledby="volume-title">
      <header>
        <div>
          <p>Interactive representation volume</p>
          <h3 id="volume-title">{cleanToken(volume.selectedTokenText)} · rank landscape</h3>
          <small>{volume.layerCount} sampled transformer layers · residual path shown at left</small>
        </div>
        <div className="volume-camera-controls" aria-label="Camera preset">
          {(['overview', 'top', 'focus'] as CameraPreset[]).map((cameraPreset) => (
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
            camera={{ near: 0.1, far: extent * 10, position: cameraPosition(preset, extent, focusY), zoom: fitZoom }}
            gl={{ antialias: true, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: true }}
            onPointerMissed={() => setHovered(null)}
            aria-label="Interactive three-dimensional Jacobian Lens rank volume"
          >
            <color attach="background" args={['#071116']} />
            <LayerStack
              rows={result.rows}
              positionCount={volume.positionCount}
              activeRowIndex={activeRowIndex}
              selectedPosition={selection.position}
              onLayerHover={setHoveredLayer}
              onSelect={onSelect}
            />
            <VolumeCells
              cells={volume.cells}
              layerCount={volume.layerCount}
              positionCount={volume.positionCount}
              selection={selection}
              signalColor={selectedTokenColor}
              activeRowIndex={activeRowIndex}
              onHover={setHovered}
              onSelect={onSelect}
            />
            <CameraRig preset={preset} fitZoom={fitZoom} extent={extent} focusY={focusY} />
          </Canvas>
        ) : (
          <div className="volume-fallback" role="status">
            <strong>3D rendering is unavailable.</strong>
            <span>The linked table remains the exact, accessible representation of this result.</span>
          </div>
        )}

        <div className="volume-axis volume-axis-x">TOKEN POSITION →</div>
        <div className="volume-axis volume-axis-y">LAYER →</div>
        <div className="volume-legend"><i /> rank signal <span /> transformer slab</div>
        <nav className="volume-layer-index" aria-label="Transformer layer navigator">
          <header><span>MODEL STACK</span><b>{result.rows[selection.rowIndex]?.kind === 'model_output' ? 'OUTPUT' : `L${result.rows[selection.rowIndex]?.layer}`}</b></header>
          <div>
            {result.rows.map((row, rowIndex) => (
              <button
                key={row.layer}
                type="button"
                className={rowIndex === selection.rowIndex ? 'is-active' : ''}
                aria-pressed={rowIndex === selection.rowIndex}
                onMouseEnter={() => setHoveredLayer(rowIndex)}
                onMouseLeave={() => setHoveredLayer(null)}
                onFocus={() => setHoveredLayer(rowIndex)}
                onBlur={() => setHoveredLayer(null)}
                onClick={() => focusLayer(rowIndex)}
              >
                <i /><span>{row.kind === 'model_output' ? 'OUT' : `L${row.layer}`}</span>
              </button>
            ))}
          </div>
        </nav>
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
        <span>X token position</span><span>Y transformer depth</span><span>Z −log rank</span>
        <strong>Choose a layer · drag to orbit · click a cell to link 2D</strong>
      </footer>
    </section>
  )
}
