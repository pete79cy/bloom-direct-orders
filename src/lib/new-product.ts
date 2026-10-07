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
export type PlantType = 'TREE' | 'SHRUB' | 'PALM' | 'PERENNIAL' | 'GRASS' | 'CLIMBER' | 'STEM' | 'OTHER';
export type PlantForm = 'BUSH' | 'CLUMP' | 'STEM' | 'SINGLE_STEM' | 'MULTI_STEM' | 'STANDARD_STEM' | 'OTHER';

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
  STEM: 'Κορμός',
  OTHER: 'Άλλο',
};

export const PLANT_FORM_LABEL: Record<PlantForm, string> = {
  BUSH: 'Θάμνος',
  CLUMP: 'Συστάδα',
  STEM: 'Κορμός',
  SINGLE_STEM: 'Μονός κορμός',
  MULTI_STEM: 'Πολύκορμο',
  STANDARD_STEM: 'Standard',
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

/** Specs of a pot / other good — the desktop's attribute set. */
export interface NonPlantAttributes {
  diameter_cm: number | null;
  height_cm: number | null;
  material: string;
  color: string;
}

export interface NewProductForm {
  /** Greek common name — what the team types first. */
  commonName: string;
  /** Botanical name; optional, falls back to the common name as on desktop. */
  scientificName: string;
  kind: ProductKind;
  plantType: PlantType;
  form: PlantForm;
  pcsPerPot: number | null;
  potVolumeL: number | null;
  heightMinCm: number | null;
  heightMaxCm: number | null;
  girthMinCm: number | null;
  girthMaxCm: number | null;
  grade: string;
  attributes: NonPlantAttributes;
  /** Variant note (desktop "Variant Notes"), e.g. «χωρίς γλάστρα». */
  variantNote: string;
  unitPrice: number;
  vatRate: VatRate;
  /** Plant note (desktop "notes" on the product) — new product only. */
  notes: string;
  /** Optional sourcing: who supplies it and at what cost. */
  supplierId: string | null;
  supplierSku: string;
  supplierCost: number | null;
}

/** The product a new sub-product (variant) hangs off. */
export interface ParentProduct {
  scientific_name: string;
  product_kind?: ProductKind | null;
}

export const EMPTY_PRODUCT_FORM: NewProductForm = {
  commonName: '',
  scientificName: '',
  kind: 'plant',
  plantType: 'SHRUB',
  form: 'BUSH',
  pcsPerPot: null,
  potVolumeL: null,
  heightMinCm: null,
  heightMaxCm: null,
  girthMinCm: null,
  girthMaxCm: null,
  grade: '',
  attributes: { diameter_cm: null, height_cm: null, material: '', color: '' },
  variantNote: '',
  unitPrice: 0,
  vatRate: 19,
  notes: '',
  supplierId: null,
  supplierSku: '',
  supplierCost: null,
};

/** Type/form most of a product's existing sizes share — a sub-product almost
 *  always matches its siblings, so the picker pre-fills them. */
export function inheritedSpecs(
  siblings: readonly { plant_type?: string | null; form?: string | null }[],
): Pick<NewProductForm, 'plantType' | 'form'> | null {
  if (siblings.length === 0) return null;
  const mode = <T extends string>(values: (string | null | undefined)[], allowed: readonly T[], fallback: T): T => {
    const counts = new Map<string, number>();
    for (const v of values) if (v && (allowed as readonly string[]).includes(v)) counts.set(v, (counts.get(v) ?? 0) + 1);
    let best: T = fallback;
    let n = 0;
    for (const [v, c] of counts) if (c > n) { best = v as T; n = c; }
    return best;
  };
  return {
    plantType: mode(siblings.map((s) => s.plant_type), Object.keys(PLANT_TYPE_LABEL) as PlantType[], 'SHRUB'),
    form: mode(siblings.map((s) => s.form), Object.keys(PLANT_FORM_LABEL) as PlantForm[], 'BUSH'),
  };
}

/** First blocking problem with the size/spec fields, or null. `kind` is the
 *  parent's kind for a sub-product, the form's for a new product. */
export function validateSpecs(f: NewProductForm, kind: ProductKind = f.kind): string | null {
  if (kind === 'plant') {
    if (f.potVolumeL == null || !(f.potVolumeL > 0)) return 'Διαλέξτε μέγεθος γλάστρας.';
    const min = f.heightMinCm;
    const max = f.heightMaxCm;
    if ((min == null) !== (max == null)) return 'Συμπληρώστε και τα δύο όρια ύψους.';
    if (min != null && max != null && (min < 0 || max < min)) return 'Το ύψος «έως» πρέπει να είναι ≥ «από».';
    if ((f.girthMinCm == null) !== (f.girthMaxCm == null)) return 'Συμπληρώστε και τα δύο όρια περιμέτρου.';
    if (f.girthMinCm != null && f.girthMaxCm != null && (f.girthMinCm < 0 || f.girthMaxCm < f.girthMinCm)) return 'Η περίμετρος «έως» πρέπει να είναι ≥ «από».';
    if (f.pcsPerPot != null && f.pcsPerPot < 1) return 'Τα τεμάχια ανά γλάστρα πρέπει να είναι ≥ 1.';
  }
  if (f.supplierCost != null && !f.supplierId) return 'Διαλέξτε προμηθευτή για την τιμή αγοράς.';
  return null;
}

/** First blocking problem, in the user's words, or null when the form saves. */
export function validateProductForm(f: NewProductForm): string | null {
  if (f.commonName.trim().length < 2) return 'Γράψτε το όνομα του προϊόντος.';
  return validateSpecs(f);
}

/** A sub-product needs a parent and specs that differ from the parent's
 *  existing sizes (the server would silently return the duplicate). */
export function validateSubproductForm(
  f: NewProductForm,
  parent: ParentProduct | null,
  existingCodes: readonly string[],
): string | null {
  if (!parent) return 'Διαλέξτε το προϊόν.';
  const specs = validateSpecs(f, parent.product_kind ?? 'plant');
  if (specs) return specs;
  if (existingCodes.includes(buildVariantBody(f, parent).variant_code)) return 'Αυτό το μέγεθος υπάρχει ήδη.';
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
  form: PlantForm | 'OTHER';
  pcs_per_pot: number | null;
  pot_volume_l: number;
  height_min_cm: number;
  height_max_cm: number;
  girth_min_cm: number | null;
  girth_max_cm: number | null;
  grade: string;
  note: string;
  unit_of_measure: 'POT';
  attributes: Record<string, string | number>;
}

/** The desktop's optional third and fourth calls after the variant. */
export interface SupplierLinkBodies {
  product: { supplier_id: string; variant_id: string; supplier_sku: string; supplier_name_text: string };
  price: { cost_price: number; currency: 'EUR' } | null;
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

/** Attributes the server keeps (empty ones dropped) and the desktop's
 *  "D{n}__H{n}__{MATERIAL}__{COLOR}" code suffix built from them. */
function nonPlantAttributes(a: NonPlantAttributes): { attributes: Record<string, string | number>; suffix: string[] } {
  const attributes: Record<string, string | number> = {};
  const suffix: string[] = [];
  if (a.diameter_cm != null) { attributes.diameter_cm = a.diameter_cm; suffix.push(`D${a.diameter_cm}`); }
  if (a.height_cm != null) { attributes.height_cm = a.height_cm; suffix.push(`H${a.height_cm}`); }
  for (const key of ['material', 'color'] as const) {
    const v = a[key].trim();
    if (!v) continue;
    attributes[key] = v;
    const slug = transliterateGreek(v);
    if (slug) suffix.push(slug);
  }
  return { attributes, suffix };
}

/** `parent` is set for a sub-product: the variant takes the existing
 *  product's name and kind instead of the form's. */
export function buildVariantBody(f: NewProductForm, parent?: ParentProduct): VariantCreateBody {
  const base = parent ?? buildPlantBody(f);
  const kind: ProductKind = parent ? (parent.product_kind ?? 'plant') : f.kind;
  if (kind !== 'plant') {
    const prefix = kind === 'pot' ? 'POT' : 'OTH';
    const slug = transliterateGreek(base.scientific_name);
    const { attributes, suffix } = nonPlantAttributes(f.attributes);
    return {
      variant_code: [slug ? `${prefix}-${slug}` : prefix, ...suffix].join('__'),
      plant_type: 'OTHER',
      form: 'OTHER',
      pcs_per_pot: null,
      pot_volume_l: 0,
      height_min_cm: 0,
      height_max_cm: 0,
      girth_min_cm: null,
      girth_max_cm: null,
      grade: '',
      note: f.variantNote.trim(),
      unit_of_measure: 'POT',
      attributes,
    };
  }
  const pot = f.potVolumeL ?? 0;
  const hMin = f.heightMinCm ?? UNKNOWN_HEIGHT;
  const hMax = f.heightMaxCm ?? UNKNOWN_HEIGHT;
  const grade = f.grade.trim();
  const parts = [
    generatePlantCode(base.scientific_name),
    f.plantType,
    f.form,
    f.pcsPerPot != null && f.pcsPerPot > 0 ? `${f.pcsPerPot}PC` : '',
    `P${pot}L`,
    `H${hMin}-${hMax}`,
  ].filter(Boolean);
  if (f.girthMinCm != null && f.girthMaxCm != null) parts.push(`G${f.girthMinCm}-${f.girthMaxCm}`);
  if (grade) parts.push(grade.toUpperCase());
  return {
    variant_code: parts.join('__'),
    plant_type: f.plantType,
    form: f.form,
    pcs_per_pot: f.pcsPerPot,
    pot_volume_l: pot,
    height_min_cm: hMin,
    height_max_cm: hMax,
    girth_min_cm: f.girthMinCm,
    girth_max_cm: f.girthMaxCm,
    grade,
    note: f.variantNote.trim(),
    unit_of_measure: 'POT',
    attributes: {},
  };
}

/** Supplier link + cost for the created variant, or null when no supplier
 *  was chosen. supplier_name_text follows the desktop default:
 *  "common - scientific - Pot 5L - Height 20-40 cm". */
export function buildSupplierLink(
  f: NewProductForm,
  variantId: string,
  names: { common_name?: string | null; scientific_name: string },
): SupplierLinkBodies | null {
  if (!f.supplierId) return null;
  const spec = [
    f.potVolumeL != null ? `Pot ${f.potVolumeL}L` : null,
    f.heightMinCm != null && f.heightMaxCm != null ? `Height ${f.heightMinCm}-${f.heightMaxCm} cm` : null,
    f.girthMinCm != null && f.girthMaxCm != null ? `Girth ${f.girthMinCm}-${f.girthMaxCm} cm` : null,
  ].filter(Boolean).join(' - ');
  return {
    product: {
      supplier_id: f.supplierId,
      variant_id: variantId,
      supplier_sku: f.supplierSku.trim(),
      supplier_name_text: [names.common_name?.trim(), names.scientific_name.trim(), spec].filter(Boolean).join(' - '),
    },
    price: f.supplierCost != null && f.supplierCost >= 0 ? { cost_price: f.supplierCost, currency: 'EUR' } : null,
  };
}

/** Short size line for the success card ("P 5L · H 40–60 CM", "Ø 30 CM · Τερακότα"). */
export function describeProductSize(f: NewProductForm, kind: ProductKind = f.kind): string | null {
  if (kind !== 'plant') {
    const a = f.attributes;
    const parts = [
      a.diameter_cm != null ? `Ø ${a.diameter_cm} CM` : null,
      a.height_cm != null ? `H ${a.height_cm} CM` : null,
      a.material.trim() || null,
      a.color.trim() || null,
    ].filter(Boolean);
    return parts.length ? parts.join(' · ') : null;
  }
  if (f.potVolumeL == null) return null;
  const parts = [`P ${f.potVolumeL}L`];
  if (f.heightMinCm != null && f.heightMaxCm != null) {
    parts.push(f.heightMinCm === f.heightMaxCm ? `H ${f.heightMinCm} CM` : `H ${f.heightMinCm}–${f.heightMaxCm} CM`);
  }
  if (f.girthMinCm != null && f.girthMaxCm != null) {
    parts.push(f.girthMinCm === f.girthMaxCm ? `G ${f.girthMinCm} CM` : `G ${f.girthMinCm}–${f.girthMaxCm} CM`);
  }
  if (f.pcsPerPot != null && f.pcsPerPot > 1) parts.push(`${f.pcsPerPot} τεμ.`);
  if (f.grade.trim()) parts.push(f.grade.trim().toUpperCase());
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
