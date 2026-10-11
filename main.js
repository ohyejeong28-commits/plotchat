const { app, BrowserWindow, Menu, shell, screen } = require("electron");
const path = require("path");

Menu.setApplicationMenu(null);

// 개발 확인용: PLOTCHAT_USERDATA를 주면 사용자 데이터와 분리된 저장소로 실행한다
if (process.env.PLOTCHAT_USERDATA) app.setPath("userData", process.env.PLOTCHAT_USERDATA);

// 앱은 하나만 실행한다. 두 번째로 실행하면 기존 창을 앞으로 가져온다
// (두 개가 동시에 켜지면 저장소가 잠겨서 두 번째 창은 저장된 키를 못 읽는다)
if (!app.requestSingleInstanceLock()) app.quit();
let win = null;
app.on("second-instance", () => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
});

function createWindow() {
  // 제타처럼 세로로 긴 모바일 폭 창 (화면 높이에 맞춘다)
  const workArea = screen.getPrimaryDisplay().workAreaSize;
  win = new BrowserWindow({
    width: 560,
    height: Math.min(960, workArea.height - 40),
    minWidth: 360,
    minHeight: 560,
    title: "플롯챗",
    icon: path.join(__dirname, "icon.ico"),
    backgroundColor: "#000000",
    autoHideMenuBar: true,
    show: false,
    webPreferences: { spellcheck: false } // 한국어 이름과 롤플레이 문장에 빨간 밑줄이 생기지 않게
  });
  win.once("ready-to-show", () => win.show());
  win.on("page-title-updated", (e) => e.preventDefault());
  // 개발 확인용: PLOTCHAT_URL을 주면 웹 주소로 연다 (아이폰용 웹 버전 확인)
  if (process.env.PLOTCHAT_URL) win.loadURL(process.env.PLOTCHAT_URL);
  else win.loadFile("index.html");

  // 앱 안의 외부 링크는 기본 브라우저로 연다
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  // 개발 확인용: PLOTCHAT_VERIFY=저장경로.png 로 실행하면 화면을 캡처하고 종료
  if (process.env.PLOTCHAT_VERIFY) {
    const errs = [];
    win.webContents.on("console-message", (e, level, msg, line, src) => {
      if (level >= 2) errs.push(level + " " + msg + " (" + src + ":" + line + ")");
    });
    win.webContents.once("did-finish-load", () => {
      setTimeout(async () => {
        if (process.env.PLOTCHAT_VERIFY_JS) {
          await win.webContents.executeJavaScript(process.env.PLOTCHAT_VERIFY_JS).catch((err) => errs.push("VERIFY_JS " + err));
        }
        setTimeout(() => {
          win.webContents.capturePage().then((img) => {
            const fs = require("fs");
            fs.writeFileSync(process.env.PLOTCHAT_VERIFY, img.toPNG());
            fs.writeFileSync(process.env.PLOTCHAT_VERIFY + ".log", errs.length ? errs.join("\n") : "NO-CONSOLE-ERRORS");
            app.quit();
          });
        }, parseInt(process.env.PLOTCHAT_VERIFY_WAIT, 10) || 1000);
      }, 800);
    });
  }

  win.webContents.on("before-input-event", (e, input) => {
    if (input.type !== "keyDown") return;
    if (input.key === "F11") {
      win.setFullScreen(!win.isFullScreen());
      e.preventDefault();
    } else if (input.key === "Escape" && win.isFullScreen()) {
      win.setFullScreen(false);
      e.preventDefault();
    } else if (input.key === "F12") {
      win.webContents.toggleDevTools();
      e.preventDefault();
    }
  });
}

app.whenReady().then(createWindow);
app.on("window-all-closed", () => app.quit());
