import { Buffer } from 'node:buffer';

const SIGNATURE_MARKERS = ['/ByteRange', '/Contents', '/SubFilter'];

export const hasEmbeddedPdfDigitalSignature = pdf => {
  if (!Buffer.isBuffer(pdf) || pdf.length < 5 || pdf.subarray(0, 5).toString() !== '%PDF-') return false;
  const content = pdf.toString('latin1');
  return SIGNATURE_MARKERS.every(marker => content.includes(marker)) && /\/Type\s*\/Sig\b|\/FT\s*\/Sig\b/.test(content);
};
