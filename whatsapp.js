const { DisconnectReason, default: makeWASocket, useMultiFileAuthState } = require("@whiskeysockets/baileys");
const qrcode = require("qrcode-terminal");
const { connectSheet } = require("./sheets");
const { handleMessage } = require("./commands");
const schedule = require("node-schedule");
const { processarRespostaBotao } = require('./statistics');

async function startBot() {
    await connectSheet();
    const { state, saveCreds } = await useMultiFileAuthState("auth_info");
    const sock = makeWASocket({ auth: state });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
            console.log("📲 Escaneie o QR Code abaixo para conectar:");
            qrcode.generate(qr, { small: true });
        }
        if (connection === "close") {
            const reason = lastDisconnect?.error?.output?.statusCode;
            console.log("Conexão encerrada. Motivo:", reason);
            if (reason !== DisconnectReason.loggedOut) {
                console.log("🔄 Tentando reconectar...");
                startBot();
            } else {
                console.log("❌ Sessão expirada. Escaneie o QR Code novamente.");
            }
        } else if (connection === "open") {
            console.log("✅ Bot conectado com sucesso!");
        }
    });

    sock.ev.on("messages.upsert", async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || !msg.key.remoteJid) return;
        if (msg.key.fromMe) return;
        await handleMessage(sock, msg);

        if (msg.message.buttonsResponseMessage) {
            await processarRespostaBotao(sock, msg);
        }
    });

    // Agendamento diário, por exemplo, para verificar a virada do mês
    schedule.scheduleJob("0 0 * * *", async () => {
        // Você pode exportar e importar a função verificarViradaDeMes de um módulo, se preferir.
        // await verificarViradaDeMes();
    });

    return sock;
}

module.exports = { startBot };
