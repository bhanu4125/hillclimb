import { useCallback, useEffect, useRef, useState } from 'react';
import { Coins, Fuel, Gauge, Pause, Play, RotateCcw, Volume2, VolumeX } from 'lucide-react';

const WORLD_SCALE = 2;
const GROUND_Y = 420;
const CAR_X = 190;
const MAX_FUEL = 100;

function terrainHeight(x) {
  return GROUND_Y + Math.sin(x / 330) * 22 + Math.sin(x / 130) * 8 + Math.sin(x / 73) * 4;
}

function terrainSlope(x) {
  return (
    Math.cos(x / 330) * 22 / 330 +
    Math.cos(x / 130) * 8 / 130 +
    Math.cos(x / 73) * 4 / 73
  );
}

function makeTerrain() {
  const points = [];
  for (let x = -300; x < 22000; x += 34) {
    points.push({ x, y: terrainHeight(x) });
  }
  return points;
}

const terrain = makeTerrain();
const collectibles = Array.from({ length: 34 }, (_, i) => ({
  x: 700 + i * 530 + (i % 3) * 90,
  y: 270 + (i % 4) * 45,
  type: i % 5 === 0 ? 'fuel' : 'coin',
}));

export default function App() {
  const canvasRef = useRef(null);
  const stateRef = useRef({
    running: false,
    paused: false,
    gameOver: false,
    distance: 0,
    fuel: MAX_FUEL,
    coins: 0,
    speed: 0,
    x: CAR_X,
    y: GROUND_Y - 46,
    vy: 0,
    wheelAngle: 0,
    spring: 0,
    springVelocity: 0,
    lastTime: 0,
    collected: new Set(),
  });
  const keysRef = useRef({ right: false, left: false });
  const [hud, setHud] = useState({ distance: 0, fuel: MAX_FUEL, coins: 0, speed: 0 });
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [best, setBest] = useState(() => Number(localStorage.getItem('springHillBest') || 0));

  const syncHud = useCallback(() => {
    const s = stateRef.current;
    setHud({
      distance: Math.floor(s.distance),
      fuel: Math.round(s.fuel),
      coins: s.coins,
      speed: Math.round(s.speed),
    });
  }, []);

  const resetGame = useCallback(() => {
    const s = stateRef.current;
    s.running = true;
    s.paused = false;
    s.gameOver = false;
    s.distance = 0;
    s.fuel = MAX_FUEL;
    s.coins = 0;
    s.speed = 0;
    s.x = CAR_X;
    s.y = GROUND_Y - 46;
    s.vy = 0;
    s.spring = 0;
    s.springVelocity = 0;
    s.wheelAngle = 0;
    s.collected.clear();
    s.lastTime = performance.now();
    setGameOver(false);
    setPaused(false);
    setRunning(true);
    syncHud();
  }, [syncHud]);

  const togglePause = useCallback(() => {
    const s = stateRef.current;
    if (!s.running || s.gameOver) return;
    s.paused = !s.paused;
    setPaused(s.paused);
    if (!s.paused) s.lastTime = performance.now();
  }, []);

  const setControl = useCallback((key, value) => {
    keysRef.current[key] = value;
  }, []);

  useEffect(() => {
    const keyDown = (event) => {
      if (event.code === 'ArrowRight' || event.code === 'KeyD') setControl('right', true);
      if (event.code === 'ArrowLeft' || event.code === 'KeyA') setControl('left', true);
      if (event.code === 'Space') {
        event.preventDefault();
        if (!running) resetGame();
        else togglePause();
      }
    };
    const keyUp = (event) => {
      if (event.code === 'ArrowRight' || event.code === 'KeyD') setControl('right', false);
      if (event.code === 'ArrowLeft' || event.code === 'KeyA') setControl('left', false);
    };
    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);
    return () => {
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp);
    };
  }, [resetGame, running, setControl, togglePause]);

  useEffect(() => {
    // The animation loop combines simulation and rendering intentionally.
    // eslint-disable-next-line sonarjs/cognitive-complexity
    const frame = (time) => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
        canvas.width = width * dpr;
        canvas.height = height * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const s = stateRef.current;
      const dt = Math.min((time - (s.lastTime || time)) / 1000, 0.033);
      s.lastTime = time;

      if (s.running && !s.paused && !s.gameOver) {
        const throttle = keysRef.current.right ? 1 : 0;
        const brake = keysRef.current.left ? 1 : 0;
        const drive = throttle * (s.fuel > 0 ? 1 : 0);
        const groundY = terrainHeight(s.x);
        const slope = terrainSlope(s.x);
        const targetSpring = (groundY - s.y - 46) * 0.027;
        const springForce = targetSpring - s.spring * 0.72;
        s.springVelocity += springForce * dt * 55;
        s.springVelocity *= Math.pow(0.996, dt * 60);
        s.spring += s.springVelocity * dt;
        s.spring = Math.max(-22, Math.min(22, s.spring));

        const engineForce = drive * 260;
        s.speed += (engineForce - s.speed * 0.45 - brake * 170 - slope * 34) * dt;
        s.speed = Math.max(0, Math.min(520, s.speed));
        if (drive) s.fuel = Math.max(0, s.fuel - 24 * dt);
        s.x += s.speed * dt;
        s.distance += s.speed * dt * 0.05;
        s.y += s.vy * dt;
        s.vy += (groundY - s.y - 46 - s.vy * 0.14) * dt * 0.7;
        s.wheelAngle += s.speed * dt * 0.12;

        if (s.fuel <= 0 && s.speed < 4) {
          s.running = false;
          s.gameOver = true;
          setGameOver(true);
          setRunning(false);
          const nextBest = Math.max(best, Math.floor(s.distance));
          setBest(nextBest);
          localStorage.setItem('springHillBest', String(nextBest));
        }

        collectibles.forEach((item) => {
          if (s.collected.has(item.x)) return;
          const dx = s.x - item.x;
          const dy = s.y + 46 - item.y;
          if (dx * dx + dy * dy < 95 * 95) {
            s.collected.add(item.x);
            if (item.type === 'coin') s.coins += 1;
            else s.fuel = Math.min(MAX_FUEL, s.fuel + 28);
          }
        });
        syncHud();
      }

      const cameraX = Math.max(0, s.x - width * 0.28);
      ctx.clearRect(0, 0, width, height);
      const sky = ctx.createLinearGradient(0, 0, 0, height);
      sky.addColorStop(0, '#07131f');
      sky.addColorStop(0.65, '#183c50');
      sky.addColorStop(1, '#d8a66b');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, width, height);

      ctx.fillStyle = 'rgba(255,219,118,.18)';
      for (let i = 0; i < 7; i += 1) {
        const x = ((i * 250 - cameraX * 0.05) % (width + 300)) - 160;
        const y = 70 + (i % 3) * 48;
        ctx.beginPath();
        ctx.arc(x, y, 24 + (i % 2) * 10, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.strokeStyle = 'rgba(255,255,255,.12)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 8; i += 1) {
        const y = 80 + i * 45;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      ctx.fillStyle = '#2c685b';
      ctx.beginPath();
      ctx.moveTo(0, height);
      for (let x = -100; x <= width + 100; x += 80) {
        const worldX = cameraX + x;
        const y = terrainHeight(worldX) * 0.75;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(width, height);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = '#7bce87';
      ctx.lineWidth = 5;
      ctx.beginPath();
      for (let x = -100; x <= width + 100; x += 10) {
        const worldX = cameraX + x;
        const y = terrainHeight(worldX);
        if (x === -100) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      ctx.strokeStyle = '#d9f6c8';
      ctx.lineWidth = 2;
      for (let x = 0; x < width; x += 48) {
        const worldX = cameraX + x;
        const y = terrainHeight(worldX);
        ctx.beginPath();
        ctx.moveTo(x, y + 7);
        ctx.lineTo(x + 19, y + 18);
        ctx.stroke();
      }

      collectibles.forEach((item) => {
        if (s.collected.has(item.x)) return;
        const px = item.x - cameraX;
        if (px < -60 || px > width + 60) return;
        ctx.save();
        ctx.translate(px, item.y);
        ctx.rotate(time / 800 + item.x);
        ctx.fillStyle = item.type === 'fuel' ? '#ffb64c' : '#f8d46b';
        ctx.shadowColor = item.type === 'fuel' ? '#ff8a00' : '#ffd84d';
        ctx.shadowBlur = 16;
        ctx.beginPath();
        if (item.type === 'fuel') {
          ctx.roundRect(-11, -18, 22, 36, 7);
          ctx.fill();
          ctx.fillStyle = '#4d2b16';
          ctx.fillRect(-9, -7, 18, 7);
        } else {
          ctx.arc(0, 0, 13, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#9c6c13';
          ctx.lineWidth = 3;
          ctx.stroke();
        }
        ctx.restore();
      });

      const carX = CAR_X - cameraX;
      const carY = s.y + s.spring;
      ctx.save();
      ctx.translate(carX, carY);
      ctx.rotate(Math.atan(terrainSlope(s.x)) * 0.22);
      ctx.fillStyle = '#ff5d4d';
      ctx.shadowColor = '#ff5d4d';
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.roundRect(-61, -18, 122, 35, 11);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#192d3f';
      ctx.beginPath();
      ctx.roundRect(-38, -39, 76, 28, 10);
      ctx.fill();
      ctx.fillStyle = '#8ed8e8';
      ctx.beginPath();
      ctx.roundRect(-31, -33, 62, 18, 7);
      ctx.fill();
      ctx.fillStyle = '#ffcf49';
      ctx.fillRect(48, -10, 10, 5);
      ctx.fillStyle = '#13212d';
      ctx.fillRect(-58, 15, 116, 7);

      const wheelY = 21;
      [-42, 42].forEach((wheelX) => {
        ctx.save();
        ctx.translate(wheelX, wheelY);
        ctx.rotate(s.wheelAngle);
        ctx.fillStyle = '#eef3f5';
        ctx.beginPath();
        ctx.arc(0, 0, 19, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#162735';
        ctx.beginPath();
        ctx.arc(0, 0, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#162735';
        ctx.lineWidth = 3;
        for (let j = 0; j < 4; j += 1) {
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(Math.cos(j * Math.PI / 2) * 9, Math.sin(j * Math.PI / 2) * 9);
          ctx.stroke();
        }
        ctx.restore();
      });
      ctx.restore();

      ctx.fillStyle = 'rgba(4,14,22,.75)';
      ctx.fillRect(18, 18, 270, 54);
      ctx.fillStyle = '#fff';
      ctx.font = '700 17px system-ui';
      ctx.fillText(`DISTANCE ${Math.floor(s.distance)} m`, 34, 47);
      ctx.fillStyle = '#ffcb59';
      ctx.fillText(`COINS ${s.coins}`, 34, 66);
      ctx.restore?.();
      requestAnimationFrame(frame);
    };
    const animation = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(animation);
  }, [best, syncHud]);

  const [hudSpeed, setHudSpeed] = useState(0);
  useEffect(() => {
    setHudSpeed(hud.speed);
  }, [hud.speed]);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark">S</span><div><strong>SPRING HILL</strong><small>RURAL RUSH</small></div></div>
        <div className="top-actions">
          <span className="best">BEST <b>{best} m</b></span>
          <button className="icon-button" onClick={() => setSoundOn(!soundOn)} aria-label="Toggle sound">{soundOn ? <Volume2 /> : <VolumeX />}</button>
        </div>
      </header>

      <section className="game-layout">
        <aside className="side-panel left-panel">
          <div className="stat-card"><Fuel /><div><small>FUEL</small><strong>{hud.fuel}%</strong></div><div className="meter"><i style={{ width: `${hud.fuel}%` }} /></div></div>
          <div className="stat-card"><Coins /><div><small>COINS</small><strong>{hud.coins}</strong></div></div>
          <div className="stat-card"><Gauge /><div><small>SPEED</small><strong>{hudSpeed} km/h</strong></div></div>
        </aside>

        <div className="game-stage">
          <canvas ref={canvasRef} className="game-canvas" aria-label="Spring Hill game canvas" />
          {!running && !gameOver && (
            <div className="start-overlay">
              <span className="eyebrow">A SPRING-SUSPENDED ADVENTURE</span>
              <h1>Conquer the<br /><em>hill.</em></h1>
              <p>Master the suspension. Collect fuel, dodge rough terrain, and race as far as you can.</p>
              <button className="primary-button" onClick={resetGame}><Play size={18} fill="currentColor" /> START ENGINE</button>
              <div className="controls-hint"><kbd>←</kbd><kbd>→</kbd><span>or</span><kbd>A</kbd><kbd>D</kbd><span>to drive</span></div>
            </div>
          )}
          {paused && <div className="pause-overlay"><Pause /><h2>PAUSED</h2><button className="primary-button" onClick={togglePause}>RESUME</button></div>}
          {gameOver && <div className="gameover-overlay"><span>OUT OF FUEL</span><h2>{hud.distance} m</h2><p>Best run: {best} m</p><button className="primary-button" onClick={resetGame}><RotateCcw size={18} /> RACE AGAIN</button></div>}
          {running && <div className="stage-controls"><button onPointerDown={() => setControl('left', true)} onPointerUp={() => setControl('left', false)} onPointerLeave={() => setControl('left', false)}>←</button><button onPointerDown={() => setControl('right', true)} onPointerUp={() => setControl('right', false)} onPointerLeave={() => setControl('right', false)}>→</button></div>}
        </div>

        <aside className="side-panel right-panel">
          <div className="mission-card"><span>MISSION 01</span><h3>Fuel for the<br />final climb</h3><p>Collect every canister you find.</p></div>
          <div className="legend"><span><i className="coin-dot" /> Coin</span><span><i className="fuel-dot" /> Fuel</span></div>
          <button className="pause-button" onClick={togglePause} disabled={!running}>{paused ? <Play size={18} /> : <Pause size={18} />}{paused ? 'Resume' : 'Pause'}</button>
        </aside>
      </section>

      <footer><span>SPRING SYSTEM ACTIVE</span><span>WASD / ARROWS TO CONTROL</span><span>SPACE TO PAUSE</span></footer>
    </main>
  );
}
