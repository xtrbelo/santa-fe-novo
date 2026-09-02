import React, { useEffect, useState } from 'react';
import { auth, findAndClaimAuthorizedAccess, onAuthStateChanged, sendEmailVerification, sendPasswordResetEmail, signInWithEmailAndPassword, signInWithPopup, signOut, GoogleAuthProvider, isFirebaseConfigured, getAppDoc, getDoc, onSnapshot } from './services/firebase';
import { ROLES } from './constants/roles';
import { canAccessModule, getModuleFromPathname, getModulePath, hasPermission, MODULES, PERMISSIONS } from './constants/permissions';
import { ToastProvider } from './components/ui/Toast';
import { useToast } from './components/ui/useToast';
import { Sidebar } from './components/layout/Sidebar';
import { MobileNav } from './components/layout/MobileNav';
import { LoginScreen } from './components/auth/LoginScreen';
import { AccessScreen } from './components/auth/AccessScreen';
import { SessionTimeoutModal } from './components/auth/SessionTimeoutModal';
import { PermissionDenied } from './components/auth/PermissionDenied';
import { useInactivityTimeout } from './hooks/useInactivityTimeout';
import { AUTH_VIEW, getAuthErrorMessage, normalizeAuthEmail, rejectUnauthorizedSession, resolveAuthView } from './utils/auth';
import { HomeModule } from './modules/Home/HomeModule';
import { AgendasModule } from './modules/Agendas/AgendasModule';
import { ProgramacaoModule } from './modules/Programacao/ProgramacaoModule';
import { FluxoModule } from './modules/Fluxo/FluxoModule';
import { PessoasModule } from './modules/Pessoas/PessoasModule';
import { ConvitesModule } from './modules/Convites/ConvitesModule';
import { AutocadastrosModule } from './modules/Autocadastros/AutocadastrosModule';
import { ConfiguracoesModule } from './modules/Configuracoes/ConfiguracoesModule';
import { UsuariosModule } from './modules/Usuarios/UsuariosModule';
import { AutocadastroMembroPage } from './modules/Autocadastro/AutocadastroMembroPage';
import { AtivacaoAcessoPage } from './modules/AtivacaoAcesso/AtivacaoAcessoPage';
import { MeuCadastroModule } from './modules/MeuCadastro/MeuCadastroModule';
import { Clock3, MailCheck, ShieldOff, ShieldQuestion } from 'lucide-react';

function AppContent() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(isFirebaseConfigured);
  const [tab, setTab] = useState(() => getModuleFromPathname(window.location.pathname));
  const [usersFilter, setUsersFilter] = useState('todos');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isCheckingAccess, setIsCheckingAccess] = useState(false);
  const [verificationCooldownUntil, setVerificationCooldownUntil] = useState(0);
  const [, setVerificationVersion] = useState(0);
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
    let unsubscribePerson = () => {};
    let authGeneration = 0;
    const unsubscribeAuth = onAuthStateChanged(auth, authenticatedUser => {
      const generation = ++authGeneration;
      let claimingAccess = false;
      unsubscribeProfile();
      unsubscribePerson();
      unsubscribeProfile = () => {};
      unsubscribePerson = () => {};
      setLoading(true);
      setUser(authenticatedUser);
      setProfile(null);
      if (!authenticatedUser) { setLoading(false); return; }
      try {
        const ref = getAppDoc('usuarios', authenticatedUser.uid);
        unsubscribeProfile = onSnapshot(ref, profileSnapshot => {
          if (generation !== authGeneration) return;
          if (!profileSnapshot.exists()) {
            if (claimingAccess) return;
            claimingAccess = true;
            setProfile(null);
            setLoading(true);
            void findAndClaimAuthorizedAccess({ uid: authenticatedUser.uid, email: authenticatedUser.email, emailVerified: authenticatedUser.emailVerified }).then(claimed => {
              if (generation !== authGeneration || claimed) return;
              unsubscribeProfile();
              unsubscribeProfile = () => {};
              setLoading(false);
              return rejectUnauthorizedSession({ auth, signOutUser: signOut, notify: toastError });
            }).catch(error => {
              console.error(error);
              if (generation !== authGeneration) return;
              unsubscribeProfile();
              unsubscribeProfile = () => {};
              setLoading(false);
              toastError('Não foi possível concluir a ativação do acesso. Procure um administrador.');
              void signOut(auth);
            }).finally(() => { claimingAccess = false; });
            return;
          }
          const nextProfile = { id: profileSnapshot.id, ...profileSnapshot.data() };
          unsubscribePerson();
          unsubscribePerson = () => {};
          if (!nextProfile.pessoaBaseId) {
            setProfile({ ...nextProfile, pessoaAtiva: true });
            setLoading(false);
            return;
          }
          setLoading(true);
          unsubscribePerson = onSnapshot(getAppDoc('pessoas', nextProfile.pessoaBaseId), personSnapshot => {
            if (generation !== authGeneration) return;
            setProfile({ ...nextProfile, pessoaAtiva: personSnapshot.exists() && personSnapshot.data().ativo !== false });
            setLoading(false);
          }, error => { if (generation !== authGeneration) return; console.error(error); toastError('Não foi possível acompanhar o cadastro vinculado.'); setLoading(false); });
        }, error => { if (generation !== authGeneration) return; console.error(error); toastError('Não foi possível acompanhar seu perfil de acesso.'); setLoading(false); });
      } catch (error) { if (generation !== authGeneration) return; console.error(error); toastError('Não foi possível carregar seu perfil de acesso.'); setLoading(false); }
    });
    return () => { authGeneration += 1; unsubscribeAuth(); unsubscribeProfile(); unsubscribePerson(); };
  }, [toastError]);

  useEffect(() => {
    if (!verificationCooldownUntil) return undefined;
    const remaining = verificationCooldownUntil - Date.now();
    if (remaining <= 0) { setVerificationCooldownUntil(0); return undefined; }
    const timer = setTimeout(() => setVerificationCooldownUntil(0), remaining);
    return () => clearTimeout(timer);
  }, [verificationCooldownUntil]);

  useEffect(() => {
    const handleHistoryNavigation = () => setTab(getModuleFromPathname(window.location.pathname));
    window.addEventListener('popstate', handleHistoryNavigation);
    return () => window.removeEventListener('popstate', handleHistoryNavigation);
  }, []);

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

  const authView = resolveAuthView({ loading, user, profile, pendingRole: ROLES.PENDENTE });
  if (authView === AUTH_VIEW.LOADING) return user ? withSessionTimeout(<div className="min-h-screen flex items-center justify-center"><p className="font-bold text-gray-500">Carregando Sistema Santa Fé...</p></div>) : <div className="min-h-screen flex items-center justify-center"><p className="font-bold text-gray-500">Carregando Sistema Santa Fé...</p></div>;
  if (authView === AUTH_VIEW.LOGIN) return <LoginScreen onEmailLogin={handleEmailLogin} onGoogleLogin={handleGoogleLogin} onResetPassword={handleResetPassword} busy={isLoggingIn} />;
  if (authView === AUTH_VIEW.UNAUTHORIZED) return withSessionTimeout(<AccessScreen icon={<ShieldQuestion size={44} />} iconClass="text-amber-600" title="Acesso não autorizado" description="Esta conta não possui autorização para acessar o Sistema Santa Fé. Procure um administrador da Casa Santa Fé." showAccountDetails={false} onSignOut={handleSignOut} />);
  if (authView === AUTH_VIEW.EMAIL_NOT_VERIFIED) return withSessionTimeout(<AccessScreen icon={<MailCheck size={44} />} iconClass="text-indigo-600" title="Confirme seu e-mail para continuar" description="Enviamos uma mensagem de confirmação para seu e-mail. O acesso operacional será liberado somente após a confirmação." user={user} profile={profile} onSignOut={handleSignOut} onVerify={refreshVerification} primaryLabel="Atualizar verificação" checking={isCheckingAccess} secondaryAction={resendVerification} secondaryLabel={Date.now() < verificationCooldownUntil ? 'Aguarde para reenviar' : 'Reenviar confirmação'} secondaryDisabled={Date.now() < verificationCooldownUntil} />);
  if (authView === AUTH_VIEW.INACTIVE) return withSessionTimeout(<AccessScreen icon={<ShieldOff size={44} />} iconClass="text-rose-600" title="Acesso desativado" description="Seu acesso ao Sistema Santa Fé está desabilitado. Procure um administrador." user={user} profile={profile} onSignOut={handleSignOut} />);
  if (authView === AUTH_VIEW.SUSPENDED) return withSessionTimeout(<AccessScreen icon={<ShieldOff size={44} />} iconClass="text-amber-600" title="Acesso suspenso — membro inativo" description="Seu cadastro de membro está inativo. Procure um administrador da Casa Santa Fé." showAccountDetails={false} onSignOut={handleSignOut} />);
  if (authView === AUTH_VIEW.PENDING) return withSessionTimeout(<AccessScreen icon={<Clock3 size={44} />} iconClass="text-amber-500" title="Solicitação enviada" description="Seu cadastro foi criado e está aguardando autorização de um Administrador da Casa Santa Fé." user={user} profile={profile} onSignOut={handleSignOut} onVerify={verifyAccess} checking={isCheckingAccess} />);

  const selectTab = nextTab => {
    setTab(nextTab);
    window.history.pushState({}, '', getModulePath(nextTab));
  };
  const openPendingUsers = () => { if (hasPermission(profile, PERMISSIONS.USERS_MANAGE)) { setUsersFilter('pendentes'); selectTab(MODULES.USERS); } };
  const renderContent = () => {
    if (!canAccessModule(profile, tab)) return <PermissionDenied />;
    if (tab === MODULES.AGENDAS) return <AgendasModule user={user} profile={profile} />;
    if (tab === MODULES.PROGRAMACAO) return <ProgramacaoModule user={user} profile={profile} />;
    if (tab === MODULES.ATTENDANCE) return <FluxoModule user={user} profile={profile} />;
    if (tab === MODULES.PEOPLE) return <PessoasModule user={user} profile={profile} />;
    if (tab === MODULES.MEMBER_INVITES) return <ConvitesModule user={user} profile={profile} />;
    if (tab === MODULES.MEMBER_REGISTRATIONS) return <AutocadastrosModule user={user} profile={profile} />;
    if (tab === MODULES.USERS) return <UsuariosModule user={user} profile={profile} initialFilter={usersFilter} />;
    if (tab === MODULES.MY_REGISTRATION) return <MeuCadastroModule user={user} profile={profile} />;
    if (tab === MODULES.CONFIG) return <ConfiguracoesModule user={user} profile={profile} />;
    return <HomeModule user={user} profile={profile} onSelectTab={selectTab} onOpenPendingUsers={openPendingUsers} />;
  };
  return withSessionTimeout(<div className="min-h-screen bg-gray-50/50 lg:pl-72 flex flex-col"><Sidebar activeTab={tab} onSelectTab={selectTab} onSignOut={handleSignOut} profile={profile} /><main className="flex-grow max-w-4xl mx-auto w-full p-4 pt-6 sm:p-10 pb-32 lg:pb-10">{renderContent()}</main><MobileNav activeTab={tab} onSelectTab={selectTab} profile={profile} /></div>);
}

export default function App() {
  const isPublicSelfRegistration = window.location.pathname === '/autocadastro';
  const isAccessActivation = window.location.pathname === '/ativar-acesso';
  return <ToastProvider>{isPublicSelfRegistration ? <AutocadastroMembroPage /> : isAccessActivation ? <AtivacaoAcessoPage /> : <AppContent />}</ToastProvider>;
}
