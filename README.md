# waveDeck AI Backend Project

## 1. 프로젝트 개요

본 프로젝트는 사용자가 업로드한 음성 파일을 기반으로<br>
AI 음성 변환(STS: Speech-to-Speech)기능을<br>
제공하는 NestJS 기반 백엔드 애플리케이션입니다.

### 주요 기능

- **음성 파일 업로드**: 사용자는 `.wav`, `.mp3` 등 형식의 음성 파일을 업로드할 수 있습니다.
- **AI 음성 변환 요청**: 업로드된 파일을 기반으로 특정 목소리(Voice ID)와 피치(Pitch)를 지정하여 AI 변환을 요청할 수 있습니다.
- **비동기 처리**: AI 변환은 시간이 소요될 수 있으므로 BullMQ (Redis 기반) 큐 시스템을 사용하여 비동기적으로 처리됩니다.
- **작업 상태 추적**: 각 변환 작업의 상태(대기, 처리 중, 완료, 실패)를 조회할 수 있습니다.
- **AI 처리 시뮬레이션**: 현재 AI 서버 연동 대신 랜덤 지연 및 실패를 포함한 Mock 처리를 시뮬레이션합니다.

## 2. 아키텍처

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

- **`AppModule`(Root)**: 애플리케이션의 루트 모듈로, 다른 모든 모듈과 TypeORM, ConfigModule 등을 임포트하고 설정합니다.
- **`UploadModule`**: `/api/v1/upload` 경로의 API 요청을 처리합니다.
  - `UploadController`: 클라이언트로부터 파일 업로드(`POST /audio`) 및 삭제(`DELETE /audio/:id`) 요청을 받습니다.
  - `UploadService`: 파일 유효성 검사, 로컬 파일 시스템 저장 (`waveDeck-uploads`), `uploads` 테이블에 메타데이터 저장/삭제 로직을 수행합니다.
- **`InferenceModule`**: `/api/v1/inference` 경로의 API 요청을 처리합니다.
  - `InferenceController`: AI 변환 요청(`POST /`) 및 작업 상태 조회(`GET /status/:jobId`) 요청을 받습니다.
  - `InferenceService`: 변환 요청 시 `inferences` 테이블에 작업 레코드를 생성하고, BullMQ (`inference-queue`)에 작업을 추가합니다. 작업 상태 조회 로직을 담당합니다.
- **`BullMQModule`(Imported in `InferenceModule`)**: Redis 기반의 큐 시스템을 설정합니다.
  - `InferenceProcessor`: `inference-queue`에 등록된 작업을 비동기적으로 처리하는 워커입니다. AI 처리(현재 Mock)를 수행하고, 그 결과를 `inferences` 테이블의 상태 및 결과 필드에 업데이트합니다.
- **`CommonModule`**: 여러 모듈에서 공통으로 사용되는 기능을 제공합니다.
  - `RequestIdMiddleware`: 모든 요청에 고유 ID를 부여하여 로깅 추적을 용이하게 합니다.
  - `HttpExceptionFilter`: HTTP 예외를 처리하여 일관된 오류 응답 형식을 제공합니다.
  - `ResponseInterceptor`: 성공적인 응답을 표준 형식(`{ statusCode, message, data }`)으로 래핑합니다.
- **`ConfigModule`**: 환경 변수(`.env`)를 관리하고 애플리케이션 전체에서 사용 가능하게 합니다.
- **`TypeOrmModule`**: MySQL 데이터베이스 연결 및 엔티티 관리를 담당합니다.

## 3. 기술 스택

- **Framework**: NestJS (v11)
- **Language**: TypeScript
- **Database**: MySQL (v8.0)
- **ORM**: TypeORM
- **Queue System**: BullMQ (Redis 기반)
- **Caching/Queue Broker**: Redis
- **Containerization**: Docker, Docker Compose
- **Testing**: Jest
- **Linting/Formatting**: ESLint, Prettier
- **CI/CD**: GitHub Actions

## 4. 실행 방법

### 사전 요구사항

- [Node.js](https://nodejs.org/) (v18.x 이상 권장, `Dockerfile` 및 CI 환경과 버전 일치 확인)
- [Docker](https://www.docker.com/)
- [Docker Compose](https://docs.docker.com/compose/)

### 설정 단계

1.  **저장소 클론**:
    ```bash
    git clone <repository-url>
    cd waveDeck-project
    ```
2.  **환경 변수 파일 생성**:
    프로젝트 루트에 `.env` 파일을 생성하고 다음 예시를 참고하여 설정합니다.<br>
    (DB 접속 정보, Redis 정보 등)

    ````dotenv
    NODE_ENV=development

        # Application Port
        PORT=3000

        # Base URL for constructing preview URLs
        BASE_URL=http://localhost:3000

        # Database Credentials
        DB_HOST=localhost
        DB_PORT=3306
        DB_USERNAME=testuser
        DB_PASSWORD=testpassword
        DB_DATABASE=wave_deck

        # Redis Credentials (for BullMQ)
        REDIS_HOST=localhost
        REDIS_PORT=6379
        # REDIS_PASSWORD= (If password protected)
        ```

    ````

3.  **의존성 설치**:
    ```bash
    npm install
    ```

### 방법 1: Docker Compose 사용 (권장)

모든 서비스(앱, DB, Redis)를 Docker 컨테이너로 한 번에 실행합니다.

1.  **컨테이너 빌드 및 실행**:
    ```bash
    docker-compose up --build -d
    ```
    - `--build`: 이미지를 새로 빌드합니다.
    - `-d`: 백그라운드에서 실행합니다.
2.  **데이터베이스 마이그레이션 실행**:
    (컨테이너가 완전히 실행된 후)
    ```bash
    npm run migration:run
    ```
3.  **(선택) 데이터 시딩 실행**:
    샘플 데이터를 생성합니다.
    ```bash
    npm run seed:run
    ```
4.  **접속 URL**: `http://localhost:3000` (또는 `.env`에 설정한 `PORT`)
5.  **컨테이너 로그 확인**: `docker-compose logs -f`
6.  **컨테이너 중지**: `docker-compose down`

### 방법 2: 로컬 Node.js 직접 실행 (DB 및 Redis는 별도 실행 필요)

로컬 개발 시 Hot Reload 등 편의성을 위해 사용합니다.<br>
MySQL 및 Redis 서버가 로컬 또는 다른 곳에서 이미 실행 중이어야 합니다.

1.  **데이터베이스 마이그레이션 실행**:
    ```bash
    npm run migration:run
    ```
2.  **(선택) 데이터 시딩 실행**:
    ```bash
    npm run seed:run
    ```
3.  **애플리케이션 실행 (개발 모드)**:
    ```bash
    npm run start:dev
    ```
4.  **접속 URL**: `http://localhost:3000` (또는 `.env`에 설정한 `PORT`)

## 5. API 테스트 방법

Postman, Insomnia 또는 `curl`과 같은 도구를 사용하여 API를 테스트할 수 있습니다.
모든 요청의 Base URL은 `http://localhost:3000/api/v1` 입니다.

### 5.1. 파일 업로드 (`POST /upload/audio`)

- **`curl` 예시**:
  ```bash
  curl --location --request POST 'http://localhost:3000/api/v1/upload/audio' \
  --form 'file=@"/path/to/your/audio.wav"' \
  --form 'userId="1"' \
  --form 'fileName="audio.wav"' \
  --form 'fileSize="102400"' \
  --form 'duration="15000"' \
  --form 'type="upload"'
  ```
- **Postman 설정**:
  - Method: `POST`
  - URL: `http://localhost:3000/api/v1/upload/audio`
  - Body: `form-data`
    - `file`: (Type: File) 오디오 파일 선택
    - `userId`: `1`
    - `fileName`: `audio.wav`
    - `fileSize`: `102400`
    - `duration`: `15000`
    - `type`: `upload`
- **성공 응답 (201)**: 업로드된 파일 정보 (`fileId`, `filePreviewUrl`, `uploadTime`) 반환
  ```json
  {
    "statusCode": 201,
    "message": "success",
    "data": {
      "fileId": 1, // 실제 생성된 ID
      "filePreviewUrl": "/waveDeck-uploads/audio/1/1.wav", // 실제 생성된 경로
      "uploadTime": "2024-07-29T10:00:00.123Z"
    }
  }
  ```

### 5.2. AI 변환 요청 (`POST /inference`)

- **`curl` 예시** (파일 업로드 후 얻은 `fileId` 사용):
  ```bash
  curl --location --request POST 'http://localhost:3000/api/v1/inference' \
  --header 'Content-Type: application/json' \
  --data-raw '{
      "userId": 1,
      "fileId": 1,  // 업로드된 파일 ID
      "voiceId": 72,
      "pitch": 0
  }'
  ```
- **Postman 설정**:
  - Method: `POST`
  - URL: `http://localhost:3000/api/v1/inference`
  - Body: `raw` (JSON)
    ```json
    {
      "userId": 1,
      "fileId": 1,
      "voiceId": 72,
      "pitch": 0
    }
    ```
- **성공 응답 (202 Accepted)**: 작업 정보 (`jobId`, `jobQueueId`, `statusCheckUrl`) 반환
  ```json
  {
    "statusCode": 202,
    "message": "Inference job accepted and queued.",
    "data": {
      "jobId": 1, // 실제 생성된 DB Job ID
      "jobQueueId": "inference-1", // 실제 생성된 BullMQ Job ID
      "statusCheckUrl": "/api/v1/inference/status/1"
    }
  }
  ```

### 5.3. 작업 상태 조회 (`GET /inference/status/:jobId`)

- **`curl` 예시** (AI 변환 요청 후 얻은 DB `jobId` 사용):
  ```bash
  curl --location --request GET 'http://localhost:3000/api/v1/inference/status/1'
  ```
- **Postman 설정**:
  - Method: `GET`
  - URL: `http://localhost:3000/api/v1/inference/status/1` (jobId를 실제 ID로 변경)
- **성공 응답 (200 OK)**: 작업 상태 상세 정보 (`JobStatusResponseDto` 형식)
  ```json
  // 예시 1: 처리 중
  {
      "statusCode": 200,
      "message": "Status for job 1 retrieved successfully.",
      "data": {
          "jobQueueId": "inference-1",
          "inferenceDbId": 1,
          "status": "processing",
          "result": null,
          "queuePosition": null,
          "createdAt": "2024-07-29T10:05:00.123Z",
          "updatedAt": "2024-07-29T10:05:05.456Z",
          "errorMessage": null,
          "processingStartedAt": "2024-07-29T10:05:05.456Z",
          "processingFinishedAt": null
      }
  }
  // 예시 2: 완료
  {
      "statusCode": 200,
      "message": "Status for job 1 retrieved successfully.",
      "data": {
          "jobQueueId": "inference-1",
          "inferenceDbId": 1,
          "status": "completed",
          "result": {
              "inferenceId": 1,
              "previewUrl": "http://localhost:3000/waveDeck-uploads/audio/1/converted_1.wav",
              "convertedPath": "waveDeck-uploads/audio/1/converted_1.wav",
              "convertedFileSize": 345678
          },
          "queuePosition": null,
          "createdAt": "2024-07-29T10:05:00.123Z",
          "updatedAt": "2024-07-29T10:05:10.789Z",
          "errorMessage": null,
          "processingStartedAt": "2024-07-29T10:05:05.456Z",
          "processingFinishedAt": "2024-07-29T10:05:10.789Z"
      }
  }
  ```

### 5.4. 파일 삭제 (`DELETE /upload/audio/:id`)

- **`curl` 예시** (삭제할 파일의 `fileId` 사용):
  ```bash
  curl --location --request DELETE 'http://localhost:3000/api/v1/upload/audio/1' \
  --header 'Content-Type: application/json' \
  --data-raw '{
      "userId": 1
  }'
  ```
- **Postman 설정**:
  - Method: `DELETE`
  - URL: `http://localhost:3000/api/v1/upload/audio/1` (id를 실제 파일 ID로 변경)
  - Body: `raw` (JSON)
    ```json
    { "userId": 1 }
    ```
- **성공 응답 (200 OK)**: 삭제 성공 메시지 반환
  ```json
  {
    "statusCode": 200,
    "message": "파일이 성공적으로 삭제되었습니다.",
    "data": null
  }
  ```

## 6. 데이터베이스

- **DBMS**: MySQL 8.0 (Docker 컨테이너 사용)
- **ORM**: TypeORM
- **엔티티**: `src/upload/entities/upload.entity.ts`, `src/inference/entities/inference.entity.ts`
- **설정**: `src/db/data-source.ts` (TypeORM CLI & Seeding용), `src/app.module.ts`<br>
  (애플리케이션용 TypeOrmModule 설정)
- **스키마 관리**: TypeORM 마이그레이션 (`src/db/migrations`)

### 테이블 구조

- **`uploads`**: 업로드된 파일 정보를 저장합니다.
  - `id` (PK): 파일 고유 ID
  - `userId`: 업로드한 사용자 ID
  - `fileName`: 원본 파일 이름
  - `filePath`: 서버에 저장된 파일 경로
  - `fileSize`: 파일 크기 (bytes)
  - `mimeType`: 파일 MIME 타입
  - `duration`: 음성 파일 길이 (milliseconds)
  - `createdAt`, `updatedAt`: 생성/수정 시간
- **`inferences`**: AI 변환 작업 정보를 저장합니다.
  - `id` (PK): 작업 고유 ID
  - `userId`: 작업을 요청한 사용자 ID
  - `uploadId` (FK -> uploads.id): 원본 파일 ID
  - `jobQueueId`: BullMQ 작업 ID
  - `status`: 작업 상태 (`pending`, `queued`, `processing`, `completed`, `failed`)
  - `voiceId`, `pitch`: AI 변환 옵션
  - `originalPath`: 원본 파일 경로 (참조용)
  - `convertedPath`: 변환된 파일 경로
  - `convertedFileSize`: 변환된 파일 크기
  - `errorMessage`: 실패 시 오류 메시지
  - `createdAt`, `updatedAt`: 생성/수정 시간
  - `processingStartedAt`, `processingFinishedAt`: 처리 시작/종료 시간
- **`migrations`**: TypeORM이 마이그레이션 기록을 관리하는 테이블입니다.

### 마이그레이션 명령어

- **마이그레이션 생성**: 엔티티 변경 후 실행합니다.
  ```bash
  # npm run migration:generate src/db/migrations/<MigrationName>
  npm run migration:generate src/db/migrations/MyNewMigration
  ```
- **마이그레이션 실행**: 데이터베이스 스키마를 최신 상태로 업데이트합니다.
  ```bash
  npm run migration:run
  ```
- **마이그레이션 되돌리기**: 가장 최근 마이그레이션을 롤백합니다.
  ```bash
  npm run migration:revert
  ```

### 데이터 시딩 (Seeding)

- **목적**: 개발 및 테스트를 위한 초기 샘플 데이터를 생성합니다.
- **실행**: 다음 명령어를 사용하여 수동으로 실행합니다.
  ```bash
  npm run seed:run
  ```
- **내용**: `src/db/seeds/upload.seeder.ts` 파일에 정의된 로직에 따라,<br>
  `userId: 1`에 대한 몇 가지 샘플 오디오 파일 업로드 정보 (`uploads` 테이블)를 생성합니다.<br>
  (파일 경로는 예시이며 실제 파일은 생성되지 않습니다.)
- **확장**: `src/db/seeds/` 디렉토리에 새로운 Seeder 파일을 추가하고<br>
`src/db/seeds/main.seeder.ts`에서 호출하여 다른 테이블의 데이터도 생성할 수 있습니다.

### 샘플 쿼리

- **모든 업로드 파일 조회**:
  ```sql
  SELECT * FROM uploads;
  ```
- **특정 사용자의 업로드 파일 조회 (userId = 1)**:
  ```sql
  SELECT * FROM uploads WHERE userId = 1;
  ```
- **모든 AI 변환 작업 조회**:
  ```sql
  SELECT * FROM inferences;
  ```
- **특정 원본 파일(uploadId = 1)에 대한 모든 변환 작업 조회**:
  ```sql
  SELECT * FROM inferences WHERE uploadId = 1;
  ```
- **완료된 변환 작업 조회**:
  ```sql
  SELECT * FROM inferences WHERE status = 'completed';
  ```

## 7. 테스트

- **프레임워크**: Jest
- **테스트 종류**: 단위 테스트 (`.spec.ts`), E2E 테스트 (`.e2e-spec.ts`)
- **실행 명령어**:
  - 모든 단위/통합 테스트 실행: `npm test`
  - 테스트 커버리지 리포트 생성: `npm run test:cov`
  - E2E 테스트 실행: `npm run test:e2e` (애플리케이션 및 연관 서비스(DB, Redis) 실행 필요)

## 8. CI/CD

- **도구**: GitHub Actions (`.github/workflows/ci.yml`)
- **트리거**: `main` 브랜치 `push` 또는 `pull_request`
- **자동화 작업**:
  1.  Node.js 설정 및 의존성 설치
  2.  Redis, MySQL 서비스 시작 (테스트용)
  3.  린트 검사 (`npm run lint`)
  4.  프로젝트 빌드 (`npm run build`)
  5.  단위/통합 테스트 및 커버리지 측정 (`npm run test:cov`)
  6.  E2E 테스트 (`npm run test:e2e`)
