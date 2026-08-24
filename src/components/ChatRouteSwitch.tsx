import React from 'react';
import { Loader2 } from 'lucide-react';
import { useUserRole } from '@/hooks/useUserRole';
import ChatInterface from './ChatInterface';
import ExpedicaoChat from './ExpedicaoChat';

// Seleciona a interface de chat conforme o papel: `expedicao` usa a versão
// restrita (backend `expedicao-chat`); demais papéis mantêm o chat completo.
const ChatRouteSwitch: React.FC = () => {
  const { role, loading } = useUserRole();

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return role === 'expedicao' ? <ExpedicaoChat /> : <ChatInterface />;
};

export default ChatRouteSwitch;
