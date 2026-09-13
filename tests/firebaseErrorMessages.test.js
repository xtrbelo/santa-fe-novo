import test from 'node:test';
import assert from 'node:assert/strict';
import { getFriendlyErrorMessage } from '../src/utils/firebaseErrorMessages.js';

test('traduz erros técnicos de permissão, sessão e conexão', () => {
  assert.match(getFriendlyErrorMessage({ code: 'functions/permission-denied' }, { fallback: 'Falha.' }), /não possui permissão/);
  assert.match(getFriendlyErrorMessage({ code: 'functions/unauthenticated' }, { fallback: 'Falha.' }), /sessão não está válida/);
  assert.match(getFriendlyErrorMessage({ code: 'firestore/unavailable' }, { fallback: 'Falha.' }), /Verifique sua internet/);
});

test('prioriza validação de negócio e preserva fallback seguro', () => {
  const options = { fallback: 'Operação não concluída.', businessMessages: { MEMBRO_INATIVO: 'O Membro está inativo.' } };
  assert.equal(getFriendlyErrorMessage({ message: 'FirebaseError: MEMBRO_INATIVO' }, options), 'O Membro está inativo.');
  assert.equal(getFriendlyErrorMessage({ message: 'detalhe técnico' }, options), 'Operação não concluída.');
});
