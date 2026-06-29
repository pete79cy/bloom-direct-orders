import { apiFetch } from './api';

/** Persist a line's chosen VAT as the plant's default on the bloom-crm API.
 *  Best-effort: a failure just means the default isn't remembered next time. */
export function savePlantVatDefault(plantId: string, rate: number): void {
  apiFetch(`/api/plants/${encodeURIComponent(plantId)}/vat-default`, {
    method: 'PATCH',
    body: JSON.stringify({ default_vat_rate: rate }),
  }).catch(() => { /* ignore */ });
}
