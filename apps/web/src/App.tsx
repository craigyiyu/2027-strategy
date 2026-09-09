/**
 * Application routes. Session routes share one SessionProvider so Interview /
 * Reflection / Preview all read the same server session state.
 */
import { Outlet, Route, Routes } from 'react-router-dom';
import { SessionProvider } from './session';
import Landing from './pages/Landing';
import Start from './pages/Start';
import Interview from './pages/Interview';
import Reflection from './pages/Reflection';
import Preview from './pages/Preview';
import Report from './pages/Report';
import Method from './pages/Method';
import Privacy from './pages/Privacy';
import Delete from './pages/Delete';
import Admin from './pages/Admin';
import NotFound from './pages/NotFound';

function SessionRoutes() {
  return (
    <SessionProvider>
      <Outlet />
    </SessionProvider>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/start" element={<Start />} />
      <Route path="/session/:token" element={<SessionRoutes />}>
        <Route index element={<Interview />} />
        <Route path="review" element={<Reflection />} />
        <Route path="preview" element={<Preview />} />
      </Route>
      <Route path="/report/:token" element={<Report />} />
      <Route path="/method" element={<Method />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/delete/:token" element={<Delete />} />
      <Route path="/admin" element={<Admin />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
