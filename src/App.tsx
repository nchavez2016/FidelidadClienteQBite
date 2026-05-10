import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index";
import CustomerLogin from "./pages/CustomerLogin";
import CustomerRegister from "./pages/CustomerRegister";
import CustomerDashboard from "./pages/CustomerDashboard";
import StaffLogin from "./pages/StaffLogin";
import StaffPanel from "./pages/StaffPanel";
import NotFound from "./pages/NotFound";
import { ProtectedRoute } from "./components/auth/ProtectedRoute";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/cliente/login" element={<CustomerLogin />} />
          <Route path="/cliente/registro" element={<CustomerRegister />} />
          <Route
            path="/cliente/dashboard"
            element={
              <ProtectedRoute roles={["customer"]} redirectTo="/cliente/login">
                <CustomerDashboard />
              </ProtectedRoute>
            }
          />
          <Route path="/staff/login" element={<StaffLogin />} />
          <Route
            path="/staff/panel"
            element={
              <ProtectedRoute roles={["admin", "cashier"]} redirectTo="/staff/login">
                <StaffPanel />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
// Refresh
