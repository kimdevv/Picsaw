package com.picsaw.puzzle.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@AllArgsConstructor
@NoArgsConstructor
public class PieceDTO {
    private String id;
    private int index;
    private int ansX;
    private int ansY;
    private double currentX;
    private double currentY;
    private int width;
    private int height;
    private PieceShape shapes;
    private boolean isCorrect;
    private String heldBy;
}
