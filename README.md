# Herdr + OpenRig 윈도우 설정

Mac에서 만든 Herdr 화면(에이전트 보드, 탭 메모, Ctrl+B 단축키, D2Coding)과 OpenRig 연동을
Windows에서 똑같이 쓰기 위한 꾸러미입니다.

**구성:** Herdr 앱은 Windows에서, Claude Code·OpenRig·tmux·프로젝트는 WSL2(Ubuntu) 안에서 돕니다.
Herdr는 WSL을 `wsl`이라는 다른 컴퓨터로 연결해서 그 안에 공간을 만듭니다.
OpenRig 팀원이 어차피 WSL의 tmux에서 돌기 때문에, 직접 띄우는 에이전트도 같은 곳에 두면
같은 도구·같은 저장소·같은 `~/.claude` 기록을 쓰게 되고 보드의 상태·토큰 표시도 한 곳만 보면 됩니다.

> Windows에서 직접 시험해 보지 못했습니다. 막히는 곳이 있으면 그 단계의 화면 내용을 그대로 알려 주세요.

## 들어 있는 것

| 파일 | 내용 |
|---|---|
| `herdr-app/layouts/herdr-board.json` | 보드 레이아웃(사이드바, 보드, 터미널, 탭 메모) |
| `herdr-app/mods/herdr-board/` | 에이전트 보드. `config.js`에 `MACHINE = "wsl"`로 맞춰 둠 |
| `herdr-app/my-spaces.patch.json` | Spaces 패널에 OpenRig 팀 추가 버튼·rig 표시를 넣는 수정 내용. 설치할 때 그 PC Herdr의 기본 `spaces` 모드를 복제해 적용합니다(Herdr 코드는 이 저장소에 넣지 않음) |
| `herdr-app/mods/tab-notes/`, `tmux-prefix/` | 탭 메모, Ctrl+B 단축키 |
| `herdr-app/keys-add.json` | 추가할 Ctrl+B 단축키 2개 |
| `setup-wsl.sh` | WSL에 tmux·Node 22·Claude Code·OpenRig 설치 |
| `install-windows.ps1` | 위 Herdr 파일을 Windows Herdr에 넣고 글꼴·단축키 설정(바꾸는 파일은 먼저 백업) |

## 순서

### 1. WSL 준비 (WSL Ubuntu 터미널)
```bash
bash setup-wsl.sh        # 이 폴더를 WSL로 복사한 뒤 실행. sudo 비밀번호를 물어봅니다
claude                   # 한 번 로그인 후 /exit
```

### 2. 작업할 프로젝트와 OpenRig 팀 (WSL)
프로젝트는 `/mnt/c/...`(Windows 디스크)가 아니라 WSL 안(예: `~/Projects/<프로젝트>`)에 두세요.
파일 감시·속도·tmux 모두 그쪽이 낫습니다. 팀 설정 파일이 있으면 그 폴더에서 시작합니다.
```bash
cd ~/Projects/<프로젝트>
rig up <팀 설정 파일>.yaml     # 예: rig up rigs/tkt/rig.yaml (kernel 팀도 함께 켜집니다)
```

### 3. Windows 준비
1. Herdr 앱을 설치하고 한 번 실행했다가 닫습니다(설정 폴더와 `keys.json`이 만들어집니다).
2. D2Coding 글꼴 설치: https://github.com/naver/d2codingfont/releases
3. WSL을 Herdr에 연결합니다. PowerShell에서:
   ```powershell
   hc machine add --via "wsl.exe -d Ubuntu -e sh -c" --name wsl
   ```
   Herdr가 WSL에 herdr-core 설치나 로그인을 요구하면 안내대로 해 주세요.
   이름은 꼭 `wsl`로 해 주세요(`herdr-board/config.js`의 `MACHINE`과 같아야 합니다).

### 4. Herdr 설정 넣기 (Herdr를 켜 둔 채, PowerShell에서 이 폴더로 가서)
```powershell
powershell -ExecutionPolicy Bypass -File .\install-windows.ps1
```
Herdr 설정 폴더를 찾아서 확인을 받고, 바꾸는 파일은 `backup-before-herdr-board-<시각>` 폴더에 먼저 백업합니다.
Ctrl+B가 이미 다른 기능에 쓰이고 있으면 덮어쓰지 않고 경고만 합니다.

### 5. 사용
- Herdr에서 `Ctrl+Shift+L`로 **herdr-board** 레이아웃을 고릅니다(스크립트가 바꿔 두었을 수도 있습니다).
- 왼쪽 Spaces 제목 옆 겹친 사각형 버튼 → 팀의 **Add** → WSL 안에 그 팀 공간이 생깁니다.
- 직접 쓸 Claude Code는 Spaces의 `wsl` 쪽 `+`로 공간을 만들어 그 안에서 `claude`를 실행하세요.

## Mac과 다른 점
- `cmd-…` 단축키 등 Mac 전용 `keys.json`은 옮기지 않습니다. Windows Herdr의 기본 단축키에 Ctrl+B 두 줄만 더합니다.
- 제목 표시줄이 없는 레이아웃이라, 창 최소화·최대화·닫기 버튼은 보드 맨 위 오른쪽에 나옵니다.
- OpenRig의 `rig terminal open`이 만드는 `rig` 레이아웃은 옮기지 않습니다. 필요하면 WSL 쪽에서 OpenRig가 다시 만듭니다.
- 보드는 `rig`, 토큰 계산(`python3`)을 `wsl` 쪽에서 실행합니다. 실패하면 보드에 토큰·팀 목록만 안 나오고 나머지는 동작합니다.

## 출처와 라이선스
- `mods/tmux-prefix`: [Gwynbleid85/herdr-tmux-prefix](https://github.com/Gwynbleid85/herdr-tmux-prefix)를 고친 것 (Apache-2.0, 바꾼 내용은 `NOTICE.md`)
- `mods/tab-notes`: [ozcberkay/herdr-coban](https://github.com/ozcberkay/herdr-coban/tree/main/tab-notes) 그대로 (Apache-2.0)
- `mods/herdr-board`: [herdrdev/herdr-layout-examples](https://github.com/herdrdev/herdr-layout-examples)의 board 예제에서 시작해 크게 고친 것 (Apache-2.0)
- `my-spaces`: 설치 때 Herdr에 들어 있는 `spaces` 모드를 복제한 뒤 `my-spaces.patch.json`의 네 군데를 고침. Herdr 버전이 달라 맞지 않으면 고치지 않고 경고만 합니다
