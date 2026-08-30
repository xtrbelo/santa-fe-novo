import test from 'node:test';
import assert from 'node:assert/strict';
import { MEMBER_INVITE_EXPIRATION_DAYS, MEMBER_INVITE_TOKEN_BYTES, buildMemberInviteUrl, buildMemberInviteWhatsAppMessage, buildMemberInviteWhatsAppUrl, generateMemberInviteToken, getMemberInviteEffectiveStatus, getMemberInviteExpiration, hashMemberInviteToken, isValidMemberInviteToken } from '../src/utils/memberInvite.js';

test('token possui pelo menos 256 bits de entropia', () => {
  assert.equal(MEMBER_INVITE_TOKEN_BYTES, 32);
  assert.equal(generateMemberInviteToken().length, 43);
});
test('token usa somente caracteres URL-safe', () => assert.match(generateMemberInviteToken(), /^[A-Za-z0-9_-]+$/));
test('tokens sucessivos são diferentes', () => assert.notEqual(generateMemberInviteToken(), generateMemberInviteToken()));
test('hash SHA-256 é determinístico', async () => assert.equal(await hashMemberInviteToken('token-teste'), await hashMemberInviteToken('token-teste')));
test('hash não contém o token bruto', async () => {
  const token = generateMemberInviteToken(); const hash = await hashMemberInviteToken(token);
  assert.equal(hash.length, 64); assert.equal(hash.includes(token), false);
});
test('URL individual preserva origem e codifica token', () => assert.equal(buildMemberInviteUrl('abc_-/+', 'http://localhost:5173/'), 'http://localhost:5173/autocadastro?token=abc_-%2F%2B'));
test('compartilhamento por WhatsApp codifica a mensagem completa sem dados pessoais indevidos', () => {
  const invite = { nome: 'Maria da Silva', url: 'https://example.test/autocadastro?token=segredo', cpf: '52998224725', email: 'maria@example.test' };
  const message = buildMemberInviteWhatsAppMessage(invite);
  assert.match(message, /Maria da Silva/);
  assert.match(message, /https:\/\/example\.test\/autocadastro\?token=segredo/);
  assert.equal(message.includes(invite.cpf), false);
  assert.equal(message.includes(invite.email), false);
  assert.equal(buildMemberInviteWhatsAppUrl(invite), `https://wa.me/?text=${encodeURIComponent(message)}`);
});
test('validade padrão é de sete dias', () => {
  const now = new Date('2026-01-01T00:00:00.000Z');
  assert.equal(MEMBER_INVITE_EXPIRATION_DAYS, 7); assert.equal(getMemberInviteExpiration(now).toISOString(), '2026-01-08T00:00:00.000Z');
});
test('status efetivo permanece ativo antes da expiração', () => assert.equal(getMemberInviteEffectiveStatus({ status: 'ativo', expiraEm: new Date('2026-01-08') }, new Date('2026-01-07')), 'ativo'));
test('status efetivo fica expirado no limite da validade', () => assert.equal(getMemberInviteEffectiveStatus({ status: 'ativo', expiraEm: new Date('2026-01-08') }, new Date('2026-01-08')), 'expirado'));
test('status revogado prevalece sobre a validade', () => assert.equal(getMemberInviteEffectiveStatus({ status: 'revogado', expiraEm: new Date('2027-01-01') }, new Date('2026-01-01')), 'revogado'));
test('token ausente ou fora do formato esperado é inválido', () => { assert.equal(isValidMemberInviteToken(null), false); assert.equal(isValidMemberInviteToken('curto'), false); assert.equal(isValidMemberInviteToken(generateMemberInviteToken()), true); });
test('status respondido é reconhecido antes da expiração', () => assert.equal(getMemberInviteEffectiveStatus({ status: 'respondido', expiraEm: new Date('2027-01-01') }, new Date('2026-01-01')), 'respondido'));
