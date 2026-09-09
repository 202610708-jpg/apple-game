const canvas = document.getElementById('viewScreen');
const ctx = canvas.getContext('2d');
const miniCanvas = document.getElementById('minimap');
const miniCtx = miniCanvas.getContext('2d');

const weaponContainer = document.getElementById('weapon-container');
const ammoValEl = document.getElementById('ammoVal');
const killValEl = document.getElementById('killVal');

let audioCtx = null;
function initAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
}

function playShotSound() {
    if (!audioCtx) return;
    const bufferSize = audioCtx.sampleRate * 0.12;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

    const noise = audioCtx.createBufferSource();
    noise.buffer = buffer;

    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800, audioCtx.currentTime);

    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0.7, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.12);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(audioCtx.destination);
    noise.start();
}

// Map Layout
const MAP_SIZE = 8;
const map = [
    1,1,1,1,1,1,1,1,
    1,0,0,0,1,0,0,1,
    1,0,2,0,1,0,2,1,
    1,0,2,0,0,0,0,1,
    1,0,1,1,2,2,0,1,
    1,0,0,0,0,2,0,1,
    1,2,2,2,0,0,0,1,
    1,1,1,1,1,1,1,1
];

// Player Setup (민감도 조절 완료)
const player = {
    x: 1.5,
    y: 1.5,
    angle: 0,
    fov: Math.PI / 3,
    moveSpeed: 0.025, // 속도 하향
    rotSpeed: 0.025,  // 회전 속도 하향
    ammo: 50,
    kills: 0
};

// Enemy Entities
const enemies = [
    { x: 2.5, y: 5.5, alive: true },
    { x: 6.5, y: 1.5, alive: true },
    { x: 6.5, y: 5.5, alive: true }
];

const zBuffer = new Array(canvas.width).fill(0);

// Key Handler
const keys = {};
window.addEventListener('keydown', (e) => {
    initAudio();
    keys[e.code] = true;
    if (e.code === 'Space') shoot();
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });
window.addEventListener('click', () => { initAudio(); shoot(); });

// Shooting Logic
let isShooting = false;
function shoot() {
    if (isShooting || player.ammo <= 0) return;
    isShooting = true;
    player.ammo--;
    ammoValEl.textContent = player.ammo;
    
    playShotSound();
    weaponContainer.classList.add('firing');

    let hitEnemy = null;
    let closestDist = 8;

    enemies.forEach(enemy => {
        if (!enemy.alive) return;
        const dx = enemy.x - player.x;
        const dy = enemy.y - player.y;
        let angleToEnemy = Math.atan2(dy, dx) - player.angle;
        
        while (angleToEnemy < -Math.PI) angleToEnemy += Math.PI * 2;
        while (angleToEnemy > Math.PI) angleToEnemy -= Math.PI * 2;

        const dist = Math.sqrt(dx * dx + dy * dy);

        if (Math.abs(angleToEnemy) < 0.2 && dist < closestDist) {
            closestDist = dist;
            hitEnemy = enemy;
        }
    });

    if (hitEnemy) {
        hitEnemy.alive = false;
        player.kills++;
        killValEl.textContent = player.kills;
    }

    setTimeout(() => {
        weaponContainer.classList.remove('firing');
        isShooting = false;
    }, 120);
}

// Render Engine
function render() {
    const w = canvas.width;
    const h = canvas.height;

    ctx.fillStyle = '#111'; ctx.fillRect(0, 0, w, h / 2);
    ctx.fillStyle = '#333'; ctx.fillRect(0, h / 2, w, h / 2);

    for (let x = 0; x < w; x++) {
        const rayAngle = (player.angle - player.fov / 2) + (x / w) * player.fov;
        let dist = 0;
        let hit = false;
        let wallType = 1;

        const cos = Math.cos(rayAngle);
        const sin = Math.sin(rayAngle);

        while (!hit && dist < 12) {
            dist += 0.03;
            const tx = Math.floor(player.x + cos * dist);
            const ty = Math.floor(player.y + sin * dist);

            if (tx < 0 || tx >= MAP_SIZE || ty < 0 || ty >= MAP_SIZE) {
                hit = true; dist = 12;
            } else if (map[ty * MAP_SIZE + tx] > 0) {
                hit = true;
                wallType = map[ty * MAP_SIZE + tx];
            }
        }

        const correctedDist = dist * Math.cos(rayAngle - player.angle);
        zBuffer[x] = correctedDist;

        const wallH = Math.min(h, h / correctedDist);
        const wallTop = (h / 2) - (wallH / 2);

        const shade = Math.max(0, 200 - Math.floor(correctedDist * 18));
        if (wallType === 1) {
            ctx.fillStyle = `rgb(${shade}, ${Math.floor(shade * 0.2)}, ${Math.floor(shade * 0.2)})`;
        } else {
            ctx.fillStyle = `rgb(${Math.floor(shade * 0.4)}, ${Math.floor(shade * 0.4)}, ${shade})`;
        }
        ctx.fillRect(x, wallTop, 1, wallH);
    }

    enemies.forEach(enemy => {
        if (!enemy.alive) return;

        const dx = enemy.x - player.x;
        const dy = enemy.y - player.y;
        let spriteAngle = Math.atan2(dy, dx) - player.angle;

        while (spriteAngle < -Math.PI) spriteAngle += Math.PI * 2;
        while (spriteAngle > Math.PI) spriteAngle -= Math.PI * 2;

        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > 0.2 && Math.abs(spriteAngle) < player.fov) {
            const spriteScreenX = Math.floor((w / 2) * (1 + Math.tan(spriteAngle) / Math.tan(player.fov / 2)));
            const spriteSize = Math.abs(Math.floor(h / dist));

            if (spriteScreenX >= 0 && spriteScreenX < w && dist < zBuffer[spriteScreenX]) {
                ctx.fillStyle = '#b00';
                ctx.beginPath();
                ctx.arc(spriteScreenX, h / 2, spriteSize / 3, 0, Math.PI * 2);
                ctx.fill();

                ctx.fillStyle = '#0f0';
                ctx.fillRect(spriteScreenX - spriteSize / 10, (h / 2) - spriteSize / 10, spriteSize / 5, spriteSize / 5);
            }
        }
    });

    drawMinimap();
}

function drawMinimap() {
    const scale = miniCanvas.width / MAP_SIZE;
    miniCtx.fillStyle = '#000';
    miniCtx.fillRect(0, 0, miniCanvas.width, miniCanvas.height);

    for (let y = 0; y < MAP_SIZE; y++) {
        for (let x = 0; x < MAP_SIZE; x++) {
            if (map[y * MAP_SIZE + x] > 0) {
                miniCtx.fillStyle = '#666';
                miniCtx.fillRect(x * scale, y * scale, scale - 1, scale - 1);
            }
        }
    }

    enemies.forEach(e => {
        if (e.alive) {
            miniCtx.fillStyle = '#f00';
            miniCtx.fillRect(e.x * scale - 2, e.y * scale - 2, 4, 4);
        }
    });

    miniCtx.fillStyle = '#0f0';
    miniCtx.fillRect(player.x * scale - 2, player.y * scale - 2, 4, 4);
    miniCtx.strokeStyle = '#0f0';
    miniCtx.beginPath();
    miniCtx.moveTo(player.x * scale, player.y * scale);
    miniCtx.lineTo((player.x + Math.cos(player.angle) * 0.8) * scale, (player.y + Math.sin(player.angle) * 0.8) * scale);
    miniCtx.stroke();
}

function update() {
    let moveX = 0;
    let moveY = 0;

    if (keys['KeyW'] || keys['ArrowUp']) {
        moveX += Math.cos(player.angle) * player.moveSpeed;
        moveY += Math.sin(player.angle) * player.moveSpeed;
    }
    if (keys['KeyS'] || keys['ArrowDown']) {
        moveX -= Math.cos(player.angle) * player.moveSpeed;
        moveY -= Math.sin(player.angle) * player.moveSpeed;
    }
    if (keys['KeyA'] || keys['ArrowLeft']) player.angle -= player.rotSpeed;
    if (keys['KeyD'] || keys['ArrowRight']) player.angle += player.rotSpeed;

    const buffer = 0.25;
    const targetX = player.x + moveX;
    const targetY = player.y + moveY;

    if (map[Math.floor(player.y) * MAP_SIZE + Math.floor(targetX + Math.sign(moveX) * buffer)] === 0) {
        player.x = targetX;
    }
    if (map[Math.floor(targetY + Math.sign(moveY) * buffer) * MAP_SIZE + Math.floor(player.x)] === 0) {
        player.y = targetY;
    }
}

function gameLoop() {
    update();
    render();
    requestAnimationFrame(gameLoop);
}

gameLoop();