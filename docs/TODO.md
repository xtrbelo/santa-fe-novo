# Pendências futuras

- Backup pré-deploy do Firestore pendente por decisão do responsável pelo projeto; criar bucket privado compatível e executar exportação em etapa futura autorizada.

- Planejar e revisar uma migração opcional dos campos legados somente após backup autorizado; a Fase 6A usa adaptadores em tempo de execução e não altera produção.
- Acompanhar avisos de segurança transitivos do `firebase-tools` (dependência somente de desenvolvimento) e atualizar quando houver versão corrigida compatível.

## Melhorias planejadas após a versão 24C

- 24D: paginação e carregamento progressivo da Auditoria no Firebase.
- 24E: detalhamento individual dos campos alterados e da origem de cada evento.
- 24F: exportação filtrada de Pessoas, Agendamentos, Solicitações e Comunicações.
- 25A: política de retenção e arquivamento do histórico, sem exclusão automática antes de aprovação.
