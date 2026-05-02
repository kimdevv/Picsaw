package com.picsaw.puzzle.repository;

import com.picsaw.puzzle.entity.PuzzleRoom;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface PuzzleRoomRepository extends JpaRepository<PuzzleRoom, String> {
}
