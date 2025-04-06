# waveDeck AI Backend Project

## 1. 프로젝트 개요

본 프로젝트는 사용자가 업로드한 음성 파일을 기반으로 AI 음성 변환(STS: Speech-to-Speech) 기능을 제공하는 NestJS 기반 백엔드 애플리케이션입니다.

### 주요 기능

*   **음성 파일 업로드**: 사용자는 `.wav`, `.mp3` 등 형식의 음성 파일을 업로드할 수 있습니다.
*   **AI 음성 변환 요청**: 업로드된 파일을 기반으로 특정 목소리(Voice ID)와 피치(Pitch)를 지정하여 AI 변환을 요청할 수 있습니다.
*   **변환 결과 관리**: 각 변환 요청은 작업(Job) 단위로 관리되며, 상태(대기, 처리 중, 완료, 실패)를 추적합니다.
*   **비동기 처리**: AI 변환은 시간이 소요될 수 있으므로 비동기적으로 처리됩니다. (현재는 Mock 데이터로 시뮬레이션)

## 2. 아키텍처

본 프로젝트는 모듈 기반의 NestJS 아키텍처를 따릅니다.

```
[Client] <---> [NestJS Backend]
                 |
                 +-- [Upload Module] (파일 처리, 저장)
                 |    |
                 |    +-- Controller (API Endpoint: /upload)
                 |    +-- Service (비즈니스 로직, 파일 시스템 연동)
                 |    +-- Entity (TypeORM: Upload Table)
                 |
                 +-- [Inference Module] (AI 변환 요청/관리)
                 |    |
                 |    +-- Controller (API Endpoint: /inference)
                 |    +-- Service (비즈니스 로직, AI 연동[Mock], 상태 관리)
                 |    +-- Entity (TypeORM: Inference Table)
                 |
                 +-- [Common Module] (공통 기능)
                 |    |
                 |    +-- Middleware (RequestId)
                 |    +-- Filters (HttpException)
                 |    +-- Interceptors (Response)
                 |
                 +-- [TypeORM] <---> [MySQL Database]
                 |
                 +-- [Configuration] (@nestjs/config)
                 |
                 +-- [Validation] (class-validator)
```

### 주요 모듈 설명

*   **`UploadModule`**: 파일 업로드 API 엔드포인트(`POST /upload/audio`, `DELETE /upload/audio/:id`)를 처리합니다. 파일을 로컬(`waveDeck-uploads`)에 저장하고, 관련 메타데이터를 `upload` 테이블에 기록합니다.
*   **`InferenceModule`**: AI 음성 변환 요청 API 엔드포인트(`POST /inference/sts`)를 처리합니다. 새로운 변환 작업을 `inference` 테이블에 등록하고, Mock AI 처리를 시뮬레이션하며 작업 상태를 관리합니다.
*   **`CommonModule`**: 요청 ID 생성 미들웨어, 전역 예외 필터, 응답 형식 인터셉터 등 애플리케이션 전반에 사용되는 공통 기능을 제공합니다.

## 3. API 엔드포인트

*   **Base URL**: `/api/v1`

### 3.1. 파일 업로드 (Upload Module)

*   **`POST /upload/audio`**: 음성 파일 및 메타데이터 업로드
    *   **Request Body**: `multipart/form-data`
        *   `file`: (File) 업로드할 음성 파일 (`.wav`, `.mp3`, `.ogg`, 최대 10MB)
        *   `userId`: (number) 사용자 ID
        *   `fileName`: (string) 원본 파일 이름
        *   `fileSize`: (number) 파일 크기 (bytes)
        *   `duration`: (number, optional) 음성 파일 길이 (milliseconds)
        *   `type`: (string) "upload"
    *   **Success Response (201 Created)**:
        ```json
        {
            "statusCode": 201,
            "message": "success",
            "data": {
                "data": {
                    "fileId": 1,
                    "filePreviewUrl": "/waveDeck-uploads/audio/1/1.wav",
                    "uploadTime": "2023-10-27T10:00:00.000Z"
                }
            }
        }
        ```
    *   **Error Responses**:
        *   `400 Bad Request`: 유효성 검사 실패 (파일 크기, 형식, 필수 필드 누락 등)
        *   `500 Internal Server Error`: 파일 저장 또는 DB 오류
*   **`DELETE /upload/audio/:id`**: 업로드된 음성 파일 삭제
    *   **Path Parameter**: `id` (number) - 삭제할 파일의 `fileId`
    *   **Request Body**: `application/json`
        ```json
        { "userId": 1 }
        ```
    *   **Success Response (200 OK)**:
        ```json
        {
            "statusCode": 200,
            "message": "success",
            "data": {
                "message": "파일이 성공적으로 삭제되었습니다."
            }
        }
        ```
    *   **Error Responses**:
        *   `404 Not Found`: 해당 ID의 파일을 찾을 수 없음
        *   `500 Internal Server Error`: 파일 삭제 또는 DB 오류

### 3.2. AI 변환 요청 (Inference Module)

*   **`POST /inference/sts`**: AI 음성 변환 요청
    *   **Request Body**: `application/json`
        ```json
        {
            "userId": 1,
            "fileId": 1,
            "voiceId": 72,
            "pitch": 0
        }
        ```
    *   **Success Response (202 Accepted)**:
        ```json
        {
            "statusCode": 202,
            "message": "success",
            "data": {
                "message": "AI transformation request accepted.",
                "data": {
                    "jobId": 123,
                    "previewUrl": "https://example.com/preview/123"
                }
            }
        }
        ```
    *   **Error Responses**:
        *   `400 Bad Request`: 유효성 검사 실패 (필수 필드 누락 등)
        *   `404 Not Found`: 요청된 `fileId`의 업로드 파일을 찾을 수 없음
        *   `500 Internal Server Error`: 작업 생성 실패

## 4. 로컬 개발 환경 설정

### 사전 요구사항

*   [Node.js](https://nodejs.org/) (v18.x 권장, `Dockerfile`과 버전 일치)
*   [Docker](https://www.docker.com/)
*   [Docker Compose](https://docs.docker.com/compose/)

### 설정 단계

1.  **저장소 클론**:
    ```bash
    git clone <repository-url>
    cd waveDeck-project
    ```
2.  **환경 변수 파일 생성**:
    프로젝트 루트에 `.env` 파일을 생성하고 다음 내용을 작성합니다. (비밀번호 등은 보안을 위해 적절히 관리하세요)
    ```dotenv
    NODE_ENV=development

    DB_HOST=localhost
    DB_PORT=3306
    DB_USERNAME=nestjs_user
    DB_PASSWORD=nestjs_password
    DB_DATABASE=wavedeck
    ```
3.  **Docker 컨테이너 실행**:
    Docker Compose를 사용하여 NestJS 애플리케이션과 MySQL 데이터베이스 컨테이너를 실행합니다.
    ```bash
    docker-compose up -d
    ```
    *   `-d` 옵션은 백그라운드에서 실행합니다.
    *   컨테이너 로그 확인: `docker-compose logs -f`
    *   컨테이너 중지: `docker-compose down`
4.  **의존성 설치**:
    (애플리케이션 컨테이너가 실행되면서 `npm ci`를 수행하지만, 로컬 개발 편의를 위해 호스트 머신에도 설치하는 것이 좋습니다.)
    ```bash
    npm install
    ```
5.  **데이터베이스 마이그레이션 실행**:
    최초 실행 시 또는 스키마 변경 후 데이터베이스 마이그레이션을 실행하여 테이블을 생성/수정합니다.
    ```bash
    npm run migration:run
    ```
6.  **애플리케이션 실행 (개발 모드 - Hot Reload)**:
    Docker 컨테이너를 사용하지 않고 로컬에서 직접 실행하여 개발 편의성을 높일 수 있습니다.
    ```bash
    npm run start:dev
    ```
    애플리케이션은 `http://localhost:3000` 에서 실행됩니다.

## 5. 데이터베이스

*   **DBMS**: MySQL 8.0 (Docker 컨테이너 사용)
*   **ORM**: TypeORM
*   **테이블**: `upload`, `inference`, `migrations`
*   **설정**: `data-source.ts` (TypeORM CLI용), `src/app.module.ts` (애플리케이션용)
*   **스키마 관리**: TypeORM 마이그레이션

### 마이그레이션 명령어

*   **마이그레이션 생성**: 엔티티 변경 후 실행하여 변경 사항에 대한 SQL 쿼리가 포함된 마이그레이션 파일을 생성합니다.
    ```bash
    # npm run migration:generate src/migrations/<MigrationName>
    npm run migration:generate src/migrations/MyNewMigration
    ```
*   **마이그레이션 실행**: 생성되거나 아직 실행되지 않은 마이그레이션을 데이터베이스에 적용합니다.
    ```bash
    npm run migration:run
    ```
*   **마이그레이션 되돌리기**: 가장 최근에 실행된 마이그레이션을 되돌립니다.
    ```bash
    npm run migration:revert
    ```

## 6. 테스트

*   **프레임워크**: Jest
*   **테스트 종류**: 단위 테스트 (`.spec.ts`), E2E 테스트 (`.e2e-spec.ts`)
*   **실행 명령어**:
    *   모든 단위/통합 테스트 실행: `npm test`
    *   테스트 커버리지 리포트 생성: `npm run test:cov`
    *   E2E 테스트 실행: `npm run test:e2e` (로컬 DB 또는 CI 환경의 테스트 DB 필요)

## 7. CI/CD

*   **도구**: GitHub Actions (`.github/workflows/ci.yml`)
*   **트리거**: `main` 브랜치 `push` 또는 `pull_request`
*   **자동화 작업**:
    1.  Node.js 설정 및 의존성 설치
    2.  린트 검사 (`npm run lint`)
    3.  프로젝트 빌드 (`npm run build`)
    4.  단위/통합 테스트 및 커버리지 측정 (`npm run test:cov`)
    5.  E2E 테스트 (`npm run test:e2e`) - 테스트용 MySQL 서비스 사용
