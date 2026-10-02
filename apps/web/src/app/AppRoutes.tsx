import { Route, Routes } from 'react-router';

import { RequireSession } from '@/features/auth/RequireSession';
import { HomePage } from '@/pages/home/HomePage';
import { ChangePasswordPage } from '@/pages/panel/ChangePasswordPage';
import { PanelHomePage } from '@/pages/panel/PanelHomePage';
import { PanelLayout } from '@/pages/panel/PanelLayout';

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/panel" element={<RequireSession />}>
        <Route path="cambiar-contrasena" element={<ChangePasswordPage />} />
        <Route element={<PanelLayout />}>
          <Route index element={<PanelHomePage />} />
        </Route>
      </Route>
    </Routes>
  );
}
