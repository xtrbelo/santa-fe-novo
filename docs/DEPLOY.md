# Plano de deploy seguro

Nenhum comando desta página deve ser executado sem autorização explícita. As rules atualmente em produção podem ainda ser amplas.

## Etapa 1 — validação local

Requer Node.js, Java 21 ou superior e dependências instaladas.

```sh
npm run lint
npm run build
npm run test:rules
```

Os três comandos devem terminar com sucesso. `test:rules` inicia apenas o Firestore Emulator em `127.0.0.1:8080` usando o projeto fictício `santa-fe-rules-test`.

## Etapa 2 — primeiro administrador

Execute o frontend local ligado ao projeto correto e conclua integralmente `docs/FIRST_ADMIN.md`. Confirme o acesso ao módulo Usuários antes de mudar as rules.

## Etapa 3 — backup

Antes da primeira restrição forte, faça uma exportação gerenciada do Firestore para um bucket protegido do mesmo projeto. Isso pode ser feito no Console em **Firestore > Import/Export** ou, após preparar bucket, permissões e faturamento, com:

```sh
gcloud firestore export gs://BUCKET_DE_BACKUP/santa-fe-AAAA-MM-DD
```

Registre o local, horário e responsável. Não armazene a exportação no Git.

## Etapas 4 e 5 — janela coordenada

1. Publique o Hosting atualizado.
2. Imediatamente publique as novas Firestore Rules.

Essa ordem é mais segura para a compatibilidade porque o frontend antigo pode ainda depender do comportamento anterior, enquanto o frontend novo já entende perfis pendentes e inativos. Existe uma janela curta em que o frontend novo opera com rules antigas amplas; por isso as duas publicações devem ser consecutivas, monitoradas e sem intervalo operacional. Publicar rules primeiro pode bloquear usuários do frontend antigo antes que a interface compatível esteja disponível.

Com autorização futura, os comandos serão:

```sh
firebase deploy --only hosting
firebase deploy --only firestore:rules
```

## Etapas 6 e 7 — smoke test

1. Entre em produção como admin e valide Painel, Pessoas, Agendas, Fluxo, Configurações e Usuários.
2. Use uma segunda conta Google de teste.
3. Confirme o ciclo `pendente -> atendimento -> gestor -> desativado`, incluindo bloqueio em tempo real.
4. Verifique eventos em `auditoria` e ausência de erros de permissão inesperados.

## Plano de retorno

Commits de referência:

- `1b33b40`: Fase 1.
- `c9250e7`: Fase 2, frontend anterior à suíte de testes e ao plano de deploy.

Para reconstruir temporariamente o frontend da Fase 2, use uma árvore/checkout separado em `c9250e7`, execute `npm install` e `npm run build`, e publique **somente Hosting** após autorização. Não publique as rules desse checkout automaticamente.

O rollback das rules deve ser tratado separadamente e revisado linha a linha. Nunca restaure regras antigas amplas apenas para recuperar acesso: isso pode reabrir escrita indevida em todas as coleções. Se as novas rules bloquearem o sistema, prefira corrigir a regra específica, validar no Emulator e publicar a correção mínima.
