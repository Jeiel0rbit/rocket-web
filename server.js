const express = require('express');
const http = require('http');
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static('public'));

let connectedUsers = 0;
let progress = 0;
let launchInterval;
let launched = false;

const TICK_RATE = 1000;

function resetGameState() {
    launched = false;
    progress = connectedUsers > 0 ? 1 : 0;
    if (!launchInterval) {
        startGameLoop();
    }
    io.emit('gameReset'); // Notifica todos os clientes para reiniciarem suas UIs
    console.log('O estado do jogo foi reiniciado.');
}

function startGameLoop() {
    if (launchInterval) return;

    launchInterval = setInterval(() => {
        if (launched) {
            clearInterval(launchInterval);
            launchInterval = null;
            return;
        }

        if (connectedUsers > 0) {
            // Aumenta o progresso mais rápido com mais usuários
            progress += connectedUsers * 0.1;
        } else {
            // Diminui gradualmente se não houver ninguém
            progress -= 1;
        }

        progress = Math.max(0, Math.min(100, progress));

        io.emit('progressUpdate', { progress, userCount: connectedUsers });

        if (progress >= 100 && !launched) {
            launched = true;
            io.emit('launch');
            console.log('Foguete lançado!');
        }

    }, TICK_RATE);
}

io.on('connection', (socket) => {
    connectedUsers++;
    console.log(`Usuário conectado. Total: ${connectedUsers}`);

    if (connectedUsers === 1 && progress < 1 && !launched) {
        progress = 1;
    }
    
    if (!launchInterval && !launched) {
        startGameLoop();
    }

    // Envia o estado atual para o novo usuário
    socket.emit('progressUpdate', { progress, userCount: connectedUsers });
    if(launched) {
        socket.emit('launch'); // Se já foi lançado, informa o novo usuário
    }


    socket.on('disconnect', () => {
        connectedUsers--;
        console.log(`Usuário desconectado. Total: ${connectedUsers}`);
        
        if (connectedUsers === 0 && !launched) {
            progress = 0;
        }
        io.emit('progressUpdate', { progress, userCount: connectedUsers });
    });

    // Listener para o pedido de reinicialização
    socket.on('requestReset', () => {
        console.log('Pedido de reinicialização recebido.');
        resetGameState();
    });
});

server.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});

