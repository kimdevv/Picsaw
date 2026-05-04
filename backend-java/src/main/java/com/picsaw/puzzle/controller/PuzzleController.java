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
    private com.picsaw.puzzle.service.MatchService matchService;

    @Autowired
    private org.springframework.data.redis.core.RedisTemplate<String, Object> redisTemplate;

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

                if (safeSearch.getAdultValue() >= 4 || safeSearch.getViolenceValue() >= 4 || safeSearch.getRacyValue() >= 4) {
                    return ResponseEntity.ok(Map.of("safe", false, "reason", "Image contains inappropriate content."));
                }
                return ResponseEntity.ok(Map.of("safe", true));
            }
        } catch (Exception e) {
            return ResponseEntity.ok(Map.of("safe", true)); // Fallback if API not configured
        }
    }

    @Autowired
    private com.fasterxml.jackson.databind.ObjectMapper objectMapper;

    @PostMapping("/match/random")
    public ResponseEntity<?> randomMatch(@RequestBody Map<String, Object> request) {
        String userId = (String) request.get("userId");
        String image = (String) request.get("image");
        Integer pieceCount = (Integer) request.get("pieceCount");
        String difficulty = (String) request.get("difficulty");

        if (userId == null) return ResponseEntity.badRequest().body("UserId is required");

        java.util.Optional<String> opponentId = matchService.findMatch(userId);
        if (opponentId.isPresent()) {
            String roomId = java.util.UUID.randomUUID().toString();
            String waiterId = opponentId.get();

            System.out.println("Matching " + userId + " with waiter " + waiterId);

            // Create the actual room in DB so both can join immediately
            try {
                PuzzleResponse puzzle = puzzleService.generatePuzzle(image, pieceCount, difficulty);
                com.picsaw.puzzle.entity.PuzzleRoom room = new com.picsaw.puzzle.entity.PuzzleRoom();
                room.setId(roomId);
                room.setPieceCount(pieceCount);
                room.setDifficulty(difficulty);
                room.setWidth(puzzle.getWidth());
                room.setHeight(puzzle.getHeight());
                room.setImageUrl(puzzle.getImageUrl());
                room.setCreatorId(userId);
                room.setPlayer1Id(waiterId); // The waiter
                room.setPlayer2Id(userId); // The matcher
                room.setMatchType("RANDOM");
                room.setStatus("PLAYING");
                puzzleRoomRepository.save(room);

                // Initialize Redis for BOTH
                puzzleService.initializeRedisState(roomId, userId, puzzle.getPieces());
                puzzleService.initializeRedisState(roomId, waiterId, puzzle.getPieces());

                Map<String, String> matchData = Map.of(
                        "roomId", roomId,
                        "player1Id", waiterId,
                        "player2Id", userId,
                        "status", "MATCHED"
                );

                String matchDataJson = objectMapper.writeValueAsString(matchData);
                redisTemplate.opsForValue().set("match:pending:" + userId, matchDataJson, java.time.Duration.ofMinutes(1));
                redisTemplate.opsForValue().set("match:pending:" + waiterId, matchDataJson, java.time.Duration.ofMinutes(1));

                System.out.println("Match keys set for " + userId + " and " + waiterId);
                return ResponseEntity.ok(Map.of("status", "MATCHED", "data", matchData));
            } catch (Exception e) {
                System.err.println("Random match room generation failed: " + e.getMessage());
                return ResponseEntity.internalServerError().build();
            }
        } else {
            System.out.println("User " + userId + " waiting for match...");
            return ResponseEntity.ok(Map.of("status", "WAITING"));
        }
    }

    @GetMapping("/match/status/{userId}")
    public ResponseEntity<?> getMatchStatus(@PathVariable String userId) {
        Object data = redisTemplate.opsForValue().get("match:pending:" + userId);
        if (data != null) {
            redisTemplate.delete("match:pending:" + userId);
            try {
                // If it was stored as JSON string (or serialized map)
                if (data instanceof String) {
                    Map<String, String> matchMap = objectMapper.readValue((String) data, Map.class);
                    return ResponseEntity.ok(Map.of("status", "MATCHED", "data", matchMap));
                }
                return ResponseEntity.ok(Map.of("status", "MATCHED", "data", data));
            } catch (Exception e) {
                System.err.println("Match status parse failed: " + e.getMessage());
                return ResponseEntity.ok(Map.of("status", "MATCHED", "data", data));
            }
        }
        return ResponseEntity.ok(Map.of("status", "WAITING"));
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
                room.setCreatorId(request.getUserId());
                room.setPlayer1Id(request.getUserId());
                room.setMatchType(request.getMatchType()); // "RANDOM" or "PRIVATE"
                room.setStatus(request.getMatchType().equals("RANDOM") ? "PLAYING" : "WAITING");

                puzzleRoomRepository.save(room);

                // Initialize Redis Piece State for BOTH players if RANDOM, or creator if PRIVATE
                puzzleService.initializeRedisState(roomId, request.getUserId(), response.getPieces());
                if (request.getOpponentId() != null) {
                    puzzleService.initializeRedisState(roomId, request.getOpponentId(), response.getPieces());
                }

                System.out.println("Room saved and Redis initialized ID: " + roomId);
                return ResponseEntity.ok(response);
            } catch (Exception dbEx) {
                System.err.println("DB Save failed: " + dbEx.getMessage());
                return ResponseEntity.internalServerError().build();
            }
        } catch (Exception e) {
            System.err.println("Generate puzzle failed: " + e.getMessage());
            return ResponseEntity.internalServerError().build();
        }
    }

    @Autowired
    private org.springframework.messaging.simp.SimpMessagingTemplate messagingTemplate;

    @GetMapping("/room/{roomId}")
    public ResponseEntity<?> getRoom(@PathVariable String roomId, @RequestParam(required = false) String userId) {
        return puzzleRoomRepository.findById(roomId)
                .map(room -> {
                    if (userId != null && "PRIVATE".equals(room.getMatchType()) && room.getPlayer2Id() == null && !userId.equals(room.getPlayer1Id())) {
                        room.setPlayer2Id(userId);
                        room.setStatus("PLAYING");
                        puzzleRoomRepository.save(room);

                        try {
                            String p1Key = "room:" + roomId + ":user:" + room.getPlayer1Id() + ":pieces";
                            String p2Key = "room:" + roomId + ":user:" + userId + ":pieces";
                            Map<Object, Object> p1Pieces = redisTemplate.opsForHash().entries(p1Key);
                            if (!p1Pieces.isEmpty()) {
                                redisTemplate.opsForHash().putAll(p2Key, p1Pieces);
                            }

                            // Notify creator that someone joined
                            messagingTemplate.convertAndSend("/topic/room/" + roomId, Map.of(
                                    "type", "JOIN",
                                    "userId", userId
                            ));
                        } catch (Exception e) {
                            System.err.println("Failed to copy pieces or notify join: " + e.getMessage());
                        }
                    }
                    return ResponseEntity.ok(room);
                })
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping("/room/{roomId}/join")
    public ResponseEntity<?> joinRoom(@PathVariable String roomId, @RequestBody Map<String, String> request) {
        String userId = request.get("userId");
        return puzzleRoomRepository.findById(roomId).map(room -> {
            if (room.getPlayer2Id() == null && !room.getPlayer1Id().equals(userId)) {
                room.setPlayer2Id(userId);
                room.setStatus("PLAYING");
                puzzleRoomRepository.save(room);
            }
            return ResponseEntity.ok(room);
        }).orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/room/{roomId}/pieces")
    public ResponseEntity<?> getRoomPieces(@PathVariable String roomId, @RequestParam String userId) {
        return ResponseEntity.ok(puzzleService.getRoomPiecesFromRedis(roomId, userId));
    }

    @Data
    public static class PuzzleRequest {
        private String image;
        private int pieceCount;
        private String difficulty;
        private String userId;
        private String matchType;
        private String opponentId;
    }
}
