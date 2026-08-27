# Segurança e primeiro administrador

- `admin`: acesso total.
- `gestor`: Pessoas, Agendas e Fluxo do Dia.
- `atendimento`: consulta de Pessoas e operação do Fluxo do Dia.
- `pendente`: nenhum módulo interno.

Novas contas Google criam o próprio documento `usuarios/{uid}` como `pendente`, ativo. Somente administrador altera perfis.

## Obrigatório antes do deploy das rules

1. Entre uma vez com a conta do primeiro administrador e copie o UID exibido (ou use Authentication).
2. No Firestore Console, abra `artifacts/{VITE_FIREBASE_PROJECT_ID}/public/data/usuarios/{UID}`.
3. Confirme `uid`, `nome`, `email`, `ativo: true` e altere `role` para `admin`; mantenha timestamps.
4. Só então publique `firestore.rules`. Sem um admin válido, ninguém poderá promover contas.

As regras negam por padrão e proíbem exclusão física de Pessoas e configurações.
