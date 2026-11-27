# herdr-setup

[Herdr](https://herdr.dev) 앱에서 코딩 에이전트를 한눈에 보는 설정입니다.
에이전트 보드, 파일 목록 패널, tmux식 Ctrl+B 단축키, D2Coding 글꼴, [OpenRig](https://www.openrig.dev) 팀 연동이 들어 있습니다.
macOS와 Windows(WSL2) 설치 방법이 따로 있습니다.

## 무엇이 들어 있나

| 기능 | 설명 |
|---|---|
| 에이전트 보드 (`herdr-board`) | Needs you / Working / Done / Idle 네 칸에 에이전트를 카드로 보여 줍니다. 하위 에이전트는 부모 카드 밑에 붙고, 카드마다 실제 작업 시간과 Claude Code 토큰 수가 나옵니다. 필터(이 공간만, 핀 고정만), 핀, 숨기기, 종료, 이름 바꾸기, OpenRig 팀원 상태와 팀 추가 창이 있습니다 |
| Spaces 패널 (`my-spaces`) | Herdr 기본 Spaces 패널에 OpenRig 팀 공간 "rig" 표시와 "Add an OpenRig team" 버튼을 더합니다. Spaces 제목 옆 `+`를 누르면 폴더 선택 창이 떠서, 고른 폴더를 작업 디렉토리로 새 공간을 만듭니다(취소하면 아무것도 안 생김). 설치할 때 그 컴퓨터의 Herdr에서 복제해 `my-spaces.patch.json`을 적용합니다(Herdr 코드는 이 저장소에 없음) |
| 탭 메모 (`tab-notes`) | 탭마다 따로 쓰는 마크다운 메모 패널. 탭을 닫으면 그 메모도 지워집니다. 설치는 되지만 `herdr-board` 레이아웃에는 넣지 않았습니다 |
| Ctrl+B 단축키 (`tmux-prefix`) | `Ctrl+B` 다음 `v` 오른쪽 나누기, `s` 아래 나누기, `h j k l` 창 이동, `c` 새 탭, `?` 전체 목록 |
| 레이아웃 (`herdr-board`) | 왼쪽 사이드바, 위 보드(경계선을 끌어 높이 조절), 아래 터미널, 오른쪽 파일 목록(Files). 파일 목록은 지금 쓰는 터미널의 폴더를 보여 주고, 터미널 위 `Hide Files` 버튼이나 macOS의 `⌘⇧B`로 숨기고 다시 보입니다 |

| 파일 | 용도 |
|---|---|
| `herdr-app/` | 레이아웃, 모드, 추가할 단축키(`keys-add.json`, macOS 전용 `keys-add-mac.json`), Spaces 패널 수정 내용 |
| `install-mac.sh` | macOS: 위 파일을 Herdr에 넣고 글꼴·단축키 설정 |
| `install-windows.ps1` | Windows: 같은 일 + 보드가 WSL을 보도록 설정, PowerShell용 `rig` 래퍼 설치 |
| `windows/` | PowerShell·cmd에서 WSL 안의 `rig`·`openrig-tui`를 실행하는 `.cmd` 래퍼 |
| `setup-wsl.sh` | Windows의 WSL 안에 tmux·Node 22·Claude Code·OpenRig 설치, Herdr가 찾도록 `/usr/local/bin`에 링크 |
| `docs/` | 실제 환경에서 점검한 결과 |

두 설치 스크립트 모두 바꾸는 파일을 Herdr 설정 폴더의 `backup-before-herdr-board-<시각>`에 먼저 백업하고,
이미 다른 기능에 쓰이는 단축키는 덮어쓰지 않고 경고만 합니다.

---

## macOS 설치

Herdr 앱, Claude Code, OpenRig가 모두 Mac에서 돕니다.

### 1. 준비
- [Herdr 앱](https://herdr.dev)을 설치하고 **한 번 실행**합니다(설정 폴더 `~/.config/herdr-app`이 만들어집니다).
- Homebrew, Node.js 22 이상, Python 3가 있어야 합니다.

### 2. 글꼴, Claude Code, OpenRig
```bash
brew install --cask font-d2coding
brew install tmux
npm install -g @anthropic-ai/claude-code @openrig/cli
claude                                   # 한 번 로그인 후 /exit
rig setup --providers claude --no-herdr  # Herdr 앱을 쓰므로 Herdr TUI는 설치하지 않음
```
OpenRig가 필요 없으면 `npm`의 `@openrig/cli`와 `rig` 줄은 건너뛰어도 됩니다. 보드에서 OpenRig 관련 표시만 비고 나머지는 동작합니다.

### 3. Herdr 설정 넣기
Herdr를 켜 둔 채 터미널에서:
```bash
git clone https://github.com/limkeunhak/herdr-setup.git
cd herdr-setup
bash install-mac.sh
```
마지막에 모드 검사를 하고 Herdr를 `herdr-board` 레이아웃으로 바꿉니다.
설정 폴더가 다른 곳이면 `bash install-mac.sh --home <폴더>`로 지정합니다.

### 4. OpenRig 팀 쓰기
```bash
rig start                                # 데몬과 OpenRig 기본 팀(kernel) 시작, 전에 돌던 팀도 복원
cd <프로젝트> && rig up <팀 설정>.yaml    # 새 팀 시작
```
Herdr 왼쪽 Spaces 제목 옆 겹친 사각형 버튼 → 팀의 **Add**를 누르면 팀원 화면이 공간으로 생깁니다(4명이면 2×2로 나뉨). 꺼진 팀은 버튼이 **Start & add**로 나오며, `rig up <팀> --existing`으로 대화를 이어서 켠 뒤 붙입니다. 대화를 이어 갈 수 없는 자리(agy 등)는 새로 시작합니다. 일부 자리만 켜지면 켜진 자리만 붙이고 빠진 자리를 주황색으로 알려 줍니다.

---

## Windows 설치 (WSL2)

**구성:** Herdr 앱은 Windows에서 돕니다. Claude Code, OpenRig, tmux, 프로젝트는 WSL2(Ubuntu) 안에서 돕니다.
Herdr는 WSL을 `wsl`이라는 다른 컴퓨터로 연결해서 그 안에 공간을 만듭니다.
OpenRig는 macOS나 Linux와 tmux가 필요해서 어차피 WSL 안에서 돌아야 합니다.
직접 띄우는 에이전트도 같은 곳에 두면 같은 도구, 같은 저장소, 같은 `~/.claude` 기록을 써서 보드의 상태와 토큰 표시가 맞습니다.

> 2026-11-26 Windows 11 + WSL2 Ubuntu(herdr-core 0.1.22, Claude Code 2.1.332, OpenRig 0.7.23)에서 시험했습니다.
> 보드 표시, 하위 에이전트 연결, Needs you 전환이 동작합니다. 점검 내용은 [`docs/check-2026-11-26.md`](docs/check-2026-11-26.md)에 있습니다.

> **이미 설치했다면:** 2026-11-26 이전 `setup-wsl.sh`로 설치한 경우, 보드의 OpenRig 팀 목록이 비어 있거나 `hc run claude`가 `cannot start "claude"`로 실패합니다.
> WSL에서 아래를 한 번 실행하세요. Herdr 서버 PATH에 원래 `/usr/local/bin`이 있어서 재시작 없이 바로 적용됩니다.
> ```bash
> for b in claude rig hc herdr-core; do sudo ln -sfn "$HOME/.local/bin/$b" /usr/local/bin/$b; done
> ```

### 1. WSL 준비 (WSL Ubuntu 터미널)
```bash
git clone https://github.com/limkeunhak/herdr-setup.git ~/herdr-setup
cd ~/herdr-setup
bash setup-wsl.sh        # sudo 비밀번호를 묻습니다. tmux·Node 22·Claude Code·OpenRig 설치
claude                   # 한 번 로그인 후 /exit
```

### 2. Windows 준비
1. [Herdr 앱](https://herdr.dev)을 설치하고 **한 번 실행**합니다.
2. D2Coding 글꼴을 설치합니다: https://github.com/naver/d2codingfont/releases
3. PowerShell에서 WSL을 Herdr에 연결합니다. 이름은 꼭 `wsl`로 하세요.
   ```powershell
   hc machine add --via "wsl.exe -d Ubuntu -e sh -c" --name wsl
   ```
   WSL에 herdr-core 설치나 로그인을 요구하면 안내대로 해 주세요.

### 3. Herdr 설정 넣기 (Herdr를 켜 둔 채, PowerShell)
```powershell
git clone https://github.com/limkeunhak/herdr-setup.git
cd herdr-setup
powershell -ExecutionPolicy Bypass -File .\install-windows.ps1
```
Herdr 설정 폴더를 찾아 맞는지 묻습니다. 폴더는 `herdr-app --help`의 마지막 `Home:` 줄로 찾고, 못 찾으면 `%USERPROFILE%\.config\herdr-app`를 씁니다.
다른 곳이면 `-HerdrHome <폴더>`로 지정하세요.
Mac 설치와 같은 일을 하고, 보드가 WSL에서 `rig`과 토큰 계산을 하도록 `herdr-board/config.js`를 `MACHINE = "wsl"`로 바꿉니다.

### 4. OpenRig 팀 쓰기 (WSL)
프로젝트는 `/mnt/c/...`가 아니라 WSL 안(예: `~/Projects/<프로젝트>`)에 두세요. 파일 감시, 속도, tmux 모두 그쪽이 낫습니다.
```bash
rig start
cd ~/Projects/<프로젝트> && rig up <팀 설정>.yaml
```
Herdr 왼쪽 Spaces 제목 옆 겹친 사각형 버튼 → 팀의 **Add**를 누르면 WSL 안에 그 팀 공간이 생깁니다(4명이면 2×2로 나뉨). 꺼진 팀은 버튼이 **Start & add**로 나오며, `rig up <팀> --existing`으로 대화를 이어서 켠 뒤 붙입니다. 대화를 이어 갈 수 없는 자리(agy 등)는 새로 시작합니다. 일부 자리만 켜지면 켜진 자리만 붙이고 빠진 자리를 주황색으로 알려 줍니다.
직접 쓸 Claude Code는 Spaces의 `wsl` 쪽 `+`로 공간을 만들어 그 안에서 `claude`를 실행하세요.
`wsl` 쪽 `+`도 폴더 선택 창을 띄우고, 고른 폴더를 WSL 경로로 바꿔 그곳에 공간을 만듭니다
(`\\wsl.localhost\Ubuntu\home\<나>\proj` → `/home/<나>/proj`, `C:\work` → `/mnt/c/work`).
선택 창 왼쪽 즐겨찾기(Quick Access)에 설치 스크립트가 고정해 둔 WSL 홈이 있습니다.

PowerShell이나 cmd에서도 `rig`, `openrig-tui`를 바로 쓸 수 있습니다. 설치 스크립트가 `%USERPROFILE%\.local\bin`에
WSL 안의 명령을 대신 실행하는 `rig.cmd`·`openrig-tui.cmd`를 넣습니다. 인자와 현재 폴더(`C:\x` → `/mnt/c/x`)는 그대로 넘어가지만,
인자로 쓴 Windows 경로는 바뀌지 않으니 `/mnt/c/...`나 `.`을 쓰세요.
```powershell
rig ps
rig doctor
```

### Mac과 다른 점
- Mac 전용 `cmd-…` 단축키는 옮기지 않습니다. Windows Herdr 기본 단축키에 Ctrl+B 두 줄만 더합니다. 오른쪽 Files 패널은 단축키 대신 터미널 위 `Hide Files` 버튼으로 숨깁니다.
- 제목 표시줄이 없는 레이아웃이라, 창 최소화·최대화·닫기 버튼은 보드 맨 위 오른쪽에 나옵니다.
- 보드는 `rig`과 토큰 계산(`python3`)을 `wsl` 쪽에서 실행합니다. 실패하면 토큰과 팀 목록만 비고 나머지는 동작합니다.

---

## 알아 둘 점
- **WSL에서 Herdr가 프로그램을 못 찾을 때:** Herdr의 WSL 쪽 서버(herdr-core)는 systemd 사용자 서비스로 돌아서 `~/.profile`을 읽지 않습니다. 그래서 `~/.local/bin`에 있는 `claude`·`rig`·`hc`를 이름만으로는 못 찾습니다. `setup-wsl.sh`가 `/usr/local/bin`에 링크를 만들어 이 문제를 막습니다. 다른 도구를 `~/.local/bin`에 더 설치했다면 같은 방법으로 링크하거나 전체 경로로 실행하세요.
- **하위 에이전트가 보드에 뜨는 조건:** 보드는 Herdr 터미널 단위로 카드를 만듭니다. Claude Code 안에서 Agent(Task) 도구로 띄운 서브에이전트는 같은 프로세스 안에서 돌기 때문에 보드에 나오지 않습니다. 보드에 카드로 띄우려면 에이전트 안에서 터미널로 실행하세요.
  ```bash
  hc run --bg --name chk-api claude --permission-mode auto "할 일 설명"
  ```
  부모 카드 밑에 "from wsl/t2"처럼 붙어서 나옵니다. 처음 여는 폴더면 신뢰 확인 창 때문에 **Needs you** 칸에 먼저 뜨니, 보드에서 카드를 열어 승인하면 됩니다.
- **부모 에이전트에 자동 입력되는 알림:** `hc run`으로 띄운 자식이 멈추거나 끝나면 hc가 부모 에이전트 입력창에 `<hc>t16 is blocked (permission)…` 같은 줄을 입력합니다. 원하지 않으면 `hc run --no-notify`로 띄우거나 `~/.config/herdr-core/config.toml`에 `notes = false`를 넣으세요.
- **`hc read`는 기본으로 화면만** 보여 줍니다. 지난 출력까지 보려면 `hc read <t> --lines 1000`처럼 줄 수를 주세요.
- **OpenRig 팀원 상태:** Herdr는 tmux 안 Claude Code가 보내는 신호로 상태를 판단합니다. 그래서 창 크기가 바뀔 때 팀원이 잠깐 working→done으로 깜빡입니다. 보드 카드는 OpenRig 상태를 쓰므로 영향이 없지만, 사이드바의 Done 표시와 "finished" 알림은 그대로 뜰 수 있습니다.
- **한글 자간:** Herdr가 시스템에 설치된 D2Coding `.ttc`를 시작할 때 못 읽으면 다른 글꼴로 바뀌어 한글 자간이 벌어집니다. `install-mac.sh`는 그래서 D2Coding `.ttf` 두 개를 Herdr 설정 폴더의 `fonts/`에도 복사합니다(Herdr가 시작할 때마다 읽는 곳). Windows에서 같은 증상이 나오면 릴리스 zip의 `D2Coding/` 안 `.ttf` 두 개를 Herdr 설정 폴더(보통 `%USERPROFILE%\.config\herdr-app`)의 `fonts\`에 넣으세요.
- **Spaces `+`와 WSL:** Spaces 제목 옆 `+`는 공간을 Windows(이 컴퓨터)에 만듭니다. WSL 안에 만들려면 컴퓨터 목록의 `wsl` 옆 `+`를 쓰세요. 둘 다 Windows 폴더 선택 창을 쓰는데, 이 창은 시작 폴더를 정할 수 없어서 WSL 홈을 즐겨찾기에 고정해 둡니다. WSL 다른 배포판이나 네트워크 폴더를 고르면 공간을 만들지 않고 알림만 띄웁니다.
- **OpenRig 레이아웃과 글꼴:** OpenRig의 `rig terminal open`이 만드는 `rig` 레이아웃에는 글꼴 설정이 없을 수 있습니다. 한글 자간이 벌어지면 그 레이아웃 파일 맨 위에 `"font": "D2Coding"`을 넣으세요.
- **되돌리기:** Herdr에서 `Ctrl+Shift+L`로 다른 레이아웃을 고르면 됩니다. 설치 전 상태는 백업 폴더에 있습니다.

## 출처와 라이선스
- `mods/tmux-prefix`: [Gwynbleid85/herdr-tmux-prefix](https://github.com/Gwynbleid85/herdr-tmux-prefix)를 고친 것 (Apache-2.0, 바꾼 내용은 `NOTICE.md`)
- `mods/tab-notes`: [ozcberkay/herdr-coban](https://github.com/ozcberkay/herdr-coban/tree/main/tab-notes) 그대로 (Apache-2.0)
- `mods/herdr-board`: [herdrdev/herdr-layout-examples](https://github.com/herdrdev/herdr-layout-examples)의 board 예제에서 시작해 크게 고친 것 (Apache-2.0)
- `my-spaces`: 설치할 때 Herdr에 들어 있는 `spaces` 모드를 복제한 뒤 `my-spaces.patch.json`의 네 군데를 고칩니다. Herdr 버전이 달라 맞지 않으면 고치지 않고 경고만 합니다.
