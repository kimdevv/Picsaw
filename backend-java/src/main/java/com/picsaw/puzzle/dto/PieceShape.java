package com.picsaw.puzzle.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@AllArgsConstructor
@NoArgsConstructor
public class PieceShape {
    private int top;
    private int right;
    private int bottom;
    private int left;
}
