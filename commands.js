// commands.js
const {
    addCadastro,
    jaEstaRegistrado,
    enviarRanking,
    registrarTreino,
    Metou,
    salvarDetalhesNaPlanilha
} = require('./sheets');
const { enviarMensagemDetalheTreino, consultarEstatisticas, processarRespostaTreino } = require('./statistics');
const { gerarRelatorioTreino } = require("./relatorio");

const pendingRegistrations = new Map();
const pendingMetas = new Map();
const pendingStatistics = new Map();

async function handleMessage(sock, msg) {
    const chatId = msg.key.remoteJid;
    const senderNumber = (msg.key.participant || msg.key.remoteJid).replace(/@s\.whatsapp\.net$/, '');

    let messageContent =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        msg.message.imageMessage?.caption ||
        msg.message.videoMessage?.caption ||
        msg.message.documentMessage?.caption ||
        msg.message.audioMessage?.caption ||
        msg.message.stickerMessage?.caption ||
        msg.message.gifMessage?.caption;

    console.log(`📩 Mensagem recebida de ${senderNumber}:`, messageContent || "[Sem texto]");
    if (!messageContent) return;

    const isPrivateChat = !chatId.includes("@g.us");

    if (pendingRegistrations.has(senderNumber)) {
        pendingRegistrations.delete(senderNumber);
        await addCadastro(messageContent, senderNumber);
        await sock.sendMessage(chatId, { text: `Cadastro concluído! Seja bem-vindo, ${messageContent} 👊🔥` });
        return;
    }

    if (pendingMetas.has(senderNumber)) {
        pendingMetas.delete(senderNumber);
        await Metou(senderNumber, sock, chatId, messageContent);
        return;
    }

    // Se o usuário já está aguardando a resposta para o comando "estatisticas"
    if (isPrivateChat && pendingStatistics.has(senderNumber)) {
        const month = messageContent.toLowerCase();
        pendingStatistics.delete(senderNumber);
        try {
            const stats = await consultarEstatisticas(month, senderNumber);
            await sock.sendMessage(chatId, { text: stats.mensagem });
        } catch (error) {
            await sock.sendMessage(chatId, { text: "Desculpe, ocorreu um erro ao obter suas estatísticas." });
        }
        return;
    }

    // Processa comandos enviados no chat privado
    if (isPrivateChat) {
        if (messageContent.toLowerCase() === "cadastro") {
            if (await jaEstaRegistrado(senderNumber)) {
                await sock.sendMessage(chatId, { text: 'Você já está cadastrado.' });
            } else {
                pendingRegistrations.set(senderNumber, true);
                await sock.sendMessage(chatId, { text: "Me informa o nome que você deseja que seja exibido na sua contagem:" });
            }
            return;
        } else if (messageContent.toLowerCase() === "ranking") {
            await enviarRanking(sock, chatId);
            return;
        } else if (messageContent.toLowerCase() === "meta") {
            await Metou(senderNumber, sock, chatId);
            return;
        } else if (messageContent.toLowerCase() === "ajuda") {
            const avisoMensagem =
                `🔥 *Bem vindo ao menu de ajuda do DogBot* 🔥\n\n` +
                `⚠️ *Leia atentamente!* Se algum dado for solicitado, ele será registrado automaticamente.\n`;
            const ajudaMensagem =
                `👊 *Fala, guerreiro!* Aqui está o guia pra tu dominar o treino:\n\n` +
                `📌 *Cadastro*: "cadastro" (no privado)\n` +
                `💪 *Registrar Treino*: Mencione o bot no grupo e digite "treinei"\n` +
                `🏆 *Ranking*: "ranking" (no privado)\n` +
                `🎯 *Meta*: "meta" (no privado)\n` +
                `📊 *Estatísticas*: "estatisticas" (no privado)\n\n` +
                `Bora pra cima! 🚀🔥`;
            await sock.sendMessage(chatId, { text: avisoMensagem, quoted: { key: msg.key, message: msg.message } });
            setTimeout(async () => {
                await sock.sendMessage(chatId, { text: ajudaMensagem, quoted: { key: msg.key, message: msg.message } });
            }, 8000);
            return;
        } else if (messageContent.toLowerCase().startsWith("estatisticas")) {
            const partes = messageContent.split(" ");
            if (partes.length < 2) {
                await sock.sendMessage(chatId, { text: "Por favor, informe o mês desejado. Exemplo: *estatisticas fevereiro*" });
                return;
            }

            const mes = partes[1].charAt(0).toUpperCase() + partes[1].slice(1).toLowerCase(); // Corrige o formato do mês
            await gerarRelatorioTreino(senderNumber, mes, sock, chatId);
        }
    } else {
        console.log("🚫 Comando ignorado, pois foi enviado em um grupo.");
    }

    // Processa comando de treino em grupo: "treinei" e menção ao bot
    if (messageContent.toLowerCase().includes("treinei") && messageContent.includes("@558393325551")) {
        console.log("✅ Mensagem contém 'treinei' e mencionou o bot. Registrando treino...");
        const privateChatId = `${senderNumber}@s.whatsapp.net`;
        await registrarTreino(senderNumber, sock, chatId, msg);
        return;
    }

    // Verifica se a mensagem contém "pix" em qualquer contexto
    if (messageContent.toLowerCase().includes("pix")) {
        await sock.sendMessage(chatId, {
            text: "Opa, vi que você demonstrou interesse em ajudar os custos de manutenção do DogBot.\nSegue nosso pix:\n\npixdeandrade@gmail.com\n\nC6 Bank"
        });
        return;
    }

    await processarRespostaTreino(sock, msg);
}

module.exports = { handleMessage, pendingRegistrations, pendingMetas };
