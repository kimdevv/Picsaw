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
    private String id; // Firestore Room ID와 매칭 가능
    
    private String creatorId;
    private int pieceCount;
    private String difficulty;
    
    @Column(columnDefinition = "MEDIUMTEXT")
    private String imageUrl;
    
    private int width;
    private int height;
    
    private boolean isCompleted;
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
    }
}
