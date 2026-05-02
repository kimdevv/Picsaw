package com.picsaw.puzzle.service;

import com.picsaw.puzzle.dto.PieceDTO;
import com.picsaw.puzzle.dto.PieceShape;
import com.picsaw.puzzle.dto.PieceState;
import com.picsaw.puzzle.dto.PuzzleResponse;
import net.coobird.thumbnailator.Thumbnails;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Random;

@Service
public class PuzzleService {

    @Autowired
    private RedisTemplate<String, Object> redisTemplate;

    private static final int MAX_WIDTH = 1200;
    private static final int MAX_HEIGHT = 900;

    public PuzzleResponse generatePuzzle(String base64Image, int requestedPieceCount, String difficulty) throws Exception {
        byte[] imageBytes = Base64.getDecoder().decode(base64Image.split(",")[1]);

        // 1. Resizing (Letterbox Logic)
        BufferedImage originalImage = ImageIO.read(new ByteArrayInputStream(imageBytes));
        double ratio = Math.min((double) MAX_WIDTH / originalImage.getWidth(), (double) MAX_HEIGHT / originalImage.getHeight());
        int finalW = (int) (originalImage.getWidth() * ratio);
        int finalH = (int) (originalImage.getHeight() * ratio);

        ByteArrayOutputStream os = new ByteArrayOutputStream();
        Thumbnails.of(new ByteArrayInputStream(imageBytes))
                .size(finalW, finalH)
                .outputFormat("jpg")
                .toOutputStream(os);

        String resizedBase64 = "data:image/jpeg;base64," + Base64.getEncoder().encodeToString(os.toByteArray());

        // 2. Grid Calculation
        int cols = (int) Math.round(Math.sqrt(requestedPieceCount * ((double) finalW / finalH)));
        int rows = (int) Math.round((double) requestedPieceCount / cols);
        int pieceW = finalW / cols;
        int pieceH = finalH / rows;

        // 3. Tab Shapes Generation
        int[][] vLines = new int[rows][cols + 1];
        int[][] hLines = new int[rows + 1][cols];
        Random rand = new Random();

        for (int i = 1; i < rows; i++) {
            for (int j = 0; j < cols; j++) hLines[i][j] = rand.nextBoolean() ? 1 : -1;
        }
        for (int i = 0; i < rows; i++) {
            for (int j = 1; j < cols; j++) vLines[i][j] = rand.nextBoolean() ? 1 : -1;
        }

        // 4. Piece Objects Creation
        List<PieceDTO> pieces = new ArrayList<>();
        int idCounter = 0;
        for (int r = 0; r < rows; r++) {
            for (int c = 0; c < cols; c++) {
                int ansX = c * pieceW;
                int ansY = r * pieceH;
                int realW = (c == cols - 1) ? (finalW - ansX) : pieceW;
                int realH = (r == rows - 1) ? (finalH - ansY) : pieceH;

                pieces.add(PieceDTO.builder()
                        .id("p-" + idCounter++)
                        .index(idCounter - 1)
                        .ansX(ansX)
                        .ansY(ansY)
                        .currentX(finalW + 80 + rand.nextDouble() * (finalW * 0.3))
                        .currentY(50 + rand.nextDouble() * (finalH - realH))
                        .width(realW)
                        .height(realH)
                        .shapes(new PieceShape(hLines[r][c], vLines[r][c+1] * -1, hLines[r+1][c] * -1, vLines[r][c]))
                        .isCorrect(false)
                        .heldBy(null)
                        .build());
            }
        }

        // 5. Add fake pieces (scaling with difficulty)
        float fakeRatio = "hard".equals(difficulty) ? 0.2f : 0.0f;
        int fakeCount = Math.max(2, (int) (pieces.size() * fakeRatio));
        for (int i = 0; i < fakeCount; i++) {
            PieceDTO source = pieces.get(rand.nextInt(pieces.size()));

            // Edge-aware randomization for fake pieces
            int top = (source.getAnsY() == 0) ? 0 : (rand.nextBoolean() ? 1 : -1);
            int left = (source.getAnsX() == 0) ? 0 : (rand.nextBoolean() ? 1 : -1);
            int bottom = (source.getAnsY() + source.getHeight() >= finalH) ? 0 : (rand.nextBoolean() ? 1 : -1);
            int right = (source.getAnsX() + source.getWidth() >= finalW) ? 0 : (rand.nextBoolean() ? 1 : -1);

            // FORCE at least one change if it happens to be the same shape as source
            if (top == source.getShapes().getTop() && right == source.getShapes().getRight() &&
                    bottom == source.getShapes().getBottom() && left == source.getShapes().getLeft()) {
                if (top != 0) top = -top;
                else if (right != 0) right = -right;
                else if (bottom != 0) bottom = -bottom;
                else if (left != 0) left = -left;
            }

            pieces.add(PieceDTO.builder()
                    .id("fake-" + idCounter++)
                    .ansX(source.getAnsX())
                    .ansY(source.getAnsY())
                    .currentX(finalW + 100 + rand.nextDouble() * (finalW * 0.4))
                    .currentY(rand.nextDouble() * (finalH - source.getHeight()))
                    .width(source.getWidth())
                    .height(source.getHeight())
                    .shapes(new PieceShape(top, right, bottom, left))
                    .isCorrect(false)
                    .heldBy(null)
                    .build());
        }

        return new PuzzleResponse(null, resizedBase64, finalW, finalH, rows, cols, pieces);
    }

    public void initializeRedisState(String roomId, List<PieceDTO> pieces) {
        String key = "room:" + roomId + ":pieces";
        for (PieceDTO p : pieces) {
            redisTemplate.opsForHash().put(key, p.getId(), p);
        }
    }

    public List<Object> getRoomPiecesFromRedis(String key) {
        return new ArrayList<>(redisTemplate.opsForHash().values(key));
    }
}
