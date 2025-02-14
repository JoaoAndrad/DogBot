const { doc, connectSheet } = require("./sheets"); // Importa a conexão com o Google Sheets

const axios = require('axios'); // Se não tiver instalado, rode: npm install axios

const APPSCRIPT_URL = "https://script.google.com/macros/s/AKfycbyjxE1TJYY5DBFMJzw5PPCZbrfjre5oXrhwZZ8ic7JC1N1L5J9UfeDuyx_Q5npVNRU/exec"; // Substitua pela URL do Apps Script

async function executarAppScript() {
    try {
        const response = await axios.get(APPSCRIPT_URL);
        console.log("Apps Script executado com sucesso:", response.data);
        return response.data;
    } catch (error) {
        console.error("Erro ao executar Apps Script:", error);
        return null;
    }
}

async function gerarRelatorioTreino(numeroUsuario, mes, sock, chatId) {
    await connectSheet(); // Garante que a conexão esteja ativa

    await executarAppScript(); // Executa o Apps Script para atualizar os dados
    const treinoSheet = doc.sheetsByTitle['Estatisticas Individuais']; // Aba correta
    const treinoRows = await treinoSheet.getRows(); // Obtém todas as linhas

    if (!treinoRows.length) {
        await sock.sendMessage(chatId, { text: "Erro ao acessar os dados. Nenhum treino encontrado!" });
        return;
    }

    // Dicionário para mapear nomes de meses para números
    const meses = {
        janeiro: "01", fevereiro: "02", março: "03", abril: "04", maio: "05", junho: "06",
        julho: "07", agosto: "08", setembro: "09", outubro: "10", novembro: "11", dezembro: "12"
    };

    const mesFormatado = meses[mes.toLowerCase()];
    if (!mesFormatado) {
        await sock.sendMessage(chatId, { text: "Mês inválido! Use algo como: *estatisticas fevereiro*" });
        return;
    }

    // Filtra os treinos do usuário para o mês solicitado
    const treinosUsuario = treinoRows.filter(row => {
        const dataSplit = row['Data'].includes('-') ? row['Data'].split('-') : row['Data'].split('/');
        const mesTreino = dataSplit[1]; // Pega a parte do mês

        return row['Contato'] === numeroUsuario && mesTreino === mesFormatado;
    });

    if (treinosUsuario.length === 0) {
        await sock.sendMessage(chatId, { text: `Nenhum treino encontrado para *${mes}/2025*.` });
        return;
    }

    // Dicionário de emojis para cada grupamento
    var emojisGrupamentos = {
        "Peito": "🕊️", // Supino e variações
        "Costas": "🏋️", // Puxada, remada
        "Biceps": "💪", // Rosca direta
        "Triceps": "🔱", // Tríceps corda, francês
        "Ombros": "💪", // Elevação lateral, desenvolvimento
        "Perna": "🦵", // Agachamento, leg press
        "Gluteos": "🍑", // Levantamento terra, stiff
        "Braço": "💪", // Genérico para biceps/triceps
        "Abdomen": "🫃", // Abdominais, prancha
        "Panturrilha": "🐐", // Subida em plataforma
        "Antebraco": "✊" // Exercícios de pegada, rolo
    };

    // Contagem de treinos por grupo muscular
    const estatisticas = {};
    treinosUsuario.forEach(row => {
        const grupos = row['Grupos'].split(',').map(g => g.trim()); // Divide os grupos e remove espaços

        grupos.forEach(grupo => {
            estatisticas[grupo] = (estatisticas[grupo] || 0) + 1;
        });
    });
    const semanasNoMes = 4; // Consideramos 4 semanas para simplificar
    const mediaSemanal = (treinosUsuario.length / semanasNoMes).toFixed(1);

    const { TotalAbstrato, nomeUsuario } = await verificarTotalAbstrato(numeroUsuario, mes);

    // Construindo a mensagem do relatório
    let mensagemRelatorio = `📊 *Seu relatório de treinos para ${mes}/2025* 📊\n\n`;
    mensagemRelatorio += `👤 *${nomeUsuario}*\n`;
    mensagemRelatorio += `🔥 *Total de treinos registrados:* ${TotalAbstrato}\n`;
    mensagemRelatorio += `✅ *Total de treinos com grupamentos registrados:* ${treinosUsuario.length}\n`;
    mensagemRelatorio += `📅 *Média semanal:* ${mediaSemanal} treinos\n\n`;
    mensagemRelatorio += `🔥 *Treinos por grupamento:*\n\n`;

    Object.entries(estatisticas).forEach(([grupo, qtd]) => {
        const emoji = emojisGrupamentos[grupo] || ""; // Adiciona o emoji correspondente
        const porcentagem = ((qtd / treinosUsuario.length) * 100).toFixed(1); // Calcula a porcentagem
        mensagemRelatorio += `${emoji} *${grupo}:* ${qtd} treino(s) (${porcentagem}%)\n`;
    });

    mensagemRelatorio += `\n🚀 *Mantenha o ritmo!*`;

    // Envia a mensagem para o usuário
    await sock.sendMessage(chatId, { text: mensagemRelatorio });
    return;
}


async function verificarTotalAbstrato(numeroUsuario, mes) {
    await connectSheet(); // Garante que a conexão esteja ativa

    const cadastroSheet = doc.sheetsByTitle['Cadastros']; // Aba de Cadastro
    const contagemSheet = doc.sheetsByTitle['Contagem']; // Aba de contagem atual
    const backupSheet = doc.sheetsByTitle['Backup']; // Aba de backup para meses anteriores

    const cadastroRows = await cadastroSheet.getRows();
    const contagemRows = await contagemSheet.getRows();
    const backupRows = await backupSheet.getRows();

    // Busca o nome correspondente ao número na aba "Cadastro"
    const usuarioCadastro = cadastroRows.find(row => row['Número'] === numeroUsuario);
    if (!usuarioCadastro) {
        console.log(`Número ${numeroUsuario} não encontrado na aba Cadastro.`);
        return 0;
    }

    const nomeUsuario = usuarioCadastro['Nome'];
    console.log(`Número ${numeroUsuario} corresponde a ${nomeUsuario} na aba Cadastro.`);

    // Dicionário para mapear nomes de meses para números
    const meses = {
        janeiro: "01", fevereiro: "02", março: "03", abril: "04", maio: "05", junho: "06",
        julho: "07", agosto: "08", setembro: "09", outubro: "10", novembro: "11", dezembro: "12"
    };

    const mesAtual = new Date().getMonth() + 1; // Obtém o mês atual (1-12)
    const mesFormatado = meses[mes.toLowerCase()];
    let TotalAbstrato = 0;

    if (parseInt(mesFormatado) === mesAtual) {
        const usuarioContagem = contagemRows.find(row => row['Nome'].toLowerCase() === nomeUsuario.toLowerCase());
        if (usuarioContagem) {
            TotalAbstrato = usuarioContagem['Treinos'] || 0;
        }
    } else {
        const usuarioBackup = backupRows.find(row => row['Nome'].toLowerCase() === nomeUsuario.toLowerCase());
        if (usuarioBackup) {
            TotalAbstrato = usuarioBackup['Treinos'] || 0;
        }
    }

    console.log(`Total abstrato de ${nomeUsuario} (${numeroUsuario}) no mês ${mes}: ${TotalAbstrato}`);
    return { TotalAbstrato, nomeUsuario };
}

module.exports = { gerarRelatorioTreino };
