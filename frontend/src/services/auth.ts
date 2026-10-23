
import api from "./api";

export interface User {
    id: string;
    name: string;
    email: string;
    dashboard_type: "mens" | "womens" | null;
    onboarding_completed: boolean;
}

export interface LoginResponse {
    access_token: string;
    token_type: string;
    user: User;
}

export interface RegisterData {
    name: string;
    email: string;
    password: string;
}

export interface LoginData {
    email: string;
    password: string;
}

export async function registerUser(data: RegisterData) {
    const response = await api.post("/api/auth/register", data);
    return response.data;
}

export async function loginUser(data: LoginData): Promise<LoginResponse> {
    const response = await api.post<LoginResponse>(
        "/api/auth/login",
        data
    );

    sessionStorage.setItem(
        "healthwiise_token",
        response.data.access_token
    );

    return response.data;
}

export function logoutUser() {
    sessionStorage.removeItem("healthwiise_token");
}
