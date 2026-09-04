# API de consulta externa (GAOCG App)

Endpoints de **leitura** do backend (Google Apps Script), autenticados por uma **chave de API** própria - separada do login de usuário do app. Pensada para consumo por ferramentas externas (Power BI, Excel, outro sistema), não pelo próprio frontend do GAOCG.

URL base: a mesma do app - `https://script.google.com/macros/s/AKfycbzbLozyF4h0HLbCeJdWyj1skAmxgrUhjV17FvKzXKVqF9l3gIAnS6ufmvj-PvjAOv4ZTg/exec`

## Gerando uma chave (Administrador do Aplicativo)

Só o perfil Administrador pode gerar/listar/revogar chaves. Mais fácil pelo Console do navegador, logado no app (o módulo `Api` já fica global):

```js
Api.chamar('gerarChaveApi', { descricao: 'Power BI - relatório mensal' }).then(r => console.log(r));
```

A resposta traz o valor da chave **uma única vez** (`gaocg_...`) - guarde-o assim que aparecer, não tem como recuperar depois (só revogar e gerar outra).

Listar chaves existentes (mostra os valores mascarados, só os 4 últimos caracteres):
```js
Api.chamar('listarChavesApi').then(r => console.log(r));
```

Revogar uma chave:
```js
Api.chamar('revogarChaveApi', { id: 'API-000001' }).then(r => console.log(r));
```

## Chamando a API

`GET` (mais simples) ou `POST` (`Content-Type: text/plain`, corpo JSON) com `action` + `chave`. Exemplo via `curl`:

```bash
curl "https://script.google.com/macros/s/AKfycbzbLozyF4h0HLbCeJdWyj1skAmxgrUhjV17FvKzXKVqF9l3gIAnS6ufmvj-PvjAOv4ZTg/exec?action=api_recibos&chave=SUA_CHAVE_AQUI&pageSize=100&competencia=2026-09"
```

Resposta sempre no formato `{"ok": true, "data": {...}}` ou `{"ok": false, "error": "..."}`.

## Endpoints disponíveis

| `action` | Equivalente interno | Filtros aceitos (principais) |
|---|---|---|
| `api_recibos` | `listarRecibos` | `competencia`, `unidade_id`, `status`, `oss`, `fonte`, `tipo_unidade`, `dea`, `ano`, `busca`, `pageSize`, `page` |
| `api_sof` | `listarSof` | `unidade_id`, `andamento`, `tipo`, `objeto`, `oss`, `fonte`, `tipo_unidade`, `dea`, `ano`, `semNe`, `busca`, `pageSize`, `page` |
| `api_unidades` | `listarUnidades` | `unidade_id`, `tipo`, `oss`, `somenteAtivas`, `busca`, `pageSize`, `page` |
| `api_notasEmpenho` | `listarNotasEmpenho` | `unidade_id`, `competencia`, `objeto`, `oss`, `fonte`, `tipo_unidade`, `dea`, `ano`, `saldoBaixo`, `busca`, `pageSize`, `page` |

Cada endpoint devolve os mesmos campos que o frontend do app já usa (mesma função por trás), com paginação (`items`, `total`, `page`, `pageSize`) - sem `pageSize`, o padrão é 20.

## O que NÃO existe (de propósito)

Só leitura. Não há endpoint de escrita/criação/exclusão por chave de API - reduz a superfície de risco de expor dados a um consumidor externo. Se algum dia precisar de escrita externa, é uma decisão separada (endpoints próprios, mais guardados).

## Limites a considerar

Conta gratuita do Apps Script (a em uso): cota diária de chamadas e ~30 execuções simultâneas. Para uso interno/pontual (Power BI atualizando a cada X horas, por exemplo) isso não chega perto de ser um problema; só vira relevante com tráfego alto/contínuo.
