
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function DashboardRedirect() {
    const { user } = useAuth();

    if (!user) return <Navigate to="/login" replace />;

    if (!user.onboarding_completed || !user.dashboard_type) {
        return <Navigate to="/onboarding" replace />;
    }

    return (
        <Navigate
            to={
                user.dashboard_type === "mens"
                    ? "/mens/dashboard"
                    : "/womens/dashboard"
            }
            replace
        />
    );
}
