import { useState } from 'react'
import ModelViewer from './components/ModelViewer.jsx'

export default function App() {
  const [selectedPoint, setSelectedPoint] = useState(null)
  const [instruction, setInstruction] = useState('')

  return (
    <div className="app">
      <header className="app-header">
        <h1>3D Forge</h1>
        <span className="tagline">
          Click the model to select a region, then describe your edit
        </span>
      </header>
      <main className="app-main">
        <ModelViewer
          modelUrl="/models/robotic_hand.glb"
          onSelectPoint={setSelectedPoint}
        />
        <aside className="sidebar">
          <h2>Spatial prompt</h2>
          <div className="field">
            <label>Selected point</label>
            <code>
              {selectedPoint
                ? `x: ${selectedPoint.x.toFixed(3)}  y: ${selectedPoint.y.toFixed(3)}  z: ${selectedPoint.z.toFixed(3)}`
                : 'nothing selected yet'}
            </code>
          </div>
          <div className="field">
            <label htmlFor="instruction">Instruction</label>
            <textarea
              id="instruction"
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder='e.g. "make this finger longer"'
              rows={4}
            />
          </div>
          <button
            className="submit"
            disabled={!selectedPoint || !instruction.trim()}
            title="Wired up in milestone M3 (Spatial Prompt Engine)"
          >
            Send edit — coming in M3
          </button>
        </aside>
      </main>
    </div>
  )
}
