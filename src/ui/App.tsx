import { Canvas } from '@react-three/fiber';
import { Line, OrbitControls, Text } from '@react-three/drei';
import { Activity, CircleDot, FlaskConical, Gauge, MessageSquare, Target } from 'lucide-react';
import { useMemo, useState } from 'react';
import { clsx } from 'clsx';
import { clubDefaults, namedFlight, simulateImpact, type ClubName, type Handedness, type HolePar, type ImpactInputs } from '../sim/impact';
import { simulateGreen } from '../sim/green';
import { modules } from '../modules/registry';
import { useLabStore } from '../store/labStore';

const nf = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
const greenScale = 5;
const ftToScene = 0.3048 * greenScale;
const compassLabels = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const parDefaults: Record<HolePar, number> = { par3: 165, par4: 440, par5: 560 };
const ydToImpactScene = 0.15;
const impactLateralScale = 0.32;
const feedbackEndpoint = import.meta.env.VITE_FEEDBACK_ENDPOINT as string | undefined;

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
  const targetZ = inputs.targetDistanceYd * ydToImpactScene;
  const carryZ = result.carryYd * ydToImpactScene;
  const landingX = result.offlineYd * impactLateralScale;
  const dispersionWidthYd = Math.round(Math.max(16, result.carryYd * (inputs.club === 'Driver' ? 0.12 : inputs.club === '6-iron' ? 0.09 : 0.07)));
  const dispersionHalfX = (dispersionWidthYd / 2) * impactLateralScale;
  const dispersionDepth = Math.max(9, result.carryYd * 0.045) * ydToImpactScene;
  const trees = useMemo(() => [-1, 1].flatMap((side) => [70, 120, 175, 235, 305, 385, 485].map((z, index) => ({
    x: side * (23 + (index % 3) * 5),
    z: z * ydToImpactScene,
    h: 3.8 + (index % 4) * 0.55,
  }))), []);
  return (
    <>
      <ambientLight intensity={0.8} />
      <directionalLight position={[4, 8, 5]} intensity={1.6} />
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.04, 52]}>
        <planeGeometry args={[96, 126]} />
        <meshStandardMaterial color="#4f6649" roughness={0.94} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.02, 47]}>
        <planeGeometry args={[34, 104]} />
        <meshStandardMaterial color="#6f8468" roughness={0.92} metalness={0.02} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.015, -1]}>
        <circleGeometry args={[3.2, 48]} />
        <meshBasicMaterial color="#f8efd9" transparent opacity={0.18} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.02, targetZ]}>
        <circleGeometry args={[8.8, 64]} />
        <meshStandardMaterial color="#8fa67f" roughness={0.86} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[-11, 0.035, targetZ - 2.5]}>
        <circleGeometry args={[3.8, 40]} />
        <meshBasicMaterial color="#d7c58a" transparent opacity={0.94} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[10.5, 0.035, targetZ + 4.5]}>
        <circleGeometry args={[4.6, 40]} />
        <meshBasicMaterial color="#d7c58a" transparent opacity={0.9} />
      </mesh>
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
      <gridHelper args={[86, 18, '#f5f0e4', '#9aaa91']} position={[0, 0.01, 47]} />
      <mesh position={[0, 0.25, 0]}>
        <sphereGeometry args={[0.32, 32, 16]} />
        <meshStandardMaterial color="#f7f1e3" roughness={0.46} />
      </mesh>
      <mesh position={[inputs.strikeX * 0.25, 0.8 + inputs.strikeY * 0.1, -1.1]} rotation-y={inputs.faceAngleDeg * Math.PI / 180}>
        <boxGeometry args={[2.4, 1.35, 0.14]} />
        <meshStandardMaterial color="#2a3128" transparent opacity={0.42} roughness={0.82} />
      </mesh>
      {ghosts.map((ghost, index) => (
        <Trajectory key={ghost.id} points={ghost.points} color="#ece4d3" opacity={0.26 - index * 0.025} scale={ydToImpactScene} lateralScale={impactLateralScale} width={2.6} />
      ))}
      <Trajectory points={sampled} color="#e86f23" opacity={0.98} scale={ydToImpactScene} lateralScale={impactLateralScale} width={5.2} />
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
      <Text position={[landingX, 1.45, carryZ]} rotation-y={Math.PI} fontSize={1.55} color="#f8efd9">
        {dispersionWidthYd} yd window
      </Text>
      <Text position={[0, 1.2, targetZ]} rotation-y={Math.PI} fontSize={1.55} color="#f8efd9">
        {inputs.holePar.replace('par', 'Par ')} · {inputs.targetDistanceYd} yd
      </Text>
      <Text position={[result.offlineYd * impactLateralScale, 10, Math.min(85, result.carryYd * 0.55)]} rotation-y={Math.PI} fontSize={2.8} color="#f5f0e4">
        {namedFlight(inputs)}
      </Text>
      <OrbitControls makeDefault enablePan={false} target={[0, 4.5, 54]} maxPolarAngle={Math.PI / 2.1} />
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
    const curve = curveAngles(preset.curve, inputs.handedness);
    const defaults = clubDefaults[inputs.club];
    return Math.abs(inputs.faceAngleDeg - curve.faceAngleDeg) < 0.1
      && Math.abs(inputs.clubPathDeg - curve.clubPathDeg) < 0.1
      && Math.abs(inputs.dynamicLoftDeg - (Number(defaults.dynamicLoftDeg ?? 0) + preset.loftOffsetDeg)) < 0.1;
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
        label: namedFlight(inputs),
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
  const points = result.points.filter((_, index) => index % 8 === 0).map((point) => [point.position[0] * greenScale, 0.13, point.position[1] * greenScale] as [number, number, number]);
  const rolloutPoints = result.rolloutPoints.filter((_, index) => index % 8 === 0).map((point) => [point.position[0] * greenScale, 0.135, point.position[1] * greenScale] as [number, number, number]);
  const leavePoint = [result.leave.position[0] * greenScale, 0.16, result.leave.position[1] * greenScale] as [number, number, number];
  const secondPuttPoints = result.leave.distanceFt > 0.4 ? [leavePoint, [0, 0.16, 0] as [number, number, number]] : [];
  const startZ = -inputs.distanceFt * ftToScene;
  return (
    <>
      <ambientLight intensity={0.9} />
      <directionalLight position={[-3, 6, 4]} intensity={1.4} />
      <mesh rotation-x={-Math.PI / 2}>
        <planeGeometry args={[32, 32, 32, 32]} />
        <meshStandardMaterial color="#748d69" roughness={0.9} />
      </mesh>
      <gridHelper args={[28, 14, '#f5f0e4', '#9bae93']} position={[0, 0.04, 0]} />
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
      <OrbitControls makeDefault enablePan={false} maxPolarAngle={Math.PI / 2.08} />
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
      <Slider label="Pace" value={inputs.pacePastFt} min={0} max={4} step={0.1} unit=" ft past" onChange={(v) => setGreenInput('pacePastFt', v)} />
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
        <p>{result.leave.heightRead}, {result.leave.sideRead}. The dashed return line shows the next putt back to the cup.</p>
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
        inputs: activeModule === 'impact' ? impactInputs : activeModule === 'green' ? greenInputs : null,
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

export function App() {
  const activeModule = useLabStore((state) => state.activeModule);
  const activeManifest = modules.find((module) => module.id === activeModule);
  return (
    <main className="app">
      <ModuleRail />
      <section className="stage">
        <div className="scene">
          <Canvas camera={{ position: activeModule === 'green' ? [0, 13, 15] : [0, 3.2, -24], fov: activeModule === 'green' ? 48 : 56 }} dpr={[1, 1.75]}>
            {activeModule === 'impact' ? <ImpactScene /> : activeModule === 'green' ? <GreenScene /> : null}
          </Canvas>
        </div>
        <header className="hud">
          <span>flightlab</span>
          <strong>{activeManifest?.title}</strong>
        </header>
      </section>
      {activeModule === 'impact' ? <ImpactPanel /> : activeModule === 'green' ? <GreenPanel /> : <PlaceholderPanel />}
      <FeedbackDock />
    </main>
  );
}
