import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { drawPieceShape, PieceShape } from '../lib/puzzleUtils';
import { motion } from 'motion/react';
import SockJS from 'sockjs-client';
import Stomp from 'stompjs';

interface Piece {
  id: string;
  ansX: number;
  ansY: number;
  currentX: number;
  currentY: number;
  width: number;
  height: number;
  shapes: PieceShape;
  heldBy?: string | null;
  isCorrect: boolean;
}

interface RoomData {
  id: string;
  imageUrl: string;
  width: number;
  height: number;
  difficulty: 'normal' | 'hard';
}

export default function PuzzleBoard({ room, onComplete, onPlayersUpdate, userNickname }: { room: RoomData, onComplete?: () => void, onPlayersUpdate?: (players: Record<string, string>) => void, userNickname?: string }) {
  const { user } = useAuth();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pieces, setPieces] = useState<Piece[]>([]);
  const piecesRef = useRef<Piece[]>([]);
  const [players, setPlayers] = useState<Record<string, string>>({}); // { userId: nickname }
  const playersRef = useRef<Record<string, string>>({});
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [draggedPieceId, setDraggedPieceId] = useState<string | null>(null);
  const draggedPieceIdRef = useRef<string | null>(null);
  const offsetRef = useRef({ x: 0, y: 0 });
  
  const stompClientRef = useRef<Stomp.Client | null>(null);
  const lastUpdateTime = useRef<number>(0);

  // Sync refs and Completion check
  useEffect(() => {
    piecesRef.current = pieces;
    // ... rest of the same effects ...
  }, [pieces]); // I'll split these to be cleaner

  useEffect(() => {
    if (pieces.length === 0) return;
    
    const realPieces = pieces.filter(p => !p.id.startsWith('fake'));
    const allCorrect = realPieces.length > 0 && realPieces.every(p => p.isCorrect);
    
    if (allCorrect) {
      const timer = setTimeout(() => onComplete?.(), 500);
      return () => clearTimeout(timer);
    }
  }, [pieces, onComplete]);

  useEffect(() => {
    draggedPieceIdRef.current = draggedPieceId;
  }, [draggedPieceId]);

  // Player meta sync effect
  useEffect(() => {
    playersRef.current = players;
    onPlayersUpdate?.(players);
  }, [players, onPlayersUpdate]);

  // Handle outgoing nickname changes
  useEffect(() => {
    if (stompClientRef.current?.connected && user && userNickname) {
      stompClientRef.current.send(`/pub/room/${room.id}/meta`, {}, JSON.stringify({
        userId: user.uid,
        nickname: userNickname
      }));
    }
  }, [userNickname, user, room.id]);

  // WebSocket update handler (stable)
  const updateFromEvent = (event: any) => {
    if (event.type === 'META') {
      setPlayers(prev => ({ ...prev, [event.userId]: event.nickname }));
      return;
    }

    setPieces(prev => prev.map(p => {
      if (p.id !== event.pieceId) return p;
      if (p.id === draggedPieceIdRef.current) return p;
      
      switch (event.type) {
        case 'MOVE':
          return { ...p, currentX: event.x, currentY: event.y };
        case 'PICK':
          return { ...p, heldBy: event.userId };
        case 'DROP':
          return { ...p, heldBy: null, currentX: event.x, currentY: event.y, isCorrect: event.isCorrect };
        default:
          return p;
      }
    }));
  };

  // Initial Load & WebSocket Connection
  useEffect(() => {
    const fetchData = async () => {
      // Fetch pieces
      const pRes = await fetch(`/api/room/${room.id}/pieces`);
      if (pRes.ok) setPieces(await pRes.json());

      // Fetch players
      const plRes = await fetch(`/api/room/${room.id}/players`);
      if (plRes.ok) {
        const data = await plRes.json();
        setPlayers(data);
      }
    };
    fetchData();

    const socket = new SockJS('/ws-puzzle');
    const client = Stomp.over(socket);
    client.debug = () => {};
    client.connect({}, () => {
      stompClientRef.current = client;
      
      // Initial identity broadcast if we have a nickname
      if (userNickname && user) {
        client.send(`/pub/room/${room.id}/meta`, {}, JSON.stringify({
          userId: user.uid,
          nickname: userNickname
        }));
      }

      client.subscribe(`/topic/room/${room.id}`, (message) => {
        updateFromEvent(JSON.parse(message.body));
      });
    });

    return () => {
      if (client.connected) client.disconnect(() => {});
    };
  }, [room.id]);

  // Load Image
  useEffect(() => {
    const img = new Image();
    img.src = room.imageUrl;
    img.onload = () => setImage(img);
  }, [room.imageUrl]);

  // High Performance Render loop
  useEffect(() => {
    if (!image) return;
    let animId: number;

    const render = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const currentPieces = piecesRef.current;
      const dId = draggedPieceIdRef.current;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Target area background
      ctx.fillStyle = '#f1f5f9'; 
      ctx.fillRect(50, 50, room.width, room.height);

      // Target area border
      ctx.strokeStyle = '#cbd5e1';
      ctx.setLineDash([10, 5]);
      ctx.lineWidth = 1;
      ctx.strokeRect(50, 50, room.width, room.height);
      ctx.setLineDash([]);

      // 1. Correct pieces (bottom layer)
      currentPieces.filter(p => p.isCorrect && !p.heldBy && p.id !== dId).forEach(p => drawPiece(ctx, p, true));
      
      // 2. Others
      currentPieces.filter(p => (!p.isCorrect || p.heldBy) && p.id !== dId).forEach(p => {
        const isMe = p.heldBy === user?.uid;
        const isOther = p.heldBy && p.heldBy !== user?.uid;
        drawPiece(ctx, p, false, isMe, isOther);
      });

      // 3. Dragged piece (top layer)
      const draggedPiece = currentPieces.find(p => p.id === dId);
      if (draggedPiece) {
        drawPiece(ctx, draggedPiece, false, true, false);
      }
      
      animId = requestAnimationFrame(render);
    };

    const drawPiece = (ctx: CanvasRenderingContext2D, p: Piece, isCorrect: boolean, isMe: boolean = false, isOther: boolean = false) => {
      const x = isCorrect ? (p.ansX + 50) : (p.currentX + 50);
      const y = isCorrect ? (p.ansY + 50) : (p.currentY + 50);
      const tabH = Math.ceil(p.height * 0.2 * 1.5) + 10; 

      ctx.save();
      drawPieceShape(ctx, x, y, p.width, p.height, p.shapes, false);
      ctx.clip();
      
      const sw = p.width + tabH * 2;
      const sh = p.height + tabH * 2;
      
      const sx = p.ansX - tabH;
      const sy = p.ansY - tabH;
      
      // Safety clip for edge pieces (prevents transparency)
      const sourceX = Math.max(0, sx);
      const sourceY = Math.max(0, sy);
      const sourceW = sw - (sourceX - sx);
      const sourceH = sh - (sourceY - sy);
      
      const destX = x - tabH + (sourceX - sx);
      const destY = y - tabH + (sourceY - sy);
      
      ctx.drawImage(
        image, 
        sourceX, sourceY, sourceW, sourceH,
        destX, destY, sourceW, sourceH
      );
      ctx.restore();

      ctx.save();
      if (isOther) { ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 2; }
      else if (isMe) { ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 2; }
      else if (isCorrect) { ctx.strokeStyle = '#10b981'; ctx.lineWidth = 0.5; ctx.globalAlpha = 0.5; }
      else { ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 1; }
      drawPieceShape(ctx, x, y, p.width, p.height, p.shapes, true);
      ctx.restore();
    };

    render();
    return () => cancelAnimationFrame(animId);
  }, [image, room.width, room.height, user?.uid]); // NO pieces in dependency array!

  // Window events for dragging
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const pId = draggedPieceIdRef.current;
      if (!pId || !user) return;
      
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const mouseX = (e.clientX - rect.left) * scaleX;
      const mouseY = (e.clientY - rect.top) * scaleY;

      const newX = (mouseX - 50) - offsetRef.current.x;
      const newY = (mouseY - 50) - offsetRef.current.y;

      // Update refs immediately for rendering
      const target = piecesRef.current.find(p => p.id === pId);
      if (target) {
        target.currentX = newX;
        target.currentY = newY;
      }

      // Throttle STOMP message
      const now = Date.now();
      if (now - lastUpdateTime.current > 50) {
        stompClientRef.current?.send(`/pub/room/${room.id}/move`, {}, JSON.stringify({
          pieceId: pId,
          x: newX,
          y: newY
        }));
        lastUpdateTime.current = now;
      }
    };

    const handleMouseUp = () => {
      const pId = draggedPieceIdRef.current;
      if (!pId || !user) return;
      
      const p = piecesRef.current.find(p => p.id === pId);
      if (p) {
        const snapThreshold = 65; // Further increased for better UX
        const isCorrect = !p.id.startsWith('fake') && 
                          Math.abs(p.currentX - p.ansX) < snapThreshold && 
                          Math.abs(p.currentY - p.ansY) < snapThreshold;

        const finalX = isCorrect ? p.ansX : p.currentX;
        const finalY = isCorrect ? p.ansY : p.currentY;

        console.log(`Drop piece ${pId}: isCorrect=${isCorrect}, dist=(${Math.abs(p.currentX - p.ansX)}, ${Math.abs(p.currentY - p.ansY)})`);

        stompClientRef.current?.send(`/pub/room/${room.id}/drop`, {}, JSON.stringify({
          pieceId: pId,
          userId: user.uid,
          x: finalX,
          y: finalY,
          isCorrect: isCorrect
        }));

        setPieces(prev => prev.map(item => 
          item.id === pId ? { ...item, currentX: finalX, currentY: finalY, isCorrect, heldBy: null } : item
        ));
      }
      setDraggedPieceId(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [user, room.id]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!user) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const mouseX = (e.clientX - rect.left) * scaleX;
    const mouseY = (e.clientY - rect.top) * scaleY;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Check pieces in reverse order (topmost first)
    const currentPieces = piecesRef.current;
    for (let i = currentPieces.length - 1; i >= 0; i--) {
      const p = currentPieces[i];
      if (p.heldBy && p.heldBy !== user.uid) continue;

      const px = (p.isCorrect ? p.ansX : p.currentX) + 50;
      const py = (p.isCorrect ? p.ansY : p.currentY) + 50;
      const margin = 35;

      if (mouseX >= px - margin && mouseX <= px + p.width + margin &&
          mouseY >= py - margin && mouseY <= py + p.height + margin) {
        
        ctx.beginPath();
        drawPieceShape(ctx, px, py, p.width, p.height, p.shapes, false);
        if (ctx.isPointInPath(mouseX, mouseY)) {
          setDraggedPieceId(p.id);
          offsetRef.current = { 
            x: (mouseX - 50) - (p.isCorrect ? p.ansX : p.currentX), 
            y: (mouseY - 50) - (p.isCorrect ? p.ansY : p.currentY) 
          };
          
          stompClientRef.current?.send(`/pub/room/${room.id}/pick`, {}, JSON.stringify({
            pieceId: p.id,
            userId: user.uid
          }));

          // Local update to ref for immediate visual feedback
          p.heldBy = user.uid;
          return;
        }
      }
    }
  };

  return (
    <div className="relative w-full h-[80vh] sm:h-[85vh] bg-gray-50 rounded-[40px] overflow-hidden shadow-[inset_0_2px_15px_rgba(0,0,0,0.05)] border border-gray-100 flex items-center justify-center p-4">
      <div className="w-full h-full flex items-center justify-center">
        <canvas
          ref={canvasRef}
          width={room.width * 1.5} 
          height={room.height + 200}
          onMouseDown={handleMouseDown}
          className="max-w-full max-h-full w-auto h-auto object-contain cursor-grab active:cursor-grabbing bg-white rounded-3xl shadow-xl transition-all duration-300"
        />
      </div>
      {room.difficulty === 'hard' && (
        <motion.div 
          animate={{ opacity: [0, 0.1, 0] }}
          transition={{ duration: 4, repeat: Infinity }}
          className="absolute inset-0 pointer-events-none bg-red-500/5 mix-blend-overlay"
        />
      )}
    </div>
  );
}
