import { useEffect, useState } from 'react';

/** Data atual atualizada uma vez por minuto (só para formatação na tela). */
export function useMinuteTick(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}
