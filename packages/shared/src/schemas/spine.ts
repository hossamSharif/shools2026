import { z } from 'zod';
import { Money, Uuid } from './primitives.js';

/** School-spine schemas (US2). Boundary validation — Article XI. */

export const CreateAcademicYearInput = z.object({
  label: z.string().min(1, 'اسم السنة الدراسية مطلوب').max(50),
  is_current: z.boolean().default(false),
});
export type CreateAcademicYearInput = z.infer<typeof CreateAcademicYearInput>;

export const CreateSectionInput = z.object({
  grade_id: Uuid,
  name: z.string().min(1, 'اسم الشعبة مطلوب').max(50),
});
export type CreateSectionInput = z.infer<typeof CreateSectionInput>;

export const StudentStatus = z.enum(['active', 'withdrawn', 'graduated']);
export type StudentStatus = z.infer<typeof StudentStatus>;

// Sudanese guardian phone: optional; accepts local/international digit forms.
const GuardianPhone = z
  .string()
  .regex(/^\+?\d{7,15}$/, 'رقم هاتف غير صالح')
  .optional()
  .or(z.literal('').transform(() => undefined));

export const StudentInput = z.object({
  name: z.string().min(1, 'اسم الطالب مطلوب').max(200),
  guardian_name: z.string().max(200).optional(),
  guardian_phone: GuardianPhone,
  photo_path: z.string().optional(),
  status: StudentStatus.default('active'),
});
export type StudentInput = z.infer<typeof StudentInput>;

export const AccountType = z.enum(['cash', 'bank']);
export type AccountType = z.infer<typeof AccountType>;

export const SchoolLogoInput = z.object({
  logo_path: z.string().min(1).max(500),
});
export type SchoolLogoInput = z.infer<typeof SchoolLogoInput>;

export const AccountInput = z
  .object({
    name: z.string().min(1, 'اسم الحساب مطلوب').max(100),
    type: AccountType,
    account_number: z.string().max(50).optional(),
    opening_balance: Money.default('0'),
  })
  .refine((v) => v.type === 'cash' || !!v.account_number, {
    message: 'رقم الحساب مطلوب للحسابات البنكية',
    path: ['account_number'],
  });
export type AccountInput = z.infer<typeof AccountInput>;

const ScheduleEntry = z.object({
  sequence: z.number().int().positive(),
  due_date: z.string().date(),
  amount: Money,
});

export const FeeStructureInput = z.object({
  grade_id: Uuid,
  academic_year_id: Uuid,
  items: z
    .array(z.object({ name: z.string().min(1), amount: Money }))
    .min(1, 'أضف عنصر رسوم واحد على الأقل'),
  schedule: z.array(ScheduleEntry).min(1, 'أضف قسطاً واحداً على الأقل'),
});
export type FeeStructureInput = z.infer<typeof FeeStructureInput>;

export const EnrollStudentInput = z.object({
  student_id: Uuid,
  grade_id: Uuid,
  section_id: Uuid,
  academic_year_id: Uuid,
});
export type EnrollStudentInput = z.infer<typeof EnrollStudentInput>;
