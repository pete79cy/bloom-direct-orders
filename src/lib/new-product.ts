/**
 * «Νέο προϊόν» from the phone: shape the form into the two Bloom calls the
 * desktop "New Product" dialog makes — POST /api/plants, then
 * POST /api/plants/:id/variants — so every catalogue rule stays server side.
 *
 * generatePlantCode / transliterateGreek / generateVariantCode MIRROR
 * bloom-crm's src/lib/plant-utils.ts (plant + non-plant branches, POT unit).
 * The server treats variant_code as the duplicate key, so the code must come
 * out byte-identical to the desktop's for the same specs.
 */

import type { VatRate } from './vat';

export type ProductKind = 'plant' | 'pot' | 'other';
export type PlantType = 'TREE' | 'SHRUB' | 'PALM' | 'PERENNIAL' | 'GRASS' | 'CLIMBER' | 'OTHER';

export const PRODUCT_KIND_LABEL: Record<ProductKind, string> = {
  plant: 'Φυτό',
  pot: 'Γλάστρα',
  other: 'Άλλο',
};

export const PLANT_TYPE_LABEL: Record<PlantType, string> = {
  SHRUB: 'Θάμνος',
  TREE: 'Δέντρο',
  PALM: 'Φοίνικας',
  PERENNIAL: 'Πολυετές',
  GRASS: 'Γρασίδι',
  CLIMBER: 'Αναρριχώμενο',
  OTHER: 'Άλλο',
};

/** Pot sizes the nursery sells most — one tap instead of typing. */
export const COMMON_POT_SIZES_L = [1.5, 3, 5, 10, 18, 25, 35, 50, 70, 100];

export function generatePlantCode(scientificName: string): string {
  return scientificName
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '-')
    .replace(/[^A-Z0-9-]/g, '');
}

const GREEK_TO_LATIN: Record<string, string> = {
  'α': 'a', 'β': 'v', 'γ': 'g', 'δ': 'd', 'ε': 'e', 'ζ': 'z', 'η': 'i', 'θ': 'th',
  'ι': 'i', 'κ': 'k', 'λ': 'l', 'μ': 'm', 'ν': 'n', 'ξ': 'x', 'ο': 'o', 'π': 'p',
  'ρ': 'r', 'σ': 's', 'ς': 's', 'τ': 't', 'υ': 'y', 'φ': 'f', 'χ': 'ch', 'ψ': 'ps', 'ω': 'o',
};

export function transliterateGreek(text: string): string {
  const lower = String(text || '').toLowerCase();
  const stripped = lower.normalize('NFD').replace(/[̀-ͯ]/g, '');
  let out = '';
  for (const ch of stripped) out += GREEK_TO_LATIN[ch] ?? ch;
  return out
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export interface NewProductForm {
  /** Greek common name — what the team types first. */
  commonName: string;
  /** Botanical name; optional, falls back to the common name as on desktop. */
  scientificName: string;
  kind: ProductKind;
  plantType: PlantType;
  potVolumeL: number | null;
  heightMinCm: number | null;
  heightMaxCm: number | null;
  unitPrice: number;
  vatRate: VatRate;
  notes: string;
}

export const EMPTY_PRODUCT_FORM: NewProductForm = {
  commonName: '',
  scientificName: '',
  kind: 'plant',
  plantType: 'SHRUB',
  potVolumeL: null,
  heightMinCm: null,
  heightMaxCm: null,
  unitPrice: 0,
  vatRate: 19,
  notes: '',
};

/** First blocking problem, in the user's words, or null when the form saves. */
export function validateProductForm(f: NewProductForm): string | null {
  if (f.commonName.trim().length < 2) return 'Γράψτε το όνομα του προϊόντος.';
  if (f.kind === 'plant') {
    if (f.potVolumeL == null || !(f.potVolumeL > 0)) return 'Διαλέξτε μέγεθος γλάστρας.';
    const min = f.heightMinCm;
    const max = f.heightMaxCm;
    if ((min == null) !== (max == null)) return 'Συμπληρώστε και τα δύο όρια ύψους.';
    if (min != null && max != null && (min < 0 || max < min)) return 'Το ύψος «έως» πρέπει να είναι ≥ «από».';
  }
  return null;
}

export interface PlantCreateBody {
  scientific_name: string;
  common_name: string;
  category: string;
  notes: string;
  default_vat_rate: number;
  product_kind: ProductKind;
}

export interface VariantCreateBody {
  variant_code: string;
  plant_type: PlantType | 'OTHER';
  form: 'OTHER';
  pot_volume_l: number;
  height_min_cm: number;
  height_max_cm: number;
  unit_of_measure: 'POT';
  attributes: Record<string, never>;
}

/** The desktop stores an unknown height as 1–1; sizeDetails() hides it. */
const UNKNOWN_HEIGHT = 1;

export function buildPlantBody(f: NewProductForm): PlantCreateBody {
  const common = f.commonName.trim();
  const sci = f.scientificName.trim() || common;
  return {
    scientific_name: sci,
    common_name: common,
    category: f.kind === 'plant' ? 'Other' : f.kind === 'pot' ? 'Pots' : 'Other',
    notes: f.notes.trim(),
    default_vat_rate: f.vatRate,
    product_kind: f.kind,
  };
}

export function buildVariantBody(f: NewProductForm): VariantCreateBody {
  const plant = buildPlantBody(f);
  if (f.kind !== 'plant') {
    const prefix = f.kind === 'pot' ? 'POT' : 'OTH';
    const slug = transliterateGreek(plant.scientific_name);
    return {
      variant_code: slug ? `${prefix}-${slug}` : prefix,
      plant_type: 'OTHER',
      form: 'OTHER',
      pot_volume_l: 0,
      height_min_cm: 0,
      height_max_cm: 0,
      unit_of_measure: 'POT',
      attributes: {},
    };
  }
  const pot = f.potVolumeL ?? 0;
  const hMin = f.heightMinCm ?? UNKNOWN_HEIGHT;
  const hMax = f.heightMaxCm ?? UNKNOWN_HEIGHT;
  const code = [generatePlantCode(plant.scientific_name), f.plantType, 'OTHER', `P${pot}L`, `H${hMin}-${hMax}`]
    .filter(Boolean)
    .join('__');
  return {
    variant_code: code,
    plant_type: f.plantType,
    form: 'OTHER',
    pot_volume_l: pot,
    height_min_cm: hMin,
    height_max_cm: hMax,
    unit_of_measure: 'POT',
    attributes: {},
  };
}

/** Short size line for the success card ("P 5L · H 40–60 CM"). */
export function describeProductSize(f: NewProductForm): string | null {
  if (f.kind !== 'plant' || f.potVolumeL == null) return null;
  const parts = [`P ${f.potVolumeL}L`];
  if (f.heightMinCm != null && f.heightMaxCm != null) {
    parts.push(f.heightMinCm === f.heightMaxCm ? `H ${f.heightMinCm} CM` : `H ${f.heightMinCm}–${f.heightMaxCm} CM`);
  }
  return parts.join(' · ');
}

/** Response of POST /api/botanical-lookup, as much of it as the form reads. */
export interface BotanicalLookup {
  result: {
    primary: { scientific_name: string; common_name_el?: string | null; confidence?: number } | null;
    alternatives: Array<{ scientific_name: string; common_name_el?: string | null }>;
  } | null;
}

/** Candidate botanical names to offer, best first, de-duplicated. */
export function botanicalCandidates(res: BotanicalLookup): string[] {
  const out: string[] = [];
  const push = (s: string | undefined | null) => {
    const v = (s ?? '').trim();
    if (v && !out.includes(v)) out.push(v);
  };
  push(res.result?.primary?.scientific_name);
  for (const a of res.result?.alternatives ?? []) push(a.scientific_name);
  return out;
}
