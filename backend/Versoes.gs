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

function bumpVersao_(recursos) {
  var lista = Array.isArray(recursos) ? recursos : [recursos];
  var props = PropertiesService.getScriptProperties();
  lista.forEach(function (r) {
    var chave = 'versao_' + r;
    var atual = Number(props.getProperty(chave) || '0');
    props.setProperty(chave, String(atual + 1));
  });
}

function getVersoes(session, params) {
  var props = PropertiesService.getScriptProperties().getProperties();
  var out = {};
  RECURSOS_VERSIONADOS.forEach(function (r) {
    out[r] = Number(props['versao_' + r] || '0');
  });
  return ok_(out);
}
