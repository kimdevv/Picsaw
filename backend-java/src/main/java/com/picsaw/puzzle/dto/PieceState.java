package com.picsaw.puzzle.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@AllArgsConstructor
@NoArgsConstructor
public class PieceState {
    private String id;
    private double x;
    private double y;
    private String heldBy;
    private boolean isCorrect;
}
