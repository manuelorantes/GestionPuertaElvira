import { Route, Routes } from 'react-router';

import { RequireSession } from '@/features/auth/RequireSession';
import { RequireStaff } from '@/features/auth/RequireStaff';
import { HomePage } from '@/pages/home/HomePage';
import { AccountingPage } from '@/pages/panel/accounting/AccountingPage';
import { AuditPage } from '@/pages/panel/audit/AuditPage';
import { UsersPage } from '@/pages/panel/users/UsersPage';
import { SystemPage } from '@/pages/panel/system/SystemPage';
import { PointsPage } from '@/pages/panel/points/PointsPage';
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
import { RollCallPage } from '@/pages/panel/teacher/RollCallPage';
import { FridayListPage } from '@/pages/panel/teacher/FridayListPage';
import { TeacherPayPage } from '@/pages/panel/teacher/TeacherPayPage';
import { TeacherStudentsPage } from '@/pages/panel/teacher/TeacherStudentsPage';
import { PendingDataPage } from '@/pages/panel/students/PendingDataPage';

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/panel" element={<RequireSession />}>
        <Route path="cambiar-contrasena" element={<ChangePasswordPage />} />
        <Route element={<PanelLayout />}>
          <Route index element={<PanelHomePage />} />
          <Route path="mis-alumnos" element={<TeacherStudentsPage />} />
          <Route path="mis-pagos" element={<TeacherPayPage />} />
          <Route path="lista/:groupId/:date" element={<RollCallPage />} />
          <Route path="viernes/:dutyId/:date" element={<FridayListPage />} />
          <Route element={<RequireStaff />}>
            <Route path="clases" element={<ClassesPage />} />
            <Route path="cobros" element={<BillingPage />} />
            <Route path="profesores" element={<TeachersPayPage />} />
            <Route path="profesores/:id" element={<TeacherPage />} />
            <Route path="contabilidad" element={<AccountingPage />} />
            <Route path="historial" element={<AuditPage />} />
            <Route path="usuarios" element={<UsersPage />} />
            <Route path="sistema" element={<SystemPage />} />
            <Route path="puntos" element={<PointsPage />} />
            <Route path="importar" element={<ImportPage />} />
            <Route path="alumnos/pendientes" element={<PendingDataPage />} />
            <Route path="alumnos" element={<StudentsPage />}>
              <Route path=":id" element={<StudentPanel />} />
            </Route>
          </Route>
        </Route>
      </Route>
    </Routes>
  );
}
