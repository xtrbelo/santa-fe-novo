import React, { useState } from 'react';
import { auth, findAndClaimAuthorizedAccess, isSignInWithEmailLink, signInWithEmailLink, signOut, updatePassword } from '../../services/firebase';
import { getAuthErrorMessage, normalizeAuthEmail } from '../../utils/auth';
import { validateAccessActivationPassword } from '../../utils/accessActivation';
import { Button } from '../../components/ui/Button';

const fieldClass = 'mt-1 w-full rounded-xl border border-gray-200 px-4 py-3 outline-none focus:border-indigo-500';
const genericError = 'Não foi possível ativar o acesso. Solicite um novo link a um administrador.';

export function AtivacaoAcessoPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const validLink = !!auth && isSignInWithEmailLink(auth, window.location.href);

  const submit = async event => {
    event.preventDefault();
    const passwordError = validateAccessActivationPassword(password, confirmation);
    if (passwordError === 'SENHA_FRACA') { setError('Use uma senha com pelo menos 8 caracteres.'); return; }
    if (passwordError === 'SENHAS_DIVERGENTES') { setError('As senhas informadas não coincidem.'); return; }
    if (!validLink) { setError(genericError); return; }
    setSubmitting(true); setError('');
    try {
      const credential = await signInWithEmailLink(auth, normalizeAuthEmail(email), window.location.href);
      await credential.user.getIdToken(true);
      const claimed = await findAndClaimAuthorizedAccess({
        uid: credential.user.uid,
        email: credential.user.email,
        emailVerified: credential.user.emailVerified,
      });
      if (!claimed) throw new Error('ATIVACAO_ACESSO_INVALIDA');
      await updatePassword(credential.user, password);
      window.location.replace('/');
    } catch (activationError) {
      console.error(activationError?.code || activationError?.message || 'ATIVACAO_ACESSO_INVALIDA');
      if (auth?.currentUser) await signOut(auth).catch(() => {});
      setError(activationError?.code === 'auth/weak-password' ? getAuthErrorMessage(activationError) : genericError);
    } finally { setSubmitting(false); }
  };

  return <main className="min-h-screen bg-indigo-50/50 px-4 py-10 sm:py-16"><form onSubmit={submit} className="mx-auto max-w-md space-y-5 rounded-3xl bg-white p-6 shadow-xl shadow-indigo-900/5 sm:p-8"><header><p className="text-xs font-black uppercase tracking-widest text-indigo-600">Casa Santa Fé</p><h1 className="mt-1 text-2xl font-black text-gray-900">Ativar acesso</h1><p className="mt-2 text-sm text-gray-500">Confirme o e-mail que recebeu este link e crie sua senha pessoal.</p></header>{!validLink && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-700">{genericError}</p>}<label className="block text-xs font-bold text-gray-600">E-mail<input className={fieldClass} type="email" value={email} onChange={event => setEmail(event.target.value)} autoComplete="email" required /></label><label className="block text-xs font-bold text-gray-600">Nova senha<input className={fieldClass} type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="new-password" minLength={8} required /></label><label className="block text-xs font-bold text-gray-600">Confirmar senha<input className={fieldClass} type="password" value={confirmation} onChange={event => setConfirmation(event.target.value)} autoComplete="new-password" minLength={8} required /></label>{error && validLink && <p role="alert" className="text-sm font-bold text-rose-600">{error}</p>}<Button type="submit" disabled={submitting || !validLink} className="w-full">{submitting ? 'Ativando...' : 'Ativar meu acesso'}</Button></form></main>;
}
