-- ============================================================================
-- 0033_user_role_values (spec 002, data-model §1, research R2).
-- Adds the new staff roles (principal, student_affairs, teacher) and reserves
-- the portal roles (guardian, student). Its own migration: a value added with
-- ALTER TYPE ... ADD VALUE cannot be used in the transaction that adds it.
-- Precedes RLS changes ⇒ OWNER REVIEW before apply (Article XII).
-- ============================================================================

alter type public.user_role add value if not exists 'principal';
alter type public.user_role add value if not exists 'student_affairs';
alter type public.user_role add value if not exists 'teacher';
alter type public.user_role add value if not exists 'guardian';
alter type public.user_role add value if not exists 'student';
