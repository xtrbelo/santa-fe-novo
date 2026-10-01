import React, { useState } from 'react';
import { normalizeExistingTextRecordsOnServer } from '../../services/firebaseFunctions';
import { Button } from '../../components/ui/Button';

const formatReport = report => report ? `${report.analyzed} registro(s) analisado(s) · ${report.changed} registro(s) com alteração · ${report.fields} campo(s) normalizado(s)` : null;

export const TextCaseNormalizationPanel = () => {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const preview = async () => {
    setLoading(true); setError(false);
    try { setReport(await normalizeExistingTextRecordsOnServer({ mode: 'preview' })); }
    catch (cause) { console.error(cause); setError(true); }
    finally { setLoading(false); }
  };

  const apply = async () => {
    if (!window.confirm('A padronização atualizará os registros selecionados. Auditorias e textos livres serão preservados. Deseja continuar?')) return;
    setLoading(true); setError(false);
    try { setReport(await normalizeExistingTextRecordsOnServer({ mode: 'apply', confirmation: 'NORMALIZAR_REGISTROS_EXISTENTES' })); }
    catch (cause) { console.error(cause); setError(true); }
    finally { setLoading(false); }
  };

  return <div className="space-y-3 border-t border-gray-100 pt-4">
    <div>
      <p className="text-sm font-bold text-blue-800">Padronização de nomes e textos exibidos</p>
      <p className="mt-1 text-xs text-gray-600">Novos cadastros usam caixa de título. A manutenção corrige nomes, endereços, cidades, configurações e e-mails existentes. CPF, telefone, códigos, status, observações e auditorias não são alterados.</p>
    </div>
    <div className="grid gap-2 sm:grid-cols-2">
      <Button variant="secondary" onClick={preview} disabled={loading}>{loading ? 'Processando...' : 'Verificar registros'}</Button>
      <Button variant="warning" onClick={apply} disabled={loading}>{loading ? 'Processando...' : 'Aplicar padronização'}</Button>
    </div>
    {error && <p className="rounded-lg bg-rose-50 p-3 text-xs text-rose-700">Não foi possível concluir a padronização. Nenhuma correção automática foi feita.</p>}
    {report && <p className="rounded-lg bg-emerald-50 p-3 text-xs text-emerald-800">{formatReport(report)}{report.mode === 'preview' ? ' · prévia, sem alterações' : ' · alterações aplicadas'}</p>}
  </div>;
};
