import { Route, Routes } from 'react-router';

import { RequireSession } from '@/features/auth/RequireSession';
import { HomePage } from '@/pages/home/HomePage';
import { AccountingPage } from '@/pages/panel/accounting/AccountingPage';
import { AuditPage } from '@/pages/panel/audit/AuditPage';
import { UsersPage } from '@/pages/panel/users/UsersPage';
import { BillingPage } from '@/pages/panel/billing/BillingPage';
import { ChangePasswordPage } from '@/pages/panel/ChangePasswordPage';
import { ImportPage } from '@/pages/panel/import/ImportPage';
import { ClassesPage } from '@/pages/panel/classes/ClassesPage';
import { PanelHomePage } from '@/pages/panel/PanelHomePage';
import { TeacherPage } from '@/pages/panel/payroll/TeacherPage';
import { TeachersPayPage } from '@/pages/panel/payroll/TeachersPayPage';
import { PanelLayout } from '@/pages/panel/PanelLayout';
import { StudentPanel } from '@/pages/panel/students/StudentPanel';
import { StudentsPage } from '@/pages/panel/students/StudentsPage';
import { PendingDataPage } from '@/pages/panel/students/PendingDataPage';

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/panel" element={<RequireSession />}>
        <Route path="cambiar-contrasena" element={<ChangePasswordPage />} />
        <Route element={<PanelLayout />}>
          <Route index element={<PanelHomePage />} />
          <Route path="clases" element={<ClassesPage />} />
          <Route path="cobros" element={<BillingPage />} />
          <Route path="profesores" element={<TeachersPayPage />} />
          <Route path="profesores/:id" element={<TeacherPage />} />
          <Route path="contabilidad" element={<AccountingPage />} />
          <Route path="historial" element={<AuditPage />} />
          <Route path="usuarios" element={<UsersPage />} />
          <Route path="importar" element={<ImportPage />} />
          <Route path="alumnos/pendientes" element={<PendingDataPage />} />
          <Route path="alumnos" element={<StudentsPage />}>
            <Route path=":id" element={<StudentPanel />} />
          </Route>
        </Route>
      </Route>
    </Routes>
  );
}
