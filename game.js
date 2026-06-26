const canvas = document.getElementById("mainCanvas");
const ctx = canvas.getContext("2d");
const flash = document.getElementById("flash");

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
resize();
window.addEventListener("resize", () => {
  resize();
  if (gs.screen !== "game") draw();
});

const W = () => canvas.width;
const H = () => canvas.height;

const AudioCtx = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;
function getAudio() {
  if (!audioCtx) audioCtx = new AudioCtx();
  return audioCtx;
}

function playTone(freq, type, dur, vol = 0.3) {
  try {
    const ac = getAudio();
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.connect(g);
    g.connect(ac.destination);
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
    o.start();
    o.stop(ac.currentTime + dur);
  } catch (e) {}
}

function playClick() {
  playTone(600, "sine", 0.08, 0.2);
}
function playRotate() {
  playTone(800, "square", 0.05, 0.15);
}
function playFail() {
  playTone(200, "sawtooth", 0.3, 0.4);
  setTimeout(() => playTone(150, "sawtooth", 0.3, 0.4), 100);
}
function playClear() {
  [523, 659, 784, 1047].forEach((f, i) =>
    setTimeout(() => playTone(f, "sine", 0.2, 0.4), i * 80),
  );
}
function playSnap() {
  [300, 500, 700].forEach((f, i) =>
    setTimeout(() => playTone(f, "triangle", 0.1, 0.5), i * 30),
  );
}

const BASE_TABS = [
  [{ side: "top", dir: 1 }],
  [{ side: "right", dir: 1 }],
  [{ side: "bottom", dir: 1 }],
  [{ side: "left", dir: 1 }],
];

function drawJigsawShape(ctx, cx, cy, size, tabPattern, angle, isHole = false) {
  const cos = Math.cos(angle),
    sin = Math.sin(angle);
  const s = size * 0.5;
  const tabSize = size * 0.22;
  const bulge = size * 0.15;

  function tp(lx, ly) {
    const rx = lx * cos - ly * sin;
    const ry = lx * sin + ly * cos;
    return [cx + rx, cy + ry];
  }

  ctx.beginPath();
  const [sx, sy] = tp(-s, -s);
  ctx.moveTo(sx, sy);

  function sideWithTab(x1, y1, x2, y2, side) {
    const mx = (x1 + x2) / 2,
      my = (y1 + y2) / 2;
    const dx = x2 - x1,
      dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    const nx = -dy / len,
      ny = dx / len;
    const tabs = tabPattern.filter((t) => t.side === side);
    if (!tabs.length) {
      const [px2, py2] = tp(x2, y2);
      ctx.lineTo(px2, py2);
      return;
    }
    const dir = tabs[0].dir;
    const offx = nx * tabSize * dir;
    const offy = ny * tabSize * dir;
    const [p1x, p1y] = tp(mx - dx * 0.2 + offx, my - dy * 0.2 + offy);
    const [p2x, p2y] = tp(
      mx + offx + nx * bulge * dir,
      my + offy + ny * bulge * dir,
    );
    const [p3x, p3y] = tp(mx + dx * 0.2 + offx, my + dy * 0.2 + offy);
    const [p4x, p4y] = tp(x2, y2);
    ctx.lineTo(p1x, p1y);
    ctx.quadraticCurveTo(p2x, p2y, p3x, p3y);
    ctx.lineTo(p4x, p4y);
  }

  sideWithTab(-s, -s, s, -s, "top");
  sideWithTab(s, -s, s, s, "right");
  sideWithTab(s, s, -s, s, "bottom");
  sideWithTab(-s, s, -s, -s, "left");

  ctx.closePath();
}

const LEVEL_SPEEDS = [0, 0, 0.6, 1.2, 2.2, 3.2];

const gs = {
  screen: "title",
  level: 1,
  streak: 0,
  totalClears: 0,
  timer: 4.0,
  rotations: 0,
  hasRotated: false,
  piece: null,
  hole: null,
  dragging: false,
  dragOffX: 0,
  dragOffY: 0,
  gameOver: false,
  gameOverReason: "",
  clearAnim: 0,
  fireParticles: [],
  holeAngle: 0,
  holeDirX: 1,
  holeDirY: 0.7,
  holeX: 0,
  holeY: 0,
  lastTime: 0,
  showRotateHint: true,
  stageClears: 0,
  levelUpAnim: 0,
};

function newStage() {
  const cx = W() / 2,
    cy = H() / 2;
  gs.holeAngle = Math.floor(Math.random() * 4);
  const holeTabPattern = BASE_TABS[gs.holeAngle];
  gs.hole = {
    x: cx,
    y: cy - H() * 0.08,
    tabPattern: holeTabPattern,
    angle: (gs.holeAngle * Math.PI) / 2,
  };

  let pieceRot;
  do {
    pieceRot = 1 + Math.floor(Math.random() * 3);
  } while (pieceRot === 0);
  gs.piece = {
    x: cx,
    y: cy + H() * 0.18,
    tabPattern: holeTabPattern,
    rotation: (gs.holeAngle + pieceRot) % 4,
    baseX: cx,
    baseY: cy + H() * 0.18,
    rotCount: 0,
  };

  gs.holeX = gs.hole.x;
  gs.holeY = gs.hole.y;
  const speed = LEVEL_SPEEDS[gs.level];
  const angle = Math.random() * Math.PI * 2;
  gs.holeDirX = Math.cos(angle) * speed;
  gs.holeDirY = Math.sin(angle) * speed;

  gs.timer = 4.0;
  gs.rotations = 0;
  gs.hasRotated = false;
  gs.dragging = false;
  gs.gameOver = false;
  gs.clearAnim = 0;
  gs.showRotateHint = true;
}

function startGame() {
  gs.level = 1;
  gs.streak = 0;
  gs.totalClears = 0;
  gs.stageClears = 0;
  gs.screen = "game";
  newStage();
  gs.lastTime = performance.now();
  requestAnimationFrame(gameLoop);
}

function triggerFlash(color) {
  flash.style.background = color;
  flash.style.opacity = "0.6";
  setTimeout(() => {
    flash.style.opacity = "0";
  }, 200);
}

function spawnFireworks(cx, cy) {
  for (let i = 0; i < 60; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 2 + Math.random() * 5;
    gs.fireParticles.push({
      x: cx,
      y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1.0,
      color: `hsl(${Math.random() * 360},100%,60%)`,
      size: 2 + Math.random() * 3,
    });
  }
}

function getSize() {
  return Math.min(W(), H()) * 0.18;
}

function isNearHole(px, py) {
  const dx = px - gs.holeX,
    dy = py - gs.holeY;
  return Math.sqrt(dx * dx + dy * dy) < getSize() * 0.5;
}

function isPieceMatchingHole() {
  return gs.hasRotated && gs.piece.rotation % 4 === gs.holeAngle % 4;
}

function gameLoop(now) {
  if (gs.screen !== "game") return;
  const dt = (now - gs.lastTime) / 1000;
  gs.lastTime = now;

  if (!gs.gameOver && !gs.clearAnim) {
    gs.timer -= dt;

    if (gs.level >= 2) {
      const size = getSize();
      const margin = size * 0.7;
      gs.holeX += gs.holeDirX;
      gs.holeY += gs.holeDirY;
      if (gs.holeX < margin || gs.holeX > W() - margin) gs.holeDirX *= -1;
      if (gs.holeY < margin || gs.holeY > H() * 0.55) gs.holeDirY *= -1;
      gs.holeX = Math.max(margin, Math.min(W() - margin, gs.holeX));
      gs.holeY = Math.max(margin, Math.min(H() * 0.55, gs.holeY));
      gs.hole.x = gs.holeX;
      gs.hole.y = gs.holeY;
    }

    if (gs.timer <= 0) {
      gs.timer = 0;
      gs.gameOver = true;
      gs.gameOverReason = "It's taking too long.";
      playFail();
      triggerFlash("#ff0000");
    }
  }

  if (gs.clearAnim > 0) {
    gs.clearAnim -= dt;
    if (gs.clearAnim <= 0) {
      gs.clearAnim = 0;
      gs.stageClears++;
      gs.totalClears++;
      if (gs.stageClears >= 5) {
        if (gs.level >= 5) {
          gs.screen = "ending";
          return;
        }
        gs.level++;
        gs.stageClears = 0;
        gs.levelUpAnim = 2.0;
      }
      newStage();
    }
  }

  if (gs.levelUpAnim > 0) gs.levelUpAnim -= dt;

  draw();
  requestAnimationFrame(gameLoop);
}

function draw() {
  ctx.clearRect(0, 0, W(), H());
  if (gs.screen === "title") drawTitle();
  else if (gs.screen === "game") drawGame();
  else if (gs.screen === "ending") drawEnding();
}

function drawTitle() {
  ctx.fillStyle = "#111";
  ctx.fillRect(0, 0, W(), H());

  ctx.textAlign = "center";
  const cy = H() / 2;

  ctx.fillStyle = "#FFD700";
  ctx.font = `bold ${Math.min(W() * 0.15, 64)}px Arial`;
  ctx.fillText("4秒パズル", W() / 2, cy - H() * 0.22);

  ctx.fillStyle = "#aaa";
  ctx.font = `${Math.min(W() * 0.038, 16)}px Arial`;
  ctx.fillText("すぐに終わるパズルゲーム", W() / 2, cy - H() * 0.12);

  const ruleY = cy - H() * 0.03;
  const lineH = H() * 0.055;
  ctx.fillStyle = "#ccc";
  ctx.font = `${Math.min(W() * 0.038, 15)}px Arial`;
  [
    "⏱️ タイムリミット：4秒",
    "🔄 回転：クリックで右回転",
    "🎯 ドラッグして穴にはめる",
    "⚠️ 必ず1回以上回転すること",
    "🏆 5クリアでレベルアップ",
  ].forEach((t, i) => {
    ctx.fillText(t, W() / 2, ruleY + i * lineH);
  });

  const bw = Math.min(W() * 0.5, 200),
    bh = H() * 0.07;
  const bx = W() / 2 - bw / 2,
    by = cy + H() * 0.3;
  ctx.fillStyle = "#FFD700";
  ctx.beginPath();
  ctx.roundRect(bx, by, bw, bh, 12);
  ctx.fill();
  ctx.fillStyle = "#111";
  ctx.font = `bold ${Math.min(W() * 0.055, 22)}px Arial`;
  ctx.fillText("スタート", W() / 2, by + bh / 2 + 8);

  ctx._titleBtn = { x: bx, y: by, w: bw, h: bh };
}

function drawGame() {
  ctx.fillStyle = "#111";
  ctx.fillRect(0, 0, W(), H());

  const size = getSize();
  const piece = gs.piece;
  const hole = gs.hole;
  const pieceAngle = (piece.rotation * Math.PI) / 2;

  if (!gs.clearAnim && !gs.gameOver) {
    drawHoleOnBoard(hole.x, hole.y, size, hole.tabPattern, hole.angle);
  }

  if (!gs.clearAnim) {
    drawPiece(
      piece.x,
      piece.y,
      size,
      piece.tabPattern,
      pieceAngle,
      piece.rotation,
      gs.hasRotated,
    );
  }

  drawHUD(size);

  if (gs.clearAnim) drawClearEffect();
  if (gs.gameOver) drawGameOver();
  if (gs.levelUpAnim > 0) drawLevelUp();
}

function drawHoleOnBoard(hx, hy, size, tabPattern, angle) {
  const boardSize = size * 1.8;
  const offCtx = document.createElement("canvas");
  offCtx.width = W();
  offCtx.height = H();
  const oc = offCtx.getContext("2d");

  oc.fillStyle = "#222";
  oc.beginPath();
  oc.roundRect(hx - boardSize / 2, hy - boardSize / 2, boardSize, boardSize, 8);
  oc.fill();

  oc.globalCompositeOperation = "destination-out";
  drawJigsawShape(oc, hx, hy, size, tabPattern, angle, true);
  oc.fill();

  ctx.drawImage(offCtx, 0, 0);

  ctx.strokeStyle = "#FFD700";
  ctx.lineWidth = 2;
  drawJigsawShape(ctx, hx, hy, size, tabPattern, angle);
  ctx.stroke();
}

function drawPiece(px, py, size, tabPattern, angle, rotIdx, hasRot) {
  ctx.save();
  if (!gs.dragging) {
    ctx.shadowColor = "rgba(255,215,0,0.5)";
    ctx.shadowBlur = 16;
  }

  ctx.fillStyle = hasRot ? "#4FC3F7" : "#90A4AE";
  drawJigsawShape(ctx, px, py, size, tabPattern, angle);
  ctx.fill();

  ctx.strokeStyle = hasRot ? "#0288D1" : "#607D8B";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();

  if (!hasRot) {
    ctx.save();
    ctx.fillStyle = "#FF5252";
    ctx.font = `bold ${size * 0.35}px Arial`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("↻", px, py);
    ctx.restore();
  }
}

function drawHUD(size) {
  const pad = 16;
  const timerRatio = gs.timer / 4.0;
  const barW = W() - pad * 2;
  const barH = H() * 0.025;
  const barY = H() * 0.92;

  ctx.fillStyle = "#333";
  ctx.beginPath();
  ctx.roundRect(pad, barY, barW, barH, 4);
  ctx.fill();

  const col =
    timerRatio > 0.5 ? "#4CAF50" : timerRatio > 0.25 ? "#FF9800" : "#F44336";
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.roundRect(pad, barY, barW * Math.max(0, timerRatio), barH, 4);
  ctx.fill();

  ctx.fillStyle = "#fff";
  ctx.font = `bold ${Math.min(W() * 0.05, 20)}px Arial`;
  ctx.textAlign = "left";
  ctx.fillText(`⏱ ${gs.timer.toFixed(1)}s`, pad, barY - 6);

  ctx.textAlign = "center";
  ctx.fillText(`🔄 ${gs.rotations}/4`, W() / 2, barY - 6);

  ctx.textAlign = "right";
  ctx.fillStyle = "#FFD700";
  ctx.fillText(`Lv.${gs.level}`, W() - pad, barY - 6);

  const starY = H() * 0.07;
  const starSize = Math.min(W() * 0.06, 24);
  const totalStars = 5;
  const startX = W() / 2 - (totalStars * starSize * 1.4) / 2;
  for (let i = 0; i < totalStars; i++) {
    ctx.fillStyle = i < gs.stageClears ? "#FFD700" : "#444";
    ctx.font = `${starSize}px Arial`;
    ctx.textAlign = "left";
    ctx.fillText("⭐", startX + i * starSize * 1.4, starY);
  }

  const lvNames = ["", "🎮通常", "👀移動", "💨速い", "🔥激速", "💀鬼畜"];
  ctx.textAlign = "center";
  ctx.fillStyle = "#aaa";
  ctx.font = `${Math.min(W() * 0.038, 14)}px Arial`;
  ctx.fillText(lvNames[gs.level], W() / 2, starY + starSize + 4);
}

function drawClearEffect() {
  gs.fireParticles.forEach((p) => {
    ctx.globalAlpha = p.life;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;

  ctx.fillStyle = "#FFD700";
  ctx.textAlign = "center";
  ctx.font = `bold ${Math.min(W() * 0.15, 60)}px Arial`;
  ctx.fillText("クリア！", W() / 2, H() / 2);
}

function drawGameOver() {
  ctx.fillStyle = "rgba(0,0,0,0.7)";
  ctx.fillRect(0, 0, W(), H());
  ctx.textAlign = "center";
  ctx.fillStyle = "#F44336";
  ctx.font = `bold ${Math.min(W() * 0.12, 48)}px Arial`;
  ctx.fillText("GAME OVER", W() / 2, H() * 0.35);

  ctx.fillStyle = "#FF9800";
  ctx.font = `italic ${Math.min(W() * 0.05, 20)}px Arial`;
  ctx.fillText(gs.gameOverReason, W() / 2, H() * 0.42);

  ctx.fillStyle = "#ccc";
  ctx.font = `${Math.min(W() * 0.045, 18)}px Arial`;
  ctx.fillText(`クリア数: ${gs.totalClears}`, W() / 2, H() * 0.5);
  ctx.fillText(`到達レベル: ${gs.level}`, W() / 2, H() * 0.57);

  const bw = Math.min(W() * 0.5, 200),
    bh = H() * 0.07;
  const bx = W() / 2 - bw / 2,
    by = H() * 0.62;
  ctx.fillStyle = "#F44336";
  ctx.beginPath();
  ctx.roundRect(bx, by, bw, bh, 12);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = `bold ${Math.min(W() * 0.05, 20)}px Arial`;
  ctx.fillText("もう一度", W() / 2, by + bh / 2 + 8);
  ctx._retryBtn = { x: bx, y: by, w: bw, h: bh };
}

function drawLevelUp() {
  const alpha = Math.min(1, gs.levelUpAnim);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = "#FFD700";
  ctx.textAlign = "center";
  ctx.font = `bold ${Math.min(W() * 0.1, 40)}px Arial`;
  ctx.fillText("🎉 レベルアップ！", W() / 2, H() * 0.82);
  ctx.globalAlpha = 1;
}

function drawEnding() {
  ctx.fillStyle = "#111";
  ctx.fillRect(0, 0, W(), H());

  gs.fireParticles.forEach((p) => {
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.1;
    p.life -= 0.01;
    if (p.life > 0) {
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  ctx.globalAlpha = 1;
  gs.fireParticles = gs.fireParticles.filter((p) => p.life > 0);

  if (Math.random() < 0.05) {
    spawnFireworks(Math.random() * W(), Math.random() * H() * 0.6);
  }

  ctx.textAlign = "center";
  ctx.fillStyle = "#FFD700";
  ctx.font = `bold ${Math.min(W() * 0.13, 52)}px Arial`;
  ctx.fillText("おめでとう！", W() / 2, H() * 0.3);

  ctx.fillStyle = "#fff";
  ctx.font = `${Math.min(W() * 0.05, 20)}px Arial`;
  ctx.fillText("全25ステージクリア！", W() / 2, H() * 0.42);
  ctx.fillStyle = "#FFD700";
  ctx.fillText("🏆 真のパズルマスター 🏆", W() / 2, H() * 0.5);

  const bw = Math.min(W() * 0.55, 220),
    bh = H() * 0.07;
  const bx = W() / 2 - bw / 2,
    by = H() * 0.62;
  ctx.fillStyle = "#FFD700";
  ctx.beginPath();
  ctx.roundRect(bx, by, bw, bh, 12);
  ctx.fill();
  ctx.fillStyle = "#111";
  ctx.font = `bold ${Math.min(W() * 0.05, 20)}px Arial`;
  ctx.fillText("もう一度プレイ", W() / 2, by + bh / 2 + 8);
  ctx._replayBtn = { x: bx, y: by, w: bw, h: bh };

  requestAnimationFrame(() => {
    if (gs.screen === "ending") {
      draw();
    }
  });
}

function getPt(e) {
  if (e.touches && e.touches.length) {
    const r = canvas.getBoundingClientRect();
    return {
      x: e.touches[0].clientX - r.left,
      y: e.touches[0].clientY - r.top,
    };
  }
  const r = canvas.getBoundingClientRect();
  return { x: (e.clientX || 0) - r.left, y: (e.clientY || 0) - r.top };
}

function inBtn(pt, btn) {
  return (
    btn &&
    pt.x >= btn.x &&
    pt.x <= btn.x + btn.w &&
    pt.y >= btn.y &&
    pt.y <= btn.y + btn.h
  );
}

function handleDown(e) {
  const pt = getPt(e);

  if (gs.screen === "title") {
    if (inBtn(pt, ctx._titleBtn)) {
      playClick();
      getAudio();
      startGame();
    }
    return;
  }

  if (gs.screen === "ending") {
    if (inBtn(pt, ctx._replayBtn)) {
      playClick();
      startGame();
    }
    return;
  }

  if (gs.screen !== "game") return;
  if (gs.gameOver) {
    if (inBtn(pt, ctx._retryBtn)) {
      playClick();
      startGame();
    }
    return;
  }
  if (gs.clearAnim) return;

  const piece = gs.piece;
  const size = getSize();
  const dx = pt.x - piece.x,
    dy = pt.y - piece.y;
  if (Math.sqrt(dx * dx + dy * dy) < size * 0.8) {
    gs.dragging = true;
    gs.dragOffX = dx;
    gs.dragOffY = dy;
    e.preventDefault();
  }
}

function handleMove(e) {
  if (!gs.dragging || gs.screen !== "game") return;
  e.preventDefault();
  const pt = getPt(e);
  gs.piece.x = pt.x - gs.dragOffX;
  gs.piece.y = pt.y - gs.dragOffY;
}

function handleUp(e) {
  if (gs.screen !== "game" || !gs.dragging) return;
  gs.dragging = false;

  if (isNearHole(gs.piece.x, gs.piece.y)) {
    if (isPieceMatchingHole()) {
      gs.piece.x = gs.holeX;
      gs.piece.y = gs.holeY;
      gs.clearAnim = 1.2;
      gs.streak++;
      playClear();
      playSnap();
      triggerFlash("#4CAF50");
      for (let i = 0; i < 3; i++)
        setTimeout(
          () =>
            spawnFireworks(
              gs.holeX + (Math.random() - 0.5) * 80,
              gs.holeY + (Math.random() - 0.5) * 80,
            ),
          i * 200,
        );
    } else if (!gs.hasRotated) {
      gs.gameOver = true;
      playFail();
      triggerFlash("#ff0000");
    } else {
      gs.piece.x = gs.piece.baseX;
      gs.piece.y = gs.piece.baseY;
    }
  } else {
    gs.piece.x = gs.piece.baseX;
    gs.piece.y = gs.piece.baseY;
  }
}

function handleTap(e) {
  if (gs.screen !== "game" || gs.gameOver || gs.clearAnim || gs.dragging)
    return;
  const pt = getPt(e);
  const piece = gs.piece;
  const size = getSize();
  const dx = pt.x - piece.x,
    dy = pt.y - piece.y;
  if (Math.sqrt(dx * dx + dy * dy) < size * 0.8) {
    if (gs.rotations >= 4) {
      gs.gameOver = true;
      gs.gameOverReason = "Spinning too much.";
      playFail();
      triggerFlash("#ff0000");
      return;
    }
    piece.rotation = (piece.rotation + 1) % 4;
    gs.rotations++;
    gs.hasRotated = true;
    gs.showRotateHint = false;
    playRotate();
    e.preventDefault();
  }
}

canvas.addEventListener("mousedown", (e) => {
  handleDown(e);
});
canvas.addEventListener("mousemove", (e) => {
  handleMove(e);
});
canvas.addEventListener("mouseup", (e) => {
  handleUp(e);
  handleTap(e);
});

canvas.addEventListener(
  "touchstart",
  (e) => {
    e.preventDefault();
    handleDown(e);
  },
  { passive: false },
);
canvas.addEventListener(
  "touchmove",
  (e) => {
    e.preventDefault();
    handleMove(e);
  },
  { passive: false },
);
canvas.addEventListener(
  "touchend",
  (e) => {
    e.preventDefault();
    handleUp(e);
    handleTap(e);
  },
  { passive: false },
);

draw();
