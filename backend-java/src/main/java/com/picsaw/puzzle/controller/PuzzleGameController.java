package com.picsaw.puzzle.controller;

import com.picsaw.puzzle.dto.PieceDTO;
import lombok.Data;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;

import java.util.Map;

@Controller
public class PuzzleGameController {

    @Autowired
    private RedisTemplate<String, Object> redisTemplate;

    @Autowired
    private SimpMessagingTemplate messagingTemplate;

    @Autowired
    private com.picsaw.puzzle.repository.PuzzleRoomRepository puzzleRoomRepository;

    // Movement sync (MOVE)
    @MessageMapping("/room/{roomId}/move")
    public void movePiece(@DestinationVariable String roomId, MoveAction action) {
        String key = "room:" + roomId + ":user:" + action.getUserId() + ":pieces";

        PieceDTO state = (PieceDTO) redisTemplate.opsForHash().get(key, action.getPieceId());

        if (state != null) {
            state.setCurrentX(action.getX());
            state.setCurrentY(action.getY());
            redisTemplate.opsForHash().put(key, action.getPieceId(), state);

            // Broadcast to other player
            messagingTemplate.convertAndSend("/topic/room/" + roomId, Map.of(
                    "type", "MOVE",
                    "userId", action.getUserId(),
                    "pieceId", action.getPieceId(),
                    "x", action.getX(),
                    "y", action.getY()
            ));
        }
    }

    // Capture piece (PICK)
    @MessageMapping("/room/{roomId}/pick")
    public void pickPiece(@DestinationVariable String roomId, PickAction action) {
        String key = "room:" + roomId + ":user:" + action.getUserId() + ":pieces";
        PieceDTO state = (PieceDTO) redisTemplate.opsForHash().get(key, action.getPieceId());

        if (state != null) {
            state.setHeldBy(action.getUserId());
            redisTemplate.opsForHash().put(key, action.getPieceId(), state);

            messagingTemplate.convertAndSend("/topic/room/" + roomId, Map.of(
                    "type", "PICK",
                    "userId", action.getUserId(),
                    "pieceId", action.getPieceId()
            ));
        }
    }

    // Release piece (DROP)
    @MessageMapping("/room/{roomId}/drop")
    public void dropPiece(@DestinationVariable String roomId, DropAction action) {
        String key = "room:" + roomId + ":user:" + action.getUserId() + ":pieces";
        PieceDTO state = (PieceDTO) redisTemplate.opsForHash().get(key, action.getPieceId());

        if (state != null) {
            state.setHeldBy(null);
            state.setCurrentX(action.getX());
            state.setCurrentY(action.getY());
            state.setCorrect(action.isCorrect());

            redisTemplate.opsForHash().put(key, action.getPieceId(), state);

            messagingTemplate.convertAndSend("/topic/room/" + roomId, Map.of(
                    "type", "DROP",
                    "userId", action.getUserId(),
                    "pieceId", action.getPieceId(),
                    "x", action.getX(),
                    "y", action.getY(),
                    "isCorrect", action.isCorrect()
            ));

            // Check if finished and notify
            if (action.isFinished()) {
                // Update DB Status
                puzzleRoomRepository.findById(roomId).ifPresent(room -> {
                    room.setStatus("FINISHED");
                    room.setWinnerId(action.getUserId());
                    puzzleRoomRepository.save(room);
                });

                messagingTemplate.convertAndSend("/topic/room/" + roomId, Map.of(
                        "type", "FINISHED",
                        "userId", action.getUserId()
                ));
            }
        }
    }

    @Data
    public static class MoveAction {
        private String userId;
        private String pieceId;
        private double x;
        private double y;
    }

    @Data
    public static class PickAction {
        private String userId;
        private String pieceId;
    }

    @Data
    public static class DropAction {
        private String userId;
        private String pieceId;
        private double x;
        private double y;
        @com.fasterxml.jackson.annotation.JsonProperty("isCorrect")
        private boolean isCorrect;
        @com.fasterxml.jackson.annotation.JsonProperty("isFinished")
        private boolean isFinished;
    }
}
