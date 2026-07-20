import { Canvas, useThree } from '@react-three/fiber';
import { Line, OrbitControls, Text } from '@react-three/drei';
import { Activity, CircleDot, FlaskConical, Gauge, MessageSquare, Target } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { clsx } from 'clsx';
import { clubDefaults, namedFlight, simulateImpact, type ClubName, type Handedness, type HolePar, type ImpactInputs } from '../sim/impact';
import { simulateGreen } from '../sim/green';
import {
  shortGameWedgeDefaults,
  simulateShortGame,
  type GreenScenario,
  type GrassType,
  type LieType,
  type ShotCategory,
  type ShotType,
  type SwingClock,
  type WedgeType,
} from '../sim/shortGame';
import { modules } from '../modules/registry';
import { useLabStore, type ImpactView } from '../store/labStore';

const nf = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
const greenScale = 5;
const ftToScene = 0.3048 * greenScale;
const compassLabels = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const parDefaults: Record<HolePar, number> = { par3: 165, par4: 440, par5: 560 };
const ydToImpactScene = 0.15;
const impactLateralScale = -0.32;
const fairwayWidthScene = 40 * ydToImpactScene;
const targetGreenRadiusScene = 10 * ydToImpactScene;
const ydToShortScene = 0.18;
const shortLieLabels: Record<LieType, string> = {
  fairway: 'Fairway',
  tight: 'Tight',
  'sitting-up': 'Sitting up',
  'in-between': 'In between',
  'sitting-down': 'Sitting down',
  flier: 'Flier',
  rough: 'Rough',
  'wet-rough': 'Wet rough',
  hardpan: 'Hardpan',
  bunker: 'Bunker',
  'plugged-bunker': 'Plugged',
};
const shortGrassLabels: Record<GrassType, string> = {
  bent: 'Bent',
  bermuda: 'Bermuda',
  fescue: 'Fescue',
  sand: 'Sand',
  'into-grain': 'Into grain',
  'down-grain': 'Down grain',
};
const shortShotLabels: Record<ShotType, string> = {
  chip: 'Chip',
  pitch: 'Pitch',
  flop: 'Flop',
  blast: 'Blast',
  bump: 'Bump',
};
const shortCategoryLabels: Record<ShotCategory, string> = {
  chip: 'Chip',
  pitch: 'Pitch',
  'distance-wedge': 'Distance wedge',
  sand: 'Sand',
};
const greenScenarioLabels: Record<GreenScenario, string> = {
  level: 'Level',
  upslope: 'Upslope',
  downslope: 'Downslope',
  crowned: 'Crowned',
  backstop: 'Backstop',
};
const categoryDefaults: Record<ShotCategory, { shot: ShotType; carryYd: number; wedge: WedgeType; swing: SwingClock }> = {
  chip: { shot: 'chip', carryYd: 9, wedge: 'Gap', swing: '7:30' },
  pitch: { shot: 'pitch', carryYd: 28, wedge: 'Sand', swing: '9:00' },
  'distance-wedge': { shot: 'pitch', carryYd: 68, wedge: 'Gap', swing: '10:30' },
  sand: { shot: 'blast', carryYd: 18, wedge: 'Sand', swing: '9:00' },
};
const lieVisuals: Record<LieType, { grass: 'low' | 'medium' | 'high'; ball: 'clean' | 'perched' | 'nested' | 'buried'; title: string; note: string }> = {
  fairway: { grass: 'low', ball: 'clean', title: 'Clean fairway pitch', note: 'Face can reach the ball; spin and carry are most predictable.' },
  tight: { grass: 'low', ball: 'clean', title: 'Tight lie', note: 'Leading edge matters; too much bounce or lean can skip into the ball.' },
  'sitting-up': { grass: 'high', ball: 'perched', title: 'Sitting up', note: 'Ball is perched above grass; easy launch, possible high-face contact.' },
  'in-between': { grass: 'medium', ball: 'nested', title: 'In-between lie', note: 'Some grass gets trapped; expect less spin and a wider landing window.' },
  'sitting-down': { grass: 'high', ball: 'buried', title: 'Sitting down', note: 'Ball is below the grass tips; contact and spin both get less reliable.' },
  flier: { grass: 'medium', ball: 'perched', title: 'Flier lie', note: 'Grass moisture/cushion drops friction; launch rides up and release jumps.' },
  rough: { grass: 'medium', ball: 'nested', title: 'Standard rough', note: 'Grass between face and ball lowers spin and adds release.' },
  'wet-rough': { grass: 'high', ball: 'nested', title: 'Wet rough', note: 'Moisture cuts friction hard; plan for a bigger skid and rollout.' },
  hardpan: { grass: 'low', ball: 'clean', title: 'Hardpan', note: 'Firm ground rewards precise low-point control and punishes bounce mismatch.' },
  bunker: { grass: 'low', ball: 'clean', title: 'Sand lie', note: 'Use sole depth and speed; ball is moved by sand, not clean face friction.' },
  'plugged-bunker': { grass: 'medium', ball: 'buried', title: 'Plugged bunker', note: 'Steeper entry and less release control; buried leading edge risk rises.' },
};
const feedbackEndpoint = import.meta.env.VITE_FEEDBACK_ENDPOINT as string | undefined;
const impactCameraViews: Record<ImpactView, { label: string }> = {
  player: { label: 'Player' },
  top: { label: 'Top' },
  side: { label: 'Side' },
};
const impactCameraFov: Record<ImpactView, number> = { player: 56, top: 46, side: 50 };

function compassLabel(degrees: number) {
  const normalized = ((degrees % 360) + 360) % 360;
  return compassLabels[Math.round(normalized / 45) % compassLabels.length];
}

type FlightPreset = {
  label: string;
  height: 'high' | 'mid' | 'low';
  curve: 'draw' | 'straight' | 'fade';
  loftOffsetDeg: number;
  attackOffsetDeg: number;
};

const flightPresets: FlightPreset[] = [
  { label: 'High draw', height: 'high', curve: 'draw', loftOffsetDeg: 4, attackOffsetDeg: 1.5 },
  { label: 'High straight', height: 'high', curve: 'straight', loftOffsetDeg: 4, attackOffsetDeg: 1.5 },
  { label: 'High fade', height: 'high', curve: 'fade', loftOffsetDeg: 4, attackOffsetDeg: 1.5 },
  { label: 'Mid draw', height: 'mid', curve: 'draw', loftOffsetDeg: 0, attackOffsetDeg: 0 },
  { label: 'Mid straight', height: 'mid', curve: 'straight', loftOffsetDeg: 0, attackOffsetDeg: 0 },
  { label: 'Mid fade', height: 'mid', curve: 'fade', loftOffsetDeg: 0, attackOffsetDeg: 0 },
  { label: 'Low draw', height: 'low', curve: 'draw', loftOffsetDeg: -4, attackOffsetDeg: -1.5 },
  { label: 'Low straight', height: 'low', curve: 'straight', loftOffsetDeg: -4, attackOffsetDeg: -1.5 },
  { label: 'Low fade', height: 'low', curve: 'fade', loftOffsetDeg: -4, attackOffsetDeg: -1.5 },
];

function curveAngles(curve: FlightPreset['curve'], handedness: Handedness) {
  const side = handedness === 'left' ? -1 : 1;
  if (curve === 'draw') return { faceAngleDeg: 1.5 * side, clubPathDeg: 3.5 * side };
  if (curve === 'fade') return { faceAngleDeg: -1.5 * side, clubPathDeg: -3.5 * side };
  return { faceAngleDeg: 0, clubPathDeg: 0 };
}

function activeFlightPreset(input: ImpactInputs) {
  return flightPresets.find((preset) => {
    const curve = curveAngles(preset.curve, input.handedness);
    const defaults = clubDefaults[input.club];
    return Math.abs(input.faceAngleDeg - curve.faceAngleDeg) < 0.1
      && Math.abs(input.clubPathDeg - curve.clubPathDeg) < 0.1
      && Math.abs(input.dynamicLoftDeg - (Number(defaults.dynamicLoftDeg ?? 0) + preset.loftOffsetDeg)) < 0.1;
  });
}

function directionalLabel(degrees: number, handedness: Handedness, positiveLabel: string, negativeLabel: string) {
  const relative = degrees * (handedness === 'left' ? -1 : 1);
  if (Math.abs(relative) < 0.4) return 'neutral';
  return relative > 0 ? positiveLabel : negativeLabel;
}

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
          {module.id === 'impact' ? <Gauge size={20} /> : module.id === 'green' ? <CircleDot size={20} /> : module.id === 'short' ? <Target size={20} /> : <Activity size={20} />}
          <span>{module.title}</span>
        </button>
      ))}
    </nav>
  );
}

function ViewSwitcher() {
  const activeModule = useLabStore((state) => state.activeModule);
  const impactView = useLabStore((state) => state.impactView);
  const setImpactView = useLabStore((state) => state.setImpactView);
  if (activeModule !== 'impact') return null;
  return (
    <div className="view-switcher" aria-label="impact camera view">
      {(Object.keys(impactCameraViews) as ImpactView[]).map((view) => (
        <button
          key={view}
          type="button"
          className={clsx(impactView === view && 'active')}
          aria-pressed={impactView === view}
          onClick={() => setImpactView(view)}
        >
          {impactCameraViews[view].label}
        </button>
      ))}
    </div>
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

function impactCameraConfig(view: ImpactView, targetDistanceYd: number, carryYd: number, apexYd = 0) {
  const shotDepth = Math.max(targetDistanceYd, carryYd + 35) * ydToImpactScene;
  const midZ = shotDepth * 0.5;
  if (view === 'top') {
    return {
      position: [0, Math.max(128, shotDepth * 1.78), midZ] as [number, number, number],
      target: [0, 0, midZ] as [number, number, number],
      up: [0, 0, 1] as [number, number, number],
      maxPolar: 0.08,
    };
  }
  if (view === 'side') {
    const carryDepth = Math.max(24, (carryYd + 24) * ydToImpactScene);
    const carryMidZ = Math.max(12, carryYd * ydToImpactScene * 0.5);
    const apexScene = apexYd * ydToImpactScene;
    const targetY = Math.max(4.5, apexScene * 0.48);
    return {
      position: [-Math.max(66, carryDepth * 1.22, apexScene * 5), targetY + Math.max(5, apexScene * 0.18), carryMidZ] as [number, number, number],
      target: [0, targetY, carryMidZ] as [number, number, number],
      up: [0, 1, 0] as [number, number, number],
      maxPolar: Math.PI / 2.02,
    };
  }
  return {
    position: [0, 3.2, -24] as [number, number, number],
    target: [0, 4.5, Math.min(72, shotDepth * 0.72)] as [number, number, number],
    up: [0, 1, 0] as [number, number, number],
    maxPolar: Math.PI / 2.02,
  };
}

function ImpactCameraRig({ view, targetDistanceYd, carryYd, apexYd }: { view: ImpactView; targetDistanceYd: number; carryYd: number; apexYd: number }) {
  const { camera } = useThree();
  const config = useMemo(() => impactCameraConfig(view, targetDistanceYd, carryYd, apexYd), [view, targetDistanceYd, carryYd, apexYd]);
  useEffect(() => {
    camera.position.set(...config.position);
    camera.up.set(...config.up);
    camera.lookAt(...config.target);
    camera.updateProjectionMatrix();
  }, [camera, config]);
  return null;
}

function pathBounds(points: readonly (readonly [number, number, number])[]) {
  const xs = points.map((point) => point[0]);
  const zs = points.map((point) => point[2]);
  const minX = Math.min(...xs, 0);
  const maxX = Math.max(...xs, 0);
  const minZ = Math.min(...zs, 0);
  const maxZ = Math.max(...zs, 0);
  return {
    center: [(minX + maxX) / 2, (minZ + maxZ) / 2] as [number, number],
    span: Math.max(maxX - minX, maxZ - minZ),
  };
}

function GreenCameraRig({ points }: { points: readonly (readonly [number, number, number])[] }) {
  const { camera } = useThree();
  const config = useMemo(() => {
    const bounds = pathBounds(points.length ? points : [[0, 0, 0]]);
    const paddedSpan = Math.max(15, bounds.span * 1.28);
    return {
      position: [bounds.center[0], Math.max(13, paddedSpan * 0.82), bounds.center[1] - Math.max(15, paddedSpan * 0.52)] as [number, number, number],
      target: [bounds.center[0], 0, bounds.center[1]] as [number, number, number],
    };
  }, [points]);
  useEffect(() => {
    camera.position.set(...config.position);
    camera.up.set(0, 1, 0);
    camera.lookAt(...config.target);
    camera.updateProjectionMatrix();
  }, [camera, config]);
  return null;
}

function ImpactScene() {
  const inputs = useLabStore((state) => state.impactInputs);
  const impactView = useLabStore((state) => state.impactView);
  const ghosts = useLabStore((state) => state.ghosts);
  const result = useMemo(() => simulateImpact(inputs), [inputs]);
  const cameraView = useMemo(() => impactCameraConfig(impactView, inputs.targetDistanceYd, result.carryYd, result.apexYd), [impactView, inputs.targetDistanceYd, result.carryYd, result.apexYd]);
  const flightLabel = activeFlightPreset(inputs)?.label ?? namedFlight(inputs);
  const sceneTextRotationY = impactView === 'top' ? 0 : Math.PI;
  const visualLateralScale = impactLateralScale;
  const sampled = result.points.filter((_, index) => index % 20 === 0).map((point) => point.position);
  const targetZ = inputs.targetDistanceYd * ydToImpactScene;
  const carryZ = result.carryYd * ydToImpactScene;
  const landingX = result.offlineYd * visualLateralScale;
  const dispersionWidthYd = Math.round(Math.max(16, result.carryYd * (inputs.club === 'Driver' ? 0.12 : inputs.club === '6-iron' ? 0.09 : 0.07)));
  const dispersionHalfX = (dispersionWidthYd / 2) * Math.abs(impactLateralScale);
  const dispersionDepth = Math.max(9, result.carryYd * 0.045) * ydToImpactScene;
  const roughLength = Math.max(targetZ + 36, 92);
  const fairwayLength = Math.max(targetZ, 36);
  const fairwayBunkers = inputs.holePar === 'par3' ? [] : [
    [-fairwayWidthScene * 0.72, targetZ * 0.48, 0.78],
    [fairwayWidthScene * 0.74, targetZ * 0.62, 0.86],
  ] as const;
  const trees = useMemo(() => [-1, 1].flatMap((side) => [70, 120, 175, 235, 305, 385, 485].map((z, index) => ({
    x: side * (23 + (index % 3) * 5),
    z: z * ydToImpactScene,
    h: 3.8 + (index % 4) * 0.55,
  }))), []);
  const fairwayStripes = useMemo(() => Array.from({ length: Math.max(5, Math.ceil(fairwayLength / 5.8)) }, (_, index) => ({
    z: 2.9 + index * 5.8,
    color: index % 2 === 0 ? '#6f9363' : '#5f8257',
  })), [fairwayLength]);
  return (
    <>
      <color attach="background" args={['#c7d7c0']} />
      <fog attach="fog" args={['#c7d7c0', 54, 132]} />
      <ImpactCameraRig view={impactView} targetDistanceYd={inputs.targetDistanceYd} carryYd={result.carryYd} apexYd={result.apexYd} />
      <ambientLight intensity={0.8} />
      <directionalLight position={[4, 8, 5]} intensity={1.6} />
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.04, roughLength * 0.5 - 8]}>
        <planeGeometry args={[96, roughLength]} />
        <meshStandardMaterial color="#3f633d" roughness={0.94} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.02, fairwayLength * 0.5]}>
        <planeGeometry args={[fairwayWidthScene, fairwayLength]} />
        <meshStandardMaterial color="#668a5c" roughness={0.92} metalness={0.02} />
      </mesh>
      {fairwayStripes.map((stripe) => (
        <mesh key={stripe.z} rotation-x={-Math.PI / 2} position={[0, 0.002, stripe.z]}>
          <planeGeometry args={[fairwayWidthScene * 0.98, 2.7]} />
          <meshBasicMaterial color={stripe.color} transparent opacity={0.42} />
        </mesh>
      ))}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.015, -1]}>
        <circleGeometry args={[1.2, 48]} />
        <meshBasicMaterial color="#f8efd9" transparent opacity={0.18} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.02, targetZ]}>
        <circleGeometry args={[targetGreenRadiusScene, 64]} />
        <meshStandardMaterial color="#8fa67f" roughness={0.86} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[-2.8, 0.035, targetZ - 0.75]}>
        <circleGeometry args={[0.8, 40]} />
        <meshBasicMaterial color="#d7c58a" transparent opacity={0.94} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[2.75, 0.035, targetZ + 0.92]}>
        <circleGeometry args={[0.9, 40]} />
        <meshBasicMaterial color="#d7c58a" transparent opacity={0.9} />
      </mesh>
      {fairwayBunkers.map(([x, z, radius]) => (
        <mesh key={`${x}:${z}`} rotation-x={-Math.PI / 2} position={[x, 0.03, z]}>
          <circleGeometry args={[radius, 36]} />
          <meshBasicMaterial color="#d7c58a" transparent opacity={0.86} />
        </mesh>
      ))}
      {trees.map((tree) => (
        <group key={`${tree.x}:${tree.z}`} position={[tree.x, 0, tree.z]}>
          <mesh position={[0, tree.h * 0.24, 0]}>
            <cylinderGeometry args={[0.22, 0.32, tree.h * 0.48, 8]} />
            <meshStandardMaterial color="#4d3324" roughness={0.9} />
          </mesh>
          <mesh position={[0, tree.h * 0.68, 0]}>
            <coneGeometry args={[1.7, tree.h, 8]} />
            <meshStandardMaterial color="#22351f" roughness={0.94} />
          </mesh>
        </group>
      ))}
      <gridHelper args={[Math.max(72, targetZ + 20), 18, '#e3eed6', '#66845b']} position={[0, 0.01, targetZ * 0.5]} />
      <mesh position={[0, 0.25, 0]}>
        <sphereGeometry args={[0.32, 32, 16]} />
        <meshStandardMaterial color="#f7f1e3" roughness={0.46} />
      </mesh>
      <mesh position={[inputs.strikeX * 0.25, 0.8 + inputs.strikeY * 0.1, -1.1]} rotation-y={inputs.faceAngleDeg * Math.PI / 180}>
        <boxGeometry args={[2.4, 1.35, 0.14]} />
        <meshStandardMaterial color="#2a3128" transparent opacity={0.42} roughness={0.82} />
      </mesh>
      {ghosts.map((ghost, index) => (
        <Trajectory key={ghost.id} points={ghost.points} color="#ece4d3" opacity={0.26 - index * 0.025} scale={ydToImpactScene} lateralScale={visualLateralScale} width={2.6} />
      ))}
      <Trajectory points={sampled} color="#e86f23" opacity={0.98} scale={ydToImpactScene} lateralScale={visualLateralScale} width={5.2} />
      <mesh position={[landingX, 0.12, carryZ]} rotation-x={-Math.PI / 2} scale={[dispersionHalfX, dispersionDepth, 1]}>
        <ringGeometry args={[0.9, 1, 72]} />
        <meshBasicMaterial color="#f8efd9" transparent opacity={0.78} />
      </mesh>
      <line>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[new Float32Array([landingX - dispersionHalfX, 0.18, carryZ, landingX + dispersionHalfX, 0.18, carryZ]), 3]} />
        </bufferGeometry>
        <lineBasicMaterial color="#f8efd9" transparent opacity={0.72} />
      </line>
      <Text position={[landingX, 1.45, carryZ]} rotation-y={sceneTextRotationY} fontSize={1.55} color="#f8efd9">
        {dispersionWidthYd} yd window
      </Text>
      <Text position={[0, 1.2, targetZ]} rotation-y={sceneTextRotationY} fontSize={1.55} color="#f8efd9">
        {inputs.holePar.replace('par', 'Par ')} · {inputs.targetDistanceYd} yd
      </Text>
      <Text position={[result.offlineYd * visualLateralScale, 10, Math.min(85, result.carryYd * 0.55)]} rotation-y={sceneTextRotationY} fontSize={2.8} color="#f5f0e4">
        {flightLabel}
      </Text>
      {impactView === 'top' ? null : <OrbitControls makeDefault enablePan={false} target={cameraView.target} maxPolarAngle={cameraView.maxPolar} />}
    </>
  );
}

function Trajectory({
  points,
  color,
  opacity,
  scale = 0.15,
  lateralScale = scale,
  width = 4,
  dashed = false,
}: {
  points: readonly (readonly [number, number, number])[];
  color: string;
  opacity: number;
  scale?: number;
  lateralScale?: number;
  width?: number;
  dashed?: boolean;
}) {
  const scaled = useMemo(() => points.map((point) => [point[0] * lateralScale, point[1] * scale, point[2] * scale] as [number, number, number]), [points, scale, lateralScale]);
  return (
    <Line points={scaled} color={color} lineWidth={width} transparent opacity={opacity} dashed={dashed} dashSize={0.42} gapSize={0.24} />
  );
}

function SurfaceArrow({ position, rotationY, length, color, opacity }: { position: [number, number, number]; rotationY: number; length: number; color: string; opacity: number }) {
  return (
    <group position={position} rotation-y={rotationY}>
      <line>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[new Float32Array([0, 0, -length * 0.5, 0, 0, length * 0.5]), 3]} />
        </bufferGeometry>
        <lineBasicMaterial color={color} transparent opacity={opacity} />
      </line>
      <mesh position={[0, 0, length * 0.5]} rotation-x={Math.PI / 2}>
        <coneGeometry args={[0.17, 0.46, 24]} />
        <meshBasicMaterial color={color} transparent opacity={opacity} />
      </mesh>
    </group>
  );
}

function GreenReadingMap({ distanceFt, slopePercent, slopeDirectionDeg, aimDeg }: { distanceFt: number; slopePercent: number; slopeDirectionDeg: number; aimDeg: number }) {
  const fall = slopeDirectionDeg * Math.PI / 180;
  const fallRotationY = fall;
  const crossRotationY = fall + Math.PI / 2;
  const arrowOpacity = 0.34 + Math.min(slopePercent, 6) * 0.07;
  const bands = useMemo(() => {
    const colors = ['#5b8fc1', '#79aebb', '#a8c59b', '#d8cf76', '#d59b57'];
    return Array.from({ length: 9 }, (_, index) => {
      const offset = (index - 4) * 2.85;
      const colorIndex = Math.round((1 - index / 8) * (colors.length - 1));
      return { offset, color: colors[colorIndex], opacity: 0.12 + slopePercent * 0.018 };
    });
  }, [slopePercent]);
  const arrows = useMemo(() => {
    const rows = [-9, -4.5, 0, 4.5, 9];
    const cols = [-7, 0, 7];
    return rows.flatMap((z) => cols.map((x) => [x, z] as const));
  }, []);
  const aimRotationY = -aimDeg * Math.PI / 180;
  const startZ = -distanceFt * ftToScene;
  return (
    <group position={[0, 0.075, 0]}>
      <group rotation-y={fallRotationY}>
        {bands.map((band) => (
          <mesh key={band.offset} position={[0, 0, band.offset]} rotation-x={-Math.PI / 2}>
            <planeGeometry args={[30, 2.55]} />
            <meshBasicMaterial color={band.color} transparent opacity={band.opacity} depthWrite={false} />
          </mesh>
        ))}
      </group>
      <SurfaceArrow position={[0, 0.045, 0]} rotationY={fallRotationY} length={26} color="#173028" opacity={0.72} />
      <group rotation-y={crossRotationY} position={[0, 0.035, 0]}>
        <line>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[new Float32Array([-14, 0, 0, 14, 0, 0]), 3]} />
          </bufferGeometry>
          <lineBasicMaterial color="#f6f2dc" transparent opacity={0.62} />
        </line>
      </group>
      {arrows.map(([x, z]) => (
        <SurfaceArrow
          key={`${x}:${z}`}
          position={[x, 0.04, z]}
          rotationY={fallRotationY}
          length={1.55 + slopePercent * 0.28}
          color="#28453a"
          opacity={arrowOpacity}
        />
      ))}
      <SurfaceArrow position={[0, 0.08, startZ]} rotationY={aimRotationY} length={6} color="#ffb454" opacity={0.84} />
    </group>
  );
}

function ImpactPanel() {
  const inputs = useLabStore((state) => state.impactInputs);
  const setImpactInput = useLabStore((state) => state.setImpactInput);
  const captureGhost = useLabStore((state) => state.captureGhost);
  const result = useMemo(() => simulateImpact(inputs), [inputs]);
  const manifest = modules.find((module) => module.id === 'impact')!;
  const spinLoftDeg = inputs.dynamicLoftDeg - inputs.attackAngleDeg;
  const flightLabel = activeFlightPreset(inputs)?.label ?? namedFlight(inputs);
  const setClub = (club: ClubName) => {
    const defaults = clubDefaults[club];
    setImpactInput('club', club);
    Object.entries(defaults).forEach(([key, value]) => setImpactInput(key as keyof ImpactInputs, value as never));
  };
  const setHandedness = (handedness: Handedness) => {
    if (handedness === inputs.handedness) return;
    setImpactInput('handedness', handedness);
    setImpactInput('faceAngleDeg', -inputs.faceAngleDeg);
    setImpactInput('clubPathDeg', -inputs.clubPathDeg);
  };
  const setPar = (holePar: HolePar) => {
    setImpactInput('holePar', holePar);
    setImpactInput('targetDistanceYd', parDefaults[holePar]);
  };
  const setTigerPreset = (preset: FlightPreset) => {
    const defaults = clubDefaults[inputs.club];
    const curve = curveAngles(preset.curve, inputs.handedness);
    setImpactInput('faceAngleDeg', curve.faceAngleDeg);
    setImpactInput('clubPathDeg', curve.clubPathDeg);
    setImpactInput('dynamicLoftDeg', Number(defaults.dynamicLoftDeg ?? inputs.dynamicLoftDeg) + preset.loftOffsetDeg);
    setImpactInput('attackAngleDeg', Number(defaults.attackAngleDeg ?? inputs.attackAngleDeg) + preset.attackOffsetDeg);
  };
  const isPresetActive = (preset: FlightPreset) => {
    return activeFlightPreset(inputs)?.label === preset.label;
  };
  const setLaunchAngle = (launchAngleDeg: number) => {
    const dynamicLoftDeg = (launchAngleDeg - inputs.attackAngleDeg * 0.18 - 1.8 - inputs.strikeY * 1.2) / 0.62;
    setImpactInput('dynamicLoftDeg', Number(dynamicLoftDeg.toFixed(1)));
  };
  return (
    <aside className="panel">
      <div className="segmented">
        {(['Driver', '6-iron', 'Wedge'] as ClubName[]).map((club) => (
          <button key={club} type="button" className={clsx(inputs.club === club && 'active')} aria-pressed={inputs.club === club} onClick={() => setClub(club)}>{club}</button>
        ))}
      </div>
      <div className="segmented handedness-toggle" aria-label="player handedness">
        {(['right', 'left'] as Handedness[]).map((handedness) => (
          <button key={handedness} type="button" className={clsx(inputs.handedness === handedness && 'active')} aria-pressed={inputs.handedness === handedness} onClick={() => setHandedness(handedness)}>
            {handedness === 'right' ? 'Right hand' : 'Left hand'}
          </button>
        ))}
      </div>
      <div className="segmented par-toggle" aria-label="hole par">
        {(['par3', 'par4', 'par5'] as HolePar[]).map((holePar) => (
          <button key={holePar} type="button" className={clsx(inputs.holePar === holePar && 'active')} aria-pressed={inputs.holePar === holePar} onClick={() => setPar(holePar)}>
            {holePar.replace('par', 'Par ')}
          </button>
        ))}
      </div>
      <Slider label="Hole" value={inputs.targetDistanceYd} min={90} max={650} step={5} unit=" yd" onChange={(v) => setImpactInput('targetDistanceYd', v)} />
      <Slider label="Club speed" value={inputs.clubSpeedMph} min={60} max={125} unit=" mph" onChange={(v) => setImpactInput('clubSpeedMph', v)} />
      <Slider label="Attack" value={inputs.attackAngleDeg} min={-8} max={6} step={0.5} unit=" deg" onChange={(v) => setImpactInput('attackAngleDeg', v)} />
      <Slider label="Path" value={inputs.clubPathDeg} min={-8} max={8} step={0.5} unit=" deg" onChange={(v) => setImpactInput('clubPathDeg', v)} />
      <Slider label="Face" value={inputs.faceAngleDeg} min={-8} max={8} step={0.5} unit=" deg" onChange={(v) => setImpactInput('faceAngleDeg', v)} />
      <Slider label="Launch" value={result.launchAngleDeg} min={4} max={38} step={0.5} unit=" deg" onChange={setLaunchAngle} />
      <Slider label="Toe / heel" value={inputs.strikeX} min={-2} max={2} step={0.1} onChange={(v) => setImpactInput('strikeX', v)} />
      <div className="quick-grid">
        {flightPresets.map((preset) => {
          const active = isPresetActive(preset);
          return (
            <button
              key={preset.label}
              type="button"
              className={clsx(active && 'active')}
              aria-pressed={active}
              onClick={() => setTigerPreset(preset)}
            >
              <FlightPathIcon height={preset.height} curve={preset.curve} />
              <span>{preset.label}</span>
            </button>
          );
        })}
      </div>
      <button type="button" className="primary" onClick={() => captureGhost({
        id: crypto.randomUUID(),
        label: flightLabel,
        points: result.points.filter((_, index) => index % 20 === 0).map((point) => point.position),
      })}>
        <Target size={18} /> Capture trace
      </button>
      <div className="readouts" aria-live="polite">
        <Readout label="Ball speed" value={`${nf.format(result.ballSpeedMph)} mph`} receipt={result.receipts.launch} />
        <Readout label="Start line" value={`${nf.format(result.startLineDeg)} deg ${directionalLabel(result.startLineDeg, inputs.handedness, 'push', 'pull')}`} receipt="Start line is launch direction: mostly face angle, with a smaller path contribution. Positive is right of target for right-handed mode and mirrored for left-handed mode." />
        <Readout label="Curve" value={directionalLabel(result.curveBiasDeg, inputs.handedness, 'fade', 'draw')} receipt="Curve comes from face-to-path. Face left of path creates draw spin; face right of path creates fade spin. Handedness mirrors the label." />
        <Readout label="Face to path" value={`${nf.format(result.faceToPathDeg)} deg`} receipt={result.receipts.dPlane} />
        <Readout label="Launch" value={`${nf.format(result.launchAngleDeg)} deg`} receipt="Launch angle is exposed as the player-facing control; internally it solves dynamic loft from launch = dynamic loft * 0.62 + attack * 0.18 + strike height." />
        <Readout label="Spin loft" value={`${nf.format(spinLoftDeg)} deg`} receipt="Spin loft = dynamic loft - attack angle. More spin loft raises spin and usually lowers smash." />
        <Readout label="Spin" value={`${Math.round(result.spinRpm)} rpm`} receipt={result.receipts.spin} />
        <Readout label="Spin axis" value={`${nf.format(result.spinAxisDeg)} deg`} receipt={result.receipts.dPlane} />
        <Readout label="Carry" value={`${nf.format(result.carryYd)} yd`} receipt={result.receipts.trajectory} />
        <Readout label="Offline" value={`${nf.format(result.offlineYd)} yd`} />
      </div>
      <ManifestNotes manifest={manifest} />
    </aside>
  );
}

function FlightPathIcon({ height, curve }: Pick<FlightPreset, 'height' | 'curve'>) {
  const startX = 32;
  const endX = curve === 'draw' ? 21 : curve === 'fade' ? 43 : 32;
  const controlX = curve === 'draw' ? 40 : curve === 'fade' ? 24 : 32;
  const apexY = height === 'high' ? 9 : height === 'low' ? 26 : 17;
  const path = `M ${startX} 54 C ${controlX} ${38 + (apexY - 17) * 0.28}, ${endX} ${apexY + 15}, ${endX} ${apexY}`;

  return (
    <svg className="flight-icon" viewBox="0 0 64 64" aria-hidden="true">
      <path className="flight-icon-grid" d="M10 54H54M18 46H46M25 38H39" />
      <path className="flight-icon-path" d={path} />
      <path className="flight-icon-arrow" d={`M ${endX - 4} ${apexY + 8} L ${endX} ${apexY} L ${endX + 4} ${apexY + 8}`} />
    </svg>
  );
}

function GreenScene() {
  const inputs = useLabStore((state) => state.greenInputs);
  const result = useMemo(() => simulateGreen(inputs), [inputs]);
  const points = useMemo(() => result.points.filter((_, index) => index % 8 === 0).map((point) => [point.position[0] * greenScale, 0.13, point.position[1] * greenScale] as [number, number, number]), [result.points]);
  const rolloutPoints = useMemo(() => result.rolloutPoints.filter((_, index) => index % 8 === 0).map((point) => [point.position[0] * greenScale, 0.135, point.position[1] * greenScale] as [number, number, number]), [result.rolloutPoints]);
  const leavePoint = useMemo(() => [result.leave.position[0] * greenScale, 0.16, result.leave.position[1] * greenScale] as [number, number, number], [result.leave.position]);
  const secondPuttPoints = useMemo(() => result.secondPuttPoints.filter((_, index) => index % 8 === 0).map((point) => [point.position[0] * greenScale, 0.16, point.position[1] * greenScale] as [number, number, number]), [result.secondPuttPoints]);
  const cameraPoints = useMemo(() => [...points, ...rolloutPoints, ...secondPuttPoints], [points, rolloutPoints, secondPuttPoints]);
  const cameraTarget = useMemo(() => {
    const bounds = pathBounds(cameraPoints);
    return [bounds.center[0], 0, bounds.center[1]] as [number, number, number];
  }, [cameraPoints]);
  const startZ = -inputs.distanceFt * ftToScene;
  return (
    <>
      <color attach="background" args={['#c8d8bd']} />
      <fog attach="fog" args={['#c8d8bd', 22, 58]} />
      <GreenCameraRig points={cameraPoints} />
      <ambientLight intensity={0.9} />
      <directionalLight position={[-3, 6, 4]} intensity={1.4} />
      <mesh rotation-x={-Math.PI / 2}>
        <planeGeometry args={[32, 32, 32, 32]} />
        <meshStandardMaterial color="#57794f" roughness={0.9} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.015, -1.2]} scale={[1.18, 0.92, 1]}>
        <circleGeometry args={[14, 112]} />
        <meshBasicMaterial color="#7fac70" transparent opacity={0.46} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.035, -1.2]} scale={[1.18, 0.92, 1]}>
        <ringGeometry args={[11.6, 11.76, 112]} />
        <meshBasicMaterial color="#f1e7bd" transparent opacity={0.42} />
      </mesh>
      <gridHelper args={[28, 14, '#e1efd6', '#6d8d62']} position={[0, 0.04, 0]} />
      <GreenReadingMap distanceFt={inputs.distanceFt} slopePercent={inputs.slopePercent} slopeDirectionDeg={inputs.slopeDirectionDeg} aimDeg={inputs.aimDeg} />
      <mesh position={[0, 0.07, 0]} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[result.captureRadiusM * greenScale, 0.29, 48]} />
        <meshBasicMaterial color="#e86f23" transparent opacity={0.9} />
      </mesh>
      <mesh position={[0, 0.045, 0]} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[0.27, 48]} />
        <meshBasicMaterial color="#171c17" />
      </mesh>
      <Trajectory points={points} color="#e86f23" opacity={0.98} scale={1} width={5} />
      {result.made && rolloutPoints.length > 1 ? <Trajectory points={rolloutPoints} color="#f8efd9" opacity={0.78} scale={1} width={3.6} dashed /> : null}
      {secondPuttPoints.length > 1 ? <Trajectory points={secondPuttPoints} color="#244136" opacity={0.78} scale={1} width={3.2} dashed /> : null}
      {secondPuttPoints.length > 1 ? (
        <mesh position={leavePoint}>
          <sphereGeometry args={[0.16, 24, 12]} />
          <meshStandardMaterial color="#243f34" roughness={0.58} />
        </mesh>
      ) : null}
      <line>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[new Float32Array([0, 0.11, startZ, 0, 0.11, 0]), 3]} />
        </bufferGeometry>
        <lineBasicMaterial color="#f5f0e4" transparent opacity={0.56} />
      </line>
      <mesh position={points[0]}>
        <sphereGeometry args={[0.18, 24, 12]} />
        <meshStandardMaterial color="#f7f1e3" roughness={0.48} />
      </mesh>
      <OrbitControls makeDefault enablePan={false} target={cameraTarget} maxPolarAngle={Math.PI / 2.08} />
    </>
  );
}

function GreenPanel() {
  const inputs = useLabStore((state) => state.greenInputs);
  const setGreenInput = useLabStore((state) => state.setGreenInput);
  const result = useMemo(() => simulateGreen(inputs), [inputs]);
  const manifest = modules.find((module) => module.id === 'green')!;
  const breakSide = result.breakFt < -0.05 ? 'right' : result.breakFt > 0.05 ? 'left' : 'center';
  return (
    <aside className="panel">
      <Slider label="Distance" value={inputs.distanceFt} min={4} max={40} step={1} unit=" ft" onChange={(v) => setGreenInput('distanceFt', v)} />
      <Slider label="Slope" value={inputs.slopePercent} min={0} max={6} step={0.25} unit="%" onChange={(v) => setGreenInput('slopePercent', v)} />
      <Slider label="Fall line" value={inputs.slopeDirectionDeg} min={0} max={360} step={5} unit=" deg" onChange={(v) => setGreenInput('slopeDirectionDeg', v)} />
      <Slider label="Stimp" value={inputs.stimp} min={6} max={14} step={0.5} onChange={(v) => setGreenInput('stimp', v)} />
      <Slider label="Aim" value={inputs.aimDeg} min={-20} max={20} step={0.25} unit=" deg" onChange={(v) => setGreenInput('aimDeg', v)} />
      <Slider label="Pace" value={inputs.pacePastFt} min={-6} max={6} step={0.1} unit=" ft" onChange={(v) => setGreenInput('pacePastFt', v)} />
      <div className={clsx('result-chip', result.made && 'made')}>{result.made ? 'Captured' : 'Missed'}</div>
      <section className="green-map-card" aria-label="green reading map legend">
        <div className="map-scale" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
        <div className="map-legend-row">
          <span>lower</span>
          <strong>{nf.format(inputs.slopePercent)}% fall {compassLabel(inputs.slopeDirectionDeg)}</strong>
          <span>higher</span>
        </div>
        <div className="map-vector-row">
          <span className="vector-swatch fall-line" />
          <p>Fall line vectors point downhill; heat bands step from low blue through high amber.</p>
        </div>
        <div className="map-vector-row">
          <span className="vector-swatch aim-line" />
          <p>Aim vector is {inputs.aimDeg === 0 ? 'straight at the cup' : `${nf.format(Math.abs(inputs.aimDeg))} deg ${inputs.aimDeg > 0 ? 'right' : 'left'}`}; expected break finishes {breakSide}.</p>
        </div>
      </section>
      <section className="leave-card" aria-label="second putt leave">
        <span>Second putt</span>
        <strong>{nf.format(result.leave.distanceFt)} ft · {result.leave.slopeRead}</strong>
        <p>{result.leave.heightRead}, {result.leave.sideRead}. The dashed return line simulates the next putt's break back to the cup.</p>
      </section>
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

function ShortScene() {
  const inputs = useLabStore((state) => state.shortInputs);
  const result = useMemo(() => simulateShortGame(inputs), [inputs]);
  const lieColor: Record<LieType, string> = {
    fairway: '#768e67',
    tight: '#a6ad83',
    'sitting-up': '#4f753d',
    'in-between': '#3f6233',
    'sitting-down': '#2f4d2a',
    flier: '#5b7b42',
    rough: '#405f34',
    'wet-rough': '#2f5334',
    hardpan: '#b6a470',
    bunker: '#d8c384',
    'plugged-bunker': '#cab169',
  };
  const flightPoints = useMemo(() => result.points.filter((_, index) => index % 2 === 0), [result.points]);
  const landingZ = result.carryYd * ydToShortScene;
  const totalZ = result.totalYd * ydToShortScene;
  const targetZ = inputs.carryYd * ydToShortScene;
  const firstBounceZ = (result.carryYd + result.firstBounceYd) * ydToShortScene;
  const secondBounceZ = (result.carryYd + result.firstBounceYd + result.secondBounceYd) * ydToShortScene;
  const greenCenterZ = Math.max(targetZ + 2.1, totalZ - 1.2);
  const groundLength = Math.max(24, totalZ + 11);
  return (
    <>
      <color attach="background" args={['#c6d8bd']} />
      <fog attach="fog" args={['#c6d8bd', 18, 48]} />
      <ambientLight intensity={0.88} />
      <directionalLight position={[-3, 7, 4]} intensity={1.45} />
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.05, groundLength * 0.5 - 4]}>
        <planeGeometry args={[20, groundLength]} />
        <meshStandardMaterial color="#365e37" roughness={0.94} />
      </mesh>
      {Array.from({ length: 8 }, (_, index) => (
        <mesh key={index} rotation-x={-Math.PI / 2} position={[0, -0.015, index * 2.6 + 1.5]}>
          <planeGeometry args={[19, 1.18]} />
          <meshBasicMaterial color={index % 2 === 0 ? '#456f42' : '#2f5734'} transparent opacity={0.3} />
        </mesh>
      ))}
      <group position={[0, 0, greenCenterZ]}>
        <mesh rotation-x={-Math.PI / 2} position={[-0.8, -0.02, -0.15]} scale={[1.28, 0.86, 1]}>
          <circleGeometry args={[4.15, 96]} />
          <meshStandardMaterial color="#8faf78" roughness={0.84} />
        </mesh>
        <mesh rotation-x={-Math.PI / 2} position={[2.15, inputs.greenScenario === 'backstop' ? 0.2 : 0.06, 1.2]} scale={[0.82, 0.62, 1]}>
          <circleGeometry args={[3.05, 80]} />
          <meshStandardMaterial color={inputs.greenScenario === 'downslope' ? '#7f9e70' : '#96b984'} roughness={0.82} />
        </mesh>
        <mesh rotation-x={-Math.PI / 2} position={[-2.25, inputs.greenScenario === 'crowned' ? 0.16 : 0.02, 1.6]} scale={[0.7, 0.58, 1]}>
          <circleGeometry args={[2.35, 72]} />
          <meshStandardMaterial color="#7fa16f" roughness={0.88} />
        </mesh>
        <mesh rotation-x={-Math.PI / 2} position={[0.15, 0.12, inputs.greenScenario === 'upslope' ? -1.1 : 0.05]} scale={[1.4, 0.62, 1]}>
          <ringGeometry args={[2.5, 2.58, 96]} />
          <meshBasicMaterial color="#d8cf76" transparent opacity={inputs.greenScenario === 'level' ? 0.24 : 0.48} />
        </mesh>
        <mesh rotation-x={-Math.PI / 2} position={[0.6, 0.17, inputs.greenScenario === 'backstop' ? 2.4 : -1.9]} scale={[1.15, 0.36, 1]}>
          <ringGeometry args={[2.3, 2.38, 96]} />
          <meshBasicMaterial color="#f8efd9" transparent opacity={0.4} />
        </mesh>
      </group>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.01, -0.2]}>
        <circleGeometry args={[1.15, 48]} />
        <meshStandardMaterial color={lieColor[inputs.lie]} roughness={0.96} />
      </mesh>
      {inputs.lie === 'bunker' || inputs.lie === 'plugged-bunker' ? (
        <mesh rotation-x={-Math.PI / 2} position={[0, 0.03, -0.2]}>
          <ringGeometry args={[0.74, 1.15, 64]} />
          <meshBasicMaterial color="#f1e3b0" transparent opacity={0.65} />
        </mesh>
      ) : null}
      <mesh rotation-x={-Math.PI / 2} position={[-2.95, 0.08, greenCenterZ - 0.72]}>
        <circleGeometry args={[0.72, 42]} />
        <meshBasicMaterial color="#d7c58a" transparent opacity={0.88} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[2.65, 0.08, greenCenterZ + 0.96]}>
        <circleGeometry args={[0.64, 42]} />
        <meshBasicMaterial color="#d7c58a" transparent opacity={0.82} />
      </mesh>
      <gridHelper args={[Math.max(18, groundLength), 12, '#dce9d2', '#65835d']} position={[0, 0.02, groundLength * 0.5 - 4]} />
      <mesh position={[0, 0.12, 0]}>
        <sphereGeometry args={[0.11, 24, 12]} />
        <meshStandardMaterial color="#f8f2e4" roughness={0.42} />
      </mesh>
      <Trajectory points={flightPoints} color="#e86f23" opacity={0.98} scale={ydToShortScene} width={3.8} />
      <Trajectory points={result.rollPoints} color="#f8efd9" opacity={0.82} scale={ydToShortScene} width={3.2} dashed />
      {result.missWindows.filter((miss) => miss.label !== 'clean').map((miss, index) => (
        <Trajectory
          key={miss.label}
          points={[[index === 0 ? 0.42 : -0.42, 0.05, miss.carryYd], [index === 0 ? 0.9 : -0.9, 0.05, miss.totalYd]]}
          color={index === 0 ? '#301b12' : '#6a5842'}
          opacity={0.48}
          scale={ydToShortScene}
          width={2.1}
          dashed
        />
      ))}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.1, landingZ]}>
        <ringGeometry args={[0.18, 0.27, 48]} />
        <meshBasicMaterial color="#e86f23" transparent opacity={0.9} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.085, landingZ]} scale={[result.landingWindowYd * ydToShortScene * 0.5, 0.42, 1]}>
        <ringGeometry args={[0.58, 0.64, 56]} />
        <meshBasicMaterial color="#f8efd9" transparent opacity={0.45} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.11, firstBounceZ]}>
        <ringGeometry args={[0.11, 0.18, 36]} />
        <meshBasicMaterial color="#301b12" transparent opacity={0.58} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.1, secondBounceZ]}>
        <ringGeometry args={[0.08, 0.14, 36]} />
        <meshBasicMaterial color="#301b12" transparent opacity={0.42} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.08, totalZ]}>
        <ringGeometry args={[0.22, 0.31, 48]} />
        <meshBasicMaterial color="#f8efd9" transparent opacity={0.72} />
      </mesh>
      <OrbitControls makeDefault enablePan={false} target={[0, 1.4, Math.max(4.5, totalZ * 0.52)]} maxPolarAngle={Math.PI / 2.08} />
    </>
  );
}

function OptionGroup<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
  labelFor,
}: {
  label: string;
  value: T;
  options: readonly T[];
  onChange: (value: T) => void;
  className?: string;
  labelFor?: (value: T) => string;
}) {
  return (
    <section className="option-group" aria-label={label}>
      <span>{label}</span>
      <div className={clsx('segmented', className)}>
        {options.map((option) => (
          <button key={option} type="button" className={clsx(value === option && 'active')} aria-pressed={value === option} onClick={() => onChange(option)}>
            {labelFor ? labelFor(option) : option}
          </button>
        ))}
      </div>
    </section>
  );
}

function PitchLieVisual({ lie }: { lie: LieType }) {
  const visual = lieVisuals[lie];
  return (
    <section className="pitch-lie-card" aria-label="pitch lie visual">
      <div className={clsx('lie-stage', `grass-${visual.grass}`, `ball-${visual.ball}`)} aria-hidden="true">
        <span className="grass-blade blade-a" />
        <span className="grass-blade blade-b" />
        <span className="grass-blade blade-c" />
        <span className="grass-blade blade-d" />
        <span className="lie-ball" />
        <span className="ground-line" />
      </div>
      <div>
        <span>Pitch lie</span>
        <strong>{visual.title}</strong>
        <p>{visual.note}</p>
      </div>
    </section>
  );
}

function ShortPanel() {
  const inputs = useLabStore((state) => state.shortInputs);
  const setShortInput = useLabStore((state) => state.setShortInput);
  const result = useMemo(() => simulateShortGame(inputs), [inputs]);
  const manifest = modules.find((module) => module.id === 'short')!;
  const shortMatrix = useMemo(() => (['Gap', 'Sand', 'Lob'] as WedgeType[]).map((wedge) => {
    const defaults = shortGameWedgeDefaults[wedge];
    return {
      wedge,
      carries: (['7:30', '9:00', '10:30'] as SwingClock[]).map((swing) => Math.round(simulateShortGame({
        ...inputs,
        wedge,
        swing,
        loftDeg: defaults.loftDeg,
        bounceDeg: defaults.bounceDeg,
      }).carryYd)),
    };
  }), [inputs]);
  const setWedge = (wedge: WedgeType) => {
    const defaults = shortGameWedgeDefaults[wedge];
    setShortInput('wedge', wedge);
    setShortInput('loftDeg', defaults.loftDeg);
    setShortInput('bounceDeg', defaults.bounceDeg);
  };
  const setCategory = (category: ShotCategory) => {
    const preset = categoryDefaults[category];
    const defaults = shortGameWedgeDefaults[preset.wedge];
    setShortInput('category', category);
    setShortInput('shot', preset.shot);
    setShortInput('carryYd', preset.carryYd);
    setShortInput('wedge', preset.wedge);
    setShortInput('swing', preset.swing);
    setShortInput('loftDeg', defaults.loftDeg);
    setShortInput('bounceDeg', defaults.bounceDeg);
    if (category === 'sand' && inputs.lie !== 'bunker' && inputs.lie !== 'plugged-bunker') {
      setShortInput('lie', 'bunker');
      setShortInput('grass', 'sand');
    }
  };
  return (
    <aside className="panel">
      <OptionGroup<ShotCategory> label="Category" value={inputs.category} options={['chip', 'pitch', 'distance-wedge', 'sand']} onChange={setCategory} labelFor={(value) => shortCategoryLabels[value]} className="short-categories" />
      <OptionGroup<LieType> label="Lie" value={inputs.lie} options={['fairway', 'tight', 'sitting-up', 'in-between', 'sitting-down', 'flier', 'rough', 'wet-rough', 'hardpan', 'bunker', 'plugged-bunker']} onChange={(value) => setShortInput('lie', value)} labelFor={(value) => shortLieLabels[value]} className="short-lies" />
      <PitchLieVisual lie={inputs.lie} />
      <OptionGroup<GrassType> label="Grass / grain" value={inputs.grass} options={['bent', 'bermuda', 'fescue', 'sand', 'into-grain', 'down-grain']} onChange={(value) => setShortInput('grass', value)} labelFor={(value) => shortGrassLabels[value]} className="short-grass" />
      <OptionGroup<WedgeType> label="Wedge" value={inputs.wedge} options={['Gap', 'Sand', 'Lob']} onChange={setWedge} />
      <OptionGroup<SwingClock> label="Clock" value={inputs.swing} options={['7:30', '9:00', '10:30']} onChange={(value) => setShortInput('swing', value)} />
      <OptionGroup<ShotType> label="Shot shape" value={inputs.shot} options={['chip', 'pitch', 'flop', 'blast', 'bump']} onChange={(value) => setShortInput('shot', value)} labelFor={(value) => shortShotLabels[value]} className="five-up" />
      <Slider label="Landing spot" value={inputs.carryYd} min={5} max={80} step={1} unit=" yd" onChange={(v) => setShortInput('carryYd', v)} />
      <Slider label="Loft" value={inputs.loftDeg} min={46} max={64} step={1} unit=" deg" onChange={(v) => setShortInput('loftDeg', v)} />
      <Slider label="Bounce" value={inputs.bounceDeg} min={4} max={16} step={1} unit=" deg" onChange={(v) => setShortInput('bounceDeg', v)} />
      <Slider label="Face open" value={inputs.faceOpenDeg} min={0} max={18} step={1} unit=" deg" onChange={(v) => setShortInput('faceOpenDeg', v)} />
      <Slider label="Shaft lean" value={inputs.shaftLeanDeg} min={-2} max={12} step={1} unit=" deg" onChange={(v) => setShortInput('shaftLeanDeg', v)} />
      <OptionGroup<GreenScenario> label="Green shape" value={inputs.greenScenario} options={['level', 'upslope', 'downslope', 'crowned', 'backstop']} onChange={(value) => setShortInput('greenScenario', value)} labelFor={(value) => greenScenarioLabels[value]} className="five-up" />
      <Slider label="Firmness" value={inputs.greenFirmness} min={1} max={5} step={1} onChange={(v) => setShortInput('greenFirmness', v)} />
      <section className="short-lesson-card" aria-label="short game relationship">
        <strong>{inputs.lie === 'bunker' ? 'Use the sole' : inputs.lie === 'tight' ? 'Respect the leading edge' : inputs.lie === 'rough' ? 'Expect less friction' : 'Clean contact window'}</strong>
        <p>{result.recommendation}</p>
        <div className="short-chips">
          <span>{result.soleInteraction}</span>
          <span>{result.carryRollRatio} carry-roll</span>
          <span>{nf.format(result.landingWindowYd)} yd window</span>
          <span>{result.surfaceReaction}</span>
        </div>
        {result.risks.length ? <p className="risk-line">{result.risks.join(' / ')}</p> : null}
      </section>
      <section className="short-outcome-card" aria-label="short game miss outcomes">
        <span>Miss pattern</span>
        {result.missWindows.map((miss) => (
          <div key={miss.label} className="outcome-row">
            <strong>{miss.label}</strong>
            <b>{Math.round(miss.carryYd)} / {Math.round(miss.totalYd)} yd</b>
            <p>{miss.note}</p>
          </div>
        ))}
      </section>
      <section className="short-matrix-card" aria-label="Pelz style clock matrix">
        <div className="matrix-head">
          <span>Clock matrix</span>
          <b>carry yd</b>
        </div>
        <div className="matrix-labels"><span /> <span>7:30</span><span>9:00</span><span>10:30</span></div>
        {shortMatrix.map((row) => (
          <div key={row.wedge} className="matrix-row">
            <strong>{row.wedge}</strong>
            {row.carries.map((carry, index) => <span key={`${row.wedge}:${index}`}>{carry}</span>)}
          </div>
        ))}
      </section>
      <div className="readouts" aria-live="polite">
        <Readout label="Launch" value={`${nf.format(result.launchDeg)} deg`} receipt={result.receipts.launch} />
        <Readout label="Spin" value={`${result.spinRpm} rpm`} receipt={result.receipts.spin} />
        <Readout label="Effective loft" value={`${nf.format(result.effectiveLoftDeg)} deg`} receipt={result.receipts.bounce} />
        <Readout label="Effective bounce" value={`${nf.format(result.effectiveBounceDeg)} deg`} receipt={result.receipts.bounce} />
        <Readout label="Apex" value={`${nf.format(result.apexFt)} ft`} />
        <Readout label="Carry" value={`${nf.format(result.carryYd)} yd`} />
        <Readout label="Rollout" value={`${nf.format(result.rolloutYd)} yd`} receipt={result.receipts.rollout} />
        <Readout label="First bounce" value={`${nf.format(result.firstBounceYd)} yd`} receipt={result.receipts.rollout} />
        <Readout label="Total" value={`${nf.format(result.totalYd)} yd`} />
        <Readout label="Contact" value={`${Math.round(result.contactQuality * 100)}%`} receipt="Contact quality is a simple first-pass lie/bounce model: high bounce helps sand and rough, but too much bounce can make tight lies harder." />
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

function FeedbackDock() {
  const activeModule = useLabStore((state) => state.activeModule);
  const impactInputs = useLabStore((state) => state.impactInputs);
  const greenInputs = useLabStore((state) => state.greenInputs);
  const shortInputs = useLabStore((state) => state.shortInputs);
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<'bug' | 'idea' | 'confusing'>('bug');
  const [score, setScore] = useState(3);
  const [text, setText] = useState('');
  const [status, setStatus] = useState('');
  const trimmed = text.trim();
  const canSubmit = trimmed.length >= 12 && trimmed.length <= 1200;

  const submitFeedback = async () => {
    if (!canSubmit) {
      setStatus('Add a little more detail.');
      return;
    }
    const payload = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      kind,
      score,
      text: trimmed,
      context: {
        activeModule,
        url: window.location.href,
        viewport: { width: window.innerWidth, height: window.innerHeight },
        userAgent: navigator.userAgent,
        inputs: activeModule === 'impact' ? impactInputs : activeModule === 'green' ? greenInputs : activeModule === 'short' ? shortInputs : null,
      },
    };
    const existing = JSON.parse(localStorage.getItem('flightlab.feedback') ?? '[]') as unknown[];
    localStorage.setItem('flightlab.feedback', JSON.stringify([...existing, payload].slice(-100)));
    setStatus('Stored locally.');
    if (feedbackEndpoint) {
      try {
        const response = await fetch(feedbackEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          keepalive: true,
        });
        setStatus(response.ok ? 'Sent and stored.' : 'Stored locally; send failed.');
      } catch {
        setStatus('Stored locally; offline send failed.');
      }
    }
    setText('');
  };

  return (
    <div className={clsx('feedback-dock', open && 'open')}>
      <button type="button" className="feedback-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
        <MessageSquare size={18} />
        <span>Feedback</span>
      </button>
      {open ? (
        <section className="feedback-panel" aria-label="flightlab feedback">
          <div className="feedback-row">
            {(['bug', 'confusing', 'idea'] as const).map((option) => (
              <button key={option} type="button" className={clsx(kind === option && 'active')} aria-pressed={kind === option} onClick={() => setKind(option)}>
                {option}
              </button>
            ))}
          </div>
          <label className="control feedback-score">
            <span>Signal<b>{score}/5</b></span>
            <input type="range" min={1} max={5} step={1} value={score} onChange={(event) => setScore(Number(event.currentTarget.value))} />
          </label>
          <textarea
            value={text}
            minLength={12}
            maxLength={1200}
            placeholder="What broke, confused you, or would make this better?"
            onChange={(event) => setText(event.currentTarget.value)}
          />
          <div className="feedback-actions">
            <span>{status || `${trimmed.length}/1200`}</span>
            <button type="button" onClick={submitFeedback} disabled={!canSubmit}>Send</button>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function ResultHud() {
  const activeModule = useLabStore((state) => state.activeModule);
  const impactInputs = useLabStore((state) => state.impactInputs);
  const greenInputs = useLabStore((state) => state.greenInputs);
  const shortInputs = useLabStore((state) => state.shortInputs);
  const impact = useMemo(() => simulateImpact(impactInputs), [impactInputs]);
  const green = useMemo(() => simulateGreen(greenInputs), [greenInputs]);
  const short = useMemo(() => simulateShortGame(shortInputs), [shortInputs]);

  if (activeModule === 'impact') {
    const flightLabel = activeFlightPreset(impactInputs)?.label ?? namedFlight(impactInputs);
    return (
      <section className="result-hud" aria-label="impact result summary">
        <span>Shot</span>
        <strong>{flightLabel}</strong>
        <div><b>{Math.round(impact.carryYd)}</b><small>carry yd</small></div>
        <div><b>{nf.format(impact.offlineYd)}</b><small>offline yd</small></div>
        <div><b>{Math.round(impact.spinRpm)}</b><small>spin rpm</small></div>
      </section>
    );
  }

  if (activeModule === 'green') {
    return (
      <section className="result-hud" aria-label="putting result summary">
        <span>Putt</span>
        <strong>{green.made ? 'Captured' : 'Missed'}</strong>
        <div><b>{nf.format(Math.abs(green.breakFt))}</b><small>break ft</small></div>
        <div><b>{nf.format(green.stopPastFt)}</b><small>stop ft</small></div>
        <div><b>{nf.format(green.leave.distanceFt)}</b><small>next ft</small></div>
      </section>
    );
  }

  if (activeModule === 'short') {
    return (
      <section className="result-hud" aria-label="short game result summary">
        <span>{shortCategoryLabels[shortInputs.category]}</span>
        <strong>{short.check}</strong>
        <div><b>{Math.round(short.carryYd)}</b><small>carry yd</small></div>
        <div><b>{nf.format(short.rolloutYd)}</b><small>roll yd</small></div>
        <div><b>{short.carryRollRatio}</b><small>carry-roll</small></div>
      </section>
    );
  }

  return null;
}

export function App() {
  const activeModule = useLabStore((state) => state.activeModule);
  const impactView = useLabStore((state) => state.impactView);
  const activeManifest = modules.find((module) => module.id === activeModule);
  const camera = activeModule === 'green'
    ? { position: [0, 13, -15] as [number, number, number], fov: 48 }
    : activeModule === 'short'
      ? { position: [0, 9.5, -14] as [number, number, number], fov: 52 }
    : { position: [0, 3.2, -24] as [number, number, number], fov: impactCameraFov[impactView] };
  return (
    <main className="app">
      <ModuleRail />
      <section className="stage">
        <div className="scene">
          <Canvas key={`${activeModule}-${impactView}`} camera={camera} dpr={[1, 1.75]}>
            {activeModule === 'impact' ? <ImpactScene /> : activeModule === 'green' ? <GreenScene /> : activeModule === 'short' ? <ShortScene /> : null}
          </Canvas>
        </div>
        <ViewSwitcher />
        <header className="hud">
          <span>flightlab</span>
          <strong>{activeManifest?.title}</strong>
        </header>
        <ResultHud />
      </section>
      {activeModule === 'impact' ? <ImpactPanel /> : activeModule === 'green' ? <GreenPanel /> : activeModule === 'short' ? <ShortPanel /> : <PlaceholderPanel />}
      <FeedbackDock />
    </main>
  );
}
