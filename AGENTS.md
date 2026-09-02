# Santa Fé V2 — Instruções para Codex

## Stack
React 19 + Vite + Firebase Auth + Firestore.

## Ambientes
- HML: santa-fe-v2-hml
- PROD: santa-fe-v2-prod
- LEGACY: santa-fe-v2

Nunca usar LEGACY para novos deploys.

## Contexto consolidado
- `main` = baseline válida das fases concluídas.
- Não reanalisar fases anteriores sem regressão evidente.
- Não ler o repositório inteiro.
- Ler primeiro apenas os arquivos citados no prompt.
- Expandir a leitura só por dependência direta.
- Não repetir arquitetura já documentada.
- Não reproduzir arquivos completos nem logs extensos.
- Durante a implementação, executar só testes focados.
- Rodar `test:all` + lint + `build:hml` + `build:prod` + diff-check somente no checkpoint final.
- Build HML e PROD usam o mesmo `dist`; após validação sequencial, nunca fazer deploy direto desse `dist`.
- Antes de deploy, gerar novamente o build do ambiente alvo.
- Resposta final curta: arquivos, comportamento, testes, lint/build/diff/status e riscos.

### Estado consolidado
- Fases 9A–9I concluídas.
- Fase 10A concluída, homologada e publicada em PROD.
- PROD Fase 10A: commit `8515916d953d91a99177c001754d2e0787f50559`, tag `production-phase10a`.
- Hotfix de identidade visual/logo concluído e publicado em PROD: commit `a7faca3`, merge na `main` `3599517`.
- Logo oficial: `public/logo_santa_fe.png`.
- URL PROD: `https://santa-fe-v2-prod.web.app`.
- Programação = disponibilidade da Casa.
- Agendamentos = marcação de Pessoa.
- Fluxo do Dia = execução.
- Novo agendamento: Serviço → Pessoa → Data disponível → Confirmar.
- Programação suporta datas específicas em lote e recorrência semanal.
- Cada data permanece como documento independente na collection `agendas`.
- Controle transacional de vagas preservado.
- Modelo: Pessoa → Membro → Usuário opcional.
- Firebase Auth != autorização.
- HML: `santa-fe-v2-hml`.
- PROD: `santa-fe-v2-prod`.
- LEGACY: `santa-fe-v2`, Hosting desativado.

## Modelo de domínio
PESSOA → MEMBRO → USUÁRIO DO SISTEMA (opcional)

- Firebase Auth != autorização de acesso.
- Membro pode existir sem usuário do sistema.
- Consulente é fluxo distinto.
- Não criar senha para membro pelo administrador.
- Uma Pessoa deve possuir no máximo um usuário do sistema.
- Preservar histórico institucional; preferir status/inativação a exclusão.

## Firestore
Raiz:
artifacts/{projectId}/public/data/{collection}

Não enfraquecer regras existentes para facilitar implementação.

## Segurança
Nunca imprimir ou versionar:
- API keys;
- tokens;
- credenciais;
- .env.hml;
- .env.production.

Não alterar .firebaserc ou arquivos .env salvo solicitação explícita.

## Forma de trabalhar — economia de tokens
- Não analisar o repositório inteiro sem necessidade.
- Ler primeiro somente os arquivos diretamente relacionados à tarefa.
- Expandir para dependências somente quando necessário.
- Não reproduzir arquivos completos na resposta.
- Não reproduzir logs extensos.
- Não explicar cada comando executado.
- Não repetir requisitos já definidos neste AGENTS.md.
- Reutilizar helpers e padrões existentes antes de criar novas abstrações.
- Evitar refatorações fora do escopo.
- Não executar npm install se dependências não mudaram.

## Testes durante implementação
Executar primeiro somente testes relacionados à alteração.

Para Rules:
npm run test:rules

Para negócio/transações:
npm run test:business

Rodar test:all somente quando a implementação estiver pronta.

## Validação final
Antes de considerar uma fase pronta:

npm run lint
npm run build:hml
npm run build:prod
npm run test:all
git diff --check

Confirmar:
- HML usa santa-fe-v2-hml
- PROD usa santa-fe-v2-prod

## Git
Uma branch por fase/hotfix.

Durante implementação:
- não commit;
- não push;
- não merge;
- não tag;
- não deploy.

Somente executar fechamento Git quando solicitado explicitamente.

## Deploy
Sempre homologar HML antes de PROD.

PROD somente após aprovação humana explícita.

Nunca considerar deploy concluído sem:
Deploy complete!

## Resposta do Codex
Responder de forma curta.

Informar somente:
- arquivos criados/alterados;
- comportamento implementado;
- decisões relevantes;
- testes executados e total;
- lint/build/diff;
- git status;
- bloqueios ou riscos, se houver.

Não incluir logs completos.
