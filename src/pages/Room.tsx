import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import PuzzleBoard from '../components/PuzzleBoard';
import { Share2, Trophy, ArrowLeft, Users, Clock, Zap, Swords } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import SockJS from 'sockjs-client';
import Stomp from 'stompjs';

export default function Room() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  
  const [room, setRoom] = useState<any>(null);
  const [myPieces, setMyPieces] = useState<any[]>([]);
  const [oppPieces, setOppPieces] = useState<any[]>([]);
  const [winner, setWinner] = useState<string | null>(null);
  const [time, setTime] = useState(0);
  const [status, setStatus] = useState<'WAITING' | 'PLAYING' | 'FINISHED'>('WAITING');
  const [opponentId, setOpponentId] = useState<string | null>(new URLSearchParams(location.search).get('opponentId'));

  const stompClientRef = useRef<Stomp.Client | null>(null);
  const piecesRef = useRef<any[]>([]);
  const oppPiecesRef = useRef<any[]>([]);

  useEffect(() => { piecesRef.current = myPieces; }, [myPieces]);
  useEffect(() => { oppPiecesRef.current = oppPieces; }, [oppPieces]);

  // Initial Load
  useEffect(() => {
    if (!roomId || !user) return;
    
    const loadData = async () => {
      try {
        const roomRes = await fetch(`/api/room/${roomId}?userId=${user.uid}`);
        if (!roomRes.ok) throw new Error('Room not found');
        const roomData = await roomRes.json();
        setRoom(roomData);
        setStatus(roomData.status);
        if (roomData.player1Id !== user.uid) setOpponentId(roomData.player1Id);
        else if (roomData.player2Id) setOpponentId(roomData.player2Id);

        // Fetch My Pieces
        const piecesRes = await fetch(`/api/room/${roomId}/pieces?userId=${user.uid}`);
        if (piecesRes.ok) setMyPieces(await piecesRes.json());

        // Fetch Opponent Pieces if joined
        if (roomData.player1Id && roomData.player2Id) {
          const targetOppId = roomData.player1Id === user.uid ? roomData.player2Id : roomData.player1Id;
          const oppRes = await fetch(`/api/room/${roomId}/pieces?userId=${targetOppId}`);
          if (oppRes.ok) setOppPieces(await oppRes.json());
        }
      } catch (err) {
        console.error(err);
        navigate('/');
      }
    };

    loadData();
  }, [roomId, user, navigate]);

  // WebSocket
  useEffect(() => {
    if (!roomId || !user) return;

    const socket = new SockJS('/ws-puzzle');
    const client = Stomp.over(socket);
    client.debug = () => {};
    
    client.connect({}, () => {
      stompClientRef.current = client;
      client.subscribe(`/topic/room/${roomId}`, (message) => {
        const event = JSON.parse(message.body);
        
        if (event.type === 'FINISHED') {
          setWinner(event.userId);
          setStatus('FINISHED');
          return;
        }

        if (event.type === 'JOIN') {
          console.log("Rival joined:", event.userId);
          setOpponentId(event.userId);
          setStatus('PLAYING');
          // Fetch Rival Pieces immediately
          fetch(`/api/room/${roomId}/pieces?userId=${event.userId}`)
            .then(res => res.json())
            .then(data => setOppPieces(data))
            .catch(err => console.error("Error loading opponent pieces:", err));
          return;
        }

        if (event.userId === user.uid) return; // Skip my own updates here (board handles local)

        // Handle Opponent Updates
        setOppPieces(prev => prev.map(p => {
          if (p.id !== event.pieceId) return p;
          switch (event.type) {
            case 'MOVE': return { ...p, currentX: event.x, currentY: event.y };
            case 'PICK': return { ...p, heldBy: event.userId };
            case 'DROP': return { ...p, heldBy: null, currentX: event.x, currentY: event.y, isCorrect: event.isCorrect };
            default: return p;
          }
        }));
      });
    });

    return () => {
      if (client.connected) client.disconnect(() => {});
    };
  }, [roomId, user]);

  const handleMyMove = (pieceId: string, x: number, y: number) => {
    stompClientRef.current?.send(`/pub/room/${roomId}/move`, {}, JSON.stringify({ userId: user?.uid, pieceId, x, y }));
  };

  const handleMyPick = (pieceId: string) => {
    stompClientRef.current?.send(`/pub/room/${roomId}/pick`, {}, JSON.stringify({ userId: user?.uid, pieceId }));
  };

  const handleMyDrop = (pieceId: string, x: number, y: number, isCorrect: boolean) => {
    const nextPieces = myPieces.map(p => p.id === pieceId ? { ...p, isCorrect } : p);
    const realPieces = nextPieces.filter(p => !p.id.startsWith('fake'));
    const allCorrect = realPieces.every(p => p.isCorrect);
    
    stompClientRef.current?.send(`/pub/room/${roomId}/drop`, {}, JSON.stringify({ 
      userId: user?.uid, 
      pieceId, 
      x, 
      y, 
      isCorrect,
      isFinished: allCorrect
    }));
    if (allCorrect) {
      setWinner(user?.uid || null);
      setStatus('FINISHED');
    }
  };

  // Timer
  useEffect(() => {
    if (status !== 'PLAYING' || !room?.createdAt) return;
    
    const calculateTime = () => {
      const start = new Date(room.createdAt).getTime();
      const now = new Date().getTime();
      const diff = Math.floor((now - start) / 1000);
      setTime(Math.max(0, diff));
    };

    calculateTime();
    const interval = setInterval(calculateTime, 1000);
    return () => clearInterval(interval);
  }, [status, room?.createdAt]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const shareRoom = () => {
    const url = window.location.href;
    try {
      if (typeof navigator.clipboard !== 'undefined' && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url)
          .then(() => alert('Link copied! Send it to your rival.'))
          .catch(() => fallbackCopy(url));
      } else {
        fallbackCopy(url);
      }
    } catch (err) {
      fallbackCopy(url);
    }
  };

  const fallbackCopy = (text: string) => {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
      alert('Link copied! Send it to your rival.');
    } catch (err) {
      prompt('Copy this link:', text);
    }
    document.body.removeChild(textArea);
  };

  if (!room) return null;

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col font-sans selection:bg-blue-500/30">
      {/* Dynamic Header */}
      <div className="h-20 bg-white/5 backdrop-blur-xl border-b border-white/10 flex items-center justify-between px-8 absolute top-0 left-0 right-0 z-50">
        <div className="flex items-center gap-8">
          <button onClick={() => navigate('/')} className="w-12 h-12 flex items-center justify-center rounded-2xl hover:bg-white/10 transition-all group">
            <ArrowLeft className="group-hover:-translate-x-1 transition-transform" />
          </button>
          
          <div className="flex items-center gap-4">
            <div className="px-4 py-2 bg-blue-600 rounded-2xl flex items-center gap-2 shadow-lg shadow-blue-900/20">
              <Clock size={16} className="text-blue-100" />
              <span className="font-black text-lg tracking-tighter">{formatTime(time)}</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 bg-white/5 rounded-2xl border border-white/10">
              <Swords size={16} className="text-red-400" />
              <span className="font-bold text-sm uppercase tracking-widest text-gray-400">Competitive Mode</span>
            </div>
          </div>
        </div>

        {status === 'WAITING' && (
          <motion.button 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            onClick={shareRoom}
            className="flex items-center gap-3 px-6 py-3 bg-white text-black rounded-2xl font-black hover:bg-gray-200 transition-all shadow-xl"
          >
            <Share2 size={18} />
            Invite Rival
          </motion.button>
        )}
      </div>

      <div className="flex-1 pt-24 pb-8 px-8 grid grid-cols-12 gap-8 h-screen">
        {/* Main Board (Me) */}
        <div className="col-span-8 flex flex-col gap-4">
          <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-blue-500 rounded-xl flex items-center justify-center font-black">P1</div>
              <h3 className="text-xl font-black tracking-tight">Your Arena</h3>
            </div>
            <div className="text-blue-400 font-black tracking-widest uppercase text-xs">
              {Math.round((myPieces.filter(p => !p.id.startsWith('fake') && p.isCorrect).length / (myPieces.filter(p => !p.id.startsWith('fake')).length || 1)) * 100)}% Complete
            </div>
          </div>
          <div className="flex-1 bg-white/5 rounded-[40px] border border-white/10 p-6 relative overflow-hidden backdrop-blur-sm">
             <PuzzleBoard 
                room={room} 
                pieces={myPieces} 
                setPieces={setMyPieces}
                onPieceMove={handleMyMove}
                onPiecePick={handleMyPick}
                onPieceDrop={handleMyDrop}
             />
          </div>
        </div>

        {/* Sidebar: Opponent & Actions */}
        <div className="col-span-4 flex flex-col gap-8">
          <div className="flex flex-col gap-4">
             <div className="flex items-center justify-between px-2">
               <div className="flex items-center gap-4">
                 <div className="w-10 h-10 bg-red-500 rounded-xl flex items-center justify-center font-black">P2</div>
                 <h3 className="text-xl font-black tracking-tight text-gray-400">Rival Sight</h3>
               </div>
             </div>
             <div className="aspect-video bg-white/5 rounded-[32px] border border-white/10 p-4 relative overflow-hidden flex items-center justify-center group grayscale hover:grayscale-0 transition-all duration-700">
               {opponentId ? (
                 <PuzzleBoard 
                   room={room} 
                   pieces={oppPieces} 
                   isReadOnly 
                 />
               ) : (
                 <div className="flex flex-col items-center gap-4 text-white/20">
                   <Zap size={48} />
                   <p className="font-black uppercase text-xs tracking-widest">Waiting for rival...</p>
                 </div>
               )}
             </div>
          </div>

          <div className="flex-1 bg-gradient-to-br from-white/5 to-transparent rounded-[32px] border border-white/10 p-8 flex flex-col justify-between">
              <div>
                <h4 className="text-xs font-black text-gray-500 uppercase tracking-[0.2em] mb-8">Match Specs</h4>
                <div className="space-y-6">
                  <div className="flex justify-between items-end border-b border-white/5 pb-4">
                    <span className="text-gray-400 font-bold text-sm">Pieces</span>
                    <span className="text-2xl font-black text-white">{room.pieceCount}</span>
                  </div>
                  <div className="flex justify-between items-end border-b border-white/5 pb-4">
                    <span className="text-gray-400 font-bold text-sm">Difficulty</span>
                    <span className="text-xl font-black text-red-500 uppercase italic">{room.difficulty}</span>
                  </div>
                </div>
              </div>

              <div className="bg-white/5 p-6 rounded-2xl border border-white/10">
                <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-2">Pro Tip</p>
                <p className="text-gray-400 text-sm leading-relaxed font-medium font-serif">Every second counts. The faster you drop correct pieces, the more pressure you put on your opponent.</p>
              </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {status === 'FINISHED' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 bg-black/90 backdrop-blur-2xl z-[100] flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.8, opacity: 0, rotate: -2 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              className="bg-white text-black p-12 rounded-[60px] text-center max-w-xl w-full shadow-[0_40px_100px_rgba(0,0,0,0.5)] border-8 border-gray-50"
            >
              <div className={`w-32 h-32 mx-auto mb-8 rounded-[40px] flex items-center justify-center shadow-2xl ${winner === user?.uid ? 'bg-yellow-400 text-white rotate-12' : 'bg-gray-100 text-gray-400 -rotate-12'}`}>
                {winner === user?.uid ? <Trophy size={64} /> : <Zap size={64} />}
              </div>
              
              <h2 className="text-6xl font-black tracking-tighter italic uppercase mb-2">
                {winner === user?.uid ? 'Victory!' : 'Defeat'}
              </h2>
              <p className="text-gray-400 font-black uppercase tracking-[0.3em] text-xs mb-10">
                {winner === user?.uid ? 'You dominated the arena' : 'Rival outclassed you'}
              </p>

              <button 
                onClick={() => navigate('/')}
                className="w-full py-6 bg-black text-white rounded-3xl font-black text-2xl hover:bg-gray-900 transition-all active:scale-95 shadow-xl"
              >
                Return to Lobby
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
