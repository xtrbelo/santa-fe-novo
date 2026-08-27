import React, { useState, useEffect } from 'react';
import { 
  getAppCollection, 
  onSnapshot, 
  findPessoaByCpf,
  createAgendamento,
  query,
  where
} from '../../services/firebase';
import { 
  maskCPF, 
  cleanDigits, 
  sortQueue, 
  getStatusColor 
} from '../../utils/formatters';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { useToast } from '../../components/ui/useToast';
import { 
  CalendarDays, 
  ChevronRight, 
  Plus, 
  Search, 
  UserCheck, 
  CheckCircle2 
} from 'lucide-react';

export const AgendaAdminCard = ({ agenda, user, servicosCatalogo }) => {
  const [expanded, setExpanded] = useState(false);
  const [fila, setFila] = useState([]);
  const [modalWiz, setModalWiz] = useState(false);
  const [step, setStep] = useState('search');
  const [buscaCpf, setBuscaCpf] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [selCons, setSelCons] = useState(null);
  const [selSrvs, setSelSrvs] = useState({});

  const toast = useToast();

  useEffect(() => {
    if (!expanded || !user) return;
    return onSnapshot(query(getAppCollection('consulentes'), where('agendaId', '==', agenda.id)), (s) => {
      setFila(
        s.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .sort(sortQueue)
      );
    });
  }, [expanded, agenda.id, user]);

  const confirmAgendamento = async () => {
    const srvs = servicosCatalogo.filter(s => selSrvs[s.id]);
    if (!srvs.length) {
      toast.error('Selecione pelo menos um serviço para agendar.');
      return;
    }

    const permittedTypes = agenda.tiposPessoaPermitidos || [];
    if (permittedTypes.length && !permittedTypes.includes(selCons.tipoPessoa)) {
      toast.error(`O tipo de pessoa "${selCons.tipoPessoa || 'não informado'}" não é permitido nesta agenda.`);
      return;
    }

    try {
      await createAgendamento({ agenda, pessoa: selCons, servicos: srvs, userId: user.uid, status: 'Agendado' });
      toast.success(`Agendamento de ${selCons.nome} confirmado com sucesso!`);
      setModalWiz(false);
      setStep('search');
      setSelCons(null);
      setSelSrvs({});
      setBuscaCpf('');
    } catch (err) {
      console.error(err);
      if (err.message === 'AGENDAMENTO_DUPLICADO') toast.error('Esta pessoa já possui agendamento ativo nesta agenda.');
      else if (err.message.startsWith('SEM_VAGA:')) toast.error(`Não há vagas disponíveis para ${err.message.split(':')[1]}.`);
      else toast.error('Erro ao realizar o agendamento.');
    }
  };

  const buscarPessoa = async (e) => {
    e.preventDefault();
    const clean = cleanDigits(buscaCpf);
    if (!clean) {
      toast.error('Informe o CPF para busca.');
      return;
    }

    setIsSearching(true);
    try {
      const pessoa = await findPessoaByCpf(clean);
      if (pessoa) {
        setSelCons(pessoa);
        setStep('services');
      } else {
        toast.error('Pessoa não encontrada no sistema. Cadastre-a no módulo de Pessoas primeiro.');
      }
    } catch (err) {
      console.error(err);
      toast.error('Erro ao pesquisar pessoa.');
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <Card className={`transition-all ${expanded ? 'ring-2 ring-amber-500 !bg-amber-50/20' : ''}`}>
      <div 
        className="flex items-center justify-between cursor-pointer" 
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
            expanded ? 'bg-amber-500 text-white shadow-md' : 'bg-gray-100 text-amber-600'
          }`}>
            <CalendarDays size={22} />
          </div>
          <div className="min-w-0 pr-2">
            <h4 className="font-black text-gray-900 text-sm sm:text-base uppercase italic leading-tight truncate">
              {agenda.data?.toDate().toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' })}
            </h4>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest truncate">
              {agenda.tipo}
            </p>
          </div>
        </div>
        <ChevronRight className={`text-gray-300 transition-transform shrink-0 ${expanded ? 'rotate-90 text-amber-500' : ''}`} />
      </div>

      {expanded && (
        <div className="mt-6 space-y-4 animate-in slide-in-from-top-2 duration-200">
          <div className="flex justify-between items-center px-1">
            <span className="text-[11px] font-black uppercase text-gray-400 tracking-widest">
              {fila.length} Inscritos
            </span>
            <Button 
              onClick={() => {
                setModalWiz(true);
                setStep('search');
                setBuscaCpf('');
                setSelCons(null);
                setSelSrvs({});
              }} 
              variant="secondary" 
              className="py-1.5 px-3 text-xs h-auto rounded-lg"
            >
              <Plus size={14} /> Novo
            </Button>
          </div>

          <div className="space-y-2">
            {fila.length === 0 ? (
              <p className="text-center text-gray-400 py-3 text-xs italic">Nenhum inscrito nesta data ainda.</p>
            ) : (
              fila.map(c => (
                <div key={c.id} className="bg-white p-3 rounded-xl border border-gray-100 flex justify-between items-center shadow-sm gap-2">
                  <div className="min-w-0">
                    <p className="font-bold text-gray-800 text-sm truncate">{c.nome}</p>
                    <p className="text-[10px] text-amber-600 font-bold uppercase truncate">
                      {c.servicosNomes?.join(', ')}
                    </p>
                  </div>
                  <span className={`text-[9px] font-black px-2.5 py-1 rounded-full uppercase shrink-0 ${getStatusColor(c.status)}`}>
                    {c.status}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      <Modal 
        isOpen={modalWiz} 
        onClose={() => setModalWiz(false)} 
        title="Assistente de Marcação"
      >
        {step === 'search' ? (
          <form onSubmit={buscarPessoa} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">
                CPF do Consulente
              </label>
              <input 
                value={buscaCpf} 
                onChange={e => setBuscaCpf(maskCPF(e.target.value))} 
                placeholder="000.000.000-00" 
                maxLength={14}
                required
                className="w-full bg-gray-50 px-4 py-3 rounded-xl border border-transparent font-bold text-sm outline-none focus:border-amber-500 focus:bg-white transition-all" 
              />
            </div>
            <Button 
              type="submit" 
              variant="warning" 
              disabled={isSearching}
              className="w-full py-4"
            >
              <Search size={18} /> {isSearching ? 'Procurando...' : 'Procurar Pessoa'}
            </Button>
          </form>
        ) : (
          <div className="space-y-6">
            <div className="p-3.5 bg-amber-50 rounded-xl border border-amber-200 flex items-center gap-3">
              <UserCheck className="text-amber-600 shrink-0" size={22} />
              <div>
                <p className="font-bold text-amber-950 text-sm">{selCons?.nome}</p>
                <p className="text-[10px] text-amber-700 font-medium">CPF: {maskCPF(selCons?.cpf)}</p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1 mb-1">
                Selecione os Serviços
              </p>
              {servicosCatalogo.map(s => (
                <label 
                  key={s.id} 
                  className={`flex items-center gap-3 p-3 bg-white border rounded-xl cursor-pointer transition-colors ${
                    selSrvs[s.id] ? 'border-amber-400 bg-amber-50/50' : 'border-gray-100 hover:border-gray-200'
                  }`}
                >
                  <input 
                    type="checkbox" 
                    checked={selSrvs[s.id] || false} 
                    onChange={() => setSelSrvs({ ...selSrvs, [s.id]: !selSrvs[s.id] })} 
                    className="w-4 h-4 rounded text-amber-500 focus:ring-amber-500" 
                  />
                  <span className="text-sm font-bold text-gray-700">{s.nome}</span>
                </label>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3 pt-2">
              <Button variant="secondary" onClick={() => setStep('search')}>
                Voltar
              </Button>
              <Button onClick={confirmAgendamento} variant="warning">
                <CheckCircle2 size={18} /> Confirmar
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </Card>
  );
};
