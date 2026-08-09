# JETEMA Workspace — Netlify 배포판 (단순 구조)

폴더 구조를 최대한 단순하게 만들었어요. 아래처럼 `functions` 폴더 하나만
빼면 전부 최상위(루트)에 바로 있는 파일들입니다.

```
index.html
netlify.toml
package.json
vite.config.js
App.jsx
main.jsx
storageAdapter.js
functions/
  storage.mjs
```

## GitHub에 올리는 방법 (웹 업로드, 설치 프로그램 없이)

1. 방금 만든 빈 저장소 페이지에서 **uploading an existing file** 링크 클릭
   (또는 Add file → Upload files)
2. 이 압축을 푼 폴더 안에서 **functions 폴더를 제외한 나머지 파일 7개**
   (index.html, netlify.toml, package.json, vite.config.js, App.jsx, main.jsx,
   storageAdapter.js)를 한꺼번에 선택해서 업로드 화면에 드래그
3. 다 올라간 거 확인하고 **Commit changes**
4. 다시 **Add file → Create new file** 클릭
5. 파일명 칸에 `functions/storage.mjs` 라고 입력 (이거 하나만 경로 입력하면 됩니다)
6. `functions/storage.mjs` 파일을 열어서 내용 전체 복사 → 방금 만든 편집창에 붙여넣기
7. **Commit changes**

이제 끝이에요. 폴더가 하나(`functions`)뿐이라 이전보다 훨씬 꼬일 일이 적어요.

## Netlify에 연결

1. [app.netlify.com](https://app.netlify.com) → **Add new site → Import an existing project → GitHub**
2. 방금 만든 저장소 선택
3. 빌드 설정은 `netlify.toml`에 이미 들어있어서 그대로 두면 됩니다.
4. **Deploy site** 클릭. 몇 분 뒤 `https://<사이트이름>.netlify.app` 로 접속 가능.

## 로컬 테스트 (선택)

```bash
npm install
npm install -g netlify-cli
netlify dev
```

## 로그인

- 이름 하나로 로그인 (아이디 없음)
- 배포 후 제일 먼저 본인 이름으로 가입하면 자동으로 관리자 계정이 됩니다
- 이후 가입자는 관리자 승인 후 비밀번호 설정
