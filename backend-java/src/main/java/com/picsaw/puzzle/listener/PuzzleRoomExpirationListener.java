package com.picsaw.puzzle.listener;

import com.picsaw.puzzle.repository.PuzzleRoomRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.connection.Message;
import org.springframework.data.redis.listener.KeyExpirationEventMessageListener;
import org.springframework.data.redis.listener.RedisMessageListenerContainer;
import org.springframework.stereotype.Component;

@Slf4j
@Component
public class PuzzleRoomExpirationListener extends KeyExpirationEventMessageListener {

    @Autowired
    private PuzzleRoomRepository roomRepository;

    public PuzzleRoomExpirationListener(RedisMessageListenerContainer listenerContainer) {
        super(listenerContainer);
    }

    @Override
    public void onMessage(Message message, byte[] pattern) {
        String expiredKey = message.toString();

        if (expiredKey.startsWith("room:timer:")) {
            String roomId = expiredKey.replace("room:timer:", "");
            log.info("Cleaning up room due to inactivity: {}", roomId);
            roomRepository.deleteById(roomId);
            // Optionally clean up other Redis keys (pieces)
        }
    }
}
