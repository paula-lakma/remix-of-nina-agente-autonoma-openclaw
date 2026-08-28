import React from 'react';
import { RestrictedHandoffChat, DERMO_REASON_LABELS } from './ExpedicaoChat';

// Chat ao Vivo restrito do papel `dermo` (dermoconsultoras).
// Mesmo modelo da expedição: todo acesso passa pela edge function `dermo-chat`,
// que revalida sessão, papel e concessão ativa no servidor.
const DermoChat: React.FC = () => (
  <RestrictedHandoffChat
    config={{
      edgeFunction: 'dermo-chat',
      reasonLabels: DERMO_REASON_LABELS,
      fallbackReasonLabel: 'Atendimento técnico / dermoconsultora',
    }}
  />
);

export default DermoChat;
