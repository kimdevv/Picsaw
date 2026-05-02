package com.picsaw.puzzle.controller;

import com.picsaw.puzzle.dto.PuzzleResponse;
import com.picsaw.puzzle.service.PuzzleService;
import lombok.Data;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import com.google.auth.oauth2.GoogleCredentials;
import com.google.cloud.vision.v1.ImageAnnotatorSettings;

import java.util.Map;
import java.io.IOException;

@RestController
@RequestMapping("/api")
public class PuzzleController {

    @Autowired
    private PuzzleService puzzleService;

    @Autowired
    private com.picsaw.puzzle.repository.PuzzleRoomRepository puzzleRoomRepository;

    @Value("${google.cloud.vision.credentials.path:}")
    private String credentialsPath;

    private com.google.cloud.vision.v1.ImageAnnotatorClient getVisionClient() throws IOException {
        if (credentialsPath != null && !credentialsPath.isEmpty()) {
            try {
                // Read from application.properties path
                org.springframework.core.io.DefaultResourceLoader loader = new org.springframework.core.io.DefaultResourceLoader();
                Resource resource = loader.getResource(credentialsPath);
                GoogleCredentials credentials = GoogleCredentials.fromStream(resource.getInputStream());
                ImageAnnotatorSettings settings = ImageAnnotatorSettings.newBuilder()
                        .setCredentialsProvider(() -> credentials)
                        .build();
                return com.google.cloud.vision.v1.ImageAnnotatorClient.create(settings);
            } catch (Exception e) {
                System.err.println("Failed to load credentials from property: " + e.getMessage());
            }
        }
        // Fallback to default behavior
        return com.google.cloud.vision.v1.ImageAnnotatorClient.create();
    }

    @Autowired
    private org.springframework.data.redis.core.RedisTemplate<String, Object> redisTemplate;

    @GetMapping("/room/{roomId}/players")
    public ResponseEntity<?> getRoomPlayers(@PathVariable String roomId) {
        String key = "room:" + roomId + ":players";
        Map<Object, Object> players = redisTemplate.opsForHash().entries(key);
        return ResponseEntity.ok(players);
    }

    @PostMapping("/validate-image")
    public ResponseEntity<?> validateImage(@RequestBody Map<String, String> request) {
        String base64Image = request.get("image");
        if (base64Image == null || base64Image.isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "No image provided"));
        }

        try {
            String imageData = base64Image.contains(",") ? base64Image.split(",")[1] : base64Image;
            byte[] imgBytes = java.util.Base64.getDecoder().decode(imageData);

            try (com.google.cloud.vision.v1.ImageAnnotatorClient vision = getVisionClient()) {
                com.google.protobuf.ByteString imgByteString = com.google.protobuf.ByteString.copyFrom(imgBytes);
                com.google.cloud.vision.v1.Image img = com.google.cloud.vision.v1.Image.newBuilder().setContent(imgByteString).build();
                com.google.cloud.vision.v1.Feature feat = com.google.cloud.vision.v1.Feature.newBuilder().setType(com.google.cloud.vision.v1.Feature.Type.SAFE_SEARCH_DETECTION).build();
                com.google.cloud.vision.v1.AnnotateImageRequest apiReq = com.google.cloud.vision.v1.AnnotateImageRequest.newBuilder()
                        .addFeatures(feat)
                        .setImage(img)
                        .build();

                com.google.cloud.vision.v1.BatchAnnotateImagesResponse response = vision.batchAnnotateImages(java.util.List.of(apiReq));
                com.google.cloud.vision.v1.SafeSearchAnnotation safeSearch = response.getResponses(0).getSafeSearchAnnotation();

                // LIKELY(4) or VERY_LIKELY(5) check
                if (safeSearch.getAdultValue() >= 4 || safeSearch.getViolenceValue() >= 4 || safeSearch.getRacyValue() >= 4) {
                    return ResponseEntity.ok(Map.of("safe", false, "reason", "Image contains inappropriate content (Adult/Violence/Racy)."));
                }

                return ResponseEntity.ok(Map.of("safe", true));
            }
        } catch (Exception e) {
            System.err.println("Vision API Error: " + e.getMessage());
            // Fallback for dev environment if credentials are missing
            return ResponseEntity.ok(Map.of("safe", true, "warning", "Vision API check failed, passed by default. Error: " + e.getMessage()));
        }
    }

    @PostMapping("/generate-puzzle")
    public ResponseEntity<PuzzleResponse> generatePuzzle(@RequestBody PuzzleRequest request) {
        try {
            PuzzleResponse response = puzzleService.generatePuzzle(
                    request.getImage(),
                    request.getPieceCount(),
                    request.getDifficulty()
            );

            String roomId = java.util.UUID.randomUUID().toString();
            response.setRoomId(roomId);

            // MySQL Persistence
            try {
                com.picsaw.puzzle.entity.PuzzleRoom room = new com.picsaw.puzzle.entity.PuzzleRoom();
                room.setId(roomId);
                room.setPieceCount(request.getPieceCount());
                room.setDifficulty(request.getDifficulty());
                room.setWidth(response.getWidth());
                room.setHeight(response.getHeight());
                room.setImageUrl(response.getImageUrl());
                puzzleRoomRepository.save(room);

                // Initialize Redis Piece State
                puzzleService.initializeRedisState(roomId, response.getPieces());

                System.out.println("Room saved and Redis initialized ID: " + roomId);
            } catch (Exception dbEx) {
                System.err.println("DB Save failed: " + dbEx.getMessage());
            }

            return ResponseEntity.ok(response);
        } catch (Exception e) {
            return ResponseEntity.internalServerError().build();
        }
    }

    @GetMapping("/room/{roomId}")
    public ResponseEntity<?> getRoom(@PathVariable String roomId) {
        return puzzleRoomRepository.findById(roomId)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/room/{roomId}/pieces")
    public ResponseEntity<?> getRoomPieces(@PathVariable String roomId) {
        String key = "room:" + roomId + ":pieces";
        return ResponseEntity.ok(puzzleService.getRoomPiecesFromRedis(key));
    }

    @Data
    public static class PuzzleRequest {
        private String image;
        private int pieceCount;
        private String difficulty;
    }
}
