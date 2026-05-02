import React, { useState, useEffect } from 'react';
import { 
  BrowserRouter as Router, 
  Routes, 
  Route, 
  useNavigate, 
  useParams,
  useLocation
} from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/AuthContext';
import Home from './pages/Home';
import Room from './pages/Room';
import { LogIn, Puzzle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

function Navbar() {
  const { user, logout } = useAuth();
  const location = useLocation();
  
  // Hide global navbar on Room page to avoid double header
  if (location.pathname.includes('/room/')) return null;
  
  return (
    <nav className="fixed top-0 left-0 right-0 h-16 bg-white/80 backdrop-blur-md border-b border-gray-100 z-50 flex items-center justify-between px-6">
      <div className="flex items-center gap-2 font-bold text-xl tracking-tight text-gray-900 cursor-pointer" onClick={() => window.location.href = '/'}>
        <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center text-white">
          <Puzzle size={20} />
        </div>
        Pic-saw
      </div>
    </nav>
  );
}

function MainApp() {
  const { loading } = useAuth();

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-gray-50">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="w-12 h-12 border-4 border-black border-t-transparent rounded-full"
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="pt-0"> {/* Navbar handling its own spacing or via absolute/fixed context */}
        <Routes>
          <Route path="/" element={<div className="pt-16"><Home /></div>} />
          <Route path="/room/:roomId" element={<Room />} />
        </Routes>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <MainApp />
      </Router>
    </AuthProvider>
  );
}
