/**
 * GAOCG App - Geração atômica de IDs sequenciais (SOF-000001, REC-000001, etc.)
 * usando a aba de controle "Contadores" + LockService, para evitar colisão
 * em cadastros simultâneos.
 */

var PREFIXOS_ID = {
  Usuarios: 'USR',
  Unidades: 'UNI',
  ListasPersonalizadas: 'LST',
  SOF: 'SOF',
  NotasEmpenho: 'NE',
  Recibos: 'REC',
  LogAuditoria: 'LOG',
  SofFontes: 'SFT',
  SofFontesCronograma: 'SFC',
  UnidadesTA: 'UTA',
  NotasEmpenhoCronograma: 'NEC'
};

/**
 * Reserva `quantidade` IDs sequenciais de uma vez, com um único lock/leitura/
 * escrita na aba Contadores, em vez de um ciclo de lock por ID. Usada por
 * registrarDiferencas_ (LogAuditoria.gs) quando uma edição muda vários campos
 * de uma vez - cada `proximoId_` isolado é lock+read+write própria, então N
 * campos alterados viravam N ciclos de lock só pra gerar os IDs do log,
 * antes mesmo de escrever as linhas em si. Ver PROGRESS.md (lentidão ao
 * trocar andamento no SOF).
 */
function proximosIds_(nomeAba, quantidade) {
  var prefixo = PREFIXOS_ID[nomeAba];
  if (!prefixo) throw new Error('Prefixo de ID não definido para a aba "' + nomeAba + '".');
  if (!quantidade || quantidade < 1) return [];

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var sheet = getSheet_(SHEETS.CONTADORES);
    var data = sheet.getDataRange().getValues();
    var rowIndex = -1;
    var proximo = 1;

    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]) === prefixo) {
        rowIndex = i + 1;
        proximo = Number(data[i][1]) || 1;
        break;
      }
    }

    var novoProximo = proximo + quantidade;
    if (rowIndex === -1) {
      sheet.appendRow([prefixo, novoProximo]);
    } else {
      sheet.getRange(rowIndex, 2).setValue(novoProximo);
    }

    var ids = [];
    for (var n = 0; n < quantidade; n++) {
      ids.push(prefixo + '-' + ('000000' + (proximo + n)).slice(-6));
    }
    return ids;
  } finally {
    lock.releaseLock();
  }
}

function proximoId_(nomeAba) {
  return proximosIds_(nomeAba, 1)[0];
}
