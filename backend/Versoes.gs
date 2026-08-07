/**
 * GAOCG App - Contador de versão por recurso, para o frontend saber (sem
 * reler a planilha) se um cache local ainda é válido - inclusive quando a
 * mudança foi feita por outro usuário/sessão.
 *
 * Usa PropertiesService (não CacheService): o contador precisa sobreviver
 * além do TTL de 30s já usado nos caches de leitura (Auth.gs,
 * ListasPersonalizadas.gs, etc.). Sem LockService de propósito - mesmo
 * padrão "sem lock" já usado no resto do código; numa escrita simultânea
 * rarissima no mesmo recurso, um incremento pode se perder, mas isso só
 * atrasa uma revalidação em mais um ciclo, nunca gera dado incorreto.
 */

var RECURSOS_VERSIONADOS = ['sof', 'recibos', 'notasEmpenho', 'unidades', 'logAuditoria', 'listas', 'usuarios', 'dashboard'];

/**
 * Uma leitura + uma escrita no PropertiesService, não importa quantos recursos
 * sejam incrementados de uma vez (varredura de 2026-08-07): antes era
 * getProperty + setProperty POR recurso, e uma escrita de Recibo dispara
 * bumpVersao_(['recibos','dashboard']) mais o bumpVersao_('logAuditoria') de
 * registrarDiferencas_ - 6 chamadas ao serviço onde bastam 2.
 *
 * setProperties sem o segundo argumento faz merge (não apaga as demais
 * propriedades do script, incluindo SPREADSHEET_ID e TOKEN_SECRET).
 */
function bumpVersao_(recursos) {
  var lista = Array.isArray(recursos) ? recursos : [recursos];
  if (!lista.length) return;
  var props = PropertiesService.getScriptProperties();
  var atuais = props.getProperties();
  var novas = {};
  lista.forEach(function (r) {
    var chave = 'versao_' + r;
    novas[chave] = String(Number(atuais[chave] || '0') + 1);
  });
  props.setProperties(novas);
}

function getVersoes(session, params) {
  var props = PropertiesService.getScriptProperties().getProperties();
  var out = {};
  RECURSOS_VERSIONADOS.forEach(function (r) {
    out[r] = Number(props['versao_' + r] || '0');
  });
  return ok_(out);
}
