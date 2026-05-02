package com.picsaw.puzzle.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.util.List;

@Data
@AllArgsConstructor
@NoArgsConstructor
public class PuzzleResponse {
    private String roomId;
    private String imageUrl;
    private int width;
    private int height;
    private int rows;
    private int cols;
    private List<PieceDTO> pieces;
}
