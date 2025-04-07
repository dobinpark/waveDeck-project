# waveDeck AI Backend Project

## 1. 프로젝트 개요 (Project Overview)

본 프로젝트는 사용자가 업로드한 음성 파일을 기반으로 AI 음성 변환(STS: Speech-to-Speech) 기능을 제공하는 NestJS 기반 백엔드 애플리케이션입니다.

### 주요 기능

-   **음성 파일 업로드**: 사용자는 `.wav`, `.mp3` 등 형식의 음성 파일을 업로드할 수 있습니다.
-   **AI 음성 변환 요청**: 업로드된 파일을 기반으로 특정 목소리(Voice ID)와 피치(Pitch)를 지정하여 AI 변환을 요청할 수 있습니다.
-   **비동기 처리**: AI 변환은 시간이 소요될 수 있으므로 BullMQ (Redis 기반) 큐 시스템을 사용하여 비동기적으로 처리됩니다.
-   **작업 상태 추적**: 각 변환 작업의 상태(대기, 처리 중, 완료, 실패)를 조회할 수 있습니다.
-   **AI 처리 시뮬레이션**: 현재 AI 서버 연동 대신 랜덤 지연 및 실패를 포함한 Mock 처리를 시뮬레이션합니다.

## 2. 아키텍처 (Architecture)

본 프로젝트는 모듈 기반의 NestJS 아키텍처를 따르며, 주요 구성 요소는 다음과 같습니다.

```mermaid
graph LR
    Client -- HTTP Request --> Nginx[Nginx/Load Balancer (Optional)]
    Nginx -- Port Forwarding --> NestJS[NestJS Backend App]

    subgraph NestJS Backend App
        direction LR
        AppController[App Controller] -- Common Routes --> CommonModule[Common Module]
        UploadController[Upload Controller] -- /upload --> UploadModule[Upload Module]
        InferenceController[Inference Controller] -- /inference --> InferenceModule[Inference Module]

        UploadModule -- Uses --> TypeORM --> DB[(MySQL)]
        InferenceModule -- Uses --> TypeORM
        InferenceModule -- Adds Job --> BullMQ[BullMQ Module]
        BullMQ -- Uses --> Redis[(Redis)]
        InferenceProcessor[Inference Processor] -- Processes Job --> BullMQ
        InferenceProcessor -- Updates Status --> TypeORM

        CommonModule -- Global --> Filters[Exception Filters]
        CommonModule -- Global --> Interceptors[Response Interceptors]
        CommonModule -- Global --> Middlewares[Request ID Middleware]
        ConfigModule[Config Module] -- Provides Config --> UploadModule & InferenceModule & CommonModule
    end

    style NestJS fill:#f9f,stroke:#333,stroke-width:2px
    style DB fill:#ccf,stroke:#333,stroke-width:2px
    style Redis fill:#fcc,stroke:#333,stroke-width:2px
```

_(위 다이어그램은 Mermaid 문법으로 작성되었으며, GitHub 등에서 렌더링됩니다.)_

### 주요 모듈 설명 및 상호작용

-   **`AppModule`(Root)**: 애플리케이션의 루트 모듈로, 다른 모든 모듈과 TypeORM, ConfigModule 등을 임포트하고 설정합니다.
-   **`UploadModule`**: `/api/v1/upload` 경로의 API 요청을 처리합니다.
    -   `UploadController`: 클라이언트로부터 파일 업로드(`POST /audio`) 및 삭제(`DELETE /audio/:id`) 요청을 받습니다.
    -   `UploadService`: 파일 유효성 검사, 로컬 파일 시스템 저장 (`waveDeck-uploads` - Docker 볼륨 또는 로컬 경로), `uploads` 테이블에 메타데이터 저장/삭제 로직을 수행합니다.
-   **`InferenceModule`**: `/api/v1/inference` 경로의 API 요청을 처리합니다.
    -   `InferenceController`: AI 변환 요청(`POST /sts`) 및 작업 상태 조회(`GET /status/:jobId`) 요청을 받습니다. (엔드포인트 경로 수정 반영)
    -   `InferenceService`: 변환 요청 시 `inferences` 테이블에 작업 레코드를 생성하고, BullMQ (`inference-queue`)에 작업을 추가합니다. 작업 상태 조회 로직을 담당합니다.
-   **`BullMQModule`(Imported in `InferenceModule`)**: Redis 기반의 큐 시스템을 설정합니다.
    -   `InferenceProcessor`: `inference-queue`에 등록된 작업을 비동기적으로 처리하는 워커입니다. AI 처리(현재 Mock)를 수행하고, 그 결과를 `inferences` 테이블의 상태 및 결과 필드에 업데이트합니다.
-   **`CommonModule`**: 여러 모듈에서 공통으로 사용되는 기능을 제공합니다.
    -   `RequestIdMiddleware`: 모든 요청에 고유 ID를 부여하여 로깅 추적을 용이하게 합니다.
    -   `HttpExceptionFilter`: HTTP 예외를 처리하여 일관된 오류 응답 형식을 제공합니다.
    -   `ResponseInterceptor`: 성공적인 응답을 표준 형식(`{ statusCode, message, data }`)으로 래핑합니다.
-   **`ConfigModule`**: 환경 변수(`.env`)를 관리하고 애플리케이션 전체에서 사용 가능하게 합니다.
-   **`TypeOrmModule`**: MySQL 데이터베이스 연결 및 엔티티 관리를 담당합니다.

## 3. 기술 스택 (Tech Stack)

-   **Framework**: NestJS (v11)
-   **Language**: TypeScript
-   **Database**: MySQL (v8.0 via Docker)
-   **ORM**: TypeORM
-   **Queue System**: BullMQ (Redis 기반)
-   **Queue Broker**: Redis (v7 via Docker)
-   **Containerization**: Docker, Docker Compose
-   **Testing**: Jest
-   **Linting/Formatting**: ESLint, Prettier
-   **CI**: GitHub Actions

## 4. 실행 방법 (Getting Started)

### 사전 요구사항

-   [Docker](https://www.docker.com/) 설치 및 실행
-   [Docker Compose](https://docs.docker.com/compose/) (Docker Desktop에 보통 포함됨)

### 설정 단계

1.  **저장소 클론**:
    ```bash
    git clone <repository-url>
    cd waveDeck-project
    ```

2.  **환경 변수 파일 생성**: 프로젝트 루트에 `.env` 파일을 생성하고 아래 예시를 참고하여 **자신의 환경에 맞게** 수정합니다.
    ```dotenv
    # 애플리케이션 설정
    NODE_ENV=development
    PORT=3000 # 앱 컨테이너 내부 포트, 포트포워딩은 docker-compose.yml 에서 설정
    BASE_URL=http://localhost:3000 # 파일 미리보기 URL 등에 사용될 기본 URL (호스트 기준)

    # 데이터베이스 설정 (docker-compose.yml의 MySQL 서비스 설정과 일치해야 함)
    DB_TYPE=mysql
    DB_HOST=mysql # Docker Compose 서비스 이름 사용
    DB_PORT=3306  # 컨테이너 내부 포트
    DB_USERNAME=root
    DB_PASSWORD=your_mysql_root_password # 여기에 실제 MySQL 루트 비밀번호 입력
    DB_DATABASE=wavedeck

    # Redis 설정 (docker-compose.yml의 Redis 서비스 설정과 일치해야 함)
    REDIS_HOST=redis # Docker Compose 서비스 이름 사용
    REDIS_PORT=6379
    # REDIS_PASSWORD= # Redis 비밀번호 설정 시 주석 해제 및 입력
    ```
    **주의:** `DB_PASSWORD`는 `docker-compose.yml`의 `MYSQL_ROOT_PASSWORD`와 동일하게 설정해야 합니다.

3.  **(의존성 설치는 Docker 빌드 시 자동으로 수행됩니다)**

### Docker Compose 사용 (권장)

모든 서비스(앱, DB, Redis)를 Docker 컨테이너로 한 번에 실행합니다.

1.  **컨테이너 빌드 및 실행**:
    프로젝트 루트 디렉토리에서 다음 명령어를 실행합니다.
    ```bash
    docker-compose up --build
    ```
    -   `--build`: 이미지 변경 사항이 있을 경우 새로 빌드합니다.
    -   백그라운드 실행을 원하면 `-d` 옵션을 추가합니다: `docker-compose up -d --build`

2.  **데이터베이스 마이그레이션 실행**:
    **별도의 터미널**을 열고, 프로젝트 루트에서 다음 명령어를 실행하여 테이블을 생성합니다.
    ```bash
    docker-compose exec app npm run migration:run
    ```
    (컨테이너가 완전히 실행된 후 실행해야 합니다.)

3.  **(선택) 데이터 시딩 실행**:
    샘플 데이터를 생성하려면 다음 명령어를 실행합니다.
    ```bash
    docker-compose exec app npm run seed:run
    ```

4.  **접속 URL**: `http://localhost:3000` (또는 `docker-compose.yml`에서 `app` 서비스에 매핑한 호스트 포트)

5.  **컨테이너 로그 확인**: `docker-compose logs -f` (백그라운드 실행 시)

6.  **컨테이너 중지**: `Ctrl + C` (포그라운드 실행 시) 또는 `docker-compose down` (백그라운드 실행 시)

### (참고) 로컬 Node.js 직접 실행

로컬 환경에 Node.js (v18+), MySQL (v8), Redis (v7+)가 직접 설치되어 있어야 합니다. `.env` 파일의 `DB_HOST`, `REDIS_HOST`를 `localhost` 등으로 수정해야 할 수 있습니다.

```bash
# 1. 의존성 설치
npm install

# 2. 데이터베이스 마이그레이션 실행
npm run migration:run

# 3. (선택) 데이터 시딩 실행
npm run seed:run

# 4. 애플리케이션 실행 (개발 모드)
npm run start:dev
```

## 5. API 테스트 방법 (API Testing)

Postman, Insomnia 또는 `curl`과 같은 도구를 사용하여 API를 테스트할 수 있습니다.
모든 요청의 Base URL은 `http://localhost:3000/api/v1` 입니다. (Docker 실행 기준)

### 5.1. 파일 업로드 (`POST /upload/audio`)

-   **`curl` 예시**:
    ```bash
    curl --location --request POST 'http://localhost:3000/api/v1/upload/audio' \
    --form 'file=@"/path/to/your/audio.wav"' \
    --form 'userId="1"' \
    --form 'fileName="audio.wav"' \
    --form 'fileSize="102400"'
    # --form 'duration="15000"' # duration 필드는 현재 사용되지 않음
    # --form 'type="upload"'   # type 필드는 현재 사용되지 않음
    ```
-   **Postman 설정**:
    -   Method: `POST`
    -   URL: `http://localhost:3000/api/v1/upload/audio`
    -   Body: `form-data`
        -   `file`: (Type: File) 오디오 파일 선택 (`.wav`, `.mp3` 등)
        -   `userId`: `1`
        -   `fileName`: `audio.wav` (서버에서 파일명 사용)
        -   `fileSize`: `102400` (서버에서 파일 크기 사용)
-   **성공 응답 (201 Created)**: 업로드된 파일 정보 (`fileId`, `filePreviewUrl`, `uploadTime`) 반환
    ```json
    {
        "statusCode": 201,
        "message": "success",
        "data": {
            "fileId": 1, // 실제 생성된 ID
            "filePreviewUrl": "http://localhost:3000/waveDeck-uploads/audio/1/1.wav", // 실제 생성된 경로 (BASE_URL 기반)
            "uploadTime": "2024-07-29T10:00:00.123Z"
        }
    }
    ```

### 5.2. AI 변환 요청 (`POST /inference/sts`)

-   **`curl` 예시** (파일 업로드 후 얻은 `fileId` 사용):
    ```bash
    curl --location --request POST 'http://localhost:3000/api/v1/inference/sts' \
    --header 'Content-Type: application/json' \
    --data-raw '{
        "userId": 1,
        "fileId": 1,  // 업로드된 파일 ID
        "voiceId": 72,
        "pitch": 0
    }'
    ```
-   **Postman 설정**:
    -   Method: `POST`
    -   URL: `http://localhost:3000/api/v1/inference/sts`
    -   Body: `raw` (JSON)
        ```json
        {
          "userId": 1,
          "fileId": 1,
          "voiceId": 72,
          "pitch": 0
        }
        ```
-   **성공 응답 (201 Created 또는 202 Accepted)**: 작업 정보 (`jobId`, `jobQueueId`, `statusCheckUrl`) 반환
    ```json
    {
        "statusCode": 201, // 또는 202
        "message": "success", // 또는 "Inference job accepted..."
        "data": {
            "jobId": 1, // 실제 생성된 DB Job ID
            "jobQueueId": "inference-1", // 실제 생성된 BullMQ Job ID
            "statusCheckUrl": "/api/v1/inference/status/1"
        }
    }
    ```

### 5.3. 작업 상태 조회 (`GET /inference/status/:jobId`)

-   **`curl` 예시** (AI 변환 요청 후 얻은 DB `jobId` 사용):
    ```bash
    curl --location --request GET 'http://localhost:3000/api/v1/inference/status/1'
    ```
-   **Postman 설정**:
    -   Method: `GET`
    -   URL: `http://localhost:3000/api/v1/inference/status/1` (jobId를 실제 ID로 변경)
-   **성공 응답 (200 OK)**: 작업 상태 상세 정보 (`JobStatusResponseDto` 형식)
    ```json
    // 예시 1: 처리 중
    {
        "statusCode": 200,
        "message": "success", // 또는 "Status for job 1 retrieved..."
        "data": {
            "jobQueueId": "inference-1",
            "inferenceDbId": 1,
            "status": "processing", // "queued", "processing", "completed", "failed"
            "result": null,
            "queuePosition": null, // 현재 구현에서는 null 반환 가능성 높음
            "createdAt": "...",
            "updatedAt": "...",
            "errorMessage": null,
            "processingStartedAt": "...",
            "processingFinishedAt": null
        }
    }
    // 예시 2: 완료
    {
        "statusCode": 200,
        "message": "success",
        "data": {
            "jobQueueId": "inference-1",
            "inferenceDbId": 1,
            "status": "completed",
            "result": {
                "inferenceId": 1,
                "previewUrl": "http://localhost:3000/waveDeck-converted/audio/1/converted_1.wav", // 실제 변환 결과 경로
                "convertedPath": "waveDeck-converted/audio/1/converted_1.wav",
                "convertedFileSize": 345678
            },
            "queuePosition": null,
            "createdAt": "...",
            "updatedAt": "...",
            "errorMessage": null,
            "processingStartedAt": "...",
            "processingFinishedAt": "..."
        }
    }
    ```

### 5.4. 파일 삭제 (`DELETE /upload/audio/:id`)

-   **`curl` 예시** (삭제할 파일의 `fileId` 사용):
    ```bash
    curl --location --request DELETE 'http://localhost:3000/api/v1/upload/audio/1' \
    --header 'Content-Type: application/json' \
    --data-raw '{
        "userId": 1
    }'
    ```
-   **Postman 설정**:
    -   Method: `DELETE`
    -   URL: `http://localhost:3000/api/v1/upload/audio/1` (id를 실제 파일 ID로 변경)
    -   Body: `raw` (JSON)
        ```json
        { "userId": 1 } 
        ```
-   **성공 응답 (200 OK)**: 삭제 성공 메시지 반환
    ```json
    {
        "statusCode": 200,
        "message": "success", // 또는 "파일이 성공적으로 삭제되었습니다."
        "data": null
    }
    ```

## 6. 데이터베이스 (Database)

-   **DBMS**: MySQL 8.0 (Docker 컨테이너 사용)
-   **ORM**: TypeORM
-   **엔티티**: `src/upload/entities/upload.entity.ts`, `src/inference/entities/inference.entity.ts`
-   **설정**: `src/db/data-source.ts` (TypeORM CLI & Seeding용), `src/app.module.ts`(애플리케이션용 TypeOrmModule 설정)
-   **스키마 관리**: TypeORM 마이그레이션 (`src/db/migrations`)

### 테이블 구조

-   **`upload`**: 업로드된 파일 정보를 저장합니다.
    -   `id` (PK), `userId`, `fileName`, `filePath`, `fileSize`, `mimeType`, `duration`, `createdAt`, `updatedAt`
-   **`inference`**: AI 변환 작업 정보를 저장합니다.
    -   `id` (PK), `userId`, `uploadId` (FK -> upload.id), `jobQueueId`, `status`, `voiceId`, `pitch`, `originalPath`, `convertedPath`, `convertedFileSize`, `errorMessage`, `createdAt`, `updatedAt`, `processingStartedAt`, `processingFinishedAt`
-   **`migrations`**: TypeORM이 마이그레이션 기록을 관리하는 테이블입니다.

### 마이그레이션 명령어 (컨테이너 실행 중 별도 터미널에서 실행)

-   **마이그레이션 생성**: 엔티티 변경 후 실행합니다.
    ```bash
    # docker-compose exec app npm run migration:generate src/db/migrations/<MigrationName>
    docker-compose exec app npm run migration:generate src/db/migrations/MyNewMigration
    ```
-   **마이그레이션 실행**: 데이터베이스 스키마를 최신 상태로 업데이트합니다.
    ```bash
    docker-compose exec app npm run migration:run
    ```
-   **마이그레이션 되돌리기**: 가장 최근 마이그레이션을 롤백합니다.
    ```bash
    docker-compose exec app npm run migration:revert
    ```

### 데이터 시딩 (Seeding)

-   **목적**: 개발 및 테스트를 위한 초기 샘플 데이터를 생성합니다.
-   **실행**: 다음 명령어를 사용하여 수동으로 실행합니다. (컨테이너 실행 중 별도 터미널)
    ```bash
    docker-compose exec app npm run seed:run
    ```
-   **내용**: `src/db/seeds/upload.seeder.ts` 파일에 정의된 로직에 따라, `userId: 1`에 대한 3개의 샘플 오디오 파일 업로드 정보 (`upload` 테이블)를 생성합니다. 생성되는 데이터 예시는 다음과 같습니다 (ID 및 시간은 실제와 다를 수 있음):
    -   `{ userId: 1, fileName: 'sample_audio_1.wav', filePath: 'waveDeck-uploads/audio/1/1.wav', ... }`
    -   `{ userId: 1, fileName: 'short_speech.mp3', filePath: 'waveDeck-uploads/audio/1/2.mp3', ... }`
    -   `{ userId: 1, fileName: 'long_podcast_segment.mp3', filePath: 'waveDeck-uploads/audio/1/3.mp3', ... }`
    (주의: 이 시더는 데이터베이스 레코드만 생성하며, 실제 오디오 파일을 생성하지는 않습니다.)
-   **확장**: `src/db/seeds/` 디렉토리에 새로운 Seeder 파일을 추가하고 `src/db/seeds/main.seeder.ts` 파일 내 `run` 메서드에서 해당 시더를 호출하도록 수정하여 다른 테이블의 데이터도 생성할 수 있습니다.

### 샘플 쿼리

-   **모든 업로드 파일 조회**: `SELECT * FROM upload;`
-   **특정 사용자의 업로드 파일 조회 (userId = 1)**: `SELECT * FROM upload WHERE userId = 1;`
-   **모든 AI 변환 작업 조회**: `SELECT * FROM inference;`
-   **특정 원본 파일(uploadId = 1)에 대한 모든 변환 작업 조회**: `SELECT * FROM inference WHERE uploadId = 1;`
-   **완료된 변환 작업 조회**: `SELECT * FROM inference WHERE status = 'completed';`

## 7. 테스트 (Testing)

-   **프레임워크**: Jest
-   **테스트 종류**: 단위 테스트 (`.spec.ts`), E2E 테스트 (`.e2e-spec.ts`)
-   **실행 명령어**:
    -   모든 단위/통합 테스트 실행: `npm test`
    -   테스트 커버리지 리포트 생성: `npm run test:cov`
    -   E2E 테스트 실행: `npm run test:e2e` (애플리케이션 및 연관 서비스(DB, Redis) 실행 필요 - CI 환경 참고)

## 8. CI/CD

-   **도구**: GitHub Actions (`.github/workflows/ci.yml`)
-   **트리거**: `main` 브랜치 `push` 또는 `pull_request`
-   **자동화 작업**:
    1.  Node.js 설정 및 의존성 설치
    2.  Redis, MySQL 서비스 시작 (테스트용)
    3.  린트 검사 (`npm run lint`)
    4.  프로젝트 빌드 (`npm run build`)
    5.  단위/통합 테스트 및 커버리지 측정 (`npm run test:cov`)
    6.  E2E 테스트 (`npm run test:e2e`)

## 9. 주요 의사결정 및 구현 세부 내용 (Decisions & Details)

**(이 섹션에 프로젝트 진행 중 내렸던 주요 기술적 결정, 특정 구현 방식의 이유 등을 자유롭게 기술하세요.)**

-   예: BullMQ를 선택한 이유, 에러 처리 전략, 폴더 구조 설계 이유, Docker 멀티 스테이지 빌드 사용 이유 등
