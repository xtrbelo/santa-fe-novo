# Primeiro administrador

Este procedimento é executado uma única vez e não deve incluir UID ou e-mail real no repositório.

## Pré-requisitos

1. No Firebase Console, abra **Authentication > Sign-in method**.
2. Habilite **Google**.
3. Desabilite **Anonymous**.
4. Confirme que o frontend local aponta para o projeto Firebase correto.

## Bootstrap

1. Execute `npm run dev`.
2. Acesse o endereço local e entre com a conta Google que será administradora.
3. A aplicação cria `artifacts/{appId}/public/data/usuarios/{uid}` com `role: "pendente"` e `ativo: true`.
4. Copie o UID exibido na tela “Acesso aguardando liberação”.
5. No Firestore Console, localize exatamente esse documento.
6. Altere somente `role` para `admin` e confirme `ativo: true`.
7. Volte ao sistema. O snapshot deve liberar a sessão automaticamente; se necessário, use **Verificar liberação** ou recarregue.
8. Confirme que o menu **Usuários** está disponível e que a conta mostra **Sua conta** com os controles bloqueados.

Depois desse bootstrap, usuários futuros devem ser liberados pelo módulo Usuários. Não publique as novas rules antes de existir e ter sido conferido pelo menos um administrador ativo.
