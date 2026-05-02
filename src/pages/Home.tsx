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

  const createRoom = async () => {
    if (!selectedImage) return;

    setLoading(true);
    setError(null);

    try {
      // 1. Validate image (Censorship)
      const valRes = await fetch('/api/validate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: selectedImage })
      });
      
      const contentType = valRes.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const text = await valRes.text();
        console.error('Server returned non-JSON:', text.slice(0, 200));
        throw new Error('Backend server is still starting up or encountered an error. Please wait 30-60 seconds.');
      }

      const valData = await valRes.json();
      if (!valRes.ok || !valData.safe) {
        throw new Error(valData.message || valData.reason || 'Image validation failed.');
      }

      // 2. Generate Puzzle Data
      const genRes = await fetch('/api/generate-puzzle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: selectedImage, pieceCount, difficulty })
      });
      
      const genContentType = genRes.headers.get('content-type');
      if (!genContentType || !genContentType.includes('application/json')) {
        throw new Error('Failed to generate puzzle. Backend might be overloaded or starting.');
      }

      if (!genRes.ok) throw new Error('Failed to generate puzzle board.');
      const puzzleData = await genRes.json();

      // Navigate to Room using the roomId returned from the java server
      // NOTE: Ensure your Spring Boot server is running on http://localhost:8080
      navigate(`/room/${puzzleData.roomId}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-12"
      >
        <h1 className="text-5xl font-extrabold text-gray-900 mb-4 tracking-tighter">
          Collaborative <span className="text-blue-600 underline underline-offset-8">Puzzle</span>
        </h1>
        <p className="text-gray-500 text-lg max-w-xl mx-auto">
          Upload an image, Invite friends, and solve together in real-time.
        </p>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
        {/* Left: Upload */}
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="space-y-6"
        >
          <div 
            onClick={() => fileInputRef.current?.click()}
            className="aspect-video border-2 border-dashed border-gray-300 rounded-3xl bg-white hover:border-blue-500 transition-all flex flex-col items-center justify-center cursor-pointer group overflow-hidden relative"
          >
            {selectedImage ? (
              <>
                <img src={selectedImage} alt="Preview" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                  <div className="px-4 py-2 bg-white rounded-full text-sm font-semibold flex items-center gap-2">
                    <Upload size={16} />
                    Change Image
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center gap-3 text-gray-400 group-hover:text-blue-500 transition-colors">
                <div className="w-16 h-16 rounded-2xl bg-gray-50 flex items-center justify-center group-hover:bg-blue-50">
                  <Upload size={32} />
                </div>
                <div className="text-center">
                  <p className="font-semibold text-gray-900">Click to upload</p>
                  <p className="text-xs">JPG, PNG or WEBP (Max 10MB)</p>
                </div>
              </div>
            )}
            <input 
              ref={fileInputRef}
              type="file" 
              accept="image/*" 
              onChange={handleFileChange} 
              className="hidden" 
            />
          </div>

          <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 p-3 rounded-xl border border-amber-100">
            <ShieldCheck size={14} className="shrink-0" />
            Images are scanned by AI for safety. Avoid sensitive content.
          </div>
        </motion.div>

        {/* Right: Settings */}
        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm space-y-8"
        >
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-4 uppercase tracking-widest">
              Piece Count
            </label>
            <div className="grid grid-cols-5 gap-2">
              {[50, 150, 300, 500].map(count => (
                <button
                  key={count}
                  onClick={() => setPieceCount(count)}
                  className={`py-2 rounded-xl text-sm font-medium transition-all ${
                    pieceCount === count 
                      ? 'bg-black text-white shadow-lg scale-105' 
                      : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {count}
                </button>
              ))}
              <div 
                className={`flex rounded-xl transition-all overflow-hidden border-2 ${
                  ![50, 150, 300, 500].includes(pieceCount) ? 'border-blue-500 shadow-md scale-105' : 'border-gray-50 bg-gray-50'
                }`}
              >
                <input 
                  type="number"
                  placeholder="입력"
                  value={![50, 150, 300, 500].includes(pieceCount) ? pieceCount : ''}
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    if (!isNaN(val)) setPieceCount(val);
                    else setPieceCount(0);
                  }}
                  className="w-full bg-transparent px-2 text-center text-sm font-bold focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-4 uppercase tracking-widest">
              Level
            </label>
            <div className="flex gap-4">
              <label 
                className={`flex-1 flex flex-col p-4 rounded-2xl border-2 cursor-pointer transition-all ${
                  difficulty === 'normal' ? 'border-blue-500 bg-blue-50' : 'border-gray-100 hover:border-gray-200'
                }`}
              >
                <input type="radio" name="diff" className="hidden" checked={difficulty === 'normal'} onChange={() => setDifficulty('normal')} />
                <span className="font-bold text-gray-900">Zen Mode</span>
                <span className="text-xs text-gray-500">Relaxing play</span>
              </label>
              <label 
                className={`flex-1 flex flex-col p-4 rounded-2xl border-2 cursor-pointer transition-all ${
                  difficulty === 'hard' ? 'border-red-500 bg-red-50' : 'border-gray-100 hover:border-gray-200'
                }`}
              >
                <input type="radio" name="diff" className="hidden" checked={difficulty === 'hard'} onChange={() => setDifficulty('hard')} />
                <span className="font-bold text-gray-900">Hard Mode</span>
                <span className="text-xs text-gray-500 underline decoration-red-200 underline-offset-2">Board shakes + Fake pieces</span>
              </label>
            </div>
          </div>

          {error && (
            <div className="p-4 bg-red-50 border border-red-100 rounded-2xl text-red-600 text-sm font-medium">
              {error}
            </div>
          )}

          <button
            onClick={createRoom}
            disabled={!selectedImage || loading}
            className="w-full h-16 bg-black text-white rounded-2xl flex items-center justify-center gap-3 font-bold text-lg hover:bg-gray-900 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 disabled:grayscale disabled:pointer-events-none"
          >
            {loading ? (
              <>
                <motion.div 
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full"
                />
                Creating Room...
              </>
            ) : (
              <>
                <FastForward size={24} />
                Start Game
              </>
            )}
          </button>
        </motion.div>
      </div>
    </div>
  );
}
