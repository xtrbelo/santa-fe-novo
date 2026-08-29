# Desenvolvimento local seguro

Testes destrutivos da Fase 6 devem ser feitos exclusivamente no Firestore Emulator. Nunca habilite o modo abaixo para validar contra dados remotos.

## Configuração

Crie um `.env.local` (ignorado pelo Git) com a configuração Firebase usada pelo projeto e:

```env
VITE_USE_FIREBASE_EMULATORS=true
```

Essa opção conecta Firestore em `127.0.0.1:8080` e Authentication em `127.0.0.1:9099` somente quando o Vite está em desenvolvimento **e** a variável é exatamente `true`. Em build de produção os emuladores nunca são ativados. A opção legada `VITE_USE_FIRESTORE_EMULATOR=true` continua aceita, mas conecta somente o Firestore e deve ser evitada para testes de autenticação.

## Execução em três terminais (PowerShell)

Terminal 1 — iniciar Authentication e Firestore locais:

```powershell
npm run emulator
```

Terminal 2 — usar somente um UID fictício criado no Auth Emulator e criar dados fictícios:

```powershell
$env:FIRESTORE_EMULATOR_HOST='127.0.0.1:8080'
$env:EMULATOR_ADMIN_UID='<UID_DO_USUARIO_LOGADO>'
npm run seed:emulator
npm run validate:emulator
```

O UID não é salvo no repositório. O seed se recusa a executar sem `FIRESTORE_EMULATOR_HOST` e nunca possui fallback para produção. Senhas pertencem exclusivamente ao Firebase Authentication e não são gravadas no Firestore, seed, logs ou auditoria.

Terminal 3 — iniciar a aplicação:

```powershell
npm run dev
```

O seed cria somente dados fictícios no Firestore, incluindo as agendas A vazia para exclusão, B com histórico para testar o bloqueio, C aberta para cancelamento e D para validar as permissões do gestor. `validate:emulator` exercita essas operações automaticamente; para validação visual, execute novamente o seed antes de abrir o Vite. Contas de teste devem ser criadas pela aplicação no Auth Emulator, nunca no Firebase Auth de produção.

Antes de qualquer teste destrutivo, confira que o Vite foi iniciado com `VITE_USE_FIREBASE_EMULATORS=true` e mantenha o Terminal 1 aberto. Nunca use essas agendas ou identidades de teste com o modo remoto.
