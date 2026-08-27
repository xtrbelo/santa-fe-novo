# Regras de negócio

- CPF é opcional; informado, deve ser válido e único.
- Pessoas e configurações são desativadas, não excluídas.
- Uma pessoa não pode ter dois agendamentos ativos na mesma agenda.
- Lista de tipos permitidos vazia significa sem restrição.
- Serviços com `requerVagas` reservam vaga atomicamente. Para legados, usa-se o maior valor entre contador salvo e ocupação real observada.
- `prioridade` e `sortQueue` são preservados.
- Alterações relevantes registram UID e Timestamp.
- Apenas administradores gerenciam usuários; não podem desativar nem rebaixar a própria conta pela interface.
- Usuários pendentes ou inativos não acessam coleções operacionais. Alterações de perfil/status entram em vigor pelo snapshot em tempo real.
