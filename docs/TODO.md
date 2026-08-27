# Pendências futuras

- Backup pré-deploy do Firestore pendente por decisão do responsável pelo projeto; criar bucket privado compatível e executar exportação em etapa futura autorizada.

- Migrar CPFs antigos para `cpf_index`.
- Reconciliar definitivamente `vagasOcupadas` e retirar a compatibilidade legada.
- Histórico de registros desativados.
- Reagendamento atômico entre agendas (cancelar origem e reservar destino numa única operação confiável).
- Métricas agregadas no painel sem leituras excessivas (avaliar contadores ou backend).
- Avaliar Cloud Functions/Admin SDK para impedir também a remoção do último administrador entre contas distintas.
- Avaliar code splitting por rota/módulo. O bundle principal concentra React, Firebase SDK, lucide-react e todos os módulos, ultrapassando 500 kB sem afetar o funcionamento.
- Acompanhar avisos de segurança transitivos do `firebase-tools` (dependência somente de desenvolvimento) e atualizar quando houver versão corrigida compatível.
