import { describe, it, expect } from 'vitest';
import {
  prettyScientificName,
  cleanSizeSummary,
  fallbackVariantLabel,
  pickPlantName,
  sizeDetails,
  sizeDetailsString,
} from './plant-display';

describe('prettyScientificName', () => {
  it('Title-cases ALL-CAPS-WITH-HYPHENS', () => {
    expect(prettyScientificName('LANTANA-MONTEVIDENSIS')).toBe('Lantana montevidensis');
  });

  it('handles underscores', () => {
    expect(prettyScientificName('OLEA_EUROPAEA')).toBe('Olea europaea');
  });

  it('leaves already-pretty names alone', () => {
    expect(prettyScientificName('Lantana montevidensis')).toBe('Lantana montevidensis');
  });

  it('preserves cultivar quotes in well-cased input', () => {
    expect(prettyScientificName("Olea europaea 'Frantoio'")).toBe("Olea europaea 'Frantoio'");
  });

  it('returns empty for null/empty', () => {
    expect(prettyScientificName(null)).toBe('');
    expect(prettyScientificName('')).toBe('');
    expect(prettyScientificName('   ')).toBe('');
  });
});

describe('cleanSizeSummary', () => {
  it('passes through a healthy summary unchanged', () => {
    expect(cleanSizeSummary('P5L · H20-50')).toBe('P5L · H20-50');
  });

  it('drops tokens containing null', () => {
    expect(cleanSizeSummary('PnullL · H2-5')).toBe('H2-5');
  });

  it('returns null when every token contained null', () => {
    expect(cleanSizeSummary('PnullL · Hnull-5')).toBeNull();
  });

  it('returns null for empty/nullish input', () => {
    expect(cleanSizeSummary(null)).toBeNull();
    expect(cleanSizeSummary('')).toBeNull();
  });
});

describe('fallbackVariantLabel', () => {
  it('extracts the first __-separated token and pretty-cases it', () => {
    expect(fallbackVariantLabel('LANTANA-MONTEVIDENSIS__OTHER__BUSH__PnullL')).toBe(
      'Lantana montevidensis',
    );
  });

  it('returns a sensible default for null/empty', () => {
    expect(fallbackVariantLabel(null)).toBe('Παραλλαγή');
    expect(fallbackVariantLabel('')).toBe('Παραλλαγή');
  });
});

describe('pickPlantName', () => {
  it('uses Greek common name as primary, scientific as secondary', () => {
    expect(pickPlantName({ scientific_name: 'Pelargonium graveolens', common_name: 'Αρμπαρόριζα' }))
      .toEqual({ primary: 'Αρμπαρόριζα', secondary: 'Pelargonium graveolens' });
  });

  it('promotes scientific to primary when common is missing', () => {
    expect(pickPlantName({ scientific_name: 'Olea europaea', common_name: '' }))
      .toEqual({ primary: 'Olea europaea', secondary: null });
    expect(pickPlantName({ scientific_name: 'Olea europaea', common_name: null }))
      .toEqual({ primary: 'Olea europaea', secondary: null });
  });

  it('Title-cases ALL-CAPS scientific names when promoted', () => {
    expect(pickPlantName({ scientific_name: 'OLEA-EUROPAEA', common_name: null }))
      .toEqual({ primary: 'Olea europaea', secondary: null });
  });

  it('suppresses secondary when common === scientific', () => {
    expect(pickPlantName({ scientific_name: 'Lantana', common_name: 'Lantana' }))
      .toEqual({ primary: 'Lantana', secondary: null });
  });

  it('returns a safe default for empty input', () => {
    expect(pickPlantName(null)).toEqual({ primary: 'Φυτό', secondary: null });
    expect(pickPlantName({})).toEqual({ primary: 'Φυτό', secondary: null });
  });
});

describe('sizeDetails', () => {
  it('returns pot + height + girth when all present', () => {
    expect(sizeDetails({
      pot_volume_l: 5,
      height_min_cm: 20, height_max_cm: 50,
      girth_min_cm: 8,  girth_max_cm: 10,
    })).toEqual(['P 5L', 'H 20–50 CM', 'G 8–10 CM']);
  });

  it('skips height when min === max === 1 (placeholder)', () => {
    expect(sizeDetails({
      pot_volume_l: 5,
      height_min_cm: 1, height_max_cm: 1,
    })).toEqual(['P 5L']);
  });

  it('skips girth when min === max === 1', () => {
    expect(sizeDetails({
      pot_volume_l: 5,
      height_min_cm: 20, height_max_cm: 50,
      girth_min_cm: 1,  girth_max_cm: 1,
    })).toEqual(['P 5L', 'H 20–50 CM']);
  });

  it('collapses range when min === max but ≠ 1', () => {
    expect(sizeDetails({
      pot_volume_l: 5,
      height_min_cm: 60, height_max_cm: 60,
    })).toEqual(['P 5L', 'H 60 CM']);
  });

  it('formats integer pot without decimals', () => {
    expect(sizeDetails({ pot_volume_l: 45 })).toEqual(['P 45L']);
  });

  it('keeps one decimal place for fractional pots', () => {
    expect(sizeDetails({ pot_volume_l: 1.5 })).toEqual(['P 1.5L']);
  });

  it('returns empty array when everything is missing or placeholder', () => {
    expect(sizeDetails({
      pot_volume_l: null,
      height_min_cm: 1, height_max_cm: 1,
      girth_min_cm: 1, girth_max_cm: 1,
    })).toEqual([]);
  });
});

describe('sizeDetailsString', () => {
  it('joins parts with " · " separator', () => {
    expect(sizeDetailsString({
      pot_volume_l: 5, height_min_cm: 20, height_max_cm: 50,
    })).toBe('P 5L · H 20–50 CM');
  });

  it('returns null when there are no tokens', () => {
    expect(sizeDetailsString({})).toBeNull();
  });
});
