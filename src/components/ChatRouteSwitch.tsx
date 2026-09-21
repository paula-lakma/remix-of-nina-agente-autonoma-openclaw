import React from 'react';
import { Loader2 } from 'lucide-react';
import { useUserRole } from '@/hooks/useUserRole';
import ChatInterface from './ChatInterface';
import ExpedicaoChat from './ExpedicaoChat';
import DermoChat from './DermoChat';
import ParceriasChat from './ParceriasChat';

// Seleciona a interface de chat conforme o papel: `expedicao` e `dermo` usam
// versões restritas (backends `expedicao-chat` / `dermo-chat`); demais papéis
// mantêm o chat completo.
const ChatRouteSwitch: React.FC = () => {
  const { role, loading } = useUserRole();

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (role === 'expedicao') return <ExpedicaoChat />;
  if (role === 'dermo') return <DermoChat />;
  if (role === 'parcerias') return <ParceriasChat />;
  return <ChatInterface />;
};

export default ChatRouteSwitch;
