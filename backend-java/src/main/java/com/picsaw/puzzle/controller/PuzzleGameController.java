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

    // Movement sync (MOVE) - broadcast to all users in the room
    @MessageMapping("/room/{roomId}/move")
    public void movePiece(@DestinationVariable String roomId, MoveAction action) {
        String key = "room:" + roomId + ":pieces";

        // Update Redis
        Map<Object, Object> pieces = redisTemplate.opsForHash().entries(key);
        PieceDTO state = (PieceDTO) pieces.get(action.getPieceId());

        if (state != null) {
            state.setCurrentX(action.getX());
            state.setCurrentY(action.getY());
            redisTemplate.opsForHash().put(key, action.getPieceId(), state);

            // Broadcast
            messagingTemplate.convertAndSend("/topic/room/" + roomId, Map.of(
                    "type", "MOVE",
                    "pieceId", action.getPieceId(),
                    "x", action.getX(),
                    "y", action.getY()
            ));
        }
    }

    // Capture piece (PICK)
    @MessageMapping("/room/{roomId}/pick")
    public void pickPiece(@DestinationVariable String roomId, PickAction action) {
        String key = "room:" + roomId + ":pieces";
        PieceDTO state = (PieceDTO) redisTemplate.opsForHash().get(key, action.getPieceId());

        if (state != null && state.getHeldBy() == null) {
            state.setHeldBy(action.getUserId());
            redisTemplate.opsForHash().put(key, action.getPieceId(), state);

            messagingTemplate.convertAndSend("/topic/room/" + roomId, Map.of(
                    "type", "PICK",
                    "pieceId", action.getPieceId(),
                    "userId", action.getUserId()
            ));
        }
    }

    // Release piece (DROP)
    @MessageMapping("/room/{roomId}/drop")
    public void dropPiece(@DestinationVariable String roomId, DropAction action) {
        String key = "room:" + roomId + ":pieces";
        PieceDTO state = (PieceDTO) redisTemplate.opsForHash().get(key, action.getPieceId());

        if (state != null) {
            state.setHeldBy(null);
            state.setCurrentX(action.getX());
            state.setCurrentY(action.getY());
            state.setCorrect(action.isCorrect());

            redisTemplate.opsForHash().put(key, action.getPieceId(), state);

            messagingTemplate.convertAndSend("/topic/room/" + roomId, Map.of(
                    "type", "DROP",
                    "pieceId", action.getPieceId(),
                    "x", action.getX(),
                    "y", action.getY(),
                    "isCorrect", action.isCorrect()
            ));
        }
    }

    // Update player info (META)
    @MessageMapping("/room/{roomId}/meta")
    public void updateMeta(@DestinationVariable String roomId, MetaAction action) {
        String key = "room:" + roomId + ":players";
        redisTemplate.opsForHash().put(key, action.getUserId(), action.getNickname());

        messagingTemplate.convertAndSend("/topic/room/" + roomId, Map.of(
                "type", "META",
                "userId", action.getUserId(),
                "nickname", action.getNickname()
        ));
    }

    @Data
    public static class MetaAction {
        private String userId;
        private String nickname;
    }

    @Data
    public static class MoveAction {
        private String pieceId;
        private double x;
        private double y;
    }

    @Data
    public static class PickAction {
        private String pieceId;
        private String userId;
    }

    @Data
    public static class DropAction {
        private String pieceId;
        private double x;
        private double y;
        @com.fasterxml.jackson.annotation.JsonProperty("isCorrect")
        private boolean isCorrect;
    }
}
