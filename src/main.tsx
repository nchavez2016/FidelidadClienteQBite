import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { AuthProvider } from "./contexts/AuthContext";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { logger } from "./lib/logger";

if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (e) => {
    logger.error('unhandledrejection', { reason: e.reason });
  });
  window.addEventListener('error', (e) => {
    logger.error('window.error', { message: e.message, filename: e.filename });
  });
}

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <AuthProvider>
      <App />
    </AuthProvider>
  </ErrorBoundary>,
);
