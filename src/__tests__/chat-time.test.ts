import { describe, it, expect } from 'vitest';
import { formatBubbleTime, formatDayLabel, formatSidebarTime, daySeparatorIndexes, chatDayKey } from '@/lib/chatTime';

// "Agora" fixo: 05/10/2026 10:00 em São Paulo (13:00 UTC, segunda-feira).
const NOW = new Date('2026-10-05T13:00:00Z');

describe('chatTime — bolha', () => {
  it('hoje em São Paulo mostra só HH:MM', () => {
    expect(formatBubbleTime('2026-10-05T12:32:00Z', NOW)).toBe('09:32');
  });
  it('outro dia mostra DD/MM/AAAA HH:MM', () => {
    expect(formatBubbleTime('2026-10-04T17:32:00Z', NOW)).toBe('04/10/2026 14:32');
  });
  it('02:30 UTC pertence ao dia anterior (23:30) em São Paulo', () => {
    expect(chatDayKey('2026-10-05T02:30:00Z')).toBe('2026-10-04');
    expect(formatBubbleTime('2026-10-05T02:30:00Z', NOW)).toBe('04/10/2026 23:30');
  });
  it('perto da meia-noite: 23:59 de hoje continua hoje', () => {
    const late = new Date('2026-10-06T02:59:30Z'); // 23:59:30 de 05/10 em SP
    expect(formatBubbleTime('2026-10-06T02:59:00Z', late)).toBe('23:59');
  });
});

describe('chatTime — separador', () => {
  it('Hoje / Ontem / data antiga', () => {
    expect(formatDayLabel('2026-10-05T11:00:00Z', NOW)).toBe('Hoje');
    expect(formatDayLabel('2026-10-04T11:00:00Z', NOW)).toBe('Ontem');
    expect(formatDayLabel('2026-10-03T11:00:00Z', NOW)).toBe('03/10/2026');
  });
});

describe('chatTime — lista lateral', () => {
  it('hoje → HH:MM', () => expect(formatSidebarTime('2026-10-05T12:42:00Z', NOW)).toBe('09:42'));
  it('ontem → Ontem', () => expect(formatSidebarTime('2026-10-04T12:42:00Z', NOW)).toBe('Ontem'));
  it('até 6 dias → dia da semana', () => {
    expect(formatSidebarTime('2026-10-01T15:00:00Z', NOW)).toBe('qui');
    expect(formatSidebarTime('2026-09-29T15:00:00Z', NOW)).toBe('ter');
  });
  it('mais antigo → DD/MM/AAAA', () => expect(formatSidebarTime('2026-09-28T15:00:00Z', NOW)).toBe('28/09/2026'));
  it('virada de dia: 23:59 vira Ontem depois da meia-noite de SP', () => {
    const ts = '2026-10-06T02:59:00Z'; // 23:59 de 05/10 em SP
    expect(formatSidebarTime(ts, new Date('2026-10-06T02:59:30Z'))).toBe('23:59');
    expect(formatSidebarTime(ts, new Date('2026-10-06T03:00:30Z'))).toBe('Ontem');
  });
});

describe('chatTime — separadores na lista de mensagens', () => {
  it('várias mensagens no mesmo dia → 1 separador', () => {
    expect([...daySeparatorIndexes(['2026-10-05T11:00:00Z', '2026-10-05T12:00:00Z', '2026-10-05T12:30:00Z'])]).toEqual([0]);
  });
  it('mudança de dia → novo separador', () => {
    expect([...daySeparatorIndexes(['2026-10-04T21:00:00Z', '2026-10-05T11:00:00Z'])]).toEqual([0, 1]);
  });
  it('página antiga do mesmo dia não duplica separador', () => {
    const older = ['2026-10-05T10:00:00Z', '2026-10-05T10:30:00Z'];
    const page = ['2026-10-05T11:00:00Z', '2026-10-05T12:00:00Z'];
    expect([...daySeparatorIndexes([...older, ...page])]).toEqual([0]);
  });
  it('página antiga de outro dia ganha separador próprio', () => {
    const older = ['2026-10-03T15:00:00Z'];
    const page = ['2026-10-05T11:00:00Z'];
    expect([...daySeparatorIndexes([...older, ...page])]).toEqual([0, 1]);
  });
  it('mensagem nova após a virada do dia em SP abre novo dia', () => {
    // 23:50 e 00:10 em SP (02:50 e 03:10 UTC)
    expect([...daySeparatorIndexes(['2026-10-06T02:50:00Z', '2026-10-06T03:10:00Z'])]).toEqual([0, 1]);
  });
});
