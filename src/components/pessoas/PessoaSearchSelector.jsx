import React, { useEffect, useRef, useState } from 'react';
import { Search, UserCheck, UserPlus, X } from 'lucide-react';
import { getRecentPessoas, searchPessoas } from '../../services/firebase';
import { getPessoaFuncoesCasa, getPessoaVinculo } from '../../utils/domain';
import { normalizeSearchDigits, normalizeSearchText } from '../../utils/pessoaSearch';
import { Button } from '../ui/Button';

const finalDigits = (value, size) => normalizeSearchDigits(value).slice(-size);
const pessoaLabel = pessoa => {
  if (getPessoaVinculo(pessoa) !== 'membro') return 'Consulente';
  const functions = getPessoaFuncoesCasa(pessoa);
  return `Membro${functions.length ? ` · ${functions.join(' / ')}` : ''}`;
};

const PessoaRow = ({ pessoa, active, onSelect }) => <button
  type="button"
  onClick={() => onSelect(pessoa)}
  className={`w-full text-left p-3 rounded-xl border transition-colors ${active ? 'border-purple-400 bg-purple-50' : 'border-gray-100 bg-white hover:bg-gray-50'}`}
>
  <strong className="block text-sm text-gray-900">{pessoa.nome}</strong>
  <span className="block text-[11px] font-bold text-purple-700 mt-0.5">{pessoaLabel(pessoa)}</span>
  <span className="block text-[11px] text-gray-500 mt-1">
    {pessoa.cpf ? `CPF final ${finalDigits(pessoa.cpf, 2)}` : 'CPF não informado'}
    {pessoa.contato || pessoa.telefone ? ` · Telefone final ${finalDigits(pessoa.contato || pessoa.telefone, 4)}` : ''}
  </span>
</button>;

export const PessoaSearchSelector = ({ value, onChange, onContinue, onCreateNew, accent = 'purple', allowedVinculos = null }) => {
  const [term, setTerm] = useState('');
  const [results, setResults] = useState([]);
  const [recent, setRecent] = useState([]);
  const [state, setState] = useState('initial');
  const [highlighted, setHighlighted] = useState(0);
  const requestId = useRef(0);

  useEffect(() => {
    let mounted = true;
    getRecentPessoas().then(items => { if (mounted) setRecent(allowedVinculos ? items.filter(item => allowedVinculos.includes(getPessoaVinculo(item))) : items); }).catch(() => {});
    return () => { mounted = false; };
  }, [allowedVinculos]);

  useEffect(() => {
    if (value) return undefined;
    const raw = term.trim();
    const digits = normalizeSearchDigits(raw);
    const numeric = digits.length > 0 && !/[a-zA-ZÀ-ÿ]/.test(raw);
    const normalized = numeric ? digits : normalizeSearchText(raw);
    const minimum = numeric ? 4 : 2;
    const currentRequest = ++requestId.current;
    if (!normalized) { setResults([]); setState('initial'); return undefined; }
    if (normalized.length < minimum) { setResults([]); setState('typing'); return undefined; }
    setState('typing');
    const timer = setTimeout(async () => {
      setState('searching');
      try {
        const found = await searchPessoas(raw, { limitResults: 12 });
        const items = allowedVinculos ? found.filter(item => allowedVinculos.includes(getPessoaVinculo(item))) : found;
        if (requestId.current !== currentRequest) return;
        setResults(items); setHighlighted(0); setState(items.length ? 'results' : 'empty');
      } catch (error) {
        console.error(error);
        if (requestId.current === currentRequest) setState('error');
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [term, value, allowedVinculos]);

  const select = pessoa => { requestId.current += 1; setResults([]); onChange(pessoa); setState('selected'); };
  const clear = () => { requestId.current += 1; onChange(null); setTerm(''); setResults([]); setState('initial'); };
  const keyDown = event => {
    if (!results.length) return;
    if (event.key === 'ArrowDown') { event.preventDefault(); setHighlighted(index => (index + 1) % results.length); }
    if (event.key === 'ArrowUp') { event.preventDefault(); setHighlighted(index => (index - 1 + results.length) % results.length); }
    if (event.key === 'Enter') { event.preventDefault(); select(results[highlighted]); }
    if (event.key === 'Escape') { event.preventDefault(); requestId.current += 1; setResults([]); setState('initial'); }
  };

  if (value) return <div className="space-y-4">
    <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-200">
      <div className="flex items-center gap-2 text-emerald-700 font-black text-xs uppercase"><UserCheck size={17}/> Pessoa selecionada</div>
      <strong className="block mt-2 text-gray-900">{value.nome}</strong>
      <span className="block text-xs font-bold text-emerald-800">{pessoaLabel(value)}</span>
      <span className="block text-xs text-gray-600 mt-1">CPF final {finalDigits(value.cpf, 2) || '--'} · Telefone final {finalDigits(value.contato || value.telefone, 4) || '----'}</span>
      <button type="button" onClick={clear} className="mt-3 text-xs font-black text-purple-700 flex items-center gap-1"><X size={14}/> Trocar pessoa</button>
    </div>
    {onContinue && <Button type="button" onClick={onContinue} className="w-full py-3">Continuar</Button>}
  </div>;

  return <div className="space-y-3">
    <label className="block text-[10px] font-black uppercase tracking-widest text-gray-500">Buscar pessoa</label>
    <div className="flex items-center gap-2 bg-gray-50 px-3 rounded-xl border border-gray-200 focus-within:border-purple-400">
      <Search size={18} className={`text-${accent}-500`}/>
      <input value={term} onChange={event => setTerm(event.target.value)} onKeyDown={keyDown} autoFocus placeholder="Nome, CPF ou telefone" className="w-full bg-transparent py-3 outline-none text-sm font-bold" aria-label="Nome, CPF ou telefone"/>
    </div>
    {state === 'initial' && <p className="text-xs text-gray-500">Digite nome, CPF ou telefone.</p>}
    {state === 'typing' && <p className="text-xs text-gray-500">Digite pelo menos {normalizeSearchDigits(term).length ? '4 dígitos' : '2 caracteres'}.</p>}
    {state === 'searching' && <p className="text-xs text-gray-500">Buscando pessoa...</p>}
    {state === 'empty' && <p className="text-xs text-gray-500">Nenhuma pessoa encontrada.</p>}
    {state === 'error' && <p className="text-xs text-red-600">Não foi possível realizar a busca.</p>}
    {!term.trim() && recent.length > 0 && <div className="space-y-2"><p className="text-[10px] font-black uppercase text-gray-400">Pessoas recentes</p>{recent.map((pessoa, index) => <PessoaRow key={pessoa.id} pessoa={pessoa} active={index === highlighted} onSelect={select}/>)}</div>}
    {results.length > 0 && <div role="listbox" className="space-y-2 max-h-72 overflow-y-auto overscroll-contain">{results.map((pessoa, index) => <PessoaRow key={pessoa.id} pessoa={pessoa} active={index === highlighted} onSelect={select}/>)}</div>}
    {onCreateNew && <button type="button" onClick={() => onCreateNew(term)} className="w-full py-3 text-sm font-black text-purple-700 border border-dashed border-purple-300 rounded-xl flex items-center justify-center gap-2"><UserPlus size={17}/> Cadastrar nova pessoa</button>}
  </div>;
};
