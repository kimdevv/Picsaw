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

export default function PuzzleBoard({ 
  room, 
  pieces, 
  setPieces, 
  isReadOnly = false, 
  userNickname, 
  onPieceMove,
  onPiecePick,
  onPieceDrop
}: { 
  room: RoomData, 
  pieces: Piece[], 
  setPieces?: React.Dispatch<React.SetStateAction<Piece[]>>,
  isReadOnly?: boolean,
  userNickname?: string,
  onPieceMove?: (pieceId: string, x: number, y: number) => void,
  onPiecePick?: (pieceId: string) => void,
  onPieceDrop?: (pieceId: string, x: number, y: number, isCorrect: boolean) => void
}) {
  const { user } = useAuth();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const piecesRef = useRef<Piece[]>([]);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [draggedPieceId, setDraggedPieceId] = useState<string | null>(null);
  const draggedPieceIdRef = useRef<string | null>(null);
  const offsetRef = useRef({ x: 0, y: 0 });
  const lastUpdateTime = useRef<number>(0);
  
  useEffect(() => {
    piecesRef.current = pieces;
  }, [pieces]);

  useEffect(() => {
    draggedPieceIdRef.current = draggedPieceId;
  }, [draggedPieceId]);

  // Load Image
  useEffect(() => {
    const img = new Image();
    img.src = room.imageUrl;
    img.onload = () => setImage(img);
  }, [room.imageUrl]);

  // Render loop
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
      ctx.fillStyle = '#f1f5f9'; 
      ctx.fillRect(50, 50, room.width, room.height);
      ctx.strokeStyle = '#cbd5e1';
      ctx.setLineDash([10, 5]);
      ctx.lineWidth = 1;
      ctx.strokeRect(50, 50, room.width, room.height);
      ctx.setLineDash([]);

      currentPieces.filter(p => p.isCorrect && !p.heldBy && p.id !== dId).forEach(p => drawPiece(ctx, p, true));
      currentPieces.filter(p => (!p.isCorrect || p.heldBy) && p.id !== dId).forEach(p => drawPiece(ctx, p, false, p.heldBy === user?.uid, !!(p.heldBy && p.heldBy !== user?.uid)));
      
      const draggedPiece = currentPieces.find(p => p.id === dId);
      if (draggedPiece) drawPiece(ctx, draggedPiece, false, true, false);
      
      animId = requestAnimationFrame(render);
    };

    const drawPiece = (ctx: CanvasRenderingContext2D, p: Piece, isCorrect: boolean, isMe: boolean = false, isOther: boolean = false) => {
      const x = isCorrect ? (p.ansX + 50) : (p.currentX + 50);
      const y = isCorrect ? (p.ansY + 50) : (p.currentY + 50);
      const tabH = Math.ceil(p.height * 0.2 * 1.5) + 10; 

      ctx.save();
      drawPieceShape(ctx, x, y, p.width, p.height, p.shapes, false);
      ctx.clip();
      
      const sx = p.ansX - tabH;
      const sy = p.ansY - tabH;
      const sourceX = Math.max(0, sx);
      const sourceY = Math.max(0, sy);
      const sourceW = (p.width + tabH * 2) - (sourceX - sx);
      const sourceH = (p.height + tabH * 2) - (sourceY - sy);
      
      ctx.drawImage(image, sourceX, sourceY, sourceW, sourceH, x - tabH + (sourceX - sx), y - tabH + (sourceY - sy), sourceW, sourceH);
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
  }, [image, room.width, room.height, user?.uid]);

  // Drag logic
  useEffect(() => {
    if (isReadOnly) return;

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

      const target = piecesRef.current.find(p => p.id === pId);
      if (target) {
        target.currentX = newX;
        target.currentY = newY;
      }

      const now = Date.now();
      if (now - lastUpdateTime.current > 50) {
        onPieceMove?.(pId, newX, newY);
        lastUpdateTime.current = now;
      }
    };

    const handleMouseUp = () => {
      const pId = draggedPieceIdRef.current;
      if (!pId || !user) return;
      
      const p = piecesRef.current.find(p => p.id === pId);
      if (p) {
        const snapThreshold = 65;
        const isCorrect = !p.id.startsWith('fake') && 
                          Math.abs(p.currentX - p.ansX) < snapThreshold && 
                          Math.abs(p.currentY - p.ansY) < snapThreshold;

        const finalX = isCorrect ? p.ansX : p.currentX;
        const finalY = isCorrect ? p.ansY : p.currentY;

        onPieceDrop?.(pId, finalX, finalY, isCorrect);
        setPieces?.(prev => prev.map(item => 
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
  }, [user, room.id, isReadOnly, onPieceMove, onPieceDrop, setPieces]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (isReadOnly || !user) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const mouseX = (e.clientX - rect.left) * scaleX;
    const mouseY = (e.clientY - rect.top) * scaleY;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
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
          onPiecePick?.(p.id);
          p.heldBy = user.uid;
          return;
        }
      }
    }
  };

  return (
    <div className={`relative bg-white rounded-3xl overflow-hidden shadow-xl border border-gray-100 ${isReadOnly ? 'scale-75 origin-top' : ''}`}>
      <canvas
        ref={canvasRef}
        width={room.width * 1.5} 
        height={room.height + 200}
        onMouseDown={handleMouseDown}
        className={`max-w-full max-h-full w-auto h-auto object-contain ${isReadOnly ? 'pointer-events-none' : 'cursor-grab active:cursor-grabbing'}`}
      />
    </div>
  );
}
