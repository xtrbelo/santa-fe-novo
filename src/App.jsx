import React, { useEffect, useRef, useState } from 'react';
import { auth, createUserWithEmailAndPassword, onAuthStateChanged, sendEmailVerification, sendPasswordResetEmail, signInWithEmailAndPassword, signInWithPopup, signOut, updateProfile, GoogleAuthProvider, isFirebaseConfigured, getAppDoc, getDoc, setDoc, onSnapshot, Timestamp } from './services/firebase';
import { ROLES, ROLE_TABS } from './constants/roles';
import { ToastProvider } from './components/ui/Toast';
import { useToast } from './components/ui/useToast';
import { Sidebar } from './components/layout/Sidebar';
import { MobileNav } from './components/layout/MobileNav';
import { LoginScreen } from './components/auth/LoginScreen';
import { AccessScreen } from './components/auth/AccessScreen';
import { SessionTimeoutModal } from './components/auth/SessionTimeoutModal';
import { useInactivityTimeout } from './hooks/useInactivityTimeout';
import { AUTH_VIEW, getAuthErrorMessage, normalizeAuthEmail, resolveAuthView, usesPasswordProvider, validateRegistration } from './utils/auth';
import { normalizeEmail } from './utils/pessoaForm';
import { HomeModule } from './modules/Home/HomeModule';
import { AgendasModule } from './modules/Agendas/AgendasModule';
import { FluxoModule } from './modules/Fluxo/FluxoModule';
import { PessoasModule } from './modules/Pessoas/PessoasModule';
import { ConvitesModule } from './modules/Convites/ConvitesModule';
import { AutocadastrosModule } from './modules/Autocadastros/AutocadastrosModule';
import { ConfiguracoesModule } from './modules/Configuracoes/ConfiguracoesModule';
import { UsuariosModule } from './modules/Usuarios/UsuariosModule';
import { AutocadastroMembroPage } from './modules/Autocadastro/AutocadastroMembroPage';
import { Clock3, MailCheck, ShieldOff } from 'lucide-react';

function AppContent() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(isFirebaseConfigured);
  const [tab, setTab] = useState('home');
  const [usersFilter, setUsersFilter] = useState('todos');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isCheckingAccess, setIsCheckingAccess] = useState(false);
  const [verificationCooldownUntil, setVerificationCooldownUntil] = useState(0);
  const [, setVerificationVersion] = useState(0);
  const pendingRegistrationName = useRef('');
  const toast = useToast();
  const toastError = toast.error;

  const handleInactivityExpiration = async () => {
    if (!auth) return;
    try { await signOut(auth); }
    catch (error) { console.error(error); }
    finally { toast.info('Sua sessão foi encerrada por inatividade. Faça login novamente.', 7000); }
  };
  const { clearActivity, continueSession, isWarning, remainingMs } = useInactivityTimeout({
    userId: user?.uid,
    onExpire: handleInactivityExpiration,
  });

  useEffect(() => {
    if (!isFirebaseConfigured || !auth) { setLoading(false); return undefined; }
    let unsubscribeProfile = () => {};
    let authGeneration = 0;
    const unsubscribeAuth = onAuthStateChanged(auth, async authenticatedUser => {
      const generation = ++authGeneration;
      unsubscribeProfile();
      unsubscribeProfile = () => {};
      setLoading(true);
      setUser(authenticatedUser);
      setProfile(null);
      if (!authenticatedUser) { setLoading(false); return; }
      try {
        const ref = getAppDoc('usuarios', authenticatedUser.uid);
        const snap = await getDoc(ref);
        if (generation !== authGeneration) return;
        if (!snap.exists()) {
          const now = Timestamp.now();
          await setDoc(ref, { uid: authenticatedUser.uid, nome: authenticatedUser.displayName || pendingRegistrationName.current || '', email: normalizeEmail(authenticatedUser.email), role: ROLES.PENDENTE, ativo: true, criadoEm: now, atualizadoEm: now });
          if (generation !== authGeneration) return;
          pendingRegistrationName.current = '';
        }
        unsubscribeProfile = onSnapshot(ref, profileSnapshot => {
          if (generation !== authGeneration) return;
          setProfile(profileSnapshot.exists() ? { id: profileSnapshot.id, ...profileSnapshot.data() } : null);
          setLoading(false);
        }, error => { if (generation !== authGeneration) return; console.error(error); toastError('Não foi possível acompanhar seu perfil de acesso.'); setLoading(false); });
      } catch (error) { if (generation !== authGeneration) return; console.error(error); toastError('Não foi possível carregar seu perfil de acesso.'); setLoading(false); }
    });
    return () => { authGeneration += 1; unsubscribeAuth(); unsubscribeProfile(); };
  }, [toastError]);

  useEffect(() => {
    if (!verificationCooldownUntil) return undefined;
    const remaining = verificationCooldownUntil - Date.now();
    if (remaining <= 0) { setVerificationCooldownUntil(0); return undefined; }
    const timer = setTimeout(() => setVerificationCooldownUntil(0), remaining);
    return () => clearTimeout(timer);
  }, [verificationCooldownUntil]);

  const handleGoogleLogin = async () => {
    if (!auth) return;
    setIsLoggingIn(true);
    try { await signInWithPopup(auth, new GoogleAuthProvider()); toast.success('Login realizado com sucesso!'); }
    catch (error) { console.error(error); toast.error(getAuthErrorMessage(error)); }
    finally { setIsLoggingIn(false); }
  };
  const handleEmailLogin = async ({ email, senha }) => {
    if (!auth) return;
    setIsLoggingIn(true);
    try { await signInWithEmailAndPassword(auth, normalizeAuthEmail(email), senha); toast.success('Login realizado com sucesso!'); }
    catch (error) { console.error(error); toast.error(getAuthErrorMessage(error)); }
    finally { setIsLoggingIn(false); }
  };
  const handleRegister = async form => {
    if (!auth) return;
    const validationError = validateRegistration(form);
    if (validationError) { toast.error(validationError); return; }
    setIsLoggingIn(true);
    pendingRegistrationName.current = form.nome.trim();
    try {
      const credential = await createUserWithEmailAndPassword(auth, normalizeAuthEmail(form.email), form.senha);
      await updateProfile(credential.user, { displayName: form.nome.trim() });
      await sendEmailVerification(credential.user);
      setVerificationCooldownUntil(Date.now() + 60000);
      toast.success('Solicitação enviada. Enviamos uma mensagem de confirmação para seu e-mail.');
    } catch (error) { pendingRegistrationName.current = ''; console.error(error); toast.error(getAuthErrorMessage(error)); }
    finally { setIsLoggingIn(false); }
  };
  const handleResetPassword = async email => {
    const normalizedEmail = normalizeAuthEmail(email);
    if (!normalizedEmail) { toast.info('Informe seu e-mail no campo acima.'); return; }
    setIsLoggingIn(true);
    try { await sendPasswordResetEmail(auth, normalizedEmail); }
    catch (error) { if (error?.code === 'auth/invalid-email') toast.error(getAuthErrorMessage(error)); else if (error?.code === 'auth/network-request-failed') toast.error(getAuthErrorMessage(error)); }
    finally {
      toast.info('Se houver uma conta compatível com este e-mail, você receberá as instruções para redefinir sua senha.');
      setIsLoggingIn(false);
    }
  };
  const resendVerification = async () => {
    if (!user || Date.now() < verificationCooldownUntil) return;
    try { await sendEmailVerification(user); setVerificationCooldownUntil(Date.now() + 60000); toast.success('E-mail de confirmação reenviado. Aguarde alguns instantes.'); }
    catch (error) { console.error(error); toast.error(getAuthErrorMessage(error)); }
  };
  const refreshVerification = async () => {
    if (!user) return;
    setIsCheckingAccess(true);
    try {
      await user.reload();
      if (user.emailVerified) await user.getIdToken(true);
      setVerificationVersion(value => value + 1);
      toast.info(user.emailVerified ? 'E-mail confirmado.' : 'A confirmação ainda não foi identificada.');
    }
    catch (error) { console.error(error); toast.error('Não foi possível atualizar a verificação.'); }
    finally { setIsCheckingAccess(false); }
  };
  const handleSignOut = async () => {
    if (!auth) return;
    clearActivity();
    try { await signOut(auth); toast.info('Você saiu do sistema.'); }
    catch (error) { console.error(error); toast.error('Erro ao sair.'); }
  };
  const verifyAccess = async () => {
    if (!user) return;
    setIsCheckingAccess(true);
    try {
      const snap = await getDoc(getAppDoc('usuarios', user.uid));
      if (snap.exists()) setProfile({ id: snap.id, ...snap.data() });
      toast.info(snap.data()?.ativo !== false && snap.data()?.role !== ROLES.PENDENTE ? 'Acesso liberado.' : 'A liberação ainda está pendente.');
    } catch (error) { console.error(error); toast.error('Não foi possível verificar a liberação.'); }
    finally { setIsCheckingAccess(false); }
  };

  const withSessionTimeout = content => <>{content}<SessionTimeoutModal isOpen={isWarning} remainingMs={remainingMs} onContinue={continueSession} /></>;

  if (resolveAuthView({ loading, user, profile, pendingRole: ROLES.PENDENTE }) === AUTH_VIEW.LOADING) return user ? withSessionTimeout(<div className="min-h-screen flex items-center justify-center"><p className="font-bold text-gray-500">Carregando Sistema Santa Fé...</p></div>) : <div className="min-h-screen flex items-center justify-center"><p className="font-bold text-gray-500">Carregando Sistema Santa Fé...</p></div>;
  if (!user) return <LoginScreen onEmailLogin={handleEmailLogin} onGoogleLogin={handleGoogleLogin} onRegister={handleRegister} onResetPassword={handleResetPassword} busy={isLoggingIn} />;
  if (usesPasswordProvider(user) && !user.emailVerified) return withSessionTimeout(<AccessScreen icon={<MailCheck size={44} />} iconClass="text-indigo-600" title="Confirme seu e-mail para continuar" description="Enviamos uma mensagem de confirmação para seu e-mail. O acesso operacional será liberado somente após a confirmação." user={user} profile={profile} onSignOut={handleSignOut} onVerify={refreshVerification} primaryLabel="Atualizar verificação" checking={isCheckingAccess} secondaryAction={resendVerification} secondaryLabel={Date.now() < verificationCooldownUntil ? 'Aguarde para reenviar' : 'Reenviar confirmação'} secondaryDisabled={Date.now() < verificationCooldownUntil} />);
  if (profile?.ativo === false) return withSessionTimeout(<AccessScreen icon={<ShieldOff size={44} />} iconClass="text-rose-600" title="Acesso desativado" description="Seu acesso ao Sistema Santa Fé está desabilitado. Procure um administrador." user={user} profile={profile} onSignOut={handleSignOut} />);
  if (!profile || profile.role === ROLES.PENDENTE) return withSessionTimeout(<AccessScreen icon={<Clock3 size={44} />} iconClass="text-amber-500" title="Solicitação enviada" description="Seu cadastro foi criado e está aguardando autorização de um Administrador da Casa Santa Fé." user={user} profile={profile} onSignOut={handleSignOut} onVerify={verifyAccess} checking={isCheckingAccess} />);

  const allowedTabs = ROLE_TABS[profile.role] || [];
  const selectTab = nextTab => setTab(allowedTabs.includes(nextTab) ? nextTab : 'home');
  const openPendingUsers = () => { if (profile.role === ROLES.ADMIN) { setUsersFilter('pendentes'); setTab('usuarios'); } };
  const renderContent = () => {
    if (!allowedTabs.includes(tab)) return <HomeModule user={user} profile={profile} onSelectTab={selectTab} allowedTabs={allowedTabs} onOpenPendingUsers={openPendingUsers} />;
    if (tab === 'agendas') return <AgendasModule user={user} profile={profile} />;
    if (tab === 'fluxo') return <FluxoModule user={user} profile={profile} />;
    if (tab === 'pessoas') return <PessoasModule user={user} profile={profile} />;
    if (tab === 'convites') return <ConvitesModule user={user} profile={profile} />;
    if (tab === 'autocadastros') return <AutocadastrosModule user={user} profile={profile} />;
    if (tab === 'usuarios') return profile.role === ROLES.ADMIN ? <UsuariosModule user={user} profile={profile} initialFilter={usersFilter} /> : <HomeModule user={user} profile={profile} onSelectTab={selectTab} allowedTabs={allowedTabs} />;
    if (tab === 'config') return <ConfiguracoesModule user={user} profile={profile} />;
    return <HomeModule user={user} profile={profile} onSelectTab={selectTab} allowedTabs={allowedTabs} onOpenPendingUsers={openPendingUsers} />;
  };
  return withSessionTimeout(<div className="min-h-screen bg-gray-50/50 lg:pl-72 flex flex-col"><Sidebar activeTab={tab} onSelectTab={selectTab} onSignOut={handleSignOut} allowedTabs={allowedTabs} profile={profile} /><main className="flex-grow max-w-4xl mx-auto w-full p-4 pt-6 sm:p-10 pb-32 lg:pb-10">{renderContent()}</main><MobileNav activeTab={tab} onSelectTab={selectTab} allowedTabs={allowedTabs} /></div>);
}

export default function App() {
  const isPublicSelfRegistration = window.location.pathname === '/autocadastro';
  return <ToastProvider>{isPublicSelfRegistration ? <AutocadastroMembroPage /> : <AppContent />}</ToastProvider>;
}
