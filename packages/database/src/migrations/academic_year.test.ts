import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getServiceClient, INTEGRATION_ENV_READY } from '../test-helpers/supabase.js';

/**
 * academic_year "exactly one current" invariant (T043 / US2). The partial unique
 * index `academic_year_one_current` (0005) must reject a SECOND is_current=true
 * year for the same school, while a DIFFERENT school keeps its own current year.
 *
 * Integration test (Article X): requires 0005 applied. Skips when env unset.
 */
const d = INTEGRATION_ENV_READY ? describe : describe.skip;

d('academic_year — one current per school', () => {
  const service = getServiceClient()!;
  let schoolA: string;
  let schoolB: string;

  beforeAll(async () => {
    const { data, error } = await service
      .from('school')
      .insert([
        { name: `t-ay-a-${Date.now()}` },
        { name: `t-ay-b-${Date.now()}` },
      ])
      .select('id');
    if (error) throw error;
    schoolA = data![0]!.id;
    schoolB = data![1]!.id;
  });

  afterAll(async () => {
    await service.from('academic_year').delete().in('school_id', [schoolA, schoolB]);
    if (schoolA) await service.from('school').delete().eq('id', schoolA);
    if (schoolB) await service.from('school').delete().eq('id', schoolB);
  });

  it('rejects a second is_current=true year for the same school', async () => {
    const first = await service
      .from('academic_year')
      .insert({ school_id: schoolA, label: '2025/2026', is_current: true })
      .select('id')
      .single();
    expect(first.error).toBeNull();

    // A second current year in the same school violates the partial unique index.
    const second = await service
      .from('academic_year')
      .insert({ school_id: schoolA, label: '2026/2027', is_current: true });
    expect(second.error).not.toBeNull();
    expect(second.error?.code).toBe('23505'); // unique_violation

    // A non-current year for the same school is fine (index only covers is_current).
    const nonCurrent = await service
      .from('academic_year')
      .insert({ school_id: schoolA, label: '2027/2028', is_current: false });
    expect(nonCurrent.error).toBeNull();
  });

  it('lets a different school have its own current year', async () => {
    const other = await service
      .from('academic_year')
      .insert({ school_id: schoolB, label: '2025/2026', is_current: true })
      .select('id')
      .single();
    expect(other.error).toBeNull();
    expect(other.data?.id).toBeTruthy();
  });
});
