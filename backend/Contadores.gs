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
  UnidadesTA: 'UTA',
  NotasEmpenhoCronograma: 'NEC'
};

function proximoId_(nomeAba) {
  var prefixo = PREFIXOS_ID[nomeAba];
  if (!prefixo) throw new Error('Prefixo de ID não definido para a aba "' + nomeAba + '".');

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

    var novoProximo = proximo + 1;
    if (rowIndex === -1) {
      sheet.appendRow([prefixo, novoProximo]);
    } else {
      sheet.getRange(rowIndex, 2).setValue(novoProximo);
    }

    var numero = ('000000' + proximo).slice(-6);
    return prefixo + '-' + numero;
  } finally {
    lock.releaseLock();
  }
}
