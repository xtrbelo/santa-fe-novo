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
Também proíbem exclusão física de agendamentos e qualquer escrita operacional vinculada a uma agenda concluída. Cancelamentos, prioridade e conclusão geram auditoria imutável em nome do usuário autenticado.

## Administração dentro do sistema

O menu Usuários aparece somente para `admin`. O administrador pode alterar outros usuários entre `admin`, `gestor`, `atendimento` e `pendente`, além de ativá-los ou desativá-los. As alterações têm confirmação, `atualizadoEm`, `atualizadoPor` e registro em `auditoria`.

A própria conta do administrador aparece como **Sua conta** e não pode ter perfil ou status alterado pela interface. As rules também recusam atualização do próprio documento, alteração de `uid`, roles desconhecidos e exclusão de usuários.

O perfil logado é acompanhado em tempo real. Promoções liberam a sessão, enquanto uma desativação bloqueia imediatamente os módulos. A tela pendente também oferece **Verificar liberação**.

## Validação automatizada

`npm run test:rules` executa a suíte em `tests/firestore.rules.test.js` contra o Firestore Emulator local. Ela cobre usuários não autenticados, pendentes, inativos, todos os perfis internos, criação do próprio perfil, auditoria, autobloqueio, eventos operacionais, imutabilidade e proteção de agendas concluídas.

Impedir que um administrador rebaixe o último **outro** administrador exige backend confiável (por exemplo, Cloud Functions/Admin SDK) e permanece pendente.
