document.addEventListener('DOMContentLoaded', () => {
    const socket = io();
    const canvas = document.getElementById('game-canvas');
    const ctx = canvas.getContext('2d');
    const userCountSpan = document.getElementById('user-count');
    const launchSuccessDiv = document.getElementById('launch-success');
    const restartButton = document.getElementById('restart-button');
    
    let canvasWidth, canvasHeight;
    let rocketY;
    
    let progress = 0;
    let userCount = 0;
    let isIgniting = false;
    let isLaunched = false;
    let rocketSpeed = 5;

    let stars = [];
    let particles = [];
    let shakeIntensity = 0;
    let shakeDuration = 0;

    let audioCtx;
    let oscillator;
    let gainNode;

    function setCanvasDimensions() {
        const aspectRatio = 600 / 800;
        const parent = canvas.parentElement;
        const maxWidth = parent.clientWidth * 0.9;
        const maxHeight = parent.clientHeight * 0.8;

        if (maxWidth / maxHeight > aspectRatio) {
            canvas.height = maxHeight;
            canvas.width = maxHeight * aspectRatio;
        } else {
            canvas.width = maxWidth;
            canvas.height = maxWidth / aspectRatio;
        }
        canvasWidth = canvas.width;
        canvasHeight = canvas.height;
        rocketY = canvasHeight * 0.775; 
        rocketSpeed = canvasHeight / 160;
    }

    function init() {
        setCanvasDimensions();
        stars = [];
        for (let i = 0; i < 200; i++) {
            stars.push({
                x: Math.random() * canvasWidth,
                y: Math.random() * canvasHeight,
                radius: Math.random() * 1.5,
                alpha: Math.random() * 0.5 + 0.5
            });
        }
        document.body.addEventListener('click', () => {
            if (!audioCtx) {
                audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            }
        }, { once: true });
        window.addEventListener('resize', setCanvasDimensions);
        
        restartButton.addEventListener('click', () => {
            socket.emit('requestReset');
        });
    }

    function resetClientState() {
        launchSuccessDiv.style.display = 'none';
        isLaunched = false;
        isIgniting = false;
        rocketY = canvasHeight * 0.775;
        particles = [];
        stopLaunchSound();
    }

    function drawRocket(y) {
        const scale = canvasHeight / 800;
        ctx.save();
        ctx.translate(canvasWidth / 2, y);
        ctx.scale(scale, scale);

        ctx.fillStyle = '#cccccc';
        ctx.beginPath();
        ctx.moveTo(0, -80);
        ctx.lineTo(30, 20);
        ctx.lineTo(-30, 20);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = 'white';
        ctx.fillRect(-25, 20, 50, 60);

        ctx.fillStyle = '#d42424';
        ctx.beginPath();
        ctx.moveTo(-25, 80);
        ctx.lineTo(-45, 100);
        ctx.lineTo(-25, 100);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(25, 80);
        ctx.lineTo(45, 100);
        ctx.lineTo(25, 100);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#42a5f5';
        ctx.beginPath();
        ctx.arc(0, 0, 12, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();
    }
    
    function drawFlameAndSmoke(y, intensity) {
        const scale = canvasHeight / 800;
        for (let i = 0; i < 10 * intensity; i++) {
            const angle = Math.random() * Math.PI + Math.PI;
            const speed = Math.random() * 8 + 4;
            particles.push({
                x: canvasWidth / 2 + (Math.random() - 0.5) * (20 * scale),
                y: y + (110 * scale),
                vx: Math.cos(angle) * speed * 0.5 * scale,
                vy: Math.sin(angle) * speed * -1 * scale,
                radius: (Math.random() * 20 + 10) * scale,
                alpha: 1,
                life: 120,
            });
        }
        particles.forEach((p, index) => {
            p.x += p.vx; p.y += p.vy; p.life--; p.alpha = (p.life / 120) * 0.8; p.radius *= 0.99;
            if (p.life <= 0) particles.splice(index, 1);
            
            const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius);
            gradient.addColorStop(0, `rgba(255, 255, 255, ${p.alpha * 0.8})`);
            gradient.addColorStop(0.4, `rgba(255, 200, 0, ${p.alpha * 0.6})`);
            gradient.addColorStop(1, `rgba(100, 100, 100, 0)`);
            ctx.fillStyle = gradient;
            ctx.beginPath(); ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2); ctx.fill();
        });
    }

    function drawProgressBar() {
        const barWidth = canvasWidth * 0.7;
        const barHeight = canvasHeight * 0.04;
        const x = (canvasWidth - barWidth) / 2;
        const y = canvasHeight - (barHeight * 1.5);

        ctx.strokeStyle = '#00aaff'; ctx.lineWidth = 2;
        ctx.strokeRect(x, y, barWidth, barHeight);

        if (progress > 0) {
            const fillWidth = (barWidth * progress) / 100;
            const gradient = ctx.createLinearGradient(x, y, x + barWidth, y);
            gradient.addColorStop(0, '#f44336'); gradient.addColorStop(0.5, '#ffeb3b'); gradient.addColorStop(1, '#4caf50');
            ctx.fillStyle = gradient; ctx.fillRect(x, y, fillWidth, barHeight);
        }

        ctx.fillStyle = 'white'; ctx.font = `${barHeight * 0.5}px Segoe UI`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(`${Math.floor(progress)}%`, canvasWidth / 2, y + barHeight / 2);
    }

    function showLaunchSuccess() {
        launchSuccessDiv.style.display = 'flex';
    }

    function gameLoop() {
        ctx.save();
        ctx.clearRect(0, 0, canvasWidth, canvasHeight);
        
        if (shakeDuration > 0) {
            shakeDuration--;
            const sx = (Math.random() - 0.5) * shakeIntensity;
            const sy = (Math.random() - 0.5) * shakeIntensity;
            ctx.translate(sx, sy);
        }

        drawStars();

        if (isIgniting) drawFlameAndSmoke(rocketY, 1.5);
        
        if (isLaunched) {
            rocketY -= rocketSpeed;
            stars.forEach(star => { star.y += rocketSpeed * 0.5; if (star.y > canvasHeight) star.y = 0; });
            drawFlameAndSmoke(rocketY, 1);
            if (rocketY < -canvasHeight * 0.25) { // Quando o foguete sai da tela
                isLaunched = false; // Para a lógica de lançamento
                isIgniting = false;
                stopLaunchSound();
                showLaunchSuccess();
            }
        }

        drawRocket(rocketY);
        if (!isLaunched && !isIgniting) drawProgressBar();

        ctx.restore();
        requestAnimationFrame(gameLoop);
    }
    
    // Funções de áudio e tremor (sem alterações)
    function drawStars() { stars.forEach(star => { ctx.fillStyle = `rgba(255, 255, 255, ${star.alpha})`; ctx.beginPath(); ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2); ctx.fill(); }); }
    function startShake(intensity, duration) { shakeIntensity = intensity; shakeDuration = duration; }
    function playLaunchSound() { if (!audioCtx) return; if (oscillator) oscillator.stop(); gainNode = audioCtx.createGain(); gainNode.connect(audioCtx.destination); gainNode.gain.setValueAtTime(0, audioCtx.currentTime); gainNode.gain.linearRampToValueAtTime(0.3, audioCtx.currentTime + 0.5); oscillator = audioCtx.createOscillator(); oscillator.connect(gainNode); oscillator.type = 'sawtooth'; oscillator.frequency.setValueAtTime(40, audioCtx.currentTime); oscillator.frequency.exponentialRampToValueAtTime(120, audioCtx.currentTime + 8); oscillator.start(); }
    function stopLaunchSound() { if (gainNode) { gainNode.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 2); oscillator.stop(audioCtx.currentTime + 2); } }

    // Listeners do Socket.IO
    socket.on('progressUpdate', (data) => { if (!isLaunched) progress = data.progress; userCount = data.userCount; userCountSpan.textContent = userCount; });
    socket.on('launch', () => { if (isLaunched || isIgniting) return; progress = 100; isIgniting = true; particles = []; playLaunchSound(); startShake(15, 150); setTimeout(() => { isLaunched = true; }, 2500); });
    socket.on('gameReset', resetClientState);

    init();
    gameLoop();
});

