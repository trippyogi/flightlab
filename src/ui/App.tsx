import { Canvas } from '@react-three/fiber';
import { OrbitControls, Text } from '@react-three/drei';
import { Activity, CircleDot, FlaskConical, Gauge, Target } from 'lucide-react';
import { useMemo, useState } from 'react';
import { clsx } from 'clsx';
import { clubDefaults, namedFlight, simulateImpact, type ClubName, type ImpactInputs } from '../sim/impact';
import { simulateGreen } from '../sim/green';
import { modules } from '../modules/registry';
import { useLabStore } from '../store/labStore';

const nf = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });

function ModuleRail() {
  const activeModule = useLabStore((state) => state.activeModule);
  const setActiveModule = useLabStore((state) => state.setActiveModule);
  return (
    <nav className="module-rail" aria-label="flightlab modules">
      <div className="mark"><FlaskConical size={22} /></div>
      {modules.map((module) => (
        <button
          key={module.id}
          type="button"
          className={clsx('rail-button', module.id === activeModule && 'active')}
          onClick={() => setActiveModule(module.id)}
          title={module.title}
        >
          {module.id === 'impact' ? <Gauge size={20} /> : module.id === 'green' ? <CircleDot size={20} /> : <Activity size={20} />}
          <span>{module.title}</span>
        </button>
      ))}
    </nav>
  );
}

type SliderProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (value: number) => void;
};

function Slider({ label, value, min, max, step = 1, unit = '', onChange }: SliderProps) {
  return (
    <label className="control">
      <span>{label}<b>{nf.format(value)}{unit}</b></span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
    </label>
  );
}

function Readout({ label, value, receipt }: { label: string; value: string; receipt?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <button type="button" className="readout" onClick={() => setOpen(!open)} aria-expanded={open}>
      <span>{label}</span>
      <strong>{value}</strong>
      {open && receipt ? <em>{receipt}</em> : null}
    </button>
  );
}

function ImpactScene() {
  const inputs = useLabStore((state) => state.impactInputs);
  const ghosts = useLabStore((state) => state.ghosts);
  const result = useMemo(() => simulateImpact(inputs), [inputs]);
  const sampled = result.points.filter((_, index) => index % 20 === 0).map((point) => point.position);
  return (
    <>
      <ambientLight intensity={0.8} />
      <directionalLight position={[4, 8, 5]} intensity={1.6} />
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.02, 115]}>
        <planeGeometry args={[90, 260]} />
        <meshStandardMaterial color="#6f8468" roughness={0.92} metalness={0.02} />
      </mesh>
      <gridHelper args={[90, 18, '#f5f0e4', '#9aaa91']} position={[0, 0, 115]} />
      <mesh position={[0, 0.25, 0]}>
        <sphereGeometry args={[0.32, 32, 16]} />
        <meshStandardMaterial color="#f7f1e3" roughness={0.46} />
      </mesh>
      <mesh position={[inputs.strikeX * 0.25, 0.8 + inputs.strikeY * 0.1, -1.1]} rotation-y={inputs.faceAngleDeg * Math.PI / 180}>
        <boxGeometry args={[2.4, 1.35, 0.14]} />
        <meshStandardMaterial color="#2a3128" transparent opacity={0.42} roughness={0.82} />
      </mesh>
      {ghosts.map((ghost, index) => (
        <Trajectory key={ghost.id} points={ghost.points} color="#ece4d3" opacity={0.26 - index * 0.025} />
      ))}
      <Trajectory points={sampled} color="#e86f23" opacity={0.98} />
      <Text position={[result.offlineYd * 0.15, 10, Math.min(85, result.carryYd * 0.55)]} fontSize={2.8} color="#f5f0e4">
        {namedFlight(inputs)}
      </Text>
      <OrbitControls makeDefault enablePan={false} maxPolarAngle={Math.PI / 2.1} />
    </>
  );
}

function Trajectory({ points, color, opacity }: { points: readonly (readonly [number, number, number])[]; color: string; opacity: number }) {
  const vertices = useMemo(() => new Float32Array(points.flatMap((point) => [point[0] * 0.15, point[1] * 0.15, point[2] * 0.15])), [points]);
  return (
    <line>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[vertices, 3]} />
      </bufferGeometry>
      <lineBasicMaterial color={color} transparent opacity={opacity} linewidth={4} />
    </line>
  );
}

function ImpactPanel() {
  const inputs = useLabStore((state) => state.impactInputs);
  const setImpactInput = useLabStore((state) => state.setImpactInput);
  const captureGhost = useLabStore((state) => state.captureGhost);
  const result = useMemo(() => simulateImpact(inputs), [inputs]);
  const manifest = modules.find((module) => module.id === 'impact')!;
  const setClub = (club: ClubName) => {
    const defaults = clubDefaults[club];
    setImpactInput('club', club);
    Object.entries(defaults).forEach(([key, value]) => setImpactInput(key as keyof ImpactInputs, value as never));
  };
  return (
    <aside className="panel">
      <div className="segmented">
        {(['Driver', '7-iron', 'Wedge'] as ClubName[]).map((club) => (
          <button key={club} type="button" className={clsx(inputs.club === club && 'active')} onClick={() => setClub(club)}>{club}</button>
        ))}
      </div>
      <Slider label="Club speed" value={inputs.clubSpeedMph} min={60} max={125} unit=" mph" onChange={(v) => setImpactInput('clubSpeedMph', v)} />
      <Slider label="Attack" value={inputs.attackAngleDeg} min={-8} max={6} step={0.5} unit=" deg" onChange={(v) => setImpactInput('attackAngleDeg', v)} />
      <Slider label="Path" value={inputs.clubPathDeg} min={-8} max={8} step={0.5} unit=" deg" onChange={(v) => setImpactInput('clubPathDeg', v)} />
      <Slider label="Face" value={inputs.faceAngleDeg} min={-8} max={8} step={0.5} unit=" deg" onChange={(v) => setImpactInput('faceAngleDeg', v)} />
      <Slider label="Loft" value={inputs.dynamicLoftDeg} min={8} max={54} step={0.5} unit=" deg" onChange={(v) => setImpactInput('dynamicLoftDeg', v)} />
      <Slider label="Toe / heel" value={inputs.strikeX} min={-2} max={2} step={0.1} onChange={(v) => setImpactInput('strikeX', v)} />
      <div className="quick-grid">
        {[
          ['Pull draw', -4, -1],
          ['Pull fade', -4, -7],
          ['Straight', 0, 0],
          ['Push draw', 4, 7],
          ['Push fade', 4, 1],
        ].map(([label, face, path]) => (
          <button key={label} type="button" onClick={() => { setImpactInput('faceAngleDeg', Number(face)); setImpactInput('clubPathDeg', Number(path)); }}>{label}</button>
        ))}
      </div>
      <button type="button" className="primary" onClick={() => captureGhost({
        id: crypto.randomUUID(),
        label: namedFlight(inputs),
        points: result.points.filter((_, index) => index % 20 === 0).map((point) => point.position),
      })}>
        <Target size={18} /> Capture trace
      </button>
      <div className="readouts" aria-live="polite">
        <Readout label="Ball speed" value={`${nf.format(result.ballSpeedMph)} mph`} receipt={result.receipts.launch} />
        <Readout label="Spin" value={`${Math.round(result.spinRpm)} rpm`} receipt={result.receipts.spin} />
        <Readout label="Spin axis" value={`${nf.format(result.spinAxisDeg)} deg`} receipt={result.receipts.dPlane} />
        <Readout label="Carry" value={`${nf.format(result.carryYd)} yd`} receipt={result.receipts.trajectory} />
        <Readout label="Offline" value={`${nf.format(result.offlineYd)} yd`} />
      </div>
      <ManifestNotes manifest={manifest} />
    </aside>
  );
}

function GreenScene() {
  const inputs = useLabStore((state) => state.greenInputs);
  const result = useMemo(() => simulateGreen(inputs), [inputs]);
  const points = result.points.filter((_, index) => index % 8 === 0).map((point) => [point.position[0] * 5, 0.06, point.position[1] * 5] as [number, number, number]);
  return (
    <>
      <ambientLight intensity={0.9} />
      <directionalLight position={[-3, 6, 4]} intensity={1.4} />
      <mesh rotation-x={-Math.PI / 2}>
        <planeGeometry args={[32, 32, 32, 32]} />
        <meshStandardMaterial color="#748d69" roughness={0.9} />
      </mesh>
      <gridHelper args={[28, 14, '#f5f0e4', '#9bae93']} position={[0, 0.04, 0]} />
      <mesh position={[0, 0.07, 0]} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[result.captureRadiusM * 5, 0.29, 48]} />
        <meshBasicMaterial color="#e86f23" transparent opacity={0.9} />
      </mesh>
      <mesh position={[0, 0.045, 0]} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[0.27, 48]} />
        <meshBasicMaterial color="#171c17" />
      </mesh>
      <Trajectory points={points} color="#e86f23" opacity={0.98} />
      <mesh position={points[0]}>
        <sphereGeometry args={[0.18, 24, 12]} />
        <meshStandardMaterial color="#f7f1e3" roughness={0.48} />
      </mesh>
      <OrbitControls makeDefault enablePan={false} maxPolarAngle={Math.PI / 2.08} />
    </>
  );
}

function GreenPanel() {
  const inputs = useLabStore((state) => state.greenInputs);
  const setGreenInput = useLabStore((state) => state.setGreenInput);
  const result = useMemo(() => simulateGreen(inputs), [inputs]);
  const manifest = modules.find((module) => module.id === 'green')!;
  return (
    <aside className="panel">
      <Slider label="Distance" value={inputs.distanceFt} min={4} max={40} step={1} unit=" ft" onChange={(v) => setGreenInput('distanceFt', v)} />
      <Slider label="Slope" value={inputs.slopePercent} min={0} max={6} step={0.25} unit="%" onChange={(v) => setGreenInput('slopePercent', v)} />
      <Slider label="Fall line" value={inputs.slopeDirectionDeg} min={0} max={360} step={5} unit=" deg" onChange={(v) => setGreenInput('slopeDirectionDeg', v)} />
      <Slider label="Stimp" value={inputs.stimp} min={6} max={14} step={0.5} onChange={(v) => setGreenInput('stimp', v)} />
      <Slider label="Aim" value={inputs.aimDeg} min={-20} max={20} step={0.25} unit=" deg" onChange={(v) => setGreenInput('aimDeg', v)} />
      <Slider label="Pace" value={inputs.pacePastFt} min={0} max={4} step={0.1} unit=" ft past" onChange={(v) => setGreenInput('pacePastFt', v)} />
      <div className={clsx('result-chip', result.made && 'made')}>{result.made ? 'Captured' : 'Missed'}</div>
      <div className="readouts" aria-live="polite">
        <Readout label="Lip speed" value={`${nf.format(result.lipSpeedMs)} m/s`} receipt={result.receipts.capture} />
        <Readout label="Capture" value={`${nf.format(result.captureRadiusM / 0.0254)} in`} receipt={result.receipts.capture} />
        <Readout label="Break" value={`${nf.format(result.breakFt)} ft`} receipt={result.receipts.slope} />
        <Readout label="Stop" value={`${nf.format(result.stopPastFt)} ft`} receipt={result.receipts.friction} />
      </div>
      <ManifestNotes manifest={manifest} />
    </aside>
  );
}

function ManifestNotes({ manifest }: { manifest: NonNullable<(typeof modules)[number]> }) {
  return (
    <section className="manifest-notes" aria-label={`${manifest.title} manifest notes`}>
      <h2>Receipts</h2>
      <p>{manifest.receipts.join(' / ')}</p>
      <h2>Sources</h2>
      <p>{manifest.sources.join(' / ')}</p>
      <h2>Log</h2>
      <p>{manifest.changelog[0]}</p>
    </section>
  );
}

function PlaceholderPanel() {
  return (
    <aside className="panel placeholder">
      <h2>Gained</h2>
      <p>Registered for v0.2. The shell already treats modules as manifest data so the strokes-gained room can land without reshaping navigation.</p>
    </aside>
  );
}

export function App() {
  const activeModule = useLabStore((state) => state.activeModule);
  const activeManifest = modules.find((module) => module.id === activeModule);
  return (
    <main className="app">
      <ModuleRail />
      <section className="stage">
        <div className="scene">
          <Canvas camera={{ position: activeModule === 'green' ? [0, 13, 15] : [0, 16, 35], fov: 48 }} dpr={[1, 1.75]}>
            {activeModule === 'impact' ? <ImpactScene /> : activeModule === 'green' ? <GreenScene /> : null}
          </Canvas>
        </div>
        <header className="hud">
          <span>flightlab</span>
          <strong>{activeManifest?.title}</strong>
        </header>
      </section>
      {activeModule === 'impact' ? <ImpactPanel /> : activeModule === 'green' ? <GreenPanel /> : <PlaceholderPanel />}
    </main>
  );
}
