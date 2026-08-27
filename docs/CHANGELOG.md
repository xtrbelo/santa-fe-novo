# Changelog

## Fase 5B — testes das transações de negócio

- Suíte exclusiva do Firebase Emulator ampliada para quatorze cenários críticos.
- Operações de negócio passaram a aceitar injeção opcional do Firestore, preservando a API usada pelo frontend.
- Corrigida a validação de tipos de pessoa para ocorrer também dentro do serviço transacional.
- Cobertura de limite e concorrência de vagas, duplicidade, cancelamentos, agenda concluída, prioridade, legado e auditoria.
- Cobertura adicional de ordenação da fila, preservação dos horários de chegada/saída e ocupação por status legado.

## Fase 3 — validação de segurança e preparação do deploy

- Firestore Emulator configurado localmente.
- Suíte automatizada de Firestore Rules adicionada.
- Bootstrap do primeiro administrador documentado.
- Ordem de deploy, backup, smoke test e plano de retorno documentados.

## Fase 2 — administração de usuários e permissões

- Módulo administrativo de usuários com busca, filtros, ordenação e contador de pendentes.
- Alteração de perfil e status com confirmação, batch e auditoria.
- Perfil logado reativo, telas separadas para acesso pendente e desativado.
- Proteção contra autobloqueio e identificação do usuário na sidebar.
- Indicador de usuários pendentes no Painel do administrador.
- Rules reforçadas para `usuarios`, `uid` e `auditoria`.

## Fase 1 — segurança e integridade

- Login Google e perfil pendente automático.
- Autorização por perfil e rules com negação padrão.
- CPF válido/único, desativação lógica e auditoria.
- Agendamento transacional com tipo, duplicidade e vagas.
- Consultas de inscritos filtradas por agenda.
- Remoção do `public/index.html` legado.
# Fase 5 — fluxo operacional e histórico

- Cancelamento transacional com devolução de vagas e auditoria.
- Transições controladas e timestamps de chegada/saída preservados.
- Prioridade operacional editável no Fluxo do Dia.
- Histórico de atendimentos por pessoa.
- Resumo por status e conclusão protegida de agendas.
- Firestore Rules e testes ampliados para impedir exclusão física e escrita em agendas concluídas.
- Reagendamento atômico e métricas agregadas documentados como evolução futura.
