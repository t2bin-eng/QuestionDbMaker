# Quiz DB Maker

PDF 문제지를 교사가 검토 가능한 문항 데이터로 구조화하고 기존 퀴즈 게임용 Excel로 내보내는 웹앱입니다. 현재 1단계 프로젝트 기반과 관리자 인증이 구현되어 있습니다.

## 로컬 실행

1. `npm install`
2. `.env.example`을 참고해 `.env.local` 생성
3. `npm run dev`

`APP_ADMIN_PASSWORD`는 8자 이상, `AUTH_SECRET`은 32자 이상의 임의 문자열을 사용합니다. 실제 비밀값은 Git에 커밋하지 않습니다. OpenAI 기반 분석 기능이 추가되기 전까지 `OPENAI_API_KEY`는 선택 사항입니다.

## 품질 검사

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## GitHub + Vercel 배포

1. GitHub에 새 비공개 저장소를 만들고 이 폴더를 push합니다.
2. Vercel에서 해당 GitHub 저장소를 Import합니다.
3. Project Settings → Environment Variables에 `APP_ADMIN_PASSWORD`, `AUTH_SECRET`, 이후 `OPENAI_API_KEY`를 등록합니다.
4. Preview와 Production 환경에 필요한 값을 모두 적용한 뒤 배포합니다.

Vercel 빌드는 별도 설정 없이 Next.js를 감지합니다. 업로드 PDF는 기본 모드에서 영구 저장하지 않으며, 비밀번호와 API 키는 클라이언트 번들에 포함되지 않습니다.

## 구현 단계

- [x] 1단계: Next.js 기반, 반응형 시작 화면, 관리자 인증, 배포 설정
- [ ] 2단계: PDF 업로드 검증, 페이지 정보와 미리보기
- [ ] 3단계: 규칙 기반 문항 후보 분리
- [ ] 4단계: AI 구조화 추출과 배치 재시도
- [ ] 5단계: 교사 검토·수정 화면
- [ ] 6단계: 정답·해설 연결
- [ ] 7단계: HTML 미리보기와 Excel 생성
- [ ] 8단계: 전체 검사, E2E, 성능 검증과 프로덕션 배포
