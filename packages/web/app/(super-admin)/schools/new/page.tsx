import { SchoolForm } from '../../../../components/super-admin/school-form.js';

export default function NewSchoolPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">مدرسة جديدة</h1>
      <SchoolForm />
    </div>
  );
}
