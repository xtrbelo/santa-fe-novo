# Sistema Santa Fé

Aplicação interna para cadastro de pessoas, criação de agendas e controle do fluxo diário de atendimentos. O frontend usa React, Vite, Tailwind CSS e Firebase Authentication/Firestore.

## Desenvolvimento

1. Copie `.env.example` para `.env.local` e configure o projeto Firebase.
2. Ative o provedor Google no Firebase Authentication.
3. Execute `npm install` e `npm run dev`.

Validações: `npm run lint` e `npm run build`.

## Segurança

O acesso exige conta Google e perfil ativo em `artifacts/{appId}/public/data/usuarios/{uid}`. Novos usuários recebem `role: "pendente"`. Consulte `docs/SECURITY.md` antes de publicar as regras e prepare o primeiro administrador.

Depois que o primeiro administrador é configurado manualmente, o módulo **Usuários** permite liberar, promover, ativar e desativar outras contas sem usar o Firebase Console.
