
import {
    createContext,
    useContext,
    useEffect,
    useState,
    type ReactNode,
} from "react";

import type { User, LoginData } from "../services/auth";
import { loginUser, logoutUser } from "../services/auth";
import { getMyProfile } from "../services/profile";

interface AuthContextValue {
    user: User | null;
    loading: boolean;
    login: (data: LoginData) => Promise<User>;
    logout: () => void;
    refreshProfile: () => Promise<User>;
}

const AuthContext = createContext<AuthContextValue | undefined>(
    undefined
);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    async function refreshProfile() {
        const profile = await getMyProfile();
        setUser(profile);
        return profile;
    }

    async function login(data: LoginData) {
        await loginUser(data);

        try {
            const profile = await getMyProfile();
            setUser(profile);
            return profile;
        } catch (error) {
            logoutUser();
            setUser(null);
            throw error;
        }
    }

    function logout() {
        logoutUser();
        setUser(null);
    }

    useEffect(() => {
        let active = true;

        async function restoreSession() {
            const token = sessionStorage.getItem("healthwiise_token");

            if (token) {
                try {
                    const profile = await getMyProfile();
                    if (active) setUser(profile);
                } catch {
                    logoutUser();
                    if (active) setUser(null);
                }
            }

            if (active) setLoading(false);
        }

        void restoreSession();

        return () => {
            active = false;
        };
    }, []);

    return (
        <AuthContext.Provider
            value={{ user, loading, login, logout, refreshProfile }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);

    if (!context) {
        throw new Error("useAuth must be used within AuthProvider");
    }

    return context;
}
