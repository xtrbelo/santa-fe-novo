# Pendências futuras

- Backup pré-deploy do Firestore pendente por decisão do responsável pelo projeto; criar bucket privado compatível e executar exportação em etapa futura autorizada.

- Migrar CPFs antigos para `cpf_index`.
- Reconciliar definitivamente `vagasOcupadas` e retirar a compatibilidade legada.
- Histórico de registros desativados.
- Cancelamento com devolução transacional de vagas.
- Testes automatizados das rules e transações.
- Avaliar Cloud Functions/Admin SDK para impedir também a remoção do último administrador entre contas distintas.
- Avaliar code splitting por rota/módulo. O bundle principal concentra React, Firebase SDK, lucide-react e todos os módulos, ultrapassando 500 kB sem afetar o funcionamento.
- Acompanhar avisos de segurança transitivos do `firebase-tools` (dependência somente de desenvolvimento) e atualizar quando houver versão corrigida compatível.
