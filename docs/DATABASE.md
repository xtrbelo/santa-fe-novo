# Banco de dados

Raiz: `artifacts/{appId}/public/data`.

- `usuarios/{uid}`: identidade, perfil, ativo e timestamps.
- `pessoas/{id}`: dados pessoais, ativo e auditoria.
- `cpf_index/{cpf}`: `pessoaId`, `criadoEm`.
- `agendas/{id}`: data, tipo, tipos permitidos, vagas, status e auditoria.
- `consulentes/{agendaId_pessoaId}`: vínculo pessoa/agenda, serviços, status, prioridade e auditoria.
- `config_tipos_pessoa`, `config_eventos`, `config_servicos`: catálogos ativos/auditados.

Legados sem `ativo` continuam visíveis (`ativo !== false`). A consulta de inscritos usa `agendaId ==`; não exige índice composto.
