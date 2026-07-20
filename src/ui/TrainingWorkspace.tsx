import { useEffect, useMemo, useState } from 'react';
import { clsx } from 'clsx';
import { simulateImpact } from '../sim/impact';
import { simulateGreen } from '../sim/green';
import { simulateShortGame } from '../sim/shortGame';
import { useLabStore, type ModuleId } from '../store/labStore';

const nf = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
type TrainingMode = 'ladder' | 'streak' | 'predict' | 'boss' | 'daily' | 'coach';
type SkillScores = Record<'flight' | 'strike' | 'pace' | 'read' | 'wedge' | 'lie', number>;

const modeCopy: Record<TrainingMode, { label: string; kicker: string }> = {
  ladder: { label: 'Distance ladder', kicker: 'Clear each rung' },
  streak: { label: 'Pressure streak', kicker: 'Three in a row' },
  predict: { label: 'Call your shot', kicker: 'Predict, then reveal' },
  boss: { label: 'Boss hole', kicker: 'Compound conditions' },
  daily: { label: 'Daily course', kicker: 'Three-skill circuit' },
  coach: { label: 'Coach challenge', kicker: 'Assigned practice' },
};

const moduleLabels: Record<ModuleId, string> = { impact: 'Flight Control', green: 'Green Reading', short: 'Short Game', gained: 'Scoring' };

function resultFor(activeModule: ModuleId) {
  const state = useLabStore.getState();
  if (activeModule === 'impact') {
    const result = simulateImpact(state.impactInputs);
    return { success: Math.abs(result.offlineYd) <= 5, score: Math.max(0, 100 - Math.abs(result.offlineYd) * 8), summary: `${Math.round(result.carryYd)} yd · ${nf.format(Math.abs(result.offlineYd))} yd offline` };
  }
  if (activeModule === 'green') {
    const result = simulateGreen(state.greenInputs, false);
    return { success: result.made, score: result.made ? 100 : Math.max(0, 90 - result.leave.distanceFt * 12), summary: result.made ? 'Center-cup capture' : `${nf.format(result.leave.distanceFt)} ft leave` };
  }
  const result = simulateShortGame(state.shortInputs);
  const error = Math.abs(result.totalYd - state.shortInputs.carryYd);
  return { success: error <= Math.max(2, result.landingWindowYd), score: Math.max(0, 100 - error * 7), summary: `${nf.format(result.carryYd)} carry · ${nf.format(result.rolloutYd)} release` };
}

function Gauge({ label, value, max = 100, note }: { label: string; value: number; max?: number; note: string }) {
  const percent = Math.max(0, Math.min(100, value / max * 100));
  return (
    <section className="game-gauge">
      <div><span>{label}</span><b>{Math.round(value)}</b></div>
      <i><em style={{ width: `${percent}%` }} /></i>
      <small>{note}</small>
    </section>
  );
}

function WindCompass() {
  const [speed, setSpeed] = useState(8);
  const [direction, setDirection] = useState(45);
  return (
    <section className="widget-card wind-widget">
      <header><span>Planning wind</span><b>{speed} MPH · {direction}°</b></header>
      <div className="wind-body">
        <div className="wind-dial"><i style={{ transform: `rotate(${direction}deg)` }}>↑</i><span>N</span></div>
        <div>
          <label>Speed<input type="range" min="0" max="25" value={speed} onChange={(event) => setSpeed(Number(event.currentTarget.value))} /></label>
          <label>Direction<input type="range" min="0" max="355" step="5" value={direction} onChange={(event) => setDirection(Number(event.currentTarget.value))} /></label>
        </div>
      </div>
      <p>Decision overlay: a {speed} mph crosswind asks for roughly {nf.format(speed * 0.7)} yd of planning room on a full shot.</p>
    </section>
  );
}

function StrikeMap() {
  const inputs = useLabStore((state) => state.impactInputs);
  const setImpactInput = useLabStore((state) => state.setImpactInput);
  return (
    <section className="widget-card">
      <header><span>Strike map</span><b>{inputs.strikeX > .3 ? 'TOE' : inputs.strikeX < -.3 ? 'HEEL' : 'CENTER'} · {inputs.strikeY > .3 ? 'HIGH' : inputs.strikeY < -.3 ? 'LOW' : 'MID'}</b></header>
      <div className="strike-map" aria-label="clubface strike selector">
        {[2, 1, 0, -1, -2].flatMap((y) => [-2, -1, 0, 1, 2].map((x) => (
          <button key={`${x}:${y}`} type="button" className={clsx(Math.round(inputs.strikeX) === x && Math.round(inputs.strikeY) === y && 'active')} onClick={() => { setImpactInput('strikeX', x); setImpactInput('strikeY', y); }} aria-label={`Strike ${x < 0 ? 'heel' : x > 0 ? 'toe' : 'center'}, ${y < 0 ? 'low' : y > 0 ? 'high' : 'middle'}`} />
        )))}
      </div>
      <p>Move impact around the face and watch speed, launch, spin, and curvature respond.</p>
    </section>
  );
}

function AnalyzeWorkspace() {
  const activeModule = useLabStore((state) => state.activeModule);
  const impactInputs = useLabStore((state) => state.impactInputs);
  const greenInputs = useLabStore((state) => state.greenInputs);
  const shortInputs = useLabStore((state) => state.shortInputs);
  const ghosts = useLabStore((state) => state.ghosts);
  const impact = useMemo(() => simulateImpact(impactInputs), [impactInputs]);
  const green = useMemo(() => simulateGreen(greenInputs, false), [greenInputs]);
  const short = useMemo(() => simulateShortGame(shortInputs), [shortInputs]);
  const confidence = activeModule === 'impact' ? Math.max(22, 96 - Math.abs(impact.offlineYd) * 5) : activeModule === 'green' ? Math.max(18, 100 - green.leave.distanceFt * 14) : Math.max(24, short.contactQuality * 100 - short.risks.length * 8);

  return (
    <aside className="panel training-panel">
      <div className="workspace-heading"><span>Analyze</span><strong>{moduleLabels[activeModule]}</strong><p>Every widget answers a shot decision.</p></div>
      {activeModule !== 'green' ? <WindCompass /> : null}
      {activeModule === 'impact' ? (
        <>
          <StrikeMap />
          <section className="widget-card"><header><span>Dispersion cone</span><b>±{Math.round(Math.max(8, impact.carryYd * .06))} YD</b></header><div className="dispersion-cone"><i style={{ width: `${Math.min(92, 30 + Math.abs(impact.offlineYd) * 3)}%` }} /></div><p>Current center is {nf.format(Math.abs(impact.offlineYd))} yd {impact.offlineYd < 0 ? 'left' : 'right'}; face-to-path is {nf.format(impact.faceToPathDeg)}°.</p></section>
          <section className="widget-card recipe-card"><header><span>Shot recipe</span><b>{impactInputs.club}</b></header><ol><li>Start line: {nf.format(impact.startLineDeg)}°</li><li>Launch window: {nf.format(impact.launchAngleDeg)}°</li><li>Carry: {Math.round(impact.carryYd)} yd</li><li>Finish: {nf.format(impact.offlineYd)} yd offline</li></ol></section>
          <section className="widget-card"><header><span>Ghost locker</span><b>{ghosts.length}/5</b></header><p>{ghosts.length ? `${ghosts[0].label} is the latest comparison trace. Capture another setup to compare the shape in-scene.` : 'Capture a trace in Setup to create a personal-best ghost.'}</p></section>
        </>
      ) : activeModule === 'green' ? (
        <>
          <Gauge label="Cup capture" value={green.captureRadiusM / .0254} max={4.25} note={`${nf.format(green.lipSpeedMs)} m/s lip speed · slower entry makes more cup available`} />
          <Gauge label="Pace window" value={Math.max(0, 100 - Math.abs(green.stopPastFt - 1.5) * 28)} note={`${nf.format(green.stopPastFt)} ft finish · target 1–2 ft past`} />
          <section className="widget-card recipe-card"><header><span>Putt recipe</span><b>{green.made ? 'CAPTURED' : 'ADJUST'}</b></header><ol><li>{greenInputs.distanceFt} ft start</li><li>{greenInputs.slopePercent}% fall {greenInputs.slopeDirectionDeg}°</li><li>Aim {nf.format(Math.abs(greenInputs.aimDeg))}° {greenInputs.aimDeg < 0 ? 'left' : 'right'}</li><li>Leave: {green.leave.distanceFt ? `${nf.format(green.leave.distanceFt)} ft` : 'holed'}</li></ol></section>
        </>
      ) : (
        <>
          <section className="widget-card lie-badge"><header><span>Lie condition</span><b>{shortInputs.lie.replaceAll('-', ' ')}</b></header><strong>{Math.round(short.contactQuality * 100)}% contact window</strong><p>{short.recommendation}</p></section>
          <Gauge label="Landing window" value={short.landingWindowYd} max={12} note={`${nf.format(short.carryYd)} yd carry · ${nf.format(short.rolloutYd)} yd rollout`} />
          <section className="widget-card"><header><span>Landing reticle</span><b>{short.carryRollRatio}</b></header><div className="landing-reticle"><i /><i /><i /></div><p>Center the first bounce inside a {nf.format(short.landingWindowYd)} yd window; expect it to {short.surfaceReaction}.</p></section>
          <section className="widget-card recipe-card"><header><span>Shot recipe</span><b>{shortInputs.wedge} · {shortInputs.swing}</b></header><ol><li>{shortInputs.shot} from {shortInputs.lie}</li><li>{nf.format(short.effectiveLoftDeg)}° effective loft</li><li>{nf.format(short.carryYd)} yd carry</li><li>{nf.format(short.totalYd)} yd total</li></ol></section>
        </>
      )}
      <Gauge label="Confidence" value={confidence} note="Live confidence blends proximity, contact quality, and current miss severity." />
    </aside>
  );
}

function TrainingWorkspace() {
  const activeModule = useLabStore((state) => state.activeModule);
  const [mode, setMode] = useState<TrainingMode>('ladder');
  const [attempts, setAttempts] = useState(0);
  const [wins, setWins] = useState(0);
  const [streak, setStreak] = useState(0);
  const [rung, setRung] = useState(1);
  const [prediction, setPrediction] = useState('straight');
  const [revealed, setRevealed] = useState(false);
  const [quizAnswer, setQuizAnswer] = useState('');
  const [skills, setSkills] = useState<SkillScores>(() => {
    try { return JSON.parse(localStorage.getItem('flightlab.skills') ?? '') as SkillScores; } catch { return { flight: 28, strike: 20, pace: 24, read: 18, wedge: 22, lie: 16 }; }
  });
  const live = resultFor(activeModule);
  const stars = attempts < 3 ? 0 : wins / attempts >= .8 ? 3 : wins / attempts >= .55 ? 2 : 1;
  useEffect(() => localStorage.setItem('flightlab.skills', JSON.stringify(skills)), [skills]);

  const record = (success: boolean) => {
    setAttempts((value) => value + 1);
    setWins((value) => value + (success ? 1 : 0));
    setStreak((value) => success ? value + 1 : 0);
    if (success && mode === 'ladder') setRung((value) => Math.min(5, value + 1));
    const keys: (keyof SkillScores)[] = activeModule === 'impact' ? ['flight', 'strike'] : activeModule === 'green' ? ['pace', 'read'] : ['wedge', 'lie'];
    setSkills((current) => ({ ...current, [keys[attempts % 2]]: Math.min(100, current[keys[attempts % 2]] + (success ? 4 : 1)) }));
  };
  const reset = () => { setAttempts(0); setWins(0); setStreak(0); setRung(1); setRevealed(false); };
  const impactInputs = useLabStore((state) => state.impactInputs);
  const currentCurve = activeModule === 'impact' ? (impactInputs.faceAngleDeg - impactInputs.clubPathDeg > .5 ? 'fade' : impactInputs.faceAngleDeg - impactInputs.clubPathDeg < -.5 ? 'draw' : 'straight') : live.success ? 'success' : 'miss';

  return (
    <aside className="panel training-panel">
      <div className="workspace-heading"><span>Train</span><strong>Practice Arcade</strong><p>Choose a game. Every result feeds the skills passport.</p></div>
      <div className="training-mode-grid">
        {(Object.keys(modeCopy) as TrainingMode[]).map((id) => <button type="button" className={clsx(mode === id && 'active')} key={id} onClick={() => { setMode(id); reset(); }}><b>{modeCopy[id].label}</b><small>{modeCopy[id].kicker}</small></button>)}
      </div>
      <section className="score-bug"><div><span>{modeCopy[mode].label}</span><strong>{wins}/{attempts}</strong></div><div><span>Streak</span><strong>{streak}</strong></div><div><span>Rating</span><strong>{'★'.repeat(stars)}{'☆'.repeat(3 - stars)}</strong></div></section>

      {mode === 'ladder' ? <section className="training-game"><span>Rung {rung}/5</span><strong>{activeModule === 'green' ? `${rung * 5} FT` : activeModule === 'short' ? `${rung * 10 + 10} YD` : `${100 + rung * 40} YD`}</strong><p>Clear the current target to move back. A miss holds the rung.</p></section> : null}
      {mode === 'streak' ? <section className="training-game"><span>Pressure gate</span><strong>{streak >= 3 ? 'GATE CLEARED' : `${3 - streak} TO GO`}</strong><p>Make three consecutive attempts. One miss resets the pressure count.</p></section> : null}
      {mode === 'predict' ? <section className="training-game"><span>Call your shot</span><div className="prediction-row">{['draw', 'straight', 'fade'].map((value) => <button type="button" className={clsx(prediction === value && 'active')} onClick={() => { setPrediction(value); setRevealed(false); }} key={value}>{value}</button>)}</div><button type="button" className="reveal-button" onClick={() => setRevealed(true)}>Reveal flight</button>{revealed ? <p className={clsx('prediction-result', prediction === currentCurve && 'correct')}>{prediction === currentCurve ? 'Read confirmed.' : `Actual result: ${currentCurve}.`} Face-to-path explains the curve.</p> : <p>Commit to an outcome before revealing the model.</p>}</section> : null}
      {mode === 'boss' ? <section className="training-game boss-game"><span>Boss hole · 18</span><strong>THE CROWN</strong><p>12 mph quartering wind · firm crowned green · short-sided miss. Win requires a high-quality result and no bailout.</p><div className="boss-health"><i style={{ width: `${Math.max(0, 100 - wins * 34)}%` }} /></div></section> : null}
      {mode === 'daily' ? <section className="daily-course">{[['01', 'Flight window'], ['02', 'Landing number'], ['03', 'Pressure putt']].map(([no, title], index) => <div key={no} className={clsx(index < wins && 'complete')}><b>{no}</b><span>{title}</span><small>{index < wins ? 'CLEARED' : index === wins ? 'UP NEXT' : 'LOCKED'}</small></div>)}</section> : null}
      {mode === 'coach' ? <section className="training-game"><span>Coach pack · CM-014</span><strong>WEDGE CONTROL</strong><p>Assigned session: 10 shots to three landing windows. Target score 700. Share the session receipt when complete.</p><div className="coach-code">COACH CODE · CM-014</div></section> : null}

      <section className="live-attempt"><span>Live result</span><strong>{live.summary}</strong><Gauge label="Quality" value={live.score} note={live.success ? 'Inside the current success window.' : 'Outside the current success window.'} /><div><button type="button" onClick={() => record(false)}>Record miss</button><button type="button" className="success" onClick={() => record(true)}>Record success</button></div></section>

      <section className="widget-card caddie-quiz"><header><span>Caddie quiz</span><b>LEARN</b></header><p>{activeModule === 'green' ? 'If you add pace, does the putt take more break or less?' : activeModule === 'short' ? 'From a tight lie, which edge becomes more dangerous?' : 'Which relationship controls curvature most directly?'}</p><div>{(activeModule === 'green' ? ['More break', 'Less break'] : activeModule === 'short' ? ['Leading edge', 'Trailing edge'] : ['Face-to-path', 'Club speed']).map((answer) => <button type="button" className={clsx(quizAnswer === answer && 'selected')} key={answer} onClick={() => setQuizAnswer(answer)}>{answer}</button>)}</div>{quizAnswer ? <small>{['Less break', 'Leading edge', 'Face-to-path'].includes(quizAnswer) ? 'Correct—carry that read into the next attempt.' : 'Try again. Ask what changes direction versus only distance.'}</small> : null}</section>

      <section className="skills-passport"><header><span>Skills passport</span><b>LEVEL {Math.floor(Object.values(skills).reduce((a, b) => a + b, 0) / 60)}</b></header>{Object.entries(skills).map(([skill, value]) => <div key={skill}><span>{skill}</span><i><em style={{ width: `${value}%` }} /></i><b>{value}</b></div>)}</section>
    </aside>
  );
}

export function LearningWorkspace({ mode }: { mode: 'train' | 'analyze' }) {
  return mode === 'train' ? <TrainingWorkspace /> : <AnalyzeWorkspace />;
}
