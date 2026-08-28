# Banco de dados

Raiz: `artifacts/{appId}/public/data`.

- `usuarios/{uid}`: identidade, perfil, ativo e timestamps.
- `pessoas/{id}`: dados pessoais, `vinculo`, `funcoesCasa`, ativo e auditoria. `tipoPessoa` permanece como snapshot compatível.
- `cpf_index/{cpf}`: `pessoaId`, `criadoEm`.
- `agendas/{id}`: data/horário, tipo de trabalho, público, serviços disponíveis, vagas por serviço, status e auditoria. Novos campos: `tipoTrabalhoId`, `tipoTrabalhoNome`, `publicosPermitidos`, `servicosIds`, `servicosNomes`, `servicosStatus`, `vagasTotais` e `vagasOcupadas`; `tipo` permanece como snapshot.
- `consulentes/{agendaId_pessoaId}`: vínculo pessoa/agenda, serviços, status, prioridade e auditoria.
- `config_funcoes_membro`: funções configuráveis dos membros (inicialmente `medium` e `cambone`).
- `config_eventos`: catálogo mantido por compatibilidade, tratado como Tipos de Trabalho e acrescido de `publicosPermitidos`.
- `config_servicos`: catálogo de serviços com `tipoTrabalhoIds` e `controlaVagas`; `requerVagas` permanece compatível.
- `config_tipos_pessoa`: catálogo legado mantido durante a transição.
- `auditoria/{id}`: eventos administrativos imutáveis com tipo, alvo, valores anterior/novo, executor e data.

Legados sem `ativo` continuam visíveis (`ativo !== false`). A consulta de inscritos usa `agendaId ==`; não exige índice composto.

O histórico de uma pessoa consulta `consulentes` por `pessoaBaseId ==` e resolve a agenda associada sem copiar novos dados pessoais. Cancelamentos usam `status`, timestamps e executor. Cancelamentos de serviço ficam em `servicosCancelamentos.{servicoId}`, permitindo na Fase 6B mover apenas parte dos serviços de um atendimento. Os eventos operacionais incluem `AGENDAMENTO_CANCELADO`, `PRIORIDADE_ALTERADA`, `AGENDA_CONCLUIDA`, `AGENDA_EDITADA`, `AGENDA_CANCELADA`, `AGENDA_EXCLUIDA` e `SERVICO_AGENDA_CANCELADO`.
