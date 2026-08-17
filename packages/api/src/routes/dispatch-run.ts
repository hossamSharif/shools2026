import { Router, type Router as RouterType } from 'express';
import { DispatchRunInput, type DispatchRunOutput } from '@erp/shared';
import { createSupabaseServiceClient } from '../supabase.js';
import { runDispatchForSchool } from '../dispatch/run-dispatch.js';
import { getSmsProvider } from '../providers/index.js';
import { requireInternalToken } from '../middleware/internal-auth.js';
import { requireSmsEnabled } from '../middleware/sms-enabled.js';

/**
 * POST /internal/dispatch/run (T117) — token-protected. Runs the reminder
 * dispatch for one school (if `school_id` given) or every school, honoring
 * write-gating (paused schools are skipped) and credit-depletion (stops
 * cleanly). Zod-validated in/out per contracts/worker-endpoints.md.
 */
export const dispatchRunRouter: RouterType = Router();

// requireSmsEnabled sits after the token check so an unauthenticated caller
// still just gets 401 and learns nothing about the deployment's state.
dispatchRunRouter.post(
  '/internal/dispatch/run',
  requireInternalToken,
  requireSmsEnabled,
  async (req, res) => {
    const parsed = DispatchRunInput.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: 'INVALID_INPUT', details: parsed.error.flatten() });
    }

    const supabase = createSupabaseServiceClient();
    const provider = getSmsProvider();

    let schoolIds: string[];
    if (parsed.data.school_id) {
      schoolIds = [parsed.data.school_id];
    } else {
      const { data, error } = await supabase.from('school').select('id');
      if (error) return res.status(500).json({ error: 'INTERNAL_ERROR' });
      schoolIds = (data ?? []).map((s) => s.id);
    }

    const results: DispatchRunOutput['results'] = [];
    for (const schoolId of schoolIds) {
      try {
        results.push(await runDispatchForSchool(supabase, provider, schoolId));
      } catch {
        results.push({
          school_id: schoolId,
          outcome: 'stopped',
          matched: 0,
          sent: 0,
          skipped_no_phone: 0,
          failed: 0,
        });
      }
    }

    return res.json({ results } satisfies DispatchRunOutput);
  },
);
