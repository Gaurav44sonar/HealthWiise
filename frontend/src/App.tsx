
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import DashboardRedirect from "./components/DashboardRedirect";

import Login from "./pages/Login";
import Register from "./pages/Register";
import Onboarding from "./pages/Onboarding";
import MensDashboard from "./pages/MensDashboard";
import WomensDashboard from "./pages/WomensDashboard";
import Nutrition from "./pages/Nutrition";
import Hydration from "./pages/Hydration";
import Sleep from "./pages/Sleep";
import Fitness from "./pages/Fitness";
import WellnessInsights from "./pages/WellnessInsights";
import Cycle from "./pages/Cycle";

import "./styles.css";

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<DashboardRedirect />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          <Route element={<ProtectedRoute />}>
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/mens/dashboard" element={<MensDashboard />} />
            <Route path="/womens/dashboard" element={<WomensDashboard />} />
            <Route path="/shared/nutrition" element={<Nutrition />} />
            <Route path="/shared/hydration" element={<Hydration />} />
            <Route path="/shared/sleep" element={<Sleep />} />
            <Route path="/shared/fitness" element={<Fitness />} />
            <Route path="/shared/wellness" element={<WellnessInsights />} />
            <Route path="/shared/insights" element={<Navigate to="/shared/wellness" replace />} />
            <Route path="/shared/cycle" element={<Cycle />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
