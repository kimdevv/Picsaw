import React, { createContext, useContext, useEffect, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';

interface User {
  uid: string;
  displayName: string | null;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const savedId = localStorage.getItem('puzzle_user_id');
    if (savedId) {
      setUser({ uid: savedId, displayName: 'Adventurer' });
    } else {
      const newId = uuidv4();
      localStorage.setItem('puzzle_user_id', newId);
      setUser({ uid: newId, displayName: 'Adventurer' });
    }
    setLoading(false);
  }, []);

  const login = async () => {
    // No-op or we could add a simple prompt for a name
  };

  const logout = async () => {
    localStorage.removeItem('puzzle_user_id');
    const newId = uuidv4();
    localStorage.setItem('puzzle_user_id', newId);
    setUser({ uid: newId, displayName: 'Adventurer' });
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
