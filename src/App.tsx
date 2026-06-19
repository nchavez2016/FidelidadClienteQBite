import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index";
import CustomerLogin from "./pages/CustomerLogin";
import CustomerRegister from "./pages/CustomerRegister";
import StaffLogin from "./pages/StaffLogin";
import { ProtectedRoute } from "./components/auth/ProtectedRoute";
import {
  loadCustomerDashboardPage,
  loadNotFoundPage,
  loadStaffPanelPage,
} from "@/lib/routePreload";

const CustomerDashboard = lazy(loadCustomerDashboardPage);
const StaffPanel = lazy(loadStaffPanelPage);
const NotFound = lazy(loadNotFoundPage);
// TEST_BRANCH_AZUL
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Suspense
          fallback={null}
        >
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/cliente/login" element={<CustomerLogin />} />
            <Route path="/cliente/registro" element={<CustomerRegister />} />
            <Route
              path="/cliente/dashboard"
              element={
                <ProtectedRoute allowedRoles={["customer"]} redirectTo="/cliente/login">
                  <CustomerDashboard />
                </ProtectedRoute>
              }
            />
            <Route path="/staff/login" element={<StaffLogin />} />
            <Route
              path="/staff/panel"
              element={
                <ProtectedRoute allowedRoles={["admin", "cashier"]} redirectTo="/staff/login">
                  <StaffPanel />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
// Refresh
