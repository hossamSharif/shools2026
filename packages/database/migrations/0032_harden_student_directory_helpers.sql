-- ============================================================================
-- 0032_harden_student_directory_helpers (students section enhancement, follow-up)
-- Closes the Supabase advisor warnings raised by 0028/0030.
--
-- 1. `ar_normalize` / `digits_only` had a role-mutable search_path
--    (lint 0011_function_search_path_mutable). They back the expression
--    indexes on `student`, so this uses ALTER FUNCTION ... SET rather than
--    CREATE OR REPLACE: the body — and therefore every indexed value — is
--    untouched, so no reindex is implied. `digits_only` calls
--    `public.ar_normalize`, hence `public` stays on its path.
--
-- 2. `guard_student_delete` is a trigger function but was still EXECUTE-able
--    by `authenticated` over /rest/v1/rpc (lint 0029). Calling it outside
--    trigger context does nothing useful; least privilege says revoke it.
--
-- Known and accepted: `pg_trgm` sits in `public` (lint 0014_extension_in_public).
-- That is deliberate — see the note in 0028. The operator class `gin_trgm_ops`
-- has to be resolvable from the pinned `search_path = public` of the functions
-- that use the trigram index.
-- ============================================================================

alter function public.ar_normalize(text) set search_path = pg_catalog;
alter function public.digits_only(text)  set search_path = public, pg_catalog;

revoke execute on function public.guard_student_delete() from authenticated;
