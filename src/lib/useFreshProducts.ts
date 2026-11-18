import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { api, type ApiProduct } from './api';

/**
 * Current data for saved products, fetched whenever the screen comes into view (ingredients and
 * ratings can change; only names and photos are stored on the phone).
 */
export function useFreshProducts(ids: number[]) {
  const [state, setState] = useState<{ products: Map<number, ApiProduct>; state: 'loading' | 'done' | 'error' }>({
    products: new Map(),
    state: 'loading',
  });
  const idsKey = ids.join(',');
  const run = useRef(0);
  const reload = useCallback(() => {
    const list = idsKey ? idsKey.split(',').map(Number) : [];
    const mine = ++run.current;
    if (!list.length) {
      setState({ products: new Map(), state: 'done' });
      return;
    }
    setState((s) => ({ ...s, state: 'loading' }));
    const chunks: number[][] = [];
    for (let i = 0; i < list.length; i += 50) chunks.push(list.slice(i, i + 50));
    Promise.all(chunks.map((c) => api.lookup(c)))
      .then((res) => {
        if (mine !== run.current) return;
        const products = new Map<number, ApiProduct>();
        for (const r of res) for (const p of r.products) if (p.id !== null) products.set(p.id, p);
        setState({ products, state: 'done' });
      })
      .catch(() => mine === run.current && setState((s) => ({ ...s, state: 'error' })));
  }, [idsKey]);
  useFocusEffect(reload);
  return { ...state, reload };
}
