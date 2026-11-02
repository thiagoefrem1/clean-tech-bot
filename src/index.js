const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const fs = require('fs');
const pino = require('pino');

const config = JSON.parse(fs.readFileSync('./bot.json', 'utf8'));
const userStates = {};

function matches(rule, body) {
    const lower = body.toLowerCase().trim();
    if (Array.isArray(rule.exact) && rule.exact.length > 0) {
        if (rule.exact.some(e => String(e).toLowerCase() === lower)) return true;
    }
    if (Array.isArray(rule.contains) && rule.contains.length > 0) {
        if (rule.contains.some(c => lower.includes(String(c).toLowerCase()))) return true;
    }
    return false;
}

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('./.baileys_auth');
    
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' })
    });

    sock.ev.on('creds.update', saveCreds);

    if (!sock.authState.creds.registered) {
        const phoneNumber = "SEU_NUMERO_AQUI"; // <-- COLOQUE O NÚMERO DO BOT AQUI (com 55 e DDD)
        
        setTimeout(async () => {
            try {
                const code = await sock.requestPairingCode(phoneNumber);
                console.log(`\n=========================================`);
                console.log(`SEU CÓDIGO DE PAREAMENTO É: ${code}`);
                console.log(`=========================================\n`);
            } catch (error) {
                console.error("Erro ao gerar código:", error);
            }
        }, 3000);
    }

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) {
                setTimeout(() => startBot(), 3000);
            }
        }
    });

    sock.ev.on('messages.upsert', async m => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const body = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
        const lowerBody = body.toLowerCase().trim();
        const userId = msg.key.remoteJid;

        if (!body.trim()) return;

        let replyText = '';
        let mediaToSend = [];

        if (userStates[userId]) {
            const state = userStates[userId];
            switch (state) {
                case 'q1_equipamento':
                    userStates[userId] = 'q2_detalhes';
                    replyText = lowerBody.includes('sim') ? "Legal! *Pergunta 2:* Qual a capacidade do equipamento? (Ex: 9.000 BTUs...)" : "Sem problemas! *Pergunta 2:* Precisa de ajuda para escolher? (Sim/Nao)";
                    break;
                case 'q2_detalhes':
                    userStates[userId] = 'q3_casa';
                    replyText = "Anotado! *Pergunta 3:* O local da instalacao e uma casa? (Sim/Nao)";
                    break;
                case 'q3_casa':
                    if (lowerBody.includes('sim')) {
                        userStates[userId] = 'q4_andares';
                        replyText = "*Pergunta 4:* A casa tem dois andares? (Sim/Nao)";
                    } else {
                        userStates[userId] = 'q5_apartamento';
                        replyText = "*Pergunta 5:* O local e um apartamento? (Sim/Nao)";
                    }
                    break;
                case 'q4_andares':
                case 'q5_apartamento':
                    userStates[userId] = 'q6_altura';
                    replyText = "*Pergunta 6:* O local de instalacao e relativamente alto? (Sim/Nao)";
                    break;
                case 'q6_altura':
                    delete userStates[userId];
                    replyText = "Perfeito! Obrigado pelas informacoes. Um especialista da Clean Tech vai analisar e entrar em contato em breve.";
                    break;
            }
            if (replyText) {
                await sock.sendMessage(userId, { text: replyText }, { quoted: msg });
                return;
            }
        }

        if (lowerBody === '6' || lowerBody === 'orcamento') {
            userStates[userId] = 'q1_equipamento';
            await sock.sendMessage(userId, { text: "Vamos comecar o seu orcamento!\n\n*Pergunta 1:* Voce ja tem o equipamento de ar condicionado? (Responda *Sim* ou *Nao*)" }, { quoted: msg });
            return;
        }

        for (const rule of config.bot) {
            if (!matches(rule, body)) continue;
            replyText = rule.response || '';
            if (Array.isArray(rule.file)) {
                for (const file of rule.file) {
                    if (fs.existsSync(file)) mediaToSend.push(file);
                }
            }
            break; 
        }

        if (!replyText && !mediaToSend.length && config.noMatch) {
            replyText = config.noMatch;
        }

        if (replyText) {
            await sock.sendMessage(userId, { text: replyText }, { quoted: msg });
        }

        for (const file of mediaToSend) {
            if (file.match(/\.(jpg|jpeg|png)$/i)) {
                await sock.sendMessage(userId, { image: fs.readFileSync(file) }, { quoted: msg });
            }
        }
    });
}

startBot();
