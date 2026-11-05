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
import TrainerSchedule from './pages/trainer/Schedule';
import TrainerSessions from './pages/trainer/Sessions';
import TrainerStats from './pages/trainer/Stats';
import ReceptionToday from './pages/reception/Today';
import ReceptionBookings from './pages/reception/AllBookings';
import ReceptionUnpaid from './pages/reception/Unpaid';
import MemberLookup from './pages/reception/MemberLookup';
import NewBooking from './pages/reception/NewBooking';
import AdminOverview from './pages/admin/Overview';
import AdminBookings from './pages/admin/Bookings';
import AdminPayments from './pages/admin/Payments';
import AdminTrainers from './pages/admin/Trainers';
import AdminHalls from './pages/admin/Halls';
import AdminMembers from './pages/admin/Members';
import AdminReports from './pages/admin/Reports';
import AdminStaff from './pages/admin/Staff';

const guarded = (role: 'member' | 'trainer' | 'receptionist' | 'admin') => (
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
      { index: true, element: <TrainerSchedule /> },
      { path: 'sessions', element: <TrainerSessions /> },
      { path: 'stats', element: <TrainerStats /> },
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
  {
    path: '/admin',
    element: guarded('admin'),
    children: [
      { index: true, element: <AdminOverview /> },
      { path: 'bookings', element: <AdminBookings /> },
      { path: 'payments', element: <AdminPayments /> },
      { path: 'trainers', element: <AdminTrainers /> },
      { path: 'halls', element: <AdminHalls /> },
      { path: 'members', element: <AdminMembers /> },
      { path: 'reports', element: <AdminReports /> },
      { path: 'staff', element: <AdminStaff /> },
    ],
  },
  { path: '*', element: <NotFound /> },
]);
