import test from 'node:test';
import assert from 'node:assert/strict';
import process from 'node:process';
import { initializeApp, deleteApp } from 'firebase/app';
import { applyActionCode, connectAuthEmulator, createUserWithEmailAndPassword, getAuth, sendEmailVerification, sendPasswordResetEmail, sendSignInLinkToEmail, signInWithEmailAndPassword, signInWithEmailLink, signOut, updatePassword } from 'firebase/auth';
import { connectFirestoreEmulator, doc, getDoc, getFirestore } from 'firebase/firestore';

const projectId = process.env.GCLOUD_PROJECT || 'santa-fe-auth-test';
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9299';
const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8280';

test('conta password nasce não verificada, autentica e conclui verificação no emulator', async () => {
  const app = initializeApp({ apiKey: 'fake-api-key', projectId }, `auth-test-${Date.now()}`);
  const auth = getAuth(app);
  const db = getFirestore(app);
  connectAuthEmulator(auth, `http://${authHost}`, { disableWarnings: true });
  const [firestoreAddress, firestorePort] = firestoreHost.split(':');
  connectFirestoreEmulator(db, firestoreAddress, Number(firestorePort));
  const email = `atendimento.${Date.now()}@santafe.local`;
  const password = 'SenhaLocal123';
  try {
    const created = await createUserWithEmailAndPassword(auth, email, password);
    assert.equal(created.user.emailVerified, false);
    assert.equal((await created.user.getIdTokenResult()).claims.email_verified, false);
    const root = `artifacts/${projectId}/public/data`;
    assert.equal((await getDoc(doc(db, `${root}/usuarios/${created.user.uid}`))).exists(), false);
    await assert.rejects(getDoc(doc(db, `${root}/pessoas/pessoa-operacional`)), error => error.code === 'permission-denied' || error.code === 'firestore/permission-denied');
    await sendEmailVerification(created.user);
    await signOut(auth);
    const signedIn = await signInWithEmailAndPassword(auth, email, password);
    assert.equal(signedIn.user.emailVerified, false);
    await sendPasswordResetEmail(auth, email);

    const response = await fetch(`http://${authHost}/emulator/v1/projects/${projectId}/oobCodes`);
    const { oobCodes } = await response.json();
    const verification = [...oobCodes].reverse().find(code => code.requestType === 'VERIFY_EMAIL' && code.email === email);
    assert.ok(verification?.oobCode);
    await applyActionCode(auth, verification.oobCode);
    await signedIn.user.reload();
    await signedIn.user.getIdToken(true);
    assert.equal(signedIn.user.emailVerified, true);
    assert.equal((await signedIn.user.getIdTokenResult()).claims.email_verified, true);
    assert.ok(oobCodes.some(code => code.requestType === 'PASSWORD_RESET' && code.email === email));
  } finally {
    await deleteApp(app);
  }
});

test('email link autentica o e-mail confirmado e permite criar a própria senha', async () => {
  const app = initializeApp({ apiKey: 'fake-api-key', projectId }, `email-link-test-${Date.now()}`);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${authHost}`, { disableWarnings: true });
  const email = `ativacao.${Date.now()}@santafe.local`;
  const password = 'SenhaAtivacao123';
  try {
    await sendSignInLinkToEmail(auth, email, { url: 'http://localhost/ativar-acesso', handleCodeInApp: true });
    const response = await fetch(`http://${authHost}/emulator/v1/projects/${projectId}/oobCodes`);
    const { oobCodes } = await response.json();
    const activation = [...oobCodes].reverse().find(code => code.requestType === 'EMAIL_SIGNIN' && code.email === email);
    assert.ok(activation?.oobLink);
    const credential = await signInWithEmailLink(auth, email, activation.oobLink);
    assert.equal(credential.user.email, email);
    assert.equal(credential.user.emailVerified, true);
    await updatePassword(credential.user, password);
    await signOut(auth);
    const passwordCredential = await signInWithEmailAndPassword(auth, email, password);
    assert.equal(passwordCredential.user.uid, credential.user.uid);
  } finally {
    await deleteApp(app);
  }
});
