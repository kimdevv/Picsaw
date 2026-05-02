export type PieceShape = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export function drawPieceShape(
  ctx: CanvasRenderingContext2D, 
  x: number, 
  y: number, 
  w: number, 
  h: number, 
  shape: PieceShape,
  stroke: boolean = true
) {
  const tabW = w * 0.25;
  const tabH = h * 0.2;

  ctx.beginPath();
  ctx.moveTo(x, y);

  // TOP
  if (shape.top === 0) {
    ctx.lineTo(x + w, y);
  } else {
    const s = shape.top;
    ctx.lineTo(x + w * 0.35, y);
    ctx.bezierCurveTo(x + w * 0.35, y - tabH * s, x + w * 0.45, y - tabH * s * 1.5, x + w * 0.5, y - tabH * s * 1.5);
    ctx.bezierCurveTo(x + w * 0.55, y - tabH * s * 1.5, x + w * 0.65, y - tabH * s, x + w * 0.65, y);
    ctx.lineTo(x + w, y);
  }

  // RIGHT
  if (shape.right === 0) {
    ctx.lineTo(x + w, y + h);
  } else {
    const s = shape.right;
    ctx.lineTo(x + w, y + h * 0.35);
    ctx.bezierCurveTo(x + w + tabH * s, y + h * 0.35, x + w + tabH * s * 1.5, y + h * 0.45, x + w + tabH * s * 1.5, y + h * 0.5);
    ctx.bezierCurveTo(x + w + tabH * s * 1.5, y + h * 0.55, x + w + tabH * s, y + h * 0.65, x + w, y + h * 0.65);
    ctx.lineTo(x + w, y + h);
  }

  // BOTTOM
  if (shape.bottom === 0) {
    ctx.lineTo(x, y + h);
  } else {
    const s = shape.bottom;
    ctx.lineTo(x + w * 0.65, y + h);
    ctx.bezierCurveTo(x + w * 0.65, y + h + tabH * s, x + w * 0.55, y + h + tabH * s * 1.5, x + w * 0.5, y + h + tabH * s * 1.5);
    ctx.bezierCurveTo(x + w * 0.45, y + h + tabH * s * 1.5, x + w * 0.35, y + h + tabH * s, x + w * 0.35, y + h);
    ctx.lineTo(x, y + h);
  }

  // LEFT
  if (shape.left === 0) {
    ctx.lineTo(x, y);
  } else {
    const s = shape.left;
    ctx.lineTo(x, y + h * 0.65);
    ctx.bezierCurveTo(x - tabH * s, y + h * 0.65, x - tabH * s * 1.5, y + h * 0.55, x - tabH * s * 1.5, y + h * 0.5);
    ctx.bezierCurveTo(x - tabH * s * 1.5, y + h * 0.45, x - tabH * s, y + h * 0.35, x, y + h * 0.35);
    ctx.lineTo(x, y);
  }

  ctx.closePath();
  if (stroke) ctx.stroke();
}
