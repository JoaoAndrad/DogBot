const pendingTreinoDetails = new Map();
const fetch = require('node-fetch');

async function enviarMensagemDetalheTreino(sock, privateChatId) {
    console.log(`Enviando mensagem de detalhes do treino para ${privateChatId}`);

    const message = {
        text: "🔥 Olá! Vamos registrar seu treino de hoje?\n\n💪 Me diga quais grupos musculares você treinou, separando por vírgula.\n\nExemplo: Peito, Tríceps, Costas.\n\n🏆 Será possível visualizar suas estatisticas de treinos! 🚀"
    };

    try {
        await sock.sendMessage(privateChatId, message);
        console.log(`Mensagem de detalhes do treino enviada para ${privateChatId}`);
        pendingTreinoDetails.set(privateChatId, true);

        // Esperar até 5 minutos para que o usuário envie sua mensagem com o grupo
        setTimeout(() => {
            if (pendingTreinoDetails.has(privateChatId)) {
                pendingTreinoDetails.delete(privateChatId);
                console.log(`Tempo esgotado para ${privateChatId} enviar os detalhes do treino.`);
                sock.sendMessage(privateChatId, { text: 'Tempo esgotado para enviar os detalhes do treino. Por favor, tente novamente.' });
            }
        }, 5 * 60 * 1000); // 5 minutos em milissegundos
    } catch (error) {
        console.error(`Erro ao enviar mensagem para ${privateChatId}:`, error);
    }
}

async function processarRespostaTreino(sock, msg) {
    const privateChatId = msg.key.remoteJid;
    const { salvarDetalhesNaPlanilha } = require('./sheets');

    if (pendingTreinoDetails.has(privateChatId)) {
        pendingTreinoDetails.delete(privateChatId);
        const treinoDetails = msg.message.conversation || msg.message.extendedTextMessage?.text;
        console.log(`Detalhes do treino recebidos de ${privateChatId}: ${treinoDetails}`);

        // Salvar os detalhes do treino na planilha
        const contato = privateChatId.split('@')[0];
        const data = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
        await salvarDetalhesNaPlanilha(contato, data, treinoDetails);

        await sock.sendMessage(privateChatId, { text: 'Detalhes do treino registrados com sucesso!' });
    }
}

module.exports = { enviarMensagemDetalheTreino, processarRespostaTreino };