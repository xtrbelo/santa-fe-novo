import React, { useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, ShieldCheck } from 'lucide-react';
import { inspectAccessIntegrity, inspectCpfIndexes, inspectMemberEmailIndexes, inspectVacancyCounters } from '../../services/firebase';
import { buildSystemHealthSummary } from '../../utils/systemHealth';
import { Button } from '../../components/ui/Button';
import { useToast } from '../../components/ui/useToast';

const inspectAll = async (loader, initial, pageSize) => {
  let cursor = null;
  const report = Object.fromEntries(Object.entries(initial).map(([key, value]) => [key, Array.isArray(value) ? [] : value]));
  do {
    const page = await loader({ pageSize, cursor });
    Object.keys(initial).forEach(key => {
      if (Array.isArray(initial[key])) report[key].push(...(page[key] || []));
      else report[key] += Number(page[key] || 0);
    });
    cursor = page.nextCursor;
  } while (cursor);
  return report;
};

export const SystemHealthPanel = () => {
  const [summary, setSummary] = useState(null);
  const [checking, setChecking] = useState(false);
  const [checkedAt, setCheckedAt] = useState(null);
  const toast = useToast();

  const check = async () => {
    setChecking(true);
    try {
      const [access, memberEmail, cpf, vacancies] = await Promise.all([
        inspectAccessIntegrity(),
        inspectMemberEmailIndexes(),
        inspectAll(inspectCpfIndexes, { analyzed: 0, correct: 0, missing: [], conflicts: [], invalid: 0, withoutCpf: 0 }, 100),
        inspectAll(inspectVacancyCounters, { analyzed: 0, divergences: [], skippedClosed: 0 }, 25),
      ]);
      const next = buildSystemHealthSummary({ access, memberEmail, cpf, vacancies });
      setSummary(next);
      setCheckedAt(new Date());
      toast[next.healthy ? 'success' : 'error'](next.healthy ? 'Sistema verificado sem pendências.' : `${next.critical} situação(ões) crítica(s) e ${next.warning} aviso(s) encontrados.`);
    } catch (error) {
      console.error(error);
      toast.error('Não foi possível concluir o diagnóstico do sistema. Tente novamente.');
    } finally { setChecking(false); }
  };

  const openDetails = id => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });

  return <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4 space-y-4">
    <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 shrink-0 text-blue-700" size={22}/><div><h4 className="font-black text-blue-950">Saúde do sistema</h4><p className="text-sm text-blue-900/70">Verifica acessos, e-mails, CPFs e vagas sem alterar nenhum dado.</p></div></div>
    <Button onClick={check} disabled={checking} className="w-full"><Activity size={17}/>{checking ? 'Executando diagnóstico...' : 'Executar diagnóstico completo'}</Button>
    {summary && <div className="space-y-3" aria-live="polite">
      <div className={`rounded-xl p-3 text-sm font-bold ${summary.healthy ? 'bg-emerald-100 text-emerald-900' : 'bg-amber-100 text-amber-950'}`}>
        {summary.healthy ? <span className="flex items-center gap-2"><CheckCircle2 size={18}/> Nenhuma pendência encontrada.</span> : <span className="flex items-center gap-2"><AlertTriangle size={18}/> {summary.critical} situação(ões) crítica(s) · {summary.warning} aviso(s)</span>}
        {checkedAt && <p className="mt-1 text-xs font-normal">Última verificação: {checkedAt.toLocaleString('pt-BR')}</p>}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">{summary.categories.map(item => <div key={item.id} className="rounded-xl border border-blue-100 bg-white p-3 text-xs">
        <div className="flex items-start justify-between gap-2"><strong className="text-gray-900">{item.label}</strong><span className={`rounded-full px-2 py-1 font-black ${item.critical ? 'bg-rose-100 text-rose-800' : item.warning ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>{item.critical ? 'Crítico' : item.warning ? 'Atenção' : 'OK'}</span></div>
        <p className="mt-2 text-gray-600">{item.analyzed} analisado(s) · {item.critical} crítico(s) · {item.warning} aviso(s)</p>
        {(item.critical > 0 || item.warning > 0) && (item.detailAvailable ? <button type="button" onClick={() => openDetails(item.id)} className="mt-2 font-bold text-blue-700 underline underline-offset-2">Ver ferramenta de correção</button> : <p className="mt-2 font-bold text-blue-700">Use a ferramenta correspondente abaixo.</p>)}
      </div>)}</div>
      {!summary.healthy && <p className="text-xs text-blue-900">As correções continuam separadas abaixo e exigem confirmação. Conflitos nunca são sobrescritos automaticamente.</p>}
    </div>}
  </div>;
};
