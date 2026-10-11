// PC 앱에서만: 화면(웹 코드)이 앱 폴더에 파일을 쓰고 GitHub에 올릴 수 있게 두 가지 기능만 열어 준다
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktop", {
  writeSync: (text) => ipcRenderer.invoke("sync:write", text),
  publishSync: (text) => ipcRenderer.invoke("sync:publish", text)
});
