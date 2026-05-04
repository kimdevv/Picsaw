package com.picsaw.puzzle.service;

import com.picsaw.puzzle.entity.PuzzleRoom;
import com.picsaw.puzzle.repository.PuzzleRoomRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.Optional;

@Service
public class MatchService {

    @Autowired
    private PuzzleRoomRepository roomRepository;

    private ConcurrentLinkedQueue<String> randomMatchQueue = new ConcurrentLinkedQueue<>();

    public synchronized Optional<String> findMatch(String userId) {
        if (randomMatchQueue.contains(userId)) {
            return Optional.empty();
        }

        if (randomMatchQueue.isEmpty()) {
            randomMatchQueue.add(userId);
            return Optional.empty();
        } else {
            String opponentId = randomMatchQueue.poll();
            if (opponentId.equals(userId)) {
                randomMatchQueue.add(userId);
                return Optional.empty();
            }
            return Optional.of(opponentId);
        }
    }

    public void removeFromQueue(String userId) {
        randomMatchQueue.remove(userId);
    }
}
