import React, { lazy, Suspense, useEffect, useState } from 'react';
import { auth, onAuthStateChanged, signInWithEmailAndPassword, signInWithPopup, signOut, GoogleAuthProvider, isFirebaseConfigured } from './services/firebaseAuth';
import { sendEmailVerificationOnServer, sendPasswordResetOnServer } from './services/firebaseFunctions';
import { ROLES } from './constants/roles';
import { canAccessModule, getModuleFromPathname, getModulePath, hasPermission, MODULE_LABELS, MODULES, PERMISSIONS } from './constants/permissions';
import { ToastProvider } from './components/ui/Toast';
import { useToast } from './components/ui/useToast';
import { ConnectionStatus } from './components/ui/ConnectionStatus';
import { Sidebar } from './components/layout/Sidebar';
import { MobileNav } from './components/layout/MobileNav';
import { AppFooter } from './components/layout/AppFooter';
import { LoginScreen } from './components/auth/LoginScreen';
import { AccessScreen } from './components/auth/AccessScreen';
import { SessionTimeoutModal } from './components/auth/SessionTimeoutModal';
import { PermissionDenied } from './components/auth/PermissionDenied';
import { useInactivityTimeout } from './hooks/useInactivityTimeout';
import { AUTH_VIEW, getAuthErrorMessage, normalizeAuthEmail, rejectUnauthorizedSession, resolveAuthView } from './utils/auth';
import { getLastActivityKey } from './utils/sessionTimeout';
import { UNSAVED_NAVIGATION_EVENT } from './hooks/useUnsavedChanges';
import { APP_VERSION_LABEL } from './constants/appVersion';
import { Clock3, MailCheck, ShieldOff, ShieldQuestion } from 'lucide-react';

const lazyNamed = (loader, exportName) => lazy(() => loader().then(module => ({ default: module[exportName] })));
const HomeModule = lazyNamed(() => import('./modules/Home/HomeModule'), 'HomeModule');
const AgendasModule = lazyNamed(() => import('./modules/Agendas/AgendasModule'), 'AgendasModule');
const ProgramacaoModule = lazyNamed(() => import('./modules/Programacao/ProgramacaoModule'), 'ProgramacaoModule');
const FluxoModule = lazyNamed(() => import('./modules/Fluxo/FluxoModule'), 'FluxoModule');
const PessoasCadastrosModule = lazyNamed(() => import('./modules/Pessoas/PessoasCadastrosModule'), 'PessoasCadastrosModule');
const ConfiguracoesModule = lazyNamed(() => import('./modules/Configuracoes/ConfiguracoesModule'), 'ConfiguracoesModule');
const UsuariosModule = lazyNamed(() => import('./modules/Usuarios/UsuariosModule'), 'UsuariosModule');
const AutocadastroMembroPage = lazyNamed(() => import('./modules/Autocadastro/AutocadastroMembroPage'), 'AutocadastroMembroPage');
const AtivacaoAcessoPage = lazyNamed(() => import('./modules/AtivacaoAcesso/AtivacaoAcessoPage'), 'AtivacaoAcessoPage');
const MeuCadastroModule = lazyNamed(() => import('./modules/MeuCadastro/MeuCadastroModule'), 'MeuCadastroModule');
const AuditoriaModule = lazyNamed(() => import('./modules/Auditoria/AuditoriaModule'), 'AuditoriaModule');

const ModuleLoading = () => <div className="min-h-40 flex items-center justify-center"><p className="font-bold text-gray-500">Carregando módulo...</p></div>;

function AppContent() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(isFirebaseConfigured);
  const [tab, setTab] = useState(() => getModuleFromPathname(window.location.pathname));
  const [usersFilter, setUsersFilter] = useState('todos');
  const [focusedPersonId, setFocusedPersonId] = useState(null);
  const [returnRequest, setReturnRequest] = useState(null);
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
    let invalidSessionClosing = false;
    const closeInvalidSession = async authenticatedUser => {
      if (invalidSessionClosing) return;
      invalidSessionClosing = true;
      setProfile(null);
      setLoading(false);
      localStorage.removeItem(getLastActivityKey(authenticatedUser.uid));
      try { await signOut(auth); }
      catch (signOutError) { console.error(signOutError); }
      finally { toastError('Sua sessão perdeu a validade. Entre novamente para continuar.'); }
    };
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
      void import('./services/firebaseCore').then(({ getAppDoc, onSnapshot }) => {
        if (generation !== authGeneration) return;
        try {
          const ref = getAppDoc('usuarios', authenticatedUser.uid);
          unsubscribeProfile = onSnapshot(ref, profileSnapshot => {
            if (generation !== authGeneration) return;
            if (!profileSnapshot.exists()) {
              if (claimingAccess) return;
              claimingAccess = true;
              setProfile(null);
              setLoading(true);
              void import('./services/firebase').then(({ findAndClaimAuthorizedAccess }) => findAndClaimAuthorizedAccess({ uid: authenticatedUser.uid, email: authenticatedUser.email, emailVerified: authenticatedUser.emailVerified })).then(claimed => {
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
              setProfile({
                ...nextProfile,
                pessoaEncontrada: personSnapshot.exists(),
                pessoaAtiva: personSnapshot.exists() && personSnapshot.data().ativo !== false,
              });
              setLoading(false);
            }, error => {
              if (generation !== authGeneration) return;
              if (error?.code === 'permission-denied' || error?.code === 'firestore/permission-denied') {
                setProfile({ ...nextProfile, pessoaAtiva: false });
                setLoading(false);
                return;
              }
              console.error(error);
              toastError('Não foi possível acompanhar o cadastro vinculado.');
              setLoading(false);
            });
          }, error => {
            if (generation !== authGeneration) return;
            console.error(error);
            if (error?.code === 'permission-denied' || error?.code === 'firestore/permission-denied') {
              void closeInvalidSession(authenticatedUser);
              return;
            }
            toastError('Não foi possível acompanhar seu perfil de acesso. Verifique sua conexão.');
            setLoading(false);
          });
        } catch (error) { if (generation !== authGeneration) return; console.error(error); toastError('Não foi possível carregar seu perfil de acesso.'); setLoading(false); }
      }).catch(error => { if (generation !== authGeneration) return; console.error(error); toastError('Não foi possível iniciar o acesso aos dados.'); setLoading(false); });
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
    const syncHistoryNavigation = () => {
      const legacySection = window.location.pathname === '/convites' ? 'links' : window.location.pathname === '/autocadastros' ? 'solicitacoes' : null;
      const nextTab = getModuleFromPathname(window.location.pathname);
      const canonicalPath = legacySection ? `${getModulePath(nextTab)}?secao=${legacySection}` : getModulePath(nextTab);
      setTab(nextTab);
      if (`${window.location.pathname}${window.location.search}` !== canonicalPath) window.history.replaceState({}, '', canonicalPath);
    };
    const handleHistoryNavigation = () => {
      const navigationEvent = new Event(UNSAVED_NAVIGATION_EVENT, { cancelable: true });
      if (!window.dispatchEvent(navigationEvent)) {
        window.history.pushState({}, '', getModulePath(tab));
        return;
      }
      syncHistoryNavigation();
    };
    window.addEventListener('popstate', handleHistoryNavigation);
    syncHistoryNavigation();
    return () => window.removeEventListener('popstate', handleHistoryNavigation);
  }, [tab]);

  const handleGoogleLogin = async () => {
    if (!auth) return;
    setIsLoggingIn(true);
    try { await signInWithPopup(auth, new GoogleAuthProvider()); }
    catch (error) { console.error(error); toast.error(getAuthErrorMessage(error)); }
    finally { setIsLoggingIn(false); }
  };
  const handleEmailLogin = async ({ email, senha }) => {
    if (!auth) return;
    setIsLoggingIn(true);
    try { await signInWithEmailAndPassword(auth, normalizeAuthEmail(email), senha); }
    catch (error) { console.error(error); toast.error(getAuthErrorMessage(error)); }
    finally { setIsLoggingIn(false); }
  };
  const handleResetPassword = async email => {
    const normalizedEmail = normalizeAuthEmail(email);
    if (!normalizedEmail) { toast.info('Informe seu e-mail no campo acima.'); return; }
    setIsLoggingIn(true);
    try { await sendPasswordResetOnServer(normalizedEmail); }
    catch (error) { if (error?.code === 'auth/invalid-email') toast.error(getAuthErrorMessage(error)); else if (error?.code === 'auth/network-request-failed') toast.error(getAuthErrorMessage(error)); }
    finally {
      toast.info('Se houver uma conta compatível com este e-mail, você receberá as instruções para redefinir sua senha.');
      setIsLoggingIn(false);
    }
  };
  const resendVerification = async () => {
    if (!user || Date.now() < verificationCooldownUntil) return;
    try { await sendEmailVerificationOnServer(); setVerificationCooldownUntil(Date.now() + 60000); toast.success('E-mail de confirmação reenviado. Aguarde alguns instantes.'); }
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
      const { getAppDoc, getDoc } = await import('./services/firebaseCore');
      const snap = await getDoc(getAppDoc('usuarios', user.uid));
      if (snap.exists()) setProfile({ id: snap.id, ...snap.data() });
      toast.info(snap.data()?.ativo !== false && snap.data()?.role !== ROLES.PENDENTE ? 'Acesso liberado.' : 'A liberação ainda está pendente.');
    } catch (error) { console.error(error); toast.error('Não foi possível verificar a liberação.'); }
    finally { setIsCheckingAccess(false); }
  };

  const withSessionTimeout = content => <>{content}<SessionTimeoutModal isOpen={isWarning} remainingMs={remainingMs} onContinue={continueSession} /></>;

  const authView = resolveAuthView({ loading, user, profile, pendingRole: ROLES.PENDENTE });
  useEffect(() => {
    const environment = import.meta.env.MODE === 'hml' ? ' • HML' : '';
    const page = authView === AUTH_VIEW.AUTHORIZED ? MODULE_LABELS[tab] : 'Acesso ao sistema';
    document.title = `${page || 'Sistema'} • Santa Fé${environment}`;
  }, [authView, tab]);
  if (authView === AUTH_VIEW.LOADING) return user ? withSessionTimeout(<div className="min-h-screen flex items-center justify-center"><p className="font-bold text-gray-500">Carregando Sistema Santa Fé...</p></div>) : <div className="min-h-screen flex items-center justify-center"><p className="font-bold text-gray-500">Carregando Sistema Santa Fé...</p></div>;
  if (authView === AUTH_VIEW.LOGIN) return <LoginScreen onEmailLogin={handleEmailLogin} onGoogleLogin={handleGoogleLogin} onResetPassword={handleResetPassword} busy={isLoggingIn} />;
  if (authView === AUTH_VIEW.UNAUTHORIZED) return withSessionTimeout(<AccessScreen icon={<ShieldQuestion size={44} />} iconClass="text-amber-600" title="Acesso não autorizado" description="Esta conta não possui autorização para acessar o Sistema Santa Fé. Procure um administrador da Casa Santa Fé." showAccountDetails={false} onSignOut={handleSignOut} />);
  if (authView === AUTH_VIEW.EMAIL_NOT_VERIFIED) return withSessionTimeout(<AccessScreen icon={<MailCheck size={44} />} iconClass="text-indigo-600" title="Confirme seu e-mail para continuar" description="Enviamos uma mensagem de confirmação para seu e-mail. O acesso operacional será liberado somente após a confirmação." user={user} profile={profile} onSignOut={handleSignOut} onVerify={refreshVerification} primaryLabel="Atualizar verificação" checking={isCheckingAccess} secondaryAction={resendVerification} secondaryLabel={Date.now() < verificationCooldownUntil ? 'Aguarde para reenviar' : 'Reenviar confirmação'} secondaryDisabled={Date.now() < verificationCooldownUntil} />);
  if (authView === AUTH_VIEW.INACTIVE) return withSessionTimeout(<AccessScreen icon={<ShieldOff size={44} />} iconClass="text-rose-600" title="Acesso desativado" description="Seu acesso ao Sistema Santa Fé está desabilitado. Procure um administrador." user={user} profile={profile} onSignOut={handleSignOut} />);
  if (authView === AUTH_VIEW.BROKEN_LINK) return withSessionTimeout(<AccessScreen icon={<ShieldOff size={44} />} iconClass="text-amber-600" title="Vínculo de cadastro não encontrado" description="Sua conta está ativa, mas o cadastro de membro vinculado não foi localizado. Peça a um Administrador para reparar o vínculo em Usuários." showAccountDetails={false} onSignOut={handleSignOut} />);
  if (authView === AUTH_VIEW.SUSPENDED) return withSessionTimeout(<AccessScreen icon={<ShieldOff size={44} />} iconClass="text-amber-600" title="Acesso suspenso — membro inativo" description="Seu cadastro de membro está inativo. Procure um administrador da Casa Santa Fé." showAccountDetails={false} onSignOut={handleSignOut} />);
  if (authView === AUTH_VIEW.PENDING) return withSessionTimeout(<AccessScreen icon={<Clock3 size={44} />} iconClass="text-amber-500" title="Solicitação enviada" description="Seu cadastro foi criado e está aguardando autorização de um Administrador da Casa Santa Fé." user={user} profile={profile} onSignOut={handleSignOut} onVerify={verifyAccess} checking={isCheckingAccess} />);

  const selectTab = nextTab => {
    const navigationEvent = new Event(UNSAVED_NAVIGATION_EVENT, { cancelable: true });
    if (!window.dispatchEvent(navigationEvent)) return;
    setTab(nextTab);
    window.history.pushState({}, '', getModulePath(nextTab));
  };
  const openUsersByFilter = filter => { if (hasPermission(profile, PERMISSIONS.USERS_MANAGE)) { setUsersFilter(filter); selectTab(MODULES.USERS); } };
  const openPersonById = pessoaId => { if (pessoaId && hasPermission(profile, PERMISSIONS.PEOPLE_VIEW)) { setFocusedPersonId(pessoaId); selectTab(MODULES.PEOPLE); } };
  const openReturnScheduling = appointment => { setReturnRequest(appointment); selectTab(MODULES.AGENDAS); };
  const openPendingRegistrations = () => {
    const navigationEvent = new Event(UNSAVED_NAVIGATION_EVENT, { cancelable: true });
    if (!window.dispatchEvent(navigationEvent)) return;
    setTab(MODULES.PEOPLE);
    window.history.pushState({}, '', `${getModulePath(MODULES.PEOPLE)}?secao=solicitacoes`);
  };
  const openCommunications = () => {
    const navigationEvent = new Event(UNSAVED_NAVIGATION_EVENT, { cancelable: true });
    if (!window.dispatchEvent(navigationEvent)) return;
    setTab(MODULES.PEOPLE);
    window.history.pushState({}, '', `${getModulePath(MODULES.PEOPLE)}?secao=comunicacoes`);
  };
  const renderContent = () => {
    if (!canAccessModule(profile, tab)) return <PermissionDenied />;
    if (tab === MODULES.AGENDAS) return <AgendasModule user={user} profile={profile} returnRequest={returnRequest} onReturnConsumed={() => setReturnRequest(null)} />;
    if (tab === MODULES.PROGRAMACAO) return <ProgramacaoModule user={user} profile={profile} />;
    if (tab === MODULES.ATTENDANCE) return <FluxoModule user={user} profile={profile} onScheduleReturn={openReturnScheduling} />;
    if (tab === MODULES.PEOPLE) return <PessoasCadastrosModule user={user} profile={profile} focusPersonId={focusedPersonId} onFocusConsumed={() => setFocusedPersonId(null)} />;
    if (tab === MODULES.USERS) return <UsuariosModule user={user} profile={profile} initialFilter={usersFilter} />;
    if (tab === MODULES.MY_REGISTRATION) return <MeuCadastroModule user={user} profile={profile} />;
    if (tab === MODULES.CONFIG) return <ConfiguracoesModule user={user} profile={profile} onOpenPerson={openPersonById} />;
    if (tab === MODULES.AUDIT) return <AuditoriaModule onOpenPerson={openPersonById} />;
    return <HomeModule user={user} profile={profile} onSelectTab={selectTab} onOpenUsers={openUsersByFilter} onOpenPendingRegistrations={openPendingRegistrations} onOpenCommunications={openCommunications} />;
  };
  return withSessionTimeout(<div className="min-h-screen bg-gray-50/50 lg:pl-72 flex flex-col">
    <a href="#main-content" className="fixed left-3 top-3 z-[250] -translate-y-24 rounded-xl bg-indigo-700 px-4 py-3 text-sm font-bold text-white shadow-xl transition-transform focus:translate-y-0">Ir para o conteúdo principal</a>
    <Sidebar activeTab={tab} onSelectTab={selectTab} onSignOut={handleSignOut} profile={profile} />
    <header className="flex items-center gap-3 border-b border-gray-100 bg-white px-4 py-2.5 lg:hidden">
      <img src="/logo_santa_fe.png" alt="Casa Santa Fé" className="h-9 w-9 shrink-0 object-contain" />
      <div className="min-w-0"><span className="block text-sm font-black uppercase italic tracking-tight text-gray-900">Casa Santa Fé</span><span className="block truncate text-[9px] font-bold text-indigo-600">{APP_VERSION_LABEL}</span></div>
    </header>
    <main id="main-content" tabIndex={-1} className="flex-grow max-w-4xl mx-auto w-full p-4 pt-6 sm:p-10 pb-32 lg:pb-10"><Suspense fallback={<ModuleLoading />}>{renderContent()}</Suspense></main>
    <MobileNav activeTab={tab} onSelectTab={selectTab} profile={profile} />
  </div>);
}

export default function App() {
  const isPublicSelfRegistration = window.location.pathname === '/autocadastro';
  const isAccessActivation = window.location.pathname === '/ativar-acesso';
  useEffect(() => {
    if (!isPublicSelfRegistration && !isAccessActivation) return;
    const page = isPublicSelfRegistration ? 'Autocadastro' : isAccessActivation ? 'Ativação de acesso' : 'Sistema';
    const environment = import.meta.env.MODE === 'hml' ? ' • HML' : '';
    document.title = `${page} • Santa Fé${environment}`;
  }, [isAccessActivation, isPublicSelfRegistration]);
  return <ToastProvider><ConnectionStatus/><div className="flex min-h-screen flex-col"><div className="flex-1"><Suspense fallback={<ModuleLoading />}>{isPublicSelfRegistration ? <AutocadastroMembroPage /> : isAccessActivation ? <AtivacaoAcessoPage /> : <AppContent />}</Suspense></div><AppFooter /></div></ToastProvider>;
}
