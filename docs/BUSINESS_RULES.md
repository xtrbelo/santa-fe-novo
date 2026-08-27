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

## Ciclo operacional

- Transições aceitas: `Agendado → Presente → Concluído` e `Agendado → Faltou`. Estados finais não voltam para estados anteriores.
- `Agendado` e `Presente` podem ser cancelados; o registro passa a `Cancelado`, recebe executor/data e devolve as vagas numa transação. Não há exclusão física.
- A prioridade pode ser alterada apenas em atendimentos abertos e coloca presentes prioritários primeiro na fila.
- Horários de chegada e saída são gravados uma única vez.
- Uma agenda `Concluída` fica somente para consulta: novos agendamentos, cancelamentos e demais alterações são bloqueados.
- Reagendamento entre agendas permanece pendente até existir uma operação atômica que preserve vagas e evite duplicidade nos dois lados.

## Validação transacional

- A validação de `tiposPessoaPermitidos` pertence também ao serviço transacional, não somente à interface.
- Reserva, limite de vagas, duplicidade, cancelamento, dupla devolução, agenda concluída, prioridade, compatibilidade legada e concorrência da última vaga são exercitados contra o Firebase Emulator por `npm run test:business`.
- A suíte usa o projeto fictício `santa-fe-business-test` e chama as mesmas funções utilizadas pelo frontend por meio de injeção opcional do Firestore.
