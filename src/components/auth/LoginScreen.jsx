import React, { useState } from 'react';
import { Eye, EyeOff, LayoutDashboard, LogIn } from 'lucide-react';
import { getLoginAutocomplete } from '../../utils/auth';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';

const Field = ({ label, ...props }) => <label className="block space-y-2 text-left">
  <span className="text-xs font-black uppercase tracking-wide text-gray-600">{label}</span>
  <input {...props} className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-gray-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />
</label>;

const PasswordField = ({ label, ...props }) => {
  const [visible, setVisible] = useState(false);
  return <div className="relative">
    <Field label={label} {...props} type={visible ? 'text' : 'password'} />
    <button type="button" onClick={() => setVisible(value => !value)} className="absolute bottom-3 right-3 text-gray-400 hover:text-indigo-600" aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'}>{visible ? <EyeOff size={20} /> : <Eye size={20} />}</button>
  </div>;
};

const emptyForm = { nome: '', email: '', senha: '', confirmarSenha: '' };

export function LoginScreen({ onEmailLogin, onGoogleLogin, onRegister, onResetPassword, busy }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState(emptyForm);
  const autocomplete = getLoginAutocomplete(mode);
  const update = event => setForm(current => ({ ...current, [event.target.name]: event.target.value }));
  const submit = event => { event.preventDefault(); mode === 'register' ? onRegister(form) : onEmailLogin(form); };
  const toggleMode = () => { setMode(current => current === 'login' ? 'register' : 'login'); setForm(emptyForm); };

  return <div className="flex min-h-screen items-center justify-center bg-gray-100/70 p-4">
    <Card className="w-full max-w-md p-7 shadow-2xl !border-none sm:p-10">
      <div className="mb-8 text-center"><div className="mx-auto flex h-16 w-16 rotate-6 items-center justify-center rounded-[22px] bg-indigo-600 text-white shadow-xl"><LayoutDashboard size={32} /></div><h1 className="mt-5 text-3xl font-black uppercase italic text-gray-900">Casa Santa Fé</h1><p className="mt-2 text-[11px] font-bold uppercase text-gray-400">Sistema de Gestão Interna</p></div>
      <form onSubmit={submit} autoComplete={autocomplete.form} className="space-y-4">
        {mode === 'register' && <Field label="Nome" name="nome" value={form.nome} onChange={update} autoComplete="name" required />}
        <Field label="E-mail" name="email" type="email" value={form.email} onChange={update} autoComplete={autocomplete.email} required />
        <PasswordField label="Senha" name="senha" value={form.senha} onChange={update} autoComplete={autocomplete.password} required />
        {mode === 'register' && <PasswordField label="Confirmar senha" name="confirmarSenha" value={form.confirmarSenha} onChange={update} autoComplete="new-password" required />}
        <Button type="submit" disabled={busy} className="w-full rounded-xl py-3"><LogIn size={19} /> {busy ? 'Aguarde...' : mode === 'register' ? 'Criar conta' : 'Entrar'}</Button>
      </form>
      {mode === 'login' && <><button type="button" disabled={busy} onClick={() => onResetPassword(form.email)} className="mt-4 w-full text-sm font-bold text-indigo-600 hover:underline">Esqueci minha senha</button><div className="my-6 flex items-center gap-3 text-xs font-bold text-gray-400"><span className="h-px flex-1 bg-gray-200" />ou<span className="h-px flex-1 bg-gray-200" /></div><Button type="button" onClick={onGoogleLogin} disabled={busy} variant="secondary" className="w-full">Entrar com Google</Button></>}
      <div className="mt-6 text-center text-sm text-gray-500">{mode === 'login' ? 'Primeiro acesso?' : 'Já possui uma conta?'} <button type="button" disabled={busy} onClick={toggleMode} className="font-black text-indigo-600 hover:underline">{mode === 'login' ? 'Solicitar acesso' : 'Voltar ao login'}</button></div>
    </Card>
  </div>;
}
