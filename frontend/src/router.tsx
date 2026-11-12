import { createBrowserRouter } from 'react-router-dom';
import { RequireRole } from './auth/RequireRole';
import { AppLayout } from './layouts/AppLayout';
import Landing from './pages/Landing';
import NotFound from './pages/NotFound';
import Login from './pages/Login';
import Register from './pages/Register';
import MemberDashboard from './pages/member/Dashboard';
import BookTrainer from './pages/member/BookTrainer';
import RentHall from './pages/member/RentHall';
import Payment from './pages/member/Payment';
import Confirmation from './pages/member/Confirmation';
import MyBookings from './pages/member/MyBookings';
import Profile from './pages/member/Profile';
import ReceptionToday from './pages/reception/Today';
import ReceptionBookings from './pages/reception/AllBookings';
import ReceptionUnpaid from './pages/reception/Unpaid';
import MemberLookup from './pages/reception/MemberLookup';
import NewBooking from './pages/reception/NewBooking';
import TrainerDashboard from './pages/trainer/Dashboard';
import TrainerSchedule from './pages/trainer/Schedule';
import TrainerStats from './pages/trainer/Stats';
import TrainerClients from './pages/trainer/Clients';
import TrainerHistory from './pages/trainer/History';
import TrainerStatus from './pages/trainer/Status';

// The admin area is hidden for now (pages removed).
const guarded = (role: 'member' | 'trainer' | 'receptionist') => (
  <RequireRole role={role}>
    <AppLayout />
  </RequireRole>
);

export const router = createBrowserRouter([
  { path: '/', element: <Landing /> }, // logged-in users are sent to their dashboard
  { path: '/login', element: <Login /> },
  { path: '/register', element: <Register /> },
  {
    path: '/member',
    element: guarded('member'),
    children: [
      { index: true, element: <MemberDashboard /> },
      { path: 'trainers', element: <BookTrainer /> },
      { path: 'halls', element: <RentHall /> },
      { path: 'pay/:bookingId', element: <Payment /> },
      { path: 'confirmation/:bookingId', element: <Confirmation /> },
      { path: 'bookings', element: <MyBookings /> },
      { path: 'profile', element: <Profile /> },
    ],
  },
  {
    path: '/trainer',
    element: guarded('trainer'),
    children: [
      { index: true, element: <TrainerDashboard /> },
      { path: 'schedule', element: <TrainerSchedule /> },
      { path: 'stats', element: <TrainerStats /> },
      { path: 'clients', element: <TrainerClients /> },
      { path: 'history', element: <TrainerHistory /> },
      { path: 'status', element: <TrainerStatus /> },
    ],
  },
  {
    path: '/reception',
    element: guarded('receptionist'),
    children: [
      { index: true, element: <ReceptionToday /> },
      { path: 'bookings', element: <ReceptionBookings /> },
      { path: 'unpaid', element: <ReceptionUnpaid /> },
      { path: 'members', element: <MemberLookup /> },
      { path: 'new', element: <NewBooking /> },
    ],
  },
  { path: '*', element: <NotFound /> },
]);
