import React from 'react';
import { RestrictedHandoffChat } from './ExpedicaoChat';

// Chat ao Vivo restrito do papel `parcerias` (Carla — influenciadoras/collab).
// Mesmo modelo da expedição e das dermoconsultoras: todo acesso passa pela
// edge function `parcerias-chat`, que revalida sessão, papel e concessão ativa.
export const PARCERIAS_REASON_LABELS: Record<string, string> = {
  influencer: 'Influenciadora',
  influenciadora: 'Influenciadora',
  content_creator: 'Criadora de conteúdo',
  criadora_conteudo: 'Criadora de conteúdo',
  collab: 'Collab',
  partnership: 'Parceria de divulgação',
  parceria: 'Parceria de divulgação',
  parceria_divulgacao: 'Parceria de divulgação',
  permuta: 'Permuta com influenciadora',
  relacionamento_influenciadoras: 'Relacionamento com influenciadoras',
};

const ParceriasChat: React.FC = () => (
  <RestrictedHandoffChat
    config={{
      edgeFunction: 'parcerias-chat',
      reasonLabels: PARCERIAS_REASON_LABELS,
      fallbackReasonLabel: 'Parcerias / influenciadoras',
    }}
  />
);

export default ParceriasChat;
