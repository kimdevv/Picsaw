package com.picsaw.puzzle.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import java.time.LocalDateTime;

@Entity
@Table(name = "puzzle_rooms")
@Getter
@Setter
public class PuzzleRoom {
    @Id
    private String id;

    private String creatorId;
    private String player1Id;
    private String player2Id;
    private int pieceCount;
    private String difficulty;

    @Column(columnDefinition = "MEDIUMTEXT")
    private String imageUrl;

    private int width;
    private int height;

    private boolean isPlayer1Finished;
    private boolean isPlayer2Finished;
    private boolean isCompleted;
    private String winnerId;

    private String matchType; // "RANDOM" or "PRIVATE"
    private String status; // "WAITING", "PLAYING", "FINISHED"

    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
    }
}
