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


### 아키텍처 개요

이 애플리케이션은 NestJS 프레임워크를 기반으로 구축된 모듈식 백엔드 서버입니다. Docker Compose를 사용하여 애플리케이션 컨테이너(NestJS), 데이터베이스 컨테이너(MySQL), 큐 브로커 컨테이너(Redis)를 함께 실행하는 구조입니다.

클라이언트(웹 브라우저, 모바일 앱, API 테스트 도구 등)는 HTTP 요청을 통해 NestJS 애플리케이션의 API 엔드포인트와 통신합니다. 파일 업로드 및 AI 변환 요청과 같은 주요 기능은 별도의 모듈로 분리되어 관리됩니다. AI 변환과 같이 시간이 오래 걸릴 수 있는 작업은 BullMQ와 Redis를 이용한 비동기 큐 시스템을 통해 처리됩니다. 데이터 영속성은 TypeORM을 통해 MySQL 데이터베이스에서 관리하며, 파일 자체는 서버의 로컬 파일 시스템(Docker 볼륨으로 관리 가능)에 저장됩니다.

### 주요 모듈 및 상호작용

1.  **`UploadModule`**:
    *   **역할:** 파일 업로드(`POST /api/v1/common/upload/audio`) 및 삭제(`DELETE /api/v1/common/upload/audio/:id`) API 요청 처리.
    *   **상호작용:**
        *   `UploadController`: 클라이언트 요청 수신, 요청 데이터 검증(파일 크기/타입 등), `UploadService` 호출.
        *   `UploadService`: 실제 파일 유효성 검사, 파일 시스템 저장 로직 수행 (로컬 `waveDeck-uploads` 디렉토리), TypeORM을 통해 `uploads` 테이블에 파일 메타데이터 저장/삭제.

2.  **`InferenceModule`**:
    *   **역할:** AI 변환 요청(`POST /api/v1/inference/sts`) 및 작업 상태 조회(`GET /api/v1/inference/status/:jobId`) API 요청 처리.
    *   **상호작용:**
        *   `InferenceController`: 클라이언트 요청 수신, 요청 데이터 검증, `InferenceService` 호출.
        *   `InferenceService`:
            *   (변환 요청 시) TypeORM을 통해 `inferences` 테이블에 작업 레코드 생성(초기 상태: PENDING).
            *   BullMQ(`inference-queue`)에 AI 처리 작업(작업 데이터: `inferenceId`) 추가.
            *   TypeORM을 통해 `inferences` 테이블 상태를 QUEUED로 업데이트하고 BullMQ Job ID 저장.
            *   (상태 조회 시) TypeORM에서 해당 `inference` 레코드 조회.
            *   BullMQ에서 실제 큐 작업 상태(`getState()`) 및 대기열 정보(`getWaitingCount()`) 조회.
            *   DB 상태와 큐 상태를 종합하여 최종 응답 DTO 생성 및 반환 (필요시 DB 상태 업데이트).
        *   `InferenceProcessor` (BullMQ 워커):
            *   `inference-queue`에서 작업을 가져와 비동기 처리 (현재는 Mock AI 처리 시뮬레이션).
            *   처리 시작 시 TypeORM 통해 `inferences` 상태를 PROCESSING으로 업데이트.
            *   처리 완료/실패 시 TypeORM 통해 `inferences` 상태를 COMPLETED 또는 FAILED로 업데이트하고 결과(변환 경로, 에러 메시지 등) 저장.

3.  **`BullMQModule`**:
    *   **역할:** Redis를 사용하여 메시지 큐 (`inference-queue`) 설정 및 관리. `InferenceModule`에서 import하여 사용.

4.  **`TypeOrmModule`**:
    *   **역할:** MySQL 데이터베이스 연결 관리, 엔티티(`Upload`, `Inference`) 정의 및 Repository 제공. 각 모듈의 서비스(`UploadService`, `InferenceService`, `InferenceProcessor`)에서 DB 작업을 위해 사용.

5.  **`ConfigModule`**:
    *   **역할:** `.env` 파일의 환경 변수(DB 접속 정보, Redis 정보, BASE_URL 등)를 로드하고 애플리케이션 전체에서 사용할 수 있도록 제공.

6.  **`CommonModule`**:
    *   **역할:** 여러 모듈에서 공통으로 사용되는 기능 제공.
        *   `HttpExceptionFilter`: 전역 예외 처리.
        *   `ResponseInterceptor`: 표준 응답 형식 래핑.
        *   `RequestIdMiddleware`: 모든 요청에 고유 ID 부여 및 로깅 컨텍스트 설정.

**주요 흐름 예시:**

*   **파일 업로드:** Client -> `UploadController` -> `UploadService` -> (File System 저장 & TypeORM 통해 DB 저장) -> `UploadController` -> Client
*   **AI 변환 요청:** Client -> `InferenceController` -> `InferenceService` -> (TypeORM 통해 DB 저장 & BullMQ 통해 큐에 작업 추가) -> `InferenceController` -> Client
*   **AI 변환 처리 (비동기):** BullMQ Queue -> `InferenceProcessor` -> (TypeORM 통해 DB 상태 업데이트 & 결과 저장)
*   **상태 조회:** Client -> `InferenceController` -> `InferenceService` -> (TypeORM 통해 DB 조회 & BullMQ 통해 큐 상태 조회) -> `InferenceController` -> Client

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
-   [Docker Compose](https://docs.docker.com/compose/)
-   (로컬 실행 시) [Node.js](https://nodejs.org/) v18+, MySQL v8+, Redis v7+

### 방법 1: Docker Compose 사용 (권장)

모든 서비스 (앱, DB, Redis)를 Docker 컨테이너로 한 번에 실행합니다.

1.  **저장소 클론**: `git clone <repository-url> && cd waveDeck-project`
2.  **환경 변수 파일 생성**: 프로젝트 루트에 `.env` 파일 생성 및 설정 (아래 예시 참고).
    ```dotenv
    # 애플리케이션 설정
    NODE_ENV=development
    PORT=3000
    BASE_URL=http://localhost:3000

    # 데이터베이스 설정 (docker-compose.yml과 일치)
    DB_TYPE=mysql
    DB_HOST=mysql
    DB_PORT=3306
    DB_USERNAME=root
    DB_PASSWORD=your_mysql_root_password # 실제 비밀번호 입력
    DB_DATABASE=wavedeck

    # Redis 설정 (docker-compose.yml과 일치)
    REDIS_HOST=redis
    REDIS_PORT=6379
    # REDIS_PASSWORD=
    ```
    **주의:** `DB_PASSWORD`는 `docker-compose.yml`의 `MYSQL_ROOT_PASSWORD`와 동일해야 합니다.
3.  **실행**: `docker-compose up --build` (백그라운드: `-d` 추가)
4.  **마이그레이션**: (실행 후 별도 터미널) `docker-compose exec app npm run migration:run`
5.  **(선택) 시딩**: (실행 후 별도 터미널) `docker-compose exec app npm run seed:run`
6.  **접속 URL**: `http://localhost:3000` (또는 `docker-compose.yml`에 설정된 호스트 포트)
7.  **중지**: `Ctrl + C` 또는 `docker-compose down`

### 방법 2: 로컬 Node.js 직접 실행

로컬 환경에 Node.js, MySQL, Redis가 설치되어 있어야 합니다. `.env` 파일의 `DB_HOST`, `REDIS_HOST`를 `localhost` 등으로 수정해야 합니다.

1.  **의존성 설치**: `npm install`
2.  **데이터베이스 마이그레이션**: `npm run migration:run`
3.  **(선택) 데이터 시딩**: `npm run seed:run`
4.  **애플리케이션 실행 (개발 모드)**: `npm run start:dev`
5.  **접속 URL**: `http://localhost:3000` (또는 `.env`의 `PORT` 설정)

## 5. API 테스트 방법 (API Testing)

API 테스트는 아래 제공된 `curl` 예시를 사용하거나 Postman과 같은 API 클라이언트 도구를 활용하여 수행할 수 있습니다. 모든 요청의 Base URL은 `http://localhost:3000/api/v1` 입니다. (Docker 실행 기준)

### 5.1. 파일 업로드 (`POST /common/upload/audio`)

오디오 파일과 관련 메타데이터를 `multipart/form-data` 형식으로 전송하여 업로드합니다.

-   **Payload (`form-data`)**: 
    -   `file`: (필수) 업로드할 오디오 파일 (`.wav`, `.mp3` 등)
    -   `userId`: (필수) 업로드하는 사용자 ID (텍스트)
    -   `fileName`: (필수) 저장될 파일 이름 (텍스트)
    -   `fileSize`: (필수) 파일 크기 (Bytes, 텍스트)
    -   `duration`: (선택) 오디오 길이 (Milliseconds, 텍스트)
-   **`curl` 예시**:
    ```bash
    curl --location --request POST 'http://localhost:3000/api/v1/common/upload/audio' \
    --form 'file=@"/path/to/your/audio.wav"' \
    --form 'userId="1"' \
    --form 'fileName="audio.wav"' \
    --form 'fileSize="102400"' \
    --form 'duration="30000"' # 선택 사항
    ```
-   **성공 응답 (201 Created)**:
    ```json
    {
        "statusCode": 201,
        "message": "success",
        "data": {
            "fileId": 1, // 생성된 파일 ID
            "filePreviewUrl": "http://localhost:3000/waveDeck-uploads/audio/1/1.wav", // 미리보기 URL
            "uploadTime": "2024-08-01T12:00:00.000Z" // 업로드 시간
        }
    }
    ```

### 5.2. AI 변환 요청 (`POST /inference/sts`)

업로드된 파일 ID와 변환 옵션을 JSON 형식으로 전송하여 AI 변환 작업을 요청합니다.

-   **Payload (`raw`, JSON)**:
    ```json
    {
      "userId": 1,         // (필수) 요청 사용자 ID
      "fileId": 1,         // (필수) 변환할 원본 파일 ID (업로드 응답의 fileId)
      "voiceId": 72,        // (필수) 사용할 목소리 ID
      "pitch": 0          // (선택) 음 높낮이 조절 (기본값 0)
    }
    ```
-   **`curl` 예시**:
    ```bash
    curl --location --request POST 'http://localhost:3000/api/v1/inference/sts' \
    --header 'Content-Type: application/json' \
    --data-raw '{ "userId": 1, "fileId": 1, "voiceId": 72, "pitch": 0 }'
    ```
-   **성공 응답 (201 Created / 202 Accepted)**:
    ```json
    {
        "statusCode": 201, // 또는 202
        "message": "success", // 또는 "Inference 작업이 수락되어 큐에 등록되었습니다."
        "data": {
            "jobId": 1, // 생성된 DB 작업 ID (Inference ID)
            "jobQueueId": "inference-1", // 생성된 큐 작업 ID
            "statusCheckUrl": "/api/v1/inference/status/1" // 상태 조회 API 경로
        }
    }
    ```

### 5.3. 작업 상태 조회 (`GET /inference/status/:jobId`)

경로 파라미터로 AI 변환 요청 시 받은 DB 작업 ID (`jobId`)를 사용하여 작업 상태를 조회합니다.

-   **Payload**: 없음 (경로 파라미터 사용)
-   **`curl` 예시**:
    ```bash
    curl --location --request GET 'http://localhost:3000/api/v1/inference/status/1'
    ```
-   **성공 응답 (200 OK)**: (`JobStatusResponseDto` 형식)
    ```json
    // 예시: 완료 상태
    {
        "statusCode": 200,
        "message": "success",
        "data": {
            "jobQueueId": "inference-1",
            "inferenceDbId": 1,
            "status": "completed", // "queued", "processing", "completed", "failed"
            "queueState": "completed", // BullMQ 큐 상태
            "waitingCount": null,
            "result": {
                "inferenceId": 1,
                "previewUrl": "http://localhost:3000/waveDeck-converted/audio/1/converted_1.wav",
                "convertedPath": "waveDeck-converted/audio/1/converted_1.wav",
                "convertedFileSize": 345678
            },
            "createdAt": "2024-08-01T12:05:00.000Z",
            "updatedAt": "2024-08-01T12:05:10.000Z",
            "errorMessage": null,
            "processingStartedAt": "2024-08-01T12:05:05.000Z",
            "processingFinishedAt": "2024-08-01T12:05:10.000Z"
        }
    }
    ```
    *참고: `status`, `queueState`, `result`, `errorMessage` 등은 작업 진행 상태에 따라 달라집니다.*

### 5.4. 파일 삭제 (`DELETE /common/upload/audio/:id`)

경로 파라미터로 삭제할 파일의 ID (`id`)를 사용하고, 요청 본문에 사용자 ID를 JSON 형식으로 전송합니다.

-   **Payload (`raw`, JSON)**:
    ```json
    { 
      "userId": 1 // (필수) 파일 소유자 확인을 위한 사용자 ID
    }
    ```
-   **`curl` 예시**:
    ```bash
    curl --location --request DELETE 'http://localhost:3000/api/v1/common/upload/audio/1' \
    --header 'Content-Type: application/json' \
    --data-raw '{ "userId": 1 }'
    ```
-   **성공 응답 (200 OK)**:
    ```json
    {
        "statusCode": 200,
        "message": "success", // 또는 "파일이 성공적으로 삭제되었습니다."
        "data": null
    }
    ```

## 6. 데이터베이스 (Database)

-   **DBMS**: MySQL 8.0 (Docker 사용)
-   **ORM**: TypeORM
-   **엔티티**: `src/upload/entities/upload.entity.ts`, `src/inference/entities/inference.entity.ts`
-   **설정**: `src/db/data-source.ts` (CLI용), `src/app.module.ts` (앱용)
-   **스키마 관리**: TypeORM 마이그레이션 (`src/db/migrations`)

### 테이블 요약

-   **`upload`**: 업로드된 파일 메타데이터 저장.
-   **`inference`**: AI 변환 작업 정보 및 상태 저장.
-   **`migrations`**: TypeORM 마이그레이션 기록.

### 마이그레이션 결과 요약

마이그레이션은 `npm run migration:run` (Docker 환경에서는 `docker-compose exec app npm run migration:run`) 명령어를 통해 실행됩니다. 현재 프로젝트에는 다음과 같은 마이그레이션 파일이 포함되어 있습니다:

-   `src/db/migrations/<timestamp>-InitialSchema.ts`: 프로젝트 초기 스키마를 설정합니다. `upload` 테이블과 `inference` 테이블을 생성하고, 두 테이블 간의 외래 키 관계(Inference -> Upload)를 정의합니다. 이 마이그레이션을 실행하면 애플리케이션 운영에 필요한 모든 테이블이 준비됩니다.

### 주요 명령어 (Docker 환경)

-   **마이그레이션 실행**: `docker-compose exec app npm run migration:run`
-   **(선택) 시딩**: `docker-compose exec app npm run seed:run` (샘플 업로드 데이터 생성)

### 데이터 시딩 (Seeding)

-   **목적**: 개발 및 테스트를 위한 초기 샘플 데이터를 생성합니다.
-   **실행**: `docker-compose exec app npm run seed:run` 명령어를 사용하여 수동으로 실행합니다.
-   **내용**: `src/db/seeds/upload.seeder.ts` 로직에 따라 `userId: 1`에 대한 3개의 샘플 오디오 파일 업로드 정보 (`upload` 테이블)를 생성합니다. (주의: DB 레코드만 생성되며 실제 파일은 생성되지 않습니다.)
-   **확장**: `src/db/seeds/` 디렉토리에 Seeder 파일을 추가하고 `src/db/seeds/main.seeder.ts`에서 호출하여 확장할 수 있습니다.

### 샘플 쿼리 및 예상 결과

다음은 데이터베이스 상태를 확인하기 위한 몇 가지 샘플 SQL 쿼리와 예상 결과입니다. (데이터는 시딩 실행 후를 가정합니다.)

1.  **모든 업로드 파일 조회**:
    ```sql
    SELECT * FROM upload;
    ```
    *   예상 결과: 시딩된 3개의 업로드 레코드(id=1, 2, 3) 및 API를 통해 추가된 업로드 레코드들이 표시됩니다.

2.  **특정 사용자의 업로드 파일 조회 (userId = 1)**:
    ```sql
    SELECT * FROM upload WHERE userId = 1;
    ```
    *   예상 결과: `userId`가 1인 업로드 레코드들 (시딩된 3개 포함)만 표시됩니다.

3.  **모든 AI 변환 작업 조회**:
    ```sql
    SELECT * FROM inference;
    ```
    *   예상 결과: AI 변환 요청 API를 통해 생성된 모든 작업 레코드들이 표시됩니다. (초기 상태에서는 비어 있습니다.)

4.  **특정 원본 파일(uploadId = 1)에 대한 모든 변환 작업 조회**:
    ```sql
    SELECT * FROM inference WHERE uploadId = 1;
    ```
    *   예상 결과: `upload` 테이블의 `id`가 1인 파일을 사용하여 생성된 변환 작업 레코드들만 표시됩니다.

5.  **완료된 변환 작업 조회**:
    ```sql
    SELECT * FROM inference WHERE status = 'completed';
    ```
    *   예상 결과: 상태가 `completed`인 변환 작업 레코드들만 표시됩니다.

## 7. 테스트 (Testing)

-   **프레임워크**: Jest
-   **실행 명령어**:
    -   단위/통합 테스트: `npm test`
    -   커버리지 리포트: `npm run test:cov`
    -   E2E 테스트: `npm run test:e2e` (앱 및 서비스 실행 필요)

## 8. CI/CD

-   **도구**: GitHub Actions (`.github/workflows/ci.yml`)
-   **트리거**: `main` 브랜치 `push` 또는 `pull_request`
-   **작업**: 의존성 설치, 린트, 빌드, 단위/통합 테스트, E2E 테스트 자동 수행.
