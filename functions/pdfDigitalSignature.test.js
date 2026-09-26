import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { hasEmbeddedPdfDigitalSignature } from './pdfDigitalSignature.js';

test('detecta estrutura de assinatura digital incorporada sem alegar validar o certificado', () => {
  const signed = Buffer.from('%PDF-1.7\n1 0 obj << /Type /Sig /SubFilter /adbe.pkcs7.detached /ByteRange [0 10 20 30] /Contents <ABCD> >>');
  assert.equal(hasEmbeddedPdfDigitalSignature(signed), true);
  assert.equal(hasEmbeddedPdfDigitalSignature(Buffer.from('%PDF-1.7\n1 0 obj << /Type /Page >>')), false);
  assert.equal(hasEmbeddedPdfDigitalSignature(Buffer.from('arquivo qualquer')), false);
});
