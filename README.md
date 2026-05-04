## 1. 기술 스택 (Tech Stack)

### 프론트엔드 (Frontend)
- **Framework**: React 18, Vite (초고속 빌드 및 개발 환경)
- **Styling**: Tailwind CSS (유틸리티 우선 스타일링)
- **Canvas Interface**: HTML5 Canvas API (수백 개의 조각을 고성능으로 렌더링하기 위해 DOM 대신 사용)
- **State Management**: React Hooks (State, Effect, Memo, Ref)
- **Animation**: motion/react (부드러운 UI 전환 및 모달 애니메이션)
- **Real-time**: StompJS / SockJS (WebSocket 프로토콜을 통한 실시간 위치 동기화)
- **Icons**: Lucide React

### 백엔드 (Backend)
- **Framework**: Spring Boot 3 (Java 기반 고성능 서버)
- **Database (Static)**: MySQL (방 정보, 생성 시간, 승자 정보 등 영구 데이터)
- **Database (Real-time)**: Redis (조각의 실시간 좌표, heldBy 점유 정보, 매칭 대기열)
- **Image Processing**: Thumbnailator (리사이징), Java AWT (조각 이미지 크롭 및 마스킹)
- **AI Integration**: Google Cloud Vision API (Safe Search를 통한 유해 이미지 자동 차단)
- **Messaging**: Spring WebSocket Message Broker (STOMP)

---

## 2. 시스템 아키텍처 및 데이터 흐름

### 2.1 이미지 파이프라인 (Image Pipeline)
1. **업로드**: 사용자가 선택하거나 업로드한 Base64 이미지를 서버로 전송.
2. **검증**: PuzzleController에서 Google Vision API를 호출하여 Adult/Violence/Racy 여부를 판단 (LIKELY(4) 이상 시 에러 반환).
3. **최적화**: 서버와 클라이언트의 부하를 줄이기 위해 원본 이미지를 최대 1200x900 사이즈로 자동 리사이징.
4. **생성**: 리사이징된 이미지를 기반으로 격자를 나누고 조각마다 유니크한 베지어 곡선 테두리를 부여하여 조각 데이터 생성.

### 2.2 실시간 상태 동기화 (State Sync)
- **Stateless Backend**: 서버는 세션을 유지하지 않으며, 모든 퍼즐 조각의 실시간 위치와 상태는 Redis에 저장되어 모든 접속자에게 동일한 상태를 보장합니다.
- **Concurrency Control**: 조각 객체에 heldBy (사용자 UID) 필드를 두어, 특정 플레이어가 잡고 있는 조각은 다른 플레이어가 조작할 수 없도록 물리적 락(Lock)을 구현했습니다.

---

## 3. 핵심 알고리즘 상세 (Detailed Algorithms)

### 3.1 퍼즐 그리드 및 조각 생성 (`PuzzleService.java`)
- **그리드 계산**: $RequestedCount$와 이미지 가로세로 비율을 사용하여 최적의 $(Rows, Cols)$를 찾습니다.
- **인터로킹(Interlocking) 생성**:
    - 조각의 각 면(상, 하, 좌, 우)은 `0(직선)`, `1(볼록/Tab)`, `-1(오목/Blank)` 값을 가집니다.
    - 서버는 조각을 생성하기 전 `vLines`와 `hLines` 2차원 배열을 사전 생성하여 조각들이 완벽하게 맞물리도록 설계되었습니다.
    - 예: 조각 (r, c)의 오른쪽 모양이 `1`이면, 조각 (r, c+1)의 왼쪽 모양은 반드시 `-1`입니다.

### 3.2 방해 조각 (Fake Pieces) 로직
- **생성 목적**: 게임의 난이도를 높여 흥미를 유발함.
- **생성 방법**: 실제 정답 조각 코드 중 하나를 랜덤 추출하여 이미지를 복제합니다.
- **모양 변조 (Mutation)**: 추출된 이미지의 테두리 모양(Shape)을 랜덤하게 재구성합니다.
- **절대 비매칭 정책**: 가짜 조각의 모양이 우연히 원본 슬롯과 일치하는 것을 방지하기 위해, 원본과 동일할 경우 강제로 한 면 이상을 반전시킵니다. 따라서 **가짜 조각은 절대로 정답 위치에 끼워지지 않습니다.**
- **생성 개수 정책**: Hard 모드 시 전체 조각 수의 약 **20%**가 가짜 조각으로 생성됩니다.

### 3.1 퍼즐 그리드 및 조각 생성 (`PuzzleService.java`)
- **그리드 계산**: $RequestedCount$와 이미지 가로세로 비율을 사용하여 최적의 $(Rows, Cols)$를 찾습니다.
- **인터로킹(Interlocking) 생성**:
    - 조각의 각 면(상, 하, 좌, 우)은 `0(직선)`, `1(볼록/Tab)`, `-1(오목/Blank)` 값을 가집니다.
    - 서버는 조각을 생성하기 전 `vLines`와 `hLines` 2차원 배열을 사전 생성하여 조각들이 완벽하게 맞물리도록 설계되었습니다.
    - 예: 조각 (r, c)의 오른쪽 모양이 `1`이면, 조각 (r, c+1)의 왼쪽 모양은 반드시 `-1`입니다.

### 3.2 방해 조각 (Fake Pieces) 로직
- **생성 목적**: 게임의 난이도를 높여 흥미를 유발함.
- **생성 방법**: 실제 정답 조각 코드 중 하나를 랜덤 추출하여 이미지를 복제합니다.
- **모양 변조 (Mutation)**: 추출된 이미지의 테두리 모양(Shape)을 랜덤하게 재구성합니다.
- **절대 비매칭 정책**: 가짜 조각의 모양이 우연히 원본 슬롯과 일치하는 것을 방지하기 위해, 원본과 동일할 경우 강제로 한 면 이상을 반전시킵니다. 따라서 **가짜 조각은 절대로 정답 위치에 끼워지지 않습니다.**
- **난이도 정책**: Normal 모드에서는 생성되지 않으며, Hard 모드 선택 시 전체 정답 조각 수의 약 20%가 가짜 조각으로 추가됩니다.

---

## 4. 환경 설정 및 변수 (Configuration)

### 4.1 백엔드 환경 변수 (`application.properties`)
백엔드 서버의 동작을 제어하는 모든 환경 변수 리스트입니다. 시스템 환경 변수를 통해 아래 값을 자유롭게 덮어쓸 수 있습니다.

| 환경 변수 | 설명 | 기본값 |
| :--- | :--- | :--- |
| `MYSQL_HOST` | MySQL 서버의 호스트 주소입니다. | `localhost` |
| `MYSQL_PORT` | MySQL 서버의 포트 번호입니다. | `3306` |
| `MYSQL_DATABASE` | 퍼즐 방 메타데이터를 저장할 데이터베이스 이름입니다. | `picsaw` |
| `MYSQL_USER` | MySQL 접속을 위한 사용자 계정 아이디입니다. | `root` |
| `MYSQL_PASSWORD` | MySQL 접속을 위한 비밀번호입니다. | (없음) |
| `REDIS_HOST` | 실시간 데이터 동기화 및 조각 상태 저장을 위한 Redis 호스트 주소입니다. | `localhost` |
| `REDIS_PORT` | Redis 서버의 포트 번호입니다. | `6379` |
| `VISION_KEY_PATH` | 구글 Vision API 인증을 위한 서비스 계정 키 파일 경로입니다. | `file:./google-key.json` |

### 4.2 프론트엔드 설정 (`vite.config.ts`)
- **Proxy**: `/api` 및 `/ws-puzzle` 경로를 `localhost:8080`으로 포워딩하여 CORS 문제를 해결하고 개발 편의성을 높임.
- **Global Define**: `process.env.GEMINI_API_KEY`를 빌드 타임에 주입하여 클라이언트 AI 기능 지원.

---

## 5. API 명세서 (API Specification)

### 5.1 REST API (HTTP)

#### `POST /api/validate-image`
- 이미지의 안전성을 검사합니다. (Google Vision API 사용)
- **요청**: `{"image": "base64..."}`
- **응답**: `{"safe": boolean, "reason": "문구"}`

#### `POST /api/generate-puzzle`
- 새로운 퍼즐 방을 생성하고 조각들을 배치합니다.
- **요청**: `{"image": "base64", "pieceCount": n, "difficulty": "normal|hard"}`
- **응답**: `PuzzleResponse` (이미지 URL, 크기 정보, 모든 조각 초기 데이터 포함)

#### `GET /api/room/{roomId}`
- 생성된 퍼즐 방의 메타데이터(크기, 조각 수 등)를 조회합니다.
- **응답**: `PuzzleRoom` 객체 (ID, 너비, 높이, 난이도 등)

#### `GET /api/room/{roomId}/pieces`
- 방에 참여할 때 Redis에서 현재 조각들의 실시간 위치를 대량 조회합니다.
- **응답**: `List<PieceDTO>` (모든 조각의 현재 상태)

#### `GET /api/room/{roomId}/players`
- 현재 방에 참여 중인 플레이어 목록과 닉네임을 가져옵니다.
- **응답**: `{ "userId": "nickname", ... }`

---

### 5.2 WebSocket 통신 (STOMP)

구독(Subscribe) 경로: `/topic/room/{roomId}`

| 타입 | 송신 경로 (Destination) | 내용 (Payload) | 서버 동작 및 효과 |
| :--- | :--- | :--- | :--- |
| **PICK** | `/pub/room/{id}/pick` | `pieceId, userId` | 해당 조각에 `heldBy` 락을 겁니다. 타 플레이어의 점유를 방지합니다. |
| **MOVE** | `/pub/room/{id}/move` | `pieceId, x, y` | 조각의 실시간 좌표를 브로드캐스트합니다. (50ms 쓰로틀링 적용) |
| **DROP** | `/pub/room/{id}/drop` | `pieceId, x, y, isCorrect` | 락을 해제하고 최종 위치 및 정답 여부를 Redis에 저장합니다. |
| **META** | `/pub/room/{id}/meta` | `userId, nickname` | 플레이어 정보를 갱신하고 플레이어 목록 UI를 동기화합니다. |

---

## 6. 클라이언트 핵심 구현 세부사항 (`PuzzleBoard.tsx`)

### 6.1 캔버스 물리 및 드로잉 엔진
- **레이어 구조**:
    1. **Target Area**: 퍼즐이 맞춰져야 할 실제 위치 표시 (점선).
    2. **Locked Pieces**: `isCorrect` 상태인 조각들 (가장 아래 레이어).
    3. **Floating Pieces**: 바닥에 흩어진 조각들.
    4. **Active Piece**: 현재 사용자가 드래그 중인 조각 (항상 최상단).
- **히트 테스트 (Click Detection)**: `ctx.isPointInPath`를 사용하여 베지어 곡선으로 그려진 퍼즐의 복잡한 영역을 완벽하게 인식합니다. 조각이 겹쳐있을 경우 데이터 배열의 역순(Z-index 상위)부터 검색합니다.

### 6.2 자석 스냅(Snap) 시스템
- 조각을 놓는 순간 정답 좌표(`ansX, ansY`)와의 거리를 계산합니다.
- **임계값**: **65px** 이내일 경우 자동으로 정답 위치에 달라붙으며 `isCorrect` 상태를 서버로 전송합니다.

### 6.3 성능 최적화
- **쓰로틀링(Throttling)**: 마우스 이동 이벤트를 가로채 50ms마다 한 번만 서버로 전송하여 네트워크 부하를 방지합니다.
- **이미지 버퍼링**: 캔버스 렌더링 시 투명한 영역 처리를 위해 `tabSize`만큼의 여백 오프셋을 자동 계산하여 이미지가 잘리지 않게 조정합니다.

---

## 7. 게임 로직 및 정책 (Policy)

- **데이터 보존**: 별도의 만료 정책이 없을 경우 Redis 데이터는 수동 삭제 전까지 유지되나, 운영 환경에 따라 TTL을 설정할 수 있습니다.
- **완료 판정**: 모든 원본 조각(가짜 조각 제외)이 `isCorrect: true`가 되는 순간 `onComplete` 콜백이 실행됩니다.
- **콘텐츠 검수**: 비정상적인 접근이나 유해한 이미지 업로드는 서버 사이드 검증 단계에서 사전 차단됩니다.
- **승리 조건**: 가짜 조각을 제외한 모든 원본 조각을 가장 먼저 맞춘 플레이어가 최종 승리자가 됩니다.
- **동기화**: 한 명의 플레이어가 게임을 종료하면 상대방에게도 알림창이 뜨며 게임이 공식 종료됩니다.
- **익명성**: 별도의 가입 없이 브라우저 localStorage 기반의 UUID를 사용하여 즉시 플레이가 가능합니다.

---

## 8. 로컬 실행 가이드 (How to Run)

프로젝트를 로컬 환경에서 구동하기 위한 순서입니다. Redis와 MySQL이 사전에 실행 중이어야 합니다.

### 8.1 백엔드 서버 (Spring Boot) 실행
1. terminal에서 `backend-java` 디렉토리로 이동합니다.
   ```bash
   cd backend-java
   ```
2. Gradle을 사용하여 서버를 실행합니다.
   ```bash
   ./gradlew bootRun
   ```
   - 서버는 기본적으로 `8080` 포트에서 실행됩니다.
또는 IntelliJ나 Eclipse 등에서 Run을 통해 실행하셔도 됩니다.

### 9.2 프론트엔드 서버 (Vite + React) 실행
1. 프로젝트 루트 디렉토리에서 의존성을 설치합니다 (최초 1회).
   ```bash
   npm install
   ```
2. 개발 서버를 실행합니다.
   ```bash
   npm run dev
   ```
   - 프론트엔드 서버는 `3000` 포트에서 실행되며, 백엔드와 자동으로 프록시 연동됩니다.

  ## 9. 게임 화면
  <img width="1911" height="918" alt="image" src="https://github.com/user-attachments/assets/97886fd0-252e-4ef9-85d7-0674a9d3095c" />

  <img width="1904" height="917" alt="image" src="https://github.com/user-attachments/assets/6d11468b-217a-4a43-89bc-7ccf689bfcac" />

  <img width="1904" height="917" alt="image" src="https://github.com/user-attachments/assets/3cd44333-a1fb-40d6-bf1e-f47891a7aff2" />

  <img width="1906" height="913" alt="image" src="https://github.com/user-attachments/assets/e2489faa-a11b-4dee-8f7b-e8ca9027ae3e" />
