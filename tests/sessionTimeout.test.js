import test from 'node:test';
import assert from 'node:assert/strict';
import { getLastActivityKey, getRemainingMs, getSessionState, parseActivityTimestamp, SESSION_STATES, SESSION_TIMEOUT_MS, SESSION_WARNING_MS } from '../src/utils/sessionTimeout.js';

const NOW = 2_000_000_000_000;

test('mantém ACTIVE antes da janela de aviso', () => {
  assert.equal(getSessionState({ lastActivity: NOW - (SESSION_TIMEOUT_MS - SESSION_WARNING_MS - 1), now: NOW }), SESSION_STATES.ACTIVE);
});
test('entra em WARNING exatamente no início da janela de aviso', () => {
  assert.equal(getSessionState({ lastActivity: NOW - (SESSION_TIMEOUT_MS - SESSION_WARNING_MS), now: NOW }), SESSION_STATES.WARNING);
});
test('fica EXPIRED em 30 minutos e acima de 30 minutos', () => {
  assert.equal(getSessionState({ lastActivity: NOW - SESSION_TIMEOUT_MS, now: NOW }), SESSION_STATES.EXPIRED);
  assert.equal(getSessionState({ lastActivity: NOW - SESSION_TIMEOUT_MS - 1, now: NOW }), SESSION_STATES.EXPIRED);
});
test('calcula corretamente o tempo restante', () => {
  assert.equal(getRemainingMs({ lastActivity: NOW - 123_000, now: NOW }), SESSION_TIMEOUT_MS - 123_000);
});
test('gera chave de atividade separada por UID', () => {
  assert.equal(getLastActivityKey('usuario-a'), 'santa-fe:last-activity:usuario-a');
  assert.notEqual(getLastActivityKey('usuario-a'), getLastActivityKey('usuario-b'));
});
test('converte somente timestamps numéricos válidos', () => {
  assert.equal(parseActivityTimestamp(null), null);
  assert.equal(parseActivityTimestamp(undefined), null);
  assert.equal(parseActivityTimestamp(''), null);
  assert.equal(parseActivityTimestamp('   '), null);
  assert.equal(parseActivityTimestamp('123456'), 123456);
  assert.equal(parseActivityTimestamp(123456), 123456);
  assert.equal(parseActivityTimestamp('inválido'), null);
  assert.equal(parseActivityTimestamp(Number.NaN), null);
  assert.equal(parseActivityTimestamp(Number.POSITIVE_INFINITY), null);
  assert.equal(parseActivityTimestamp(-1), null);
  assert.equal(parseActivityTimestamp(0), 0);
  assert.equal(parseActivityTimestamp('0'), 0);
});
test('ausência de timestamp é tratada como sessão nova sem expiração imediata', () => {
  assert.equal(getSessionState({ lastActivity: null, now: NOW }), SESSION_STATES.ACTIVE);
  assert.equal(getRemainingMs({ lastActivity: null, now: NOW }), SESSION_TIMEOUT_MS);
});
test('trata timestamp inválido com segurança como uma sessão nova', () => {
  assert.equal(getSessionState({ lastActivity: 'inválido', now: NOW }), SESSION_STATES.ACTIVE);
  assert.equal(getRemainingMs({ lastActivity: 'inválido', now: NOW }), SESSION_TIMEOUT_MS);
});
test('nova atividade reinicia o cálculo da sessão', () => {
  const oldActivity = NOW - (SESSION_TIMEOUT_MS - SESSION_WARNING_MS);
  assert.equal(getSessionState({ lastActivity: oldActivity, now: NOW }), SESSION_STATES.WARNING);
  assert.equal(getSessionState({ lastActivity: NOW, now: NOW }), SESSION_STATES.ACTIVE);
  assert.equal(getRemainingMs({ lastActivity: NOW, now: NOW }), SESSION_TIMEOUT_MS);
});
