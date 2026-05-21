import { describe, it, expect } from 'vitest';
import { prettyScientificName, cleanSizeSummary, fallbackVariantLabel } from './plant-display';

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
