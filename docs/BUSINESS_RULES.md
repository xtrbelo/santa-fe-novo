# Regras de negócio

- CPF é opcional; informado, deve ser válido e único.
- Pessoas e configurações são desativadas, não excluídas.
- Uma pessoa não pode ter dois agendamentos ativos na mesma agenda. A exclusividade é garantida transacionalmente por `agendamentos_ativos`; cancelar libera essa trava sem apagar o atendimento histórico.
- Pessoa usa `vinculo` (`consulente` ou `membro`) e `funcoesCasa`. Membros podem exercer várias funções e também receber atendimento.
- Os adaptadores centrais interpretam `tipoPessoa`, `tiposPessoaPermitidos` e `requerVagas` legados; lista de públicos permitidos vazia significa sem restrição.
- Serviços novos pertencem a um ou mais tipos de trabalho por `tipoTrabalhoIds`. O controle de vagas é definido por `controlaVagas` e o limite pertence à combinação agenda + serviço.
- Serviços com controle de vagas reservam vaga atomicamente. Para legados, usa-se o maior valor entre contador salvo e ocupação real observada.
- `prioridade` e `sortQueue` são preservados.
- Alterações relevantes registram UID e Timestamp.
- Apenas administradores gerenciam usuários; não podem desativar nem rebaixar a própria conta pela interface.
- Usuários pendentes ou inativos não acessam coleções operacionais. Alterações de perfil/status entram em vigor pelo snapshot em tempo real.

## Ciclo operacional

- Transições aceitas: `Agendado → Presente → Concluído` e `Agendado → Faltou`. Estados finais não voltam para estados anteriores.
- `Agendado` e `Presente` podem ser cancelados; o registro passa a `Cancelado`, recebe executor/data e devolve as vagas numa transação. Não há exclusão física.
- Um novo agendamento após cancelamento recebe outro ID. O documento cancelado permanece intacto no histórico e a nova reserva cria uma nova trava ativa.
- Admin e gestor podem realocar atendimentos ainda `Agendado`, inclusive quando a agenda de origem ou um serviço nela foi cancelado. A operação exige motivo, destino futuro e disponível e no máximo três serviços por transação.
- Na realocação completa a origem passa a `Reagendado`; na parcial permanece `Agendado`. `servicosIds` e `servicosNomes` originais nunca são removidos: `servicosRealocados` identifica o que deixou de ser operacional.
- Cada realocação cria novo atendimento e lock no destino, ajusta vagas atomicamente e usa um `realocacaoId` comum na origem, destino e auditoria. Não há mesclagem com atendimento já existente no destino.
- `Faltou` preserva a vaga utilizada no histórico da agenda; somente o cancelamento explícito devolve a reserva. Registros `Cancelado` não entram na reconciliação da ocupação real.
- A prioridade pode ser alterada apenas em atendimentos abertos e coloca presentes prioritários primeiro na fila.
- Horários de chegada e saída são gravados uma única vez.
- Uma agenda só pode ser cancelada enquanto não houver atendimento `Presente` ou `Concluído`; `Agendado`, `Faltou` e `Cancelado` não bloqueiam o cancelamento.
- A correção administrativa de status é exclusiva do administrador e aceita somente `Concluído → Presente/Agendado`, `Presente → Agendado` e `Faltou → Agendado`, sempre com motivo e auditoria. Ela limpa horários incompatíveis e não altera vagas.
- Uma agenda `Concluída` ou `Cancelada` fica somente para consulta: novos agendamentos e alterações operacionais são bloqueados.
- Editar uma agenda permite data, horário, público, serviços e limites. O tipo de trabalho só muda sem histórico; um serviço com atendimentos ativos não pode ser removido; o limite não pode ficar abaixo da ocupação.
- Cancelar um serviço impede novas reservas, preserva os atendimentos vinculados e informa a quantidade afetada. Excluir fisicamente uma agenda exige perfil administrador e ausência total de histórico.
- Reagendamento entre agendas permanece pendente até existir uma operação atômica que preserve vagas e evite duplicidade nos dois lados.

## Validação transacional

- Público, disponibilidade e status do serviço na agenda são validados também pelo serviço transacional, não somente pela interface.
- Reserva, limite de vagas, duplicidade, cancelamento, reagendamento após cancelamento, dupla devolução, bloqueio por atendimento executado, correção administrativa, agenda concluída, prioridade, ordenação da fila, horários, compatibilidade legada e concorrência da última vaga são exercitados contra o Firebase Emulator por `npm run test:business`.
- A suíte usa o projeto fictício `santa-fe-business-test` e chama as mesmas funções utilizadas pelo frontend por meio de injeção opcional do Firestore.
