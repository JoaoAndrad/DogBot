// utils.js
function getTodayDate() {
    return new Date().toLocaleDateString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
    });
}

module.exports = { getTodayDate };
