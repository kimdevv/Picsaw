import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { Upload, Image as ImageIcon, FastForward, ShieldCheck } from 'lucide-react';
import { motion } from 'motion/react';
import { v4 as uuidv4 } from 'uuid';

export default function Home() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [pieceCount, setPieceCount] = useState(50);
  const [difficulty, setDifficulty] = useState<'normal' | 'hard'>('normal');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        setError('Image too large. Max 10MB.');
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        setSelectedImage(reader.result as string);
        setError(null);
      };
      reader.readAsDataURL(file);
    }
  };

  const startMatch = async (mode: 'RANDOM' | 'PRIVATE') => {
    if (!selectedImage) {
      setError("Please upload an image first!");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      if (mode === 'RANDOM') {
        const matchRes = await fetch('/api/match/random', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            userId: user?.uid,
            image: selectedImage,
            pieceCount,
            difficulty
          })
        });
        const matchData = await matchRes.json();
        
        if (matchData.status === 'MATCHED') {
          // Navigate immediately if matched
          const { roomId, player1Id, player2Id } = matchData.data;
          const oppId = player1Id === user?.uid ? player2Id : player1Id;
          navigate(`/room/${roomId}?mode=RANDOM&opponentId=${oppId}`);
        } else {
          // Polling for match status
          const poll = setInterval(async () => {
            try {
              const statusRes = await fetch(`/api/match/status/${user?.uid}`);
              if (!statusRes.ok) return;
              
              const statusData = await statusRes.json();
              console.log("Poll status:", statusData);
              if (statusData.status === 'MATCHED' && statusData.data) {
                clearInterval(poll);
                const { roomId, player1Id, player2Id } = statusData.data;
                const oppId = player1Id === user?.uid ? player2Id : player1Id;
                console.log("Matched! room:", roomId, "opponent:", oppId);
                setLoading(false);
                navigate(`/room/${roomId}?mode=RANDOM&opponentId=${oppId}`);
              }
            } catch (pollErr) {
              console.error("Polling error:", pollErr);
            }
          }, 2000);
          
          // If after 45 seconds no match, cancel (increased time)
          setTimeout(() => {
            clearInterval(poll);
            setLoading(false);
          }, 45000);
        }
      } else {
        // ... (existing PRIVATE logic)
        const valRes = await fetch('/api/validate-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: selectedImage })
        });
        const valData = await valRes.json();
        if (!valRes.ok || !valData.safe) throw new Error(valData.message || 'Validation failed');

        const genRes = await fetch('/api/generate-puzzle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            image: selectedImage, 
            pieceCount, 
            difficulty, 
            userId: user?.uid,
            matchType: 'PRIVATE'
          })
        });
        const puzzleData = await genRes.json();
        navigate(`/room/${puzzleData.roomId}?mode=PRIVATE`);
      }
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-6 py-12">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-12"
      >
        <h1 className="text-6xl font-black text-gray-900 mb-4 tracking-tighter">
          Pic-saw <span className="text-blue-600 italic">V/S</span>
        </h1>
        <p className="text-gray-500 text-lg max-w-xl mx-auto font-medium">
          The ultimate 1:1 competitive puzzle challenge. Match, solve, and win.
        </p>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left: Upload */}
        <div className="lg:col-span-2 space-y-6">
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            onClick={() => fileInputRef.current?.click()}
            className="aspect-video border-2 border-dashed border-gray-200 rounded-[40px] bg-white hover:border-blue-500 transition-all flex flex-col items-center justify-center cursor-pointer group overflow-hidden relative shadow-sm"
          >
            {selectedImage ? (
              <>
                <img src={selectedImage} alt="Preview" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                  <div className="px-6 py-3 bg-white rounded-2xl text-sm font-bold flex items-center gap-2 shadow-xl">
                    <Upload size={18} />
                    Change Masterpiece
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center gap-4 text-gray-300 group-hover:text-blue-500 transition-colors">
                <div className="w-20 h-20 rounded-3xl bg-gray-50 flex items-center justify-center group-hover:bg-blue-50 group-hover:rotate-6 transition-all duration-300">
                  <Upload size={40} />
                </div>
                <div className="text-center">
                  <p className="text-xl font-bold text-gray-900">Upload your arena</p>
                  <p className="text-sm font-medium">JPG, PNG or WEBP (Max 10MB)</p>
                </div>
              </div>
            )}
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button 
              onClick={() => startMatch('RANDOM')}
              disabled={loading}
              className="h-24 bg-blue-600 hover:bg-blue-700 text-white rounded-[32px] flex items-center justify-center gap-4 font-black text-2xl shadow-xl shadow-blue-200 transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50"
            >
              <FastForward size={32} />
              Random Match
            </button>
            <button 
              onClick={() => startMatch('PRIVATE')}
              disabled={!selectedImage || loading}
              className="h-24 bg-black hover:bg-gray-900 text-white rounded-[32px] flex items-center justify-center gap-4 font-black text-2xl shadow-xl shadow-gray-200 transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50"
            >
              <ImageIcon size={32} />
              Private Arena
            </button>
          </div>
        </div>

        {/* Right: Settings */}
        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="bg-white p-8 rounded-[40px] border border-gray-100 shadow-xl space-y-10"
        >
          <div>
            <label className="block text-xs font-black text-gray-400 mb-6 uppercase tracking-[0.2em]">
              Intensity (Pieces)
            </label>
            <div className="grid grid-cols-2 gap-3">
              {[50, 150, 300, 500].map(count => (
                <button
                  key={count}
                  onClick={() => setPieceCount(count)}
                  className={`py-4 rounded-2xl text-lg font-black transition-all ${
                    pieceCount === count 
                      ? 'bg-blue-600 text-white shadow-lg' 
                      : 'bg-gray-50 text-gray-400 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                >
                  {count}
                </button>
              ))}
              <div className="col-span-2 flex rounded-2xl transition-all overflow-hidden border-2 border-gray-100 bg-gray-50 has-[:focus]:border-blue-500">
                <input 
                  type="number"
                  placeholder="Custom Pieces"
                  value={![50, 150, 300, 500].includes(pieceCount) ? pieceCount : ''}
                  onChange={(e) => setPieceCount(parseInt(e.target.value) || 0)}
                  className="w-full bg-transparent px-4 py-4 text-center text-lg font-black focus:outline-none placeholder:text-gray-300"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-black text-gray-400 mb-6 uppercase tracking-[0.2em]">
              Combat Level
            </label>
            <div className="space-y-3">
              <label 
                className={`flex items-center gap-4 p-5 rounded-3xl border-4 cursor-pointer transition-all ${
                  difficulty === 'normal' ? 'border-blue-500 bg-blue-50' : 'border-gray-50 hover:border-gray-100'
                }`}
              >
                <input type="radio" name="diff" className="hidden" checked={difficulty === 'normal'} onChange={() => setDifficulty('normal')} />
                <div className={`w-6 h-6 rounded-full border-4 ${difficulty === 'normal' ? 'border-blue-600 bg-white' : 'border-gray-200'}`} />
                <div>
                  <p className="font-black text-gray-900 leading-tight">Normal</p>
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Standard Rules</p>
                </div>
              </label>
              <label 
                className={`flex items-center gap-4 p-5 rounded-3xl border-4 cursor-pointer transition-all ${
                  difficulty === 'hard' ? 'border-red-500 bg-red-50' : 'border-gray-50 hover:border-gray-100'
                }`}
              >
                <input type="radio" name="diff" className="hidden" checked={difficulty === 'hard'} onChange={() => setDifficulty('hard')} />
                <div className={`w-6 h-6 rounded-full border-4 ${difficulty === 'hard' ? 'border-red-600 bg-white' : 'border-gray-200'}`} />
                <div>
                  <p className="font-black text-gray-900 leading-tight">Survival</p>
                  <p className="text-[10px] text-red-400 font-bold uppercase tracking-wider underline decoration-red-200 underline-offset-4">Fakes + Quakes</p>
                </div>
              </label>
            </div>
          </div>

          {error && (
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="p-4 bg-red-50 border border-red-100 rounded-2xl text-red-600 text-xs font-bold text-center"
            >
              {error}
            </motion.div>
          )}

          {loading && (
            <div className="flex flex-col items-center gap-3">
              <motion.div 
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full"
              />
              <p className="text-sm font-black text-gray-400 animate-pulse uppercase tracking-widest">Searching for Rival...</p>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
