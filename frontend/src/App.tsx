import { RouterProvider } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { ToastProvider } from './components/Toast';
import { router } from './router';
import { ThemeProvider } from './theme/ThemeContext';

export default function App() {
  return (
    <ThemeProvider>
    <ToastProvider>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </ToastProvider>
    </ThemeProvider>
  );
}
