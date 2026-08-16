# 문항 카드 스튜디오

PDF 문제지에서 문항 영역을 검토·저장하고, 문항 카드를 조합해 HWPX 문제지를 만드는 개인용 웹앱입니다.

## 저장 구조

무료 사용을 우선해 파일과 메타데이터를 분리합니다.

- Firebase Authentication: 이메일/비밀번호 로그인
- Cloud Firestore: 과목, 단원, 문항 좌표, 태그 등 작은 메타데이터
- PC 로컬 폴더: 원본 PDF, 문항 이미지, HWPX 템플릿과 결과물
- Firebase Storage: 사용하지 않음

브라우저의 File System Access API로 사용자가 선택한 폴더에 직접 저장합니다. 최신 Chrome 또는 Edge에서 `localhost`나 HTTPS 주소로 실행해야 합니다.

```text
선택한 폴더/
  documents/{documentId}/source.pdf
  documents/{documentId}/question-texts.json
  questions/{questionId}/question.png
  templates/{templateVersion}/template.hwpx
  exports/{exportId}/result.hwpx
```

폴더 접근 권한은 브라우저가 관리합니다. 브라우저를 다시 열었을 때 보안상 쓰기 권한을 한 번 더 요청할 수 있습니다.

## 현재 구현

- Next.js 16 App Router, TypeScript strict, Tailwind CSS
- 대시보드, PDF 문서, 문항 카드, 문제지 제작, 분류 체계, 설정 화면
- Firebase 이메일 로그인 클라이언트와 Admin 지연 초기화
- Firestore 보안 규칙과 복합 인덱스
- PDF 형식·50MB 제한·저작권 확인 업로드 UX
- PC 저장 폴더 선택 및 IndexedDB 폴더 핸들 보존
- 선택한 폴더의 `documents/{documentId}/source.pdf`에 PDF 직접 저장
- PDF.js 페이지 렌더링과 저해상도 페이지 썸네일
- 문항 번호 텍스트 좌표 기반 1단·2단 영역 자동 제안
- 영역 직접 생성, 이동, 크기 조절, 삭제, 실행 취소·다시 실행
- 스캔 페이지 OCR 필요 표시와 검수 완료 상태 관리
- `documents/{documentId}/review-draft.json` 검수 초안 저장
- 검수 완료 문항의 문제·정답·해설 텍스트를 이용한 중단원 자동 분류
- 확실한 문항은 로컬 규칙과 사용자가 확정한 분류 사례로 처리하고, 애매한 문항만 Gemini 무료 등급으로 보강
- `/api/health` 구성 상태 점검

문항 이미지 생성, Firestore 메타데이터 확정 저장, HWPX 생성기는 후속 단계입니다.

## 로컬 실행

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

Chrome 또는 Edge에서 `http://localhost:3000/settings`를 열고 **저장 폴더 선택**을 누릅니다. Firebase 값이 없어도 화면과 로컬 PDF 저장은 확인할 수 있습니다.

## Gemini 무료 등급 보강

Gemini는 로컬 분류 점수가 낮은 애매한 문항에만 호출됩니다. 서버는 모델을
`gemini-3.5-flash-lite`로 고정하고, 무료 쿼터 소진이나 호출 실패 시 다른 모델로
재시도하지 않습니다.

Google AI Studio에서 **결제 계정이 연결되지 않고 Billing Tier가 Free인 프로젝트**의
API 키를 만든 뒤 아래 두 환경 변수를 설정합니다.

```dotenv
GEMINI_API_KEY=무료_프로젝트_API_키
GEMINI_FREE_TIER_ONLY=true
```

`GEMINI_FREE_TIER_ONLY=true`가 없거나 API 키가 비어 있으면 Gemini 호출은 차단되고
로컬 자동 분류만 동작합니다. Google의 과금 등급은 API 요청 옵션이 아니라 키가 속한
프로젝트의 결제 연결 상태로 결정되므로, AI Studio에서 Free 표시와 결제 미연결 상태를
직접 확인해야 합니다. 실제 키는 저장소에 커밋하지 않습니다.

PDF를 저장하면 업로드 창의 **검수 편집기 열기**를 눌러 자동 탐지 결과를 검토할 수 있습니다. 브라우저를 다시 연 뒤에는 설정에서 같은 저장 폴더를 다시 허용해야 할 수 있습니다.

## Firebase 무료 설정

1. Firebase 프로젝트를 만듭니다.
2. Authentication에서 이메일/비밀번호 로그인을 활성화합니다.
3. Cloud Firestore만 생성합니다.
4. `.env.example`을 `.env.local`로 복사하고 Web SDK 값을 입력합니다.
5. 서버 기능이 필요하면 Admin SDK 환경 변수도 입력합니다.
6. Firestore 규칙과 인덱스를 배포합니다.

```powershell
firebase login
firebase use <project-id>
firebase deploy --only firestore:rules,firestore:indexes
```

Cloud Storage 생성, Storage 규칙 배포, Blaze 요금제 등록은 하지 않습니다. 서비스 계정 JSON이나 실제 비밀값은 저장소에 커밋하지 않습니다.

## 검증

```powershell
npm run verify
```

검증 범위는 ESLint, TypeScript, Vitest 단위 테스트, Next.js 프로덕션 빌드입니다.

## Firestore 경로

```text
users/{uid}
workspaces/{workspaceId}
  members/{uid}
  subjects/{subjectId}
  categories/{categoryId}
  tags/{tagId}
  sourceDocuments/{documentId}
  questions/{questionId}
    regions/{regionId}
    assets/{assetId}
  examSets/{examSetId}
    items/{itemId}
  exports/{exportId}
```

Firestore에는 로컬 절대 경로를 저장하지 않고 `documents/{documentId}/source.pdf` 같은 상대 경로만 기록합니다.
