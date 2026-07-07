# GAOCG App

Aplicação web interna da Gerência Administrativa Orçamentária dos Contratos de Gestão (GAOCG), substituindo as planilhas hoje usadas para controlar SOFs, Notas de Empenho e Recibos.

- **Frontend:** HTML + CSS + JavaScript vanilla, sem build, publicado via GitHub Pages.
- **Backend:** Google Apps Script, publicado como Web App (API JSON).
- **Banco de dados:** Google Sheets (uma aba por "tabela").

A especificação completa está em [`docs/`](docs): [documento de requisitos](docs/documento_requisitos_gaocg.md), [modelo de dados](docs/modelo_dados_gaocg.md) e o [prompt de construção](docs/PROMPT_BUILD_GAOCG_APP.md) que orientou esta implementação.

## Estrutura do repositório

```
/backend            Google Apps Script (API)
  Code.gs           doGet/doPost, roteamento de todas as ações
  Utils.gs          Helpers de planilha, validação (CNPJ/SEI/SOF), resposta HTTP
  Auth.gs           Login, hash de senha, geração/validação de token
  Contadores.gs     Geração atômica de IDs sequenciais
  Usuarios.gs       Gestão de Usuários (Func. 9)
  Unidades.gs       Cadastro Mestre de Unidades (Func. 2)
  ListasPersonalizadas.gs   Opções de andamento/status por frente (Func. 3/4/8)
  Sof.gs            Gestão de SOF (Func. 3)
  NotasEmpenho.gs   Notas de Empenho (Func. 5)
  Recibos.gs        Gestão de Recibos + migração histórica (Func. 4)
  LogAuditoria.gs   Log de auditoria (Func. 6)
  EdicoesEmAndamento.gs   Aviso de edição simultânea (Func. 10)
  Dashboard.gs      Indicadores (Func. 8)
  Seed.gs           Bootstrap da planilha (cria abas/cabeçalhos, usuário gerente inicial)
  appsscript.json   Manifesto do projeto Apps Script

/css/style.css       Estilos (CSS puro, sem framework)
/js                  Um módulo por tela + api.js/auth.js/app.js
index.html           Shell da SPA

/docs                Cópia dos documentos de especificação
```

**Desvio documentado em relação à estrutura sugerida no prompt de construção:** os arquivos de frontend ficam na raiz do repositório (`index.html`, `css/`, `js/`) em vez de dentro de `/frontend`, para manter continuidade com o layout já publicado no GitHub Pages deste repositório. Também foram adicionados `js/usuarios.js` e `js/listas.js` (não listados explicitamente no prompt), pois as Funcionalidades 9 e a administração de `ListasPersonalizadas` precisam de tela própria.

## Passo a passo de implantação

### 1. Criar e configurar a planilha (Fase 0)

1. Crie uma planilha Google Sheets nova e vazia (ex.: "GAOCG - Banco de Dados").
2. Menu **Extensões > Apps Script**. Isso cria um projeto de script vinculado (bound script) à planilha.
3. Apague o conteúdo padrão de `Code.gs` do editor do Apps Script e cole, em arquivos `.gs` separados, o conteúdo de cada arquivo em `/backend` deste repositório (crie um arquivo de script por `.gs`: `Code`, `Utils`, `Auth`, `Contadores`, `Usuarios`, `Unidades`, `ListasPersonalizadas`, `Sof`, `NotasEmpenho`, `Recibos`, `LogAuditoria`, `EdicoesEmAndamento`, `Dashboard`, `Seed`).
4. Copie também o conteúdo de `backend/appsscript.json` para o manifesto do projeto (no editor: ícone de engrenagem > "Mostrar arquivo de manifesto `appsscript.json`").
5. No editor do Apps Script, selecione a função `configurarPlanilha` no seletor de funções e clique em **Executar**. Na primeira execução, autorize as permissões solicitadas (acesso à planilha).
   - Isso cria todas as abas do `modelo_dados_gaocg.md` com os cabeçalhos corretos, a aba de controle `Contadores`, um usuário gerente inicial (`login: admin`, `senha: TrocarSenha123`) e algumas opções de `ListasPersonalizadas` sugeridas (ver seção "Suposições assumidas" abaixo).
   - **Troque a senha do usuário `admin` no primeiro acesso** (crie um usuário definitivo e inative o `admin`, ou redefina a senha dele pela tela de Usuários).

### 2. Publicar o backend como Web App

1. No editor do Apps Script: **Implantar > Nova implantação**.
2. Tipo: **Aplicativo da Web**.
3. "Executar como": **Eu** (o usuário que está implantando) — assim o script sempre acessa a planilha com a permissão de quem publicou, independentemente de quem está usando o app.
4. "Quem tem acesso": **Qualquer pessoa**.
5. Clique em **Implantar** e copie a URL gerada (termina em `/exec`).
6. Sempre que o código do backend for alterado, é preciso criar uma **nova versão** da implantação (Implantar > Gerenciar implantações > editar > Nova versão) para que as mudanças entrem em vigor na URL publicada.

### 3. Configurar o frontend

1. Abra `js/api.js` e substitua `COLOQUE_AQUI_A_URL_DO_WEB_APP/exec` pela URL copiada no passo anterior.
2. Publique o repositório no GitHub Pages (Settings > Pages > Branch `main`, pasta raiz).
3. Acesse a URL do GitHub Pages e faça login com o usuário gerente criado no passo 1.

### 4. Cadastrar as Unidades (Fase 1)

Antes de qualquer SOF ou Recibo, cadastre as unidades pela tela **Unidades** (CNPJ + contrato de gestão não podem se repetir).

### 5. Migração do histórico de Recibos (Fase 3)

O módulo de Recibo deve nascer com o histórico já existente; o de SOF nasce vazio (decisão de negócio, Funcionalidade 4). Não há tela de migração pronta no MVP (execução única e pontual) — rode a função `migrarRecibosHistorico(session, linhas)` diretamente pelo editor do Apps Script (ou via uma chamada de API autenticada como gerente), montando `linhas` a partir da planilha "Recibos Regulares + Rateio" atual, com:

- `unidade_id` já resolvido contra o cadastro de `Unidades` (por isso a Fase 1 precisa estar concluída antes).
- Linhas do mesmo grupo de rateio compartilhando o mesmo `rateio_grupo_id`.
- Os demais campos de `Recibos` (ver `modelo_dados_gaocg.md`).

Essa rotina grava `origem = 'importacao_inicial'` e **não** gera entradas em `LogAuditoria` (decisão de negócio já fechada).

## Segurança (spike da Fase 0)

- **CORS:** o Apps Script Web App não responde de forma confiável a um preflight OPTIONS (a URL `/exec` redireciona e o navegador rejeita). A solução adotada foi **evitar completamente o preflight**: o frontend só faz `GET` (nunca gera preflight) ou `POST` com `Content-Type: text/plain` (um content-type "simples" para CORS). Ver comentários em `backend/Utils.gs` (`jsonOut_`) e `js/api.js`.
- **Autenticação:** todo endpoint exige um token válido, exceto `ping` e `login`. O token é assinado com HMAC-SHA256 (segredo gerado automaticamente em Script Properties na primeira execução, nunca no código-fonte) e não expira por tempo (requisito de negócio) — mas cada requisição revalida o usuário contra a aba `Usuarios` (perfil/frente/`ativo` atuais), então inativar um usuário efetiva o bloqueio imediatamente.
- **Senhas:** hash SHA-256 com salt por usuário (`Auth.gs`). Apps Script não tem bibliotecas de hashing robustas como bcrypt/argon2 nativamente; isso é um trade-off conhecido do ambiente de baixo custo, documentado aqui conforme pedido.
- **Spreadsheet ID:** nunca exposto ao frontend; fica em Script Properties (`SPREADSHEET_ID`, opcional — se vazio, o script usa a planilha ativa/vinculada).
- **Sanitização:** toda entrada recebida pela Web App passa por `sanitizeString_`/`toNumber_`/`toBool_` antes de ser gravada; nunca se confia em dados vindos do cliente.

## Suposições assumidas (Seção 8 do prompt de construção)

1. **Ordem de carga da migração:** `Unidades` populada antes de `Recibos` histórico — tratado como pré-condição de infraestrutura.
2. **Indicador de log de auditoria no dashboard do gerente:** implementado (`edicoes_fora_da_frente` em `Dashboard.gs`/`dashboard.js`) — contagem de edições `fora_da_frente` no período.
3. **Opções de `ListasPersonalizadas` com `pausa_contagem_parado = VERDADEIRO`:** o campo é configurável normalmente pela tela de Listas Personalizadas (padrão `FALSO`). `Seed.gs` já cria, como sugestão inicial editável, "AGUARDANDO AUTORIZAÇÃO CPF" e "AGUARDANDO DISPONIBILIDADE ORÇAMENTÁRIA" com `pausa_contagem_parado = VERDADEIRO` para as frentes de SOF/Recibo, e demais opções básicas com `FALSO`. Ajuste livremente pela tela.

## Limitações conhecidas do MVP

- Migração de Recibos históricos não tem tela própria; é uma rotina de backend executada uma única vez no lançamento (ver passo 5 acima).
- Locale da planilha: recomenda-se pt-BR para que os booleans nativos do Sheets sejam exibidos como VERDADEIRO/FALSO (o app grava/lê `true`/`false` normalmente; a exibição no Sheets segue o locale da planilha).
- Fora de escopo (não construído, conforme prompt de construção): geração automática de documentos, calendário de prazos por e-mail, checklist digital de anexos, relatórios avançados além do CSV simples, integração com Drive, fluxo de aprovação formal entre frentes, login via Google OAuth, telas dedicadas para RPA/Diária/TA/Emenda Parlamentar.
