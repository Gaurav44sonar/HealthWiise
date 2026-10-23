
import api from "./api";
import type { User } from "./auth";

export async function getMyProfile(): Promise<User> {
    const response = await api.get<User>("/api/profile/me");
    return response.data;
}

export async function saveDashboardPreference(
    dashboard_type: "mens" | "womens"
): Promise<User> {
    const response = await api.patch<User>(
        "/api/profile/dashboard",
        { dashboard_type }
    );

    return response.data;
}
