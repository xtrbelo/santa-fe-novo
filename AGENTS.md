# Santa Fé V2 — Instruções para Codex

## Stack
React 19 + Vite + Firebase Auth + Firestore.

## Ambientes
- HML: `santa-fe-v2-hml`
- PROD: `santa-fe-v2-prod`
- LEGACY: `santa-fe-v2`

Nunca usar LEGACY para novos deploys.

---

## Contexto e economia de uso

- `main` = baseline válida das fases concluídas.
- Não reanalisar fases anteriores sem regressão evidente.
- Não analisar o repositório inteiro sem necessidade.
- Ler primeiro somente os arquivos citados no prompt.
- Expandir a leitura apenas para dependências diretas e realmente necessárias.
- Quando o arquivo ou componente envolvido já for conhecido, não fazer busca ampla no repositório.
- Não repetir arquitetura, regras ou requisitos já documentados neste `AGENTS.md`.
- Não reproduzir arquivos completos na resposta.
- Não reproduzir logs extensos.
- Não explicar cada comando executado.
- Reutilizar helpers, componentes e padrões existentes antes de criar novas abstrações.
- Evitar refatorações fora do escopo solicitado.
- Priorizar alterações mínimas e localizadas.
- Não executar `npm install` se as dependências não mudaram.
- Não fazer melhorias adicionais não solicitadas.

---

## Estado consolidado

- Fases 9A–10B concluídas em PROD.
- Fase 10A:
  - commit `8515916d953d91a99177c001754d2e0787f50559`
  - tag `production-phase10a`
- Hotfix de identidade visual:
  - merge na `main`: `3599517`
  - logo oficial: `public/logo_santa_fe.png`
- Fase 10B:
  - commit `1f851309f7f1ef11228acb88797a4c11041d7a45`
  - tag `production-phase10b`
  - testes finais: 309/309

### Regras de negócio consolidadas

- Autocadastro de Membro possui Dados da Casa.
- `dataIngresso` é opcional.
- `batizadoCaesf` exige Sim/Não.
- `dataBatismoCaesf` é obrigatória somente quando `batizadoCaesf = Sim`.
- Funções da Casa espelham `config_funcoes_membro`.
- Considerar função válida quando `ativo !== false`.
- Funções permitem múltipla seleção.
- “Sem função” é uma função configurável normal.
- Autocadastros legados permanecem compatíveis.
- Aprovação de autocadastro não cria Usuário do Sistema automaticamente.
- Versão possui fonte central:
  - PROD exibe `Versão 10B`
  - HML exibe `Versão 10B • HML`
- Programação = disponibilidade da Casa.
- Agendamentos = marcação de Pessoa.
- Fluxo do Dia = execução.
- Novo agendamento:
  - Serviço
  - Pessoa
  - Data disponível
  - Confirmar
- Programação suporta:
  - datas específicas em lote;
  - recorrência semanal.
- Cada data permanece como documento independente na collection `agendas`.
- Controle transacional de vagas deve ser preservado.
- Modelo principal:
  - Pessoa → Membro → Usuário do Sistema opcional
- Firebase Auth não equivale a autorização de acesso.
- HML: `santa-fe-v2-hml`
- PROD: `santa-fe-v2-prod`
- LEGACY: `santa-fe-v2`, Hosting desativado.

---

## Modelo de domínio

PESSOA → MEMBRO → USUÁRIO DO SISTEMA (opcional)

- Firebase Auth != autorização de acesso.
- Membro pode existir sem usuário do sistema.
- Consulente é fluxo distinto.
- Não criar senha para membro pelo administrador.
- Uma Pessoa deve possuir no máximo um usuário do sistema.
- Preservar histórico institucional.
- Preferir status/inativação a exclusão definitiva.

---

## Firestore

Raiz:

`artifacts/{projectId}/public/data/{collection}`

- Não alterar a estrutura raiz sem solicitação explícita.
- Não enfraquecer regras existentes para facilitar implementação.
- Preservar compatibilidade com dados existentes sempre que possível.

---

## Segurança

Nunca imprimir, expor ou versionar:

- API keys;
- tokens;
- credenciais;
- secrets;
- `.env.hml`;
- `.env.production`.

Não alterar:

- `.firebaserc`;
- arquivos `.env`;
- configuração de projeto Firebase;

salvo solicitação explícita.

Nunca colocar credenciais diretamente no frontend.

---

## Forma de trabalhar

Para cada tarefa:

1. Ler somente o necessário.
2. Identificar a causa ou ponto exato da alteração.
3. Fazer a menor alteração possível.
4. Preservar funcionalidades não relacionadas.
5. Executar apenas validações focadas durante a implementação.
6. Informar de forma curta o resultado.

Não fazer:

- revisão geral do projeto;
- refatoração preventiva;
- reorganização de arquivos;
- troca de arquitetura;
- criação de abstrações desnecessárias;
- alterações visuais não solicitadas;
- melhorias extras fora do escopo.

---

## Testes durante implementação

Executar primeiro somente testes relacionados à alteração.

### Firestore Rules

`npm run test:rules`

### Negócio / transações

`npm run test:business`

Durante tarefas intermediárias:

- não executar `test:all` automaticamente;
- não executar todos os builds automaticamente;
- não executar lint geral sem necessidade;
- usar a validação mínima suficiente para a alteração atual.

---

## Regra de checkpoint final

Não tratar toda tarefa concluída como checkpoint final.

Não executar automaticamente após cada solicitação:

- `npm run test:all`
- `npm run lint`
- `npm run build:hml`
- `npm run build:prod`
- `git diff --check`

Executar validação completa somente quando:

- o usuário disser `finalizar fase`;
- o usuário disser `checkpoint final`;
- o usuário pedir `validar tudo`;
- houver preparação para deploy;
- ou existir necessidade técnica clara que justifique a validação completa.

Em tarefas intermediárias, usar apenas testes e verificações focadas.

---

## Validação final

Quando houver checkpoint final, executar:

`npm run lint`

`npm run build:hml`

`npm run build:prod`

`npm run test:all`

`git diff --check`

Confirmar:

- HML usa `santa-fe-v2-hml`
- PROD usa `santa-fe-v2-prod`

Build HML e PROD utilizam o mesmo `dist`.

Após validação sequencial:

- nunca fazer deploy direto do `dist` anterior;
- antes do deploy, gerar novamente o build do ambiente alvo.

---

## Git

Uma branch por fase ou hotfix.

Durante implementação:

- não commit;
- não push;
- não merge;
- não tag;
- não deploy.

Executar fechamento Git somente quando solicitado explicitamente.

Antes de qualquer ação Git destrutiva ou irreversível, confirmar o escopo.

---

## Deploy

Sempre homologar em HML antes de PROD.

Fluxo obrigatório:

HML → validação humana → PROD

PROD somente após aprovação humana explícita.

Não executar deploy por conta própria durante implementação.

Nunca considerar deploy concluído sem a mensagem:

`Deploy complete!`

Antes de qualquer deploy:

- confirmar o ambiente alvo;
- gerar novamente o build do ambiente alvo;
- verificar que não está usando LEGACY.

---

## Resposta do Codex

Responder em português do Brasil e de forma curta.

Informar somente:

- arquivos criados ou alterados;
- comportamento implementado;
- decisões relevantes;
- testes executados e total;
- lint/build/diff, somente se executados;
- `git status`;
- bloqueios ou riscos, se houver.

Não incluir:

- arquivos completos;
- logs completos;
- explicações longas de comandos;
- repetição das regras deste `AGENTS.md`.

Considerar que o responsável pelo projeto não é desenvolvedor profissional. Quando uma ação manual for necessária, explicar de forma simples e objetiva.
### Regra para tarefas sem alteração de código

Se, após a análise, nenhuma alteração de código for necessária:

- não executar lint;
- não executar build;
- não executar suites de testes;
- não executar validação geral apenas para reconfirmar estado já validado;
- não repetir testes que já passaram anteriormente no mesmo estado do código.

Somente executar algum teste nesse caso se:
- o usuário solicitar explicitamente;
- houver evidência concreta de regressão;
- ou for indispensável para responder à tarefa.

Se não houve alteração, informar apenas que o estado atual já contém a correção e encerrar a tarefa.
### Evitar validação redundante

Antes de executar lint, build ou testes, verificar se houve alteração de arquivo nesta tarefa.

Se não houve alteração desde a última validação bem-sucedida, não repetir a validação.

Não usar lint, build ou testes apenas como confirmação automática de conclusão.