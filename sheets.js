// sheets.js
const { GoogleSpreadsheet } = require('google-spreadsheet');
const fs = require('fs');
const creds = require('./credentials.json');
const { enviarMensagemDetalheTreino } = require('./statistics');

const SHEET_ID = '1M6BYZo68vaRfQpRVg04KrrWVQbOXZ51tUufkyN0Gu7I';
const doc = new GoogleSpreadsheet(SHEET_ID);
const DESC_FILE = 'descricao.txt';

async function initializeDoc() {
    await doc.useServiceAccountAuth(creds);
    await doc.loadInfo(); // Loads document properties and worksheets
}

initializeDoc();

module.exports = { doc };

async function connectSheet() {
    await doc.useServiceAccountAuth(creds);
    await doc.loadInfo();
    console.log("Google Sheets conectado!");
}

async function addCadastro(nome, numero) {
    const sheet = doc.sheetsByTitle['Cadastros'];
    const cleanNumber = numero.replace(/@s\.whatsapp\.net$/, '');
    await sheet.addRow({ Nome: nome, Número: cleanNumber });
    console.log(`Cadastro adicionado: ${nome} (${cleanNumber})`);
}

async function jaEstaRegistrado(numero) {
    const sheet = doc.sheetsByTitle['Cadastros'];
    const rows = await sheet.getRows();
    const cleanNumber = numero.replace(/@s\.whatsapp\.net$/, '');
    return rows.some(row => row['Número'] === cleanNumber);
}

async function registrarTreino(numero, sock, chatId, msg) {
    const cadastroSheet = doc.sheetsByTitle['Cadastros'];
    const treinoSheet = doc.sheetsByTitle['Contagem'];
    const cadastroRows = await cadastroSheet.getRows();
    const treinoRows = await treinoSheet.getRows();
    const cleanNumber = numero.replace(/@s\.whatsapp\.net$/, '');
    const userCadastro = cadastroRows.find(row => row['Número'] === cleanNumber);
    if (!userCadastro) {
        await sock.sendMessage(chatId, {
            text: 'Faz teu cadastro aí, lixo.',
            contextInfo: {
                quotedMessage: msg.message,
                stanzaId: msg.key.id,
                participant: msg.key.participant || msg.key.remoteJid
            }
        });
        return;
    }
    const userName = userCadastro['Nome'];
    let userTreino = treinoRows.find(row => row['Nome'] === userName);
    const today = new Date().toLocaleDateString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        day: "2-digit",
        month: "2-digit"
    });
    let mensagem = '';
    let treinoRegistrado = false;
    if (userTreino) {
        const lastWorkoutDate = userTreino['Horario'];
        if (lastWorkoutDate === today) {
            mensagem = 'Você já treinou hoje!';
        } else {
            userTreino['Treinos'] = parseInt(userTreino['Treinos'] || 0) + 1;
            userTreino['Anual'] = parseInt(userTreino['Anual'] || 1) + 1;
            userTreino['Horario'] = today;
            await userTreino.save();
            mensagem = 'Treino registrado! Bora pra cima 💪';
            treinoRegistrado = true;
        }
    } else {
        await treinoSheet.addRow({
            Nome: userName,
            Treinos: 1,
            Anual: 1,
            Horario: today,
            Troféus: 0,
            Meta: "",
            'Tem Meta': "Não"
        });
        mensagem = 'Primeiro treino registrado! Bem-vindo ao DogForts! 🏋️';
        treinoRegistrado = true;
    }
    console.log("Mensagem:", mensagem);
    if (sock && chatId) {
        await sock.sendMessage(chatId, {
            text: mensagem,
            contextInfo: {
                quotedMessage: msg.message,
                stanzaId: msg.key.id,
                participant: msg.key.participant || msg.key.remoteJid
            }
        });
        console.log("Mensagem enviada!");
        if (treinoRegistrado) {
            console.log("🔄 Atualizando descrição do grupo...");
            await atualizarDescricaoGrupo(sock, chatId);
            // Chama a função enviarMensagemDetalheTreino se o treino for registrado
            const privateChatId = `${numero}@s.whatsapp.net`;
            await enviarMensagemDetalheTreino(sock, privateChatId);
        } else {
            console.log("🚫 Treino já registrado hoje, descrição do grupo NÃO será alterada.");
        }
    } else {
        console.error("Erro: sock ou chatId não definidos.");
    }
}

async function salvarDetalhesNaPlanilha(contato, data, grupos) {
    const sheet = doc.sheetsByTitle['Estatisticas Individuais'];
    const newRow = {};
    newRow['Contato'] = contato;
    newRow['Data'] = data;
    newRow['Grupos'] = grupos;

    // Adiciona a nova linha na planilha
    await sheet.addRow(newRow);
    console.log(`Detalhes do treino salvos na planilha para ${contato}`);
}

async function enviarRanking(sock, chatId) {
    let descricao = fs.existsSync(DESC_FILE) ? fs.readFileSync(DESC_FILE, 'utf8').trim() : "Nenhuma descrição encontrada.";
    const linhasDescricao = descricao.split('\n').filter((linha, index, self) => linha.trim() !== '' && self.indexOf(linha) === index);
    descricao = linhasDescricao.join('\n').trim();
    descricao = descricao.replace(/(DOGLIST dias acumulativos\nBeginning: \d{2}\/\d{2}\nEnding: \d{2}\/\d{2})/, "$1\n");
    descricao = descricao.replace(/(Season 2025)/, "\n$1\n");
    const treinoSheet = doc.sheetsByTitle['Contagem'];
    const treinoRows = await treinoSheet.getRows();
    let ranking = treinoRows
        .map(row => {
            const nome = row['Nome'];
            const treinos = parseInt(row['Treinos'] || 0);
            const trofeus = parseInt(row['Troféus'] || 0);
            const anual = parseInt(row['Anual'] || 0);
            const meta = parseInt(row['Meta'] || 0);
            const temMeta = row['Tem Meta']?.trim().toLowerCase() === "sim";
            if (temMeta) {
                return trofeus > 0
                    ? `${nome} (${trofeus}x 🏆): ${treinos} (${anual}/${meta})`
                    : `${nome}: ${treinos} (${anual}/${meta})`;
            } else {
                return trofeus > 0 ? `${nome} (${trofeus}x 🏆): ${treinos}` : `${nome}: ${treinos}`;
            }
        })
        .filter(entry => entry)
        .join('\n');
    const seasonIndex = descricao.indexOf("Season 2025");
    if (seasonIndex !== -1) {
        let antesSeason = descricao.substring(0, seasonIndex).trim();
        let depoisSeason = descricao.substring(seasonIndex).trim();
        descricao = `${antesSeason}\n\n${depoisSeason}`;
    }
    const mensagemFinal = ranking ? `${descricao}\n\n${ranking}` : descricao;
    await sock.sendMessage(chatId, { text: mensagemFinal });
}

async function Metou(numero, sock, chatId, metaText) {
    const treinoSheet = doc.sheetsByTitle['Contagem'];
    const treinoRows = await treinoSheet.getRows();
    const cleanNumber = numero.replace(/@s\.whatsapp\.net$/, '');
    const cadastroSheet = doc.sheetsByTitle['Cadastros'];
    const cadastroRows = await cadastroSheet.getRows();
    const userCadastro = cadastroRows.find(row => row['Número'].replace(/\D/g, '') === cleanNumber);
    if (!userCadastro) {
        await sock.sendMessage(chatId, { text: 'Tu nem tá na lista ainda, faz teu cadastro primeiro!' });
        return;
    }
    const userName = userCadastro['Nome'];
    let userTreino = treinoRows.find(row => row['Nome'] === userName);
    if (!userTreino) {
        await sock.sendMessage(chatId, { text: 'Tu ainda não tem treinos registrados!' });
        return;
    }
    userTreino['Meta'] = metaText;
    await userTreino.save();
    await sock.sendMessage(chatId, { text: `Meta registrada: ${metaText} treinos este ano! 🚀` });
}

async function atualizarDescricaoGrupo(sock, chatId) {
    try {
        const treinoSheet = doc.sheetsByTitle['Contagem'];
        const treinoRows = await treinoSheet.getRows();
        let ranking = treinoRows
            .map(row => {
                const nome = row['Nome'];
                const treinos = parseInt(row['Treinos'] || 0);
                const trofeus = parseInt(row['Troféus'] || 0);
                const anual = parseInt(row['Anual'] || 0);
                const meta = parseInt(row['Meta'] || 0);
                const temMeta = row['Tem Meta']?.trim().toLowerCase() === "sim";
                if (temMeta) {
                    return trofeus > 0
                        ? `${nome} (${trofeus}x 🏆): ${treinos} (${anual}/${meta})`
                        : `${nome}: ${treinos} (${anual}/${meta})`;
                } else {
                    return trofeus > 0 ? `${nome} (${trofeus}x 🏆): ${treinos}` : `${nome}: ${treinos}`;
                }
            })
            .filter(entry => entry)
            .join('\n');
        let descricao = fs.existsSync(DESC_FILE) ? fs.readFileSync(DESC_FILE, 'utf8').trim() : "Nenhuma descrição encontrada.";
        const linhasDescricao = descricao.split('\n').filter((linha, index, self) => linha.trim() !== '' && self.indexOf(linha) === index);
        descricao = linhasDescricao.join('\n').trim();
        descricao = descricao.replace(/(DOGLIST dias acumulativos\nBeginning: \d{2}\/\d{2}\nEnding: \d{2}\/\d{2})/, "$1\n");
        descricao = descricao.replace(/(Season 2025)/, "\n$1\n");
        const seasonIndex = descricao.indexOf("Season 2025");
        if (seasonIndex !== -1) {
            let antesSeason = descricao.substring(0, seasonIndex).trim();
            let depoisSeason = descricao.substring(seasonIndex).trim();
            descricao = `${antesSeason}\n\n${depoisSeason}`;
        }
        const novaDescricao = ranking ? `${descricao}\n\n${ranking}` : descricao;
        await sock.groupUpdateDescription(chatId, novaDescricao);
        console.log("✅ Descrição do grupo atualizada com sucesso!");
    } catch (error) {
        console.error("❌ Erro ao atualizar a descrição do grupo:", error);
    }
}

function obterProximoMes() {
    const nomeMeses = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ];
    let descricaoAtual = fs.existsSync('descricao.txt') ? fs.readFileSync('descricao.txt', 'utf8') : '';
    let linhas = descricaoAtual.trim().split('\n');
    let ultimoMesEncontrado = null;
    for (let i = linhas.length - 1; i >= 0; i--) {
        let linha = linhas[i].trim();
        for (let mes of nomeMeses) {
            if (linha.startsWith(mes)) {
                ultimoMesEncontrado = mes;
                break;
            }
        }
        if (ultimoMesEncontrado) break;
    }
    if (ultimoMesEncontrado) {
        let index = nomeMeses.indexOf(ultimoMesEncontrado);
        return index !== -1 ? nomeMeses[(index + 1) % 12] : "Unknown";
    }
    return "January";
}

async function virarMes() {
    const treinoSheet = doc.sheetsByTitle["Contagem"];
    const backupSheet = doc.sheetsByTitle["Backup"];
    const treinoRows = await treinoSheet.getRows();
    for (const row of treinoRows) {
        await backupSheet.addRow({
            Nome: row["Nome"],
            Treinos: row["Treinos"],
            Horario: row["Horario"],
            Troféus: row["Troféus"],
            Anual: row["Anual"],
            Meta: row["Meta"],
            "Tem Meta": row["Tem Meta"],
            Data: new Date().toLocaleDateString("pt-BR")
        });
    }
    console.log("Backup realizado com sucesso!");
    let maxTreinos = Math.max(...treinoRows.map(row => parseInt(row["Treinos"] || 0)));
    let vencedores = treinoRows.filter(row => parseInt(row["Treinos"] || 0) === maxTreinos);
    if (vencedores.length > 0 && maxTreinos > 0) {
        for (const vencedor of vencedores) {
            vencedor["Troféus"] = parseInt(vencedor["Troféus"] || 0) + 1;
            await vencedor.save();
        }
    }
    for (const row of treinoRows) {
        row["Treinos"] = 0;
        await row.save();
    }
    if (vencedores.length > 0) {
        let nomesVencedores = vencedores.map(row => row["Nome"]);
        let proximoMes = obterProximoMes();
        await atualizarDescricao(nomesVencedores, proximoMes);
    }
    console.log("Processo de virada de mês concluído!");
}

async function atualizarDescricao(vencedores, mes) {
    if (!vencedores || vencedores.length === 0) return;
    let descricao = fs.existsSync(DESC_FILE) ? fs.readFileSync(DESC_FILE, 'utf8').trim() : "";
    const meses = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ];
    let ultimoMesRegistrado = "";
    let indiceUltimoMes = -1;
    for (let i = meses.length - 1; i >= 0; i--) {
        if (descricao.includes(`${meses[i]} Winner`)) {
            ultimoMesRegistrado = meses[i];
            indiceUltimoMes = i;
            break;
        }
    }
    if (indiceUltimoMes === -1) return;
    let mesVencedorIndex = (indiceUltimoMes + 1) % 12;
    let mesProximoIndex = (indiceUltimoMes + 2) % 12;
    let mesVencedor = meses[mesVencedorIndex];
    let mesProximo = meses[mesProximoIndex];
    if (!mesVencedor || !mesProximo) return;
    let primeiroDia = `01/${(mesProximoIndex + 1).toString().padStart(2, "0")}`;
    let ultimoDia = new Date(2025, mesProximoIndex + 1, 0).getDate();
    let ultimoDiaFormatado = `${ultimoDia.toString().padStart(2, "0")}/${(mesProximoIndex + 1).toString().padStart(2, "0")}`;
    let regexDoglist = /DOGLIST dias acumulativos\s*\nBeginning: \d{2}\/\d{2}\s*\nEnding: \d{2}\/\d{2}/;
    let doglistNova = `DOGLIST dias acumulativos\nBeginning: ${primeiroDia}\nEnding: ${ultimoDiaFormatado}`;
    if (descricao.match(regexDoglist)) {
        descricao = descricao.replace(regexDoglist, doglistNova);
    } else {
        console.log("⚠️ Seção DOGLIST não encontrada, inserindo manualmente...");
        descricao += `\n\n${doglistNova}`;
    }
    let vencedorTexto = vencedores.length > 1
        ? `${mesVencedor} Winners: ${vencedores.join(" e ")}`
        : `${mesVencedor} Winner: ${vencedores[0]}`;
    let linhas = descricao.split("\n");
    let indiceSeason = linhas.findIndex(linha => linha.includes("Season 2025"));
    if (indiceSeason !== -1) {
        let indiceUltimoWinner = linhas.slice(indiceSeason).findLastIndex(l => l.includes("Winner"));
        if (indiceUltimoWinner !== -1) {
            linhas.splice(indiceSeason + indiceUltimoWinner + 1, 0, vencedorTexto);
        } else {
            linhas.splice(indiceSeason + 1, 0, vencedorTexto);
        }
    } else {
        linhas.push("\nSeason 2025", vencedorTexto);
    }
    descricao = linhas.join("\n").trim();
    fs.writeFileSync(DESC_FILE, descricao, "utf8");
}

module.exports = {
    connectSheet,
    addCadastro,
    jaEstaRegistrado,
    registrarTreino,
    salvarDetalhesNaPlanilha,
    enviarRanking,
    Metou,
    atualizarDescricaoGrupo,
    virarMes,
    doc,
    atualizarDescricao,
    obterProximoMes
};
