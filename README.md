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

### 주요 모듈 요약

-   **`UploadModule`**: 파일 업로드/삭제 API 처리, 파일 시스템 저장, DB 메타데이터 관리.
-   **`InferenceModule`**: AI 변환 요청/상태 조회 API 처리, 큐 작업 등록, DB 상태 관리.
-   **`BullMQModule` & `InferenceProcessor`**: Redis 기반 큐 설정 및 비동기 작업 처리 워커.
-   **`CommonModule`**: 전역 예외 필터, 응답 인터셉터, 요청 ID 미들웨어 등 공통 기능 제공.
-   **`ConfigModule`**: `.env` 환경 변수 관리.
-   **`TypeOrmModule`**: MySQL DB 연결 및 엔티티 관리.

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

**(Postman 사용 시) Postman Collection:** [Postman 컬렉션 링크 또는 파일 경로 삽입 - 선택 사항]

### 5.1. 파일 업로드 (`POST /common/upload/audio`)

오디오 파일과 사용자 ID, 파일명, 크기 등의 메타데이터를 `form-data`로 전송합니다.

-   **`curl` 예시**:
    ```bash
    curl --location --request POST 'http://localhost:3000/api/v1/common/upload/audio' \
    --form 'file=@"/path/to/your/audio.wav"' \
    --form 'userId="1"' \
    --form 'fileName="audio.wav"' \
    --form 'fileSize="102400"'
    ```
-   **성공 시**: 201 응답과 함께 `fileId`, `filePreviewUrl`, `uploadTime` 반환.

### 5.2. AI 변환 요청 (`POST /inference/sts`)

`userId`, `fileId`, `voiceId`, `pitch`를 JSON 바디로 전송합니다.

-   **`curl` 예시**:
    ```bash
    curl --location --request POST 'http://localhost:3000/api/v1/inference/sts' \
    --header 'Content-Type: application/json' \
    --data-raw '{ "userId": 1, "fileId": 1, "voiceId": 72, "pitch": 0 }'
    ```
-   **성공 시**: 201 또는 202 응답과 함께 `jobId` (DB ID), `jobQueueId` (큐 ID), `statusCheckUrl` 반환.

### 5.3. 작업 상태 조회 (`GET /inference/status/:jobId`)

경로 파라미터로 DB `jobId`를 사용합니다.

-   **`curl` 예시**:
    ```bash
    curl --location --request GET 'http://localhost:3000/api/v1/inference/status/1'
    ```
-   **성공 시**: 200 응답과 함께 상세 작업 상태 (`JobStatusResponseDto` 형식) 반환 (DB 상태, 큐 상태, 결과 등 포함).

### 5.4. 파일 삭제 (`DELETE /common/upload/audio/:id`)

경로 파라미터로 `fileId`를 사용하고, `userId`를 JSON 바디로 전송합니다.

-   **`curl` 예시**:
    ```bash
    curl --location --request DELETE 'http://localhost:3000/api/v1/common/upload/audio/1' \
    --header 'Content-Type: application/json' \
    --data-raw '{ "userId": 1 }'
    ```
-   **성공 시**: 200 응답과 함께 삭제 성공 메시지 반환.

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

## 9. 주요 의사결정 및 구현 세부 내용 (Decisions & Details)

**(이 섹션에 프로젝트 진행 중 내렸던 주요 기술적 결정, 특정 구현 방식의 이유 등을 자유롭게 기술하세요.)**

-   예: BullMQ를 선택한 이유, 에러 처리 전략, 폴더 구조 설계 이유, Docker 멀티 스테이지 빌드 사용 이유 등
