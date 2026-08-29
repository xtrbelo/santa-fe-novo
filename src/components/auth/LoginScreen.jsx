import React, { useState } from 'react';
import { Eye, EyeOff, LayoutDashboard, LogIn } from 'lucide-react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';

const Field = ({ label, ...props }) => <label className="block text-left space-y-2"><span className="text-xs font-black uppercase tracking-wide text-gray-600">{label}</span><input {...props} className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-gray-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" /></label>;

const PasswordField = ({ label, ...props }) => {
  const [visible, setVisible] = useState(false);
  return <div className="relative"><Field label={label} {...props} type={visible ? 'text' : 'password'} /><button type="button" onClick={() => setVisible(value => !value)} className="absolute bottom-3 right-3 text-gray-400 hover:text-indigo-600" aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'}>{visible ? <EyeOff size={20} /> : <Eye size={20} />}</button></div>;
};

export function LoginScreen({ onEmailLogin, onGoogleLogin, onRegister, onResetPassword, busy }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ nome: '', email: '', senha: '', confirmarSenha: '' });
  const update = event => setForm(current => ({ ...current, [event.target.name]: event.target.value }));
  const submit = event => { event.preventDefault(); mode === 'register' ? onRegister(form) : onEmailLogin(form); };
  return <div className="min-h-screen bg-gray-100/70 flex items-center justify-center p-4"><Card className="max-w-md w-full p-7 sm:p-10 shadow-2xl !border-none"><div className="text-center mb-8"><div className="w-16 h-16 bg-indigo-600 rounded-[22px] mx-auto flex items-center justify-center text-white rotate-6 shadow-xl"><LayoutDashboard size={32} /></div><h1 className="text-3xl font-black text-gray-900 italic uppercase mt-5">Casa Santa Fé</h1><p className="text-gray-400 font-bold text-[11px] uppercase mt-2">Sistema de Gestão Interna</p></div><form onSubmit={submit} className="space-y-4">{mode === 'register' && <Field label="Nome" name="nome" value={form.nome} onChange={update} autoComplete="name" required />}<Field label="E-mail" name="email" type="email" value={form.email} onChange={update} autoComplete="email" required /><PasswordField label="Senha" name="senha" value={form.senha} onChange={update} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} required />{mode === 'register' && <PasswordField label="Confirmar senha" name="confirmarSenha" value={form.confirmarSenha} onChange={update} autoComplete="new-password" required />}<Button type="submit" disabled={busy} className="w-full py-3 rounded-xl"><LogIn size={19} /> {busy ? 'Aguarde...' : mode === 'register' ? 'Criar conta' : 'Entrar'}</Button></form>{mode === 'login' && <><button type="button" disabled={busy} onClick={() => onResetPassword(form.email)} className="w-full mt-4 text-sm font-bold text-indigo-600 hover:underline">Esqueci minha senha</button><div className="flex items-center gap-3 my-6 text-xs font-bold text-gray-400"><span className="h-px flex-1 bg-gray-200" />ou<span className="h-px flex-1 bg-gray-200" /></div><Button type="button" onClick={onGoogleLogin} disabled={busy} variant="secondary" className="w-full">Entrar com Google</Button></>}<div className="text-center mt-6 text-sm text-gray-500">{mode === 'login' ? 'Primeiro acesso?' : 'Já possui uma conta?'} <button type="button" disabled={busy} onClick={() => setMode(mode === 'login' ? 'register' : 'login')} className="font-black text-indigo-600 hover:underline">{mode === 'login' ? 'Solicitar acesso' : 'Voltar ao login'}</button></div></Card></div>;
}
