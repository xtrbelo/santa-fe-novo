import React, { useEffect, useState } from 'react';
import { DatabaseBackup, Download, ShieldAlert } from 'lucide-react';
import { getAppDoc, onSnapshot } from '../../services/firebase';
import { getSystemBackupDownloadOnServer, runSystemBackupOnServer } from '../../services/firebaseFunctions';
import { Button } from '../../components/ui/Button';
import { useToast } from '../../components/ui/useToast';

const formatDateTime = value => {
  const date = value?.toDate?.() || (value ? new Date(value) : null);
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleString('pt-BR') : 'Ainda não executado';
};

export const SystemBackupPanel = () => {
  const [status, setStatus] = useState(null); const [busy, setBusy] = useState(false); const toast = useToast();
  useEffect(() => onSnapshot(getAppDoc('sistema_operacional', 'backup'), snapshot => setStatus(snapshot.exists() ? snapshot.data() : null), error => console.error(error)), []);
  const runBackup = async () => {
    if (!window.confirm('Executar um backup completo agora?')) return;
    setBusy(true);
    try { const result = await runSystemBackupOnServer(); toast.success(`Backup concluído com ${result.documents} documento(s).`); }
    catch (error) { console.error(error); toast.error('Não foi possível concluir o backup. O alerta foi registrado.'); }
    finally { setBusy(false); }
  };
  const download = async () => {
    setBusy(true);
    try { const result = await getSystemBackupDownloadOnServer(); window.location.assign(result.url); }
    catch (error) { console.error(error); toast.error('Não foi possível baixar o último backup.'); }
    finally { setBusy(false); }
  };
  const failed = status?.status === 'erro';
  return <div id="backup-sistema" className="scroll-mt-24 space-y-3">
    <div><h3 className="flex items-center gap-2 font-black uppercase text-indigo-800"><DatabaseBackup size={18}/> Backup do sistema</h3><p className="mt-1 text-xs text-gray-500">Cópia privada automática todos os dias às 03h, mantida por 35 dias.</p></div>
    <div className={`rounded-xl p-3 text-sm ${failed ? 'border border-rose-200 bg-rose-50 text-rose-900' : 'bg-emerald-50 text-emerald-900'}`}>
      {failed && <ShieldAlert className="mr-1 inline" size={17}/>}<strong>{failed ? 'O último backup falhou' : status?.status === 'executando' ? 'Backup em andamento' : 'Proteção ativa'}</strong>
      <p className="mt-1 text-xs">Último sucesso: {formatDateTime(status?.ultimoSucessoEm)}</p>
      {status?.quantidadeDocumentos != null && <p className="text-xs">{status.quantidadeDocumentos} documento(s) em {status.quantidadeColecoes} coleção(ões).</p>}
    </div>
    <div className="grid gap-2 sm:grid-cols-2"><Button busy={busy} onClick={runBackup}><DatabaseBackup size={16}/> Executar backup agora</Button><Button variant="secondary" disabled={busy || !status?.arquivo?.caminho} onClick={download}><Download size={16}/> Baixar último backup</Button></div>
    <p className="text-[11px] text-gray-500">A restauração é uma operação administrativa assistida para evitar substituição acidental dos dados atuais.</p>
  </div>;
};
