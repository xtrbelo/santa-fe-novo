# Banco de dados

Raiz: `artifacts/{appId}/public/data`.

- `usuarios/{uid}`: identidade, perfil, ativo e timestamps.
- `pessoas/{id}`: dados pessoais, ativo e auditoria.
- `cpf_index/{cpf}`: `pessoaId`, `criadoEm`.
- `agendas/{id}`: data, tipo, tipos permitidos, vagas, status e auditoria.
- `consulentes/{agendaId_pessoaId}`: vínculo pessoa/agenda, serviços, status, prioridade e auditoria.
- `config_tipos_pessoa`, `config_eventos`, `config_servicos`: catálogos ativos/auditados.
- `auditoria/{id}`: eventos administrativos imutáveis com tipo, alvo, valores anterior/novo, executor e data.

Legados sem `ativo` continuam visíveis (`ativo !== false`). A consulta de inscritos usa `agendaId ==`; não exige índice composto.

O histórico de uma pessoa consulta `consulentes` por `pessoaBaseId ==` e resolve a agenda associada sem copiar novos dados pessoais. Cancelamentos usam `status`, `canceladoEm`, `canceladoPor` e, opcionalmente, `motivoCancelamento`. Agendas concluídas usam `status`, `concluidaEm` e `concluidaPor`. Os eventos operacionais imutáveis são `AGENDAMENTO_CANCELADO`, `PRIORIDADE_ALTERADA` e `AGENDA_CONCLUIDA`.
