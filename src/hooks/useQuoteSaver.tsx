import { useRef, useState } from 'react';
import { toast } from 'sonner';
import GroupPriceSheet from '@/components/GroupPriceSheet';
import { useSaveQuote, type SaveQuoteResponse } from '@/lib/queries';
import {
  applyPriceScope, readQuoteSaveError, type GroupDeviation, type SaveQuotePayload,
} from '@/lib/quote';
import type { PriceScope } from '@/types';

interface PendingScope {
  deviations: GroupDeviation[];
  memberCount: number;
}

/**
 * Save a quote through POST /api/quotes/save, resolving Bloom's
 * GROUP_PRICE_DEVIATIONS rejection in-line: the GroupPriceSheet asks the
 * operator which scope the new prices have, then the same payload is re-sent
 * with price_scope on the deviating lines. Every other rejection surfaces as
 * a toast with Bloom's own message. Resolves null when nothing was saved.
 *
 * Render `sheet` once in the page that uses the hook.
 */
export function useQuoteSaver() {
  const mutation = useSaveQuote();
  const [pending, setPending] = useState<PendingScope | null>(null);
  const resolver = useRef<((scope: PriceScope | null) => void) | null>(null);

  function askScope(p: PendingScope): Promise<PriceScope | null> {
    return new Promise((resolve) => {
      resolver.current = resolve;
      setPending(p);
    });
  }

  function answer(scope: PriceScope | null) {
    resolver.current?.(scope);
    resolver.current = null;
    setPending(null);
  }

  async function save(payload: SaveQuotePayload): Promise<SaveQuoteResponse | null> {
    try {
      return await mutation.mutateAsync(payload);
    } catch (err) {
      const e = readQuoteSaveError(err);
      if (e.kind === 'group' && e.deviations.length > 0) {
        const scope = await askScope({ deviations: e.deviations, memberCount: e.memberCount });
        if (!scope) return null;
        return save(applyPriceScope(payload, e.deviations.map((d) => d.line_no), scope));
      }
      toast.error(e.message);
      return null;
    }
  }

  const sheet = (
    <GroupPriceSheet
      open={!!pending}
      deviations={pending?.deviations ?? []}
      memberCount={pending?.memberCount ?? 0}
      onCancel={() => answer(null)}
      onChoose={(scope) => answer(scope)}
    />
  );

  return { save, sheet, isSaving: mutation.isPending };
}
