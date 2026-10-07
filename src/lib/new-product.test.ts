import { describe, expect, it } from 'vitest';
import {
  EMPTY_PRODUCT_FORM, botanicalCandidates, buildPlantBody, buildSupplierLink, buildVariantBody, describeProductSize,
  generatePlantCode, inheritedSpecs, transliterateGreek, validateProductForm, validateSubproductForm, type NewProductForm,
} from './new-product';

const lavender: NewProductForm = {
  ...EMPTY_PRODUCT_FORM,
  commonName: ' Λεβάντα ',
  scientificName: 'Lavandula angustifolia',
  potVolumeL: 5,
  heightMinCm: 20,
  heightMaxCm: 40,
  unitPrice: 4.5,
  vatRate: 5,
};

describe('codes mirror bloom-crm', () => {
  it('generatePlantCode', () => {
    expect(generatePlantCode('Phoenix roebelenii')).toBe('PHOENIX-ROEBELENII');
    expect(generatePlantCode(' Citrus × limon ')).toBe('CITRUS--LIMON');
  });
  it('transliterateGreek', () => {
    expect(transliterateGreek('Γλάστρα Τερακότα Classic')).toBe('GLASTRA-TERAKOTA-CLASSIC');
    expect(transliterateGreek('...')).toBe('');
  });
});

describe('validateProductForm', () => {
  it('needs a name and, for plants, a pot size', () => {
    expect(validateProductForm(EMPTY_PRODUCT_FORM)).toMatch(/όνομα/);
    expect(validateProductForm({ ...EMPTY_PRODUCT_FORM, commonName: 'Λεβάντα' })).toMatch(/γλάστρας/);
    expect(validateProductForm(lavender)).toBeNull();
  });
  it('height must be a full, ordered range', () => {
    expect(validateProductForm({ ...lavender, heightMaxCm: null })).toMatch(/όρια/);
    expect(validateProductForm({ ...lavender, heightMinCm: 50 })).toMatch(/≥/);
    expect(validateProductForm({ ...lavender, heightMinCm: null, heightMaxCm: null })).toBeNull();
  });
  it('non-plants need only a name', () => {
    expect(validateProductForm({ ...EMPTY_PRODUCT_FORM, kind: 'pot', commonName: 'Γλάστρα 30' })).toBeNull();
  });
});

describe('bodies', () => {
  it('plant: trims names, falls back to the common name as botanical', () => {
    expect(buildPlantBody(lavender)).toMatchObject({
      scientific_name: 'Lavandula angustifolia', common_name: 'Λεβάντα', default_vat_rate: 5, product_kind: 'plant',
    });
    expect(buildPlantBody({ ...lavender, scientificName: '' }).scientific_name).toBe('Λεβάντα');
  });
  it('variant: desktop-identical code for a plant', () => {
    expect(buildVariantBody(lavender)).toEqual({
      variant_code: 'LAVANDULA-ANGUSTIFOLIA__SHRUB__BUSH__P5L__H20-40',
      plant_type: 'SHRUB', form: 'BUSH', pcs_per_pot: null, pot_volume_l: 5, height_min_cm: 20, height_max_cm: 40,
      girth_min_cm: null, girth_max_cm: null, grade: '', note: '', unit_of_measure: 'POT', attributes: {},
    });
  });
  it('variant: unknown height uses the 1–1 placeholder', () => {
    const v = buildVariantBody({ ...lavender, heightMinCm: null, heightMaxCm: null });
    expect(v.variant_code).toBe('LAVANDULA-ANGUSTIFOLIA__SHRUB__BUSH__P5L__H1-1');
    expect([v.height_min_cm, v.height_max_cm]).toEqual([1, 1]);
  });
  it('variant: full desktop code with pcs, girth and grade', () => {
    const v = buildVariantBody({ ...lavender, plantType: 'TREE', form: 'MULTI_STEM', pcsPerPot: 3, girthMinCm: 8, girthMaxCm: 10, grade: 'a', variantNote: ' χωρίς γλάστρα ' });
    expect(v.variant_code).toBe('LAVANDULA-ANGUSTIFOLIA__TREE__MULTI_STEM__3PC__P5L__H20-40__G8-10__A');
    expect(v).toMatchObject({ pcs_per_pot: 3, girth_min_cm: 8, girth_max_cm: 10, grade: 'a', note: 'χωρίς γλάστρα' });
  });
  it('variant: pots and other goods take the kind-prefixed code without dimensions', () => {
    const v = buildVariantBody({ ...EMPTY_PRODUCT_FORM, kind: 'pot', commonName: 'Γλάστρα Τερακότα' });
    expect(v).toMatchObject({ variant_code: 'POT-GLASTRA-TERAKOTA', pot_volume_l: 0, height_min_cm: 0, height_max_cm: 0 });
    expect(buildVariantBody({ ...EMPTY_PRODUCT_FORM, kind: 'other', commonName: '!!' }).variant_code).toBe('OTH');
  });
});

describe('display', () => {
  it('describeProductSize', () => {
    expect(describeProductSize(lavender)).toBe('P 5L · H 20–40 CM');
    expect(describeProductSize({ ...lavender, heightMaxCm: 20 })).toBe('P 5L · H 20 CM');
    expect(describeProductSize({ ...lavender, kind: 'pot' })).toBeNull();
  });
  it('botanicalCandidates: primary first, no duplicates, tolerates empty', () => {
    expect(botanicalCandidates({ result: null })).toEqual([]);
    expect(botanicalCandidates({
      result: {
        primary: { scientific_name: 'Laurus nobilis' },
        alternatives: [{ scientific_name: 'Nerium oleander' }, { scientific_name: 'Laurus nobilis' }],
      },
    })).toEqual(['Laurus nobilis', 'Nerium oleander']);
  });
});

describe('sub-product (variant of an existing product)', () => {
  const parentPlant = { scientific_name: 'Olea europaea', product_kind: 'plant' as const };
  const parentPot = { scientific_name: 'Γλάστρα Τερακότα', product_kind: 'pot' as const };
  const specs: NewProductForm = { ...EMPTY_PRODUCT_FORM, plantType: 'TREE', form: 'OTHER', potVolumeL: 35, heightMinCm: 150, heightMaxCm: 175 };

  it('takes the parent name and kind, ignores the form name', () => {
    expect(buildVariantBody({ ...specs, commonName: 'ignored' }, parentPlant).variant_code)
      .toBe('OLEA-EUROPAEA__TREE__OTHER__P35L__H150-175');
  });
  it('pot attributes build the desktop suffix and are sent', () => {
    const v = buildVariantBody({ ...EMPTY_PRODUCT_FORM, attributes: { diameter_cm: 30, height_cm: null, material: 'Τερακότα', color: '' } }, parentPot);
    expect(v.variant_code).toBe('POT-GLASTRA-TERAKOTA__D30__TERAKOTA');
    expect(v.attributes).toEqual({ diameter_cm: 30, material: 'Τερακότα' });
  });
  it('validateSubproductForm: parent, specs, then duplicate size', () => {
    expect(validateSubproductForm(specs, null, [])).toMatch(/προϊόν/);
    expect(validateSubproductForm({ ...specs, potVolumeL: null }, parentPlant, [])).toMatch(/γλάστρας/);
    expect(validateSubproductForm(specs, parentPlant, ['OLEA-EUROPAEA__TREE__OTHER__P35L__H150-175'])).toMatch(/υπάρχει/);
    expect(validateSubproductForm(specs, parentPlant, [])).toBeNull();
    expect(validateSubproductForm(EMPTY_PRODUCT_FORM, parentPot, [])).toBeNull();
  });
  it('describeProductSize for a pot', () => {
    expect(describeProductSize({ ...EMPTY_PRODUCT_FORM, attributes: { diameter_cm: 30, height_cm: 25, material: 'Τερακότα', color: '' } }, 'pot'))
      .toBe('Ø 30 CM · H 25 CM · Τερακότα');
  });
});

describe('supplier link', () => {
  it('nothing without a supplier; product + price with one', () => {
    expect(buildSupplierLink(lavender, 'v1', { common_name: 'Λεβάντα', scientific_name: 'Lavandula angustifolia' })).toBeNull();
    const link = buildSupplierLink(
      { ...lavender, supplierId: 's1', supplierSku: ' LAV-5 ', supplierCost: 2.1 },
      'v1',
      { common_name: 'Λεβάντα', scientific_name: 'Lavandula angustifolia' },
    );
    expect(link).toEqual({
      product: { supplier_id: 's1', variant_id: 'v1', supplier_sku: 'LAV-5', supplier_name_text: 'Λεβάντα - Lavandula angustifolia - Pot 5L - Height 20-40 cm' },
      price: { cost_price: 2.1, currency: 'EUR' },
    });
    expect(buildSupplierLink({ ...lavender, supplierId: 's1' }, 'v1', { scientific_name: 'X' })!.price).toBeNull();
  });
  it('a cost without a supplier is refused', () => {
    expect(validateProductForm({ ...lavender, supplierCost: 2 })).toMatch(/προμηθευτή/);
  });
});

describe('inheritedSpecs', () => {
  it('takes the siblings\' most common type and form', () => {
    expect(inheritedSpecs([])).toBeNull();
    expect(inheritedSpecs([
      { plant_type: 'TREE', form: 'SINGLE_STEM' }, { plant_type: 'TREE', form: 'MULTI_STEM' }, { plant_type: 'SHRUB', form: 'SINGLE_STEM' },
    ])).toEqual({ plantType: 'TREE', form: 'SINGLE_STEM' });
    expect(inheritedSpecs([{ plant_type: 'WEIRD', form: null }])).toEqual({ plantType: 'SHRUB', form: 'BUSH' });
  });
});
