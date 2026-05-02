import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import PuzzleBoard from '../components/PuzzleBoard';
import { Share2, Trophy, ArrowLeft, Users, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function Room() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [room, setRoom] = useState<any>(null);
  const [pieces, setPieces] = useState<any[]>([]);
  const [complete, setComplete] = useState(false);
  const [time, setTime] = useState(0);
  const [nickname, setNickname] = useState(localStorage.getItem('puzzleNickname') || '');
  const [players, setPlayers] = useState<Record<string, string>>({});

  useEffect(() => {
    localStorage.setItem('puzzleNickname', nickname);
  }, [nickname]);

  useEffect(() => {
    if (!roomId) return;
    
    const loadData = async () => {
      try {
        const roomRes = await fetch(`/api/room/${roomId}`);
        if (!roomRes.ok) throw new Error('Room not found');
        const roomData = await roomRes.json();
        setRoom(roomData);

        const piecesRes = await fetch(`/api/room/${roomId}/pieces`);
        if (piecesRes.ok) {
          const piecesData: any[] = await piecesRes.json();
          setPieces(piecesData);
          if (piecesData.length > 0) {
            const realPieces = piecesData.filter(p => !p.id.startsWith('fake'));
            if (realPieces.every(p => p.isCorrect)) {
              setComplete(true);
            }
          }
        }
      } catch (err) {
        console.error(err);
        navigate('/');
      }
    };

    loadData();
  }, [roomId, navigate]);

  // Timer
  useEffect(() => {
    if (complete || !room?.createdAt) return;
    
    const calculateTime = () => {
      const start = new Date(room.createdAt).getTime();
      const now = new Date().getTime();
      const diff = Math.floor((now - start) / 1000);
      setTime(Math.max(0, diff));
    };

    calculateTime();
    const interval = setInterval(calculateTime, 1000);
    return () => clearInterval(interval);
  }, [complete, room?.createdAt]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const shareRoom = () => {
    navigator.clipboard.writeText(window.location.href);
    alert('Room link copied to clipboard!');
  };

  if (!room) return null;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="h-16 bg-white border-b border-gray-100 flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-6">
          <button 
            onClick={() => navigate('/')}
            className="p-2 hover:bg-gray-50 rounded-full text-gray-500 transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          
          <div className="flex items-center gap-3">
            <input 
              type="text"
              placeholder="Your Nickname"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              className="px-4 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all w-40"
            />
          </div>

          <div className="flex items-center gap-4 border-l border-gray-100 pl-6">
            <div className="flex items-center gap-2 px-3 py-1 bg-blue-50 text-blue-600 rounded-full text-sm font-semibold">
              <Clock size={14} />
              {formatTime(time)}
            </div>
            <div className="flex items-center gap-2 px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-sm font-semibold">
              <Users size={14} />
              {Object.keys(players).length || 1} Playing
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={shareRoom}
            className="flex items-center gap-2 px-4 py-2 bg-black text-white rounded-full text-sm font-bold hover:bg-gray-800 transition-all shadow-sm"
          >
            <Share2 size={16} />
            Invite Friends
          </button>
        </div>
      </div>

      <div className="flex-1 p-6 flex flex-col items-center justify-center relative overflow-hidden">
        {/* Background Ambient */}
        <div className="absolute inset-0 pointer-events-none opacity-20">
          <div className="absolute top-1/4 -left-20 w-80 h-80 bg-blue-400 rounded-full blur-[120px]" />
          <div className="absolute bottom-1/4 -right-20 w-80 h-80 bg-purple-400 rounded-full blur-[120px]" />
        </div>

        <div className="w-full max-w-[1400px] bg-white p-4 rounded-3xl shadow-xl border border-gray-100">
          <PuzzleBoard 
            room={room} 
            userNickname={nickname}
            onPlayersUpdate={setPlayers}
            onComplete={() => {
              console.log("Puzzle Completion Event triggered!");
              setComplete(true);
            }} 
          />
        </div>
      </div>

      <AnimatePresence>
        {complete && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 30 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              className="bg-white max-w-2xl w-full p-10 rounded-[50px] text-center shadow-[0_32px_64px_-16px_rgba(0,0,0,0.3)] relative overflow-hidden"
            >
              {/* Certificate Border decoration */}
              <div className="absolute inset-0 pointer-events-none border-[16px] border-double border-gray-50 m-4 rounded-[34px]" />
              
              <div className="relative z-10">
                <div className="w-24 h-24 bg-gradient-to-tr from-yellow-400 to-amber-300 rounded-[30px] flex items-center justify-center mx-auto mb-8 rotate-12 shadow-xl text-white">
                  <Trophy size={48} />
                </div>
                
                <h2 className="text-4xl font-black text-gray-900 mb-2 tracking-tighter uppercase italic">Mission Accomplished</h2>
                <p className="text-gray-400 mb-8 font-bold tracking-widest uppercase text-xs">Certified Puzzle Master</p>

                <div className="bg-white rounded-3xl p-6 mb-10 border-4 border-gray-50 shadow-inner relative group">
                  <div className="aspect-video rounded-2xl overflow-hidden shadow-2xl mb-6 bg-white p-1 border border-gray-100">
                    <img 
                      src={room.imageUrl} 
                      alt="Completed Work" 
                      className="w-full h-full object-cover rounded-xl"
                    />
                  </div>
                  
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div className="bg-gray-50 rounded-2xl py-3 px-2">
                      <p className="text-[10px] text-gray-400 font-black uppercase mb-1">Time</p>
                      <p className="text-lg font-black text-blue-600">{formatTime(time)}</p>
                    </div>
                    <div className="bg-gray-50 rounded-2xl py-3 px-2">
                      <p className="text-[10px] text-gray-400 font-black uppercase mb-1">Pieces</p>
                      <p className="text-lg font-black text-gray-900">{room.pieceCount}</p>
                    </div>
                    <div className="bg-gray-50 rounded-2xl py-3 px-2">
                      <p className="text-[10px] text-gray-400 font-black uppercase mb-1">Rank</p>
                      <p className="text-lg font-black text-gray-900">S</p>
                    </div>
                  </div>
                  
                  <div className="mt-6 pt-4 border-t border-gray-100">
                    <p className="text-gray-400 text-[10px] font-black uppercase mb-3">Contributors</p>
                    <div className="flex flex-wrap justify-center gap-2">
                       {Object.values(players).length > 0 ? (
                         Object.values(players).map((name, i) => (
                           <span key={i} className="px-3 py-1 bg-gray-50 rounded-full text-xs font-bold text-gray-700">
                             {name}
                           </span>
                         ))
                       ) : (
                         <span className="px-3 py-1 bg-gray-50 rounded-full text-xs font-bold text-gray-700">
                           {nickname || 'Anonymous Hero'}
                         </span>
                       )}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <button 
                    onClick={() => navigate('/')}
                    className="group flex items-center justify-center gap-3 py-5 bg-gray-50 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-3xl font-black text-lg transition-all"
                  >
                    <ArrowLeft size={24} className="group-hover:-translate-x-1 transition-transform" />
                    Lobby
                  </button>
                  <button 
                     onClick={() => {
                        alert('Masterpiece successfully posted to the Community Board!');
                        navigate('/');
                     }}
                     className="flex items-center justify-center gap-3 py-5 bg-blue-600 hover:bg-blue-700 text-white rounded-3xl font-black text-lg shadow-2xl shadow-blue-200 transition-all active:scale-95"
                  >
                    <Share2 size={24} />
                    Post to Board
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
